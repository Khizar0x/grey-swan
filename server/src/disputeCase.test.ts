import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { sanitiseAnswers } from './ai/sanitise.js'
import { buildCaseFile } from './disputeCase.js'
import { validateOwnerAnswers, validateRenterAnswers } from './disputeAnswers.js'

const owner = validateOwnerAnswers({
  areas: ['front', 'left', 'front'],
  damageType: 'crack',
  severity: 'cosmetic',
  missingAccessories: 'charger',
  photosCid: 'closeups',
  statement: 'A crack across the front.',
})!
const renter = validateRenterAnswers({ agrees: 'no', duringUse: 'unsure', duringPacking: 'no', statement: 'It was fine when I sent it.' })!

const enc = new TextEncoder()
const files: Record<string, Uint8Array> = {
  m1: enc.encode(JSON.stringify({ photos: ['a', 'b'] })),
  m4: enc.encode(JSON.stringify({ photos: ['c'], shots: [{ shot: 'front', capture: 'captured' }], phaseCode: 'SWAN-AAAA' })),
  closeups: enc.encode(JSON.stringify({ photos: ['d'] })),
  a: Uint8Array.of(1), b: Uint8Array.of(2), c: Uint8Array.of(3), d: Uint8Array.of(4),
}

test('validators reject bad input and dedupe areas', () => {
  assert.deepEqual(owner.areas, ['front', 'left'])
  assert.equal(validateOwnerAnswers({ ...owner, areas: [] }), null)
  assert.equal(validateOwnerAnswers({ ...owner, areas: ['roof'] }), null)
  assert.equal(validateOwnerAnswers({ ...owner, statement: 'x'.repeat(1001) }), null)
  assert.equal(validateOwnerAnswers({ ...owner, photosCid: '' }), null)
  assert.equal(validateRenterAnswers({ agrees: 'maybe', duringUse: 'no', duringPacking: 'no', statement: 's' }), null)
})

test('buildCaseFile maps a rental and answers to the pipeline format', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'case-'))
  const cf = await buildCaseFile({
    rentalPubkey: 'R1',
    depositLamports: 1_500_000_000,
    manifests: { p1: 'm1', p4: 'm4', dispute: 'closeups' },
    owner,
    renter,
    photoDir: dir,
    fetchBytes: async (url) => {
      const key = url.split('/').pop()!
      if (!files[key]) throw new Error(`unexpected ${key}`)
      return files[key]
    },
  })
  assert.equal(cf.caseId, 'rental-R1')
  assert.deepEqual(cf.photos.map((p) => [p.id, p.phase]), [['P1-1', 'p1'], ['P1-2', 'p1'], ['P4-1', 'p4'], ['D-1', 'dispute']])
  assert.deepEqual([...(await readFile(cf.photos[3].path))], [4])
  assert.equal(cf.owner.answers.where, 'front, left')
  assert.equal(cf.owner.answers.what, 'crack')
  assert.equal(cf.renter.answers.item_damaged, 'no')
  // Fits what the pipeline's own sanitiser accepts, untouched.
  assert.deepEqual(sanitiseAnswers(cf.owner.answers).suspicious, [])
  assert.deepEqual(sanitiseAnswers(cf.renter.answers).suspicious, [])
})

test('a skipped label shot is carried into the case file; old manifests have none', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'case-'))
  const withSkip = {
    ...files,
    m1: enc.encode(JSON.stringify({ photos: ['a', 'b'], shots: [], skipped: ['label', 'accessories', 7, 'x'.repeat(50)], phaseCode: 'SWAN-BBBB' })),
  }
  const get = (table: Record<string, Uint8Array>) => async (url: string) => table[url.split('/').pop()!]
  const cf = await buildCaseFile({ rentalPubkey: 'R2', depositLamports: 1, manifests: { p1: 'm1', p4: 'm4' }, owner, renter, photoDir: dir, fetchBytes: get(withSkip) })
  assert.deepEqual(cf.skippedShots, { p1: ['label', 'accessories'] })
  assert.equal(cf.photos.length, 3)
  const old = await buildCaseFile({ rentalPubkey: 'R3', depositLamports: 1, manifests: { p1: 'm1', p4: 'm4' }, owner, renter, photoDir: dir, fetchBytes: get(files) })
  assert.equal(old.skippedShots, undefined)
})
