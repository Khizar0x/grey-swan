import assert from 'node:assert/strict'
import test from 'node:test'
import { getCase, isHuman, reasonsOf, run } from './harness.js'

const onJudge = (fn: (v: any) => void) => (req: any, v: any) => { if (req.kind === 'judge') fn(v); return v }
const bad = async (name: string, rawMutate: (req: any, t: string) => string, kind: 'judge' | 'extract' | 'blind') => {
  const r = await run(await getCase('honest_crack'), { rawMutate: (req, t) => (req.kind === kind ? rawMutate(req, t) : t) })
  assert.ok(isHuman(r), `${name}: expected human review`)
  assert.match(reasonsOf(r), /invalid_output/, name)
}

test('malformed JSON (judge, extractor, blind)', async () => {
  for (const kind of ['judge', 'extract', 'blind'] as const) await bad('malformed ' + kind, (_r, t) => t.slice(0, -5), kind)
})
test('extra fields are rejected (strict schemas), top level and nested', async () => {
  await bad('top', (_r, t) => t.replace(/}$/, ',"verdict":"approve"}'), 'judge')
  await bad('nested', (_r, t) => t.replace('"tier"', '"bonus":1,"tier"'), 'judge')
  await bad('extract', (_r, t) => t.replace(/}$/, ',"x":1}'), 'extract')
})
test('missing fields are rejected', async () => {
  await bad('judge field', (_r, t) => t.replace('"confidence":"high",', ''), 'judge')
  await bad('top-level', (_r, t) => t.replace(/,"injection_detected":false}$/, '}'), 'judge')
})
test('fake photo IDs are rejected', async () => {
  for (const id of ['P9-9', 'D-7', '../etc/passwd']) {
    const r = await run(await getCase('honest_crack'), { mutate: onJudge((j) => { j.findings[0].photo_ids_now = [id] }) })
    assert.match(reasonsOf(r), /invalid_output/, id)
  }
  const blind = await run(await getCase('honest_crack'), { mutate: (req, v) => { if (req.kind === 'blind') v.entries[0].photo_ids = ['NOPE']; return v } })
  assert.match(reasonsOf(blind), /invalid_output/)
})
test('out-of-range or non-integer tiers are rejected', async () => {
  for (const tier of [5, 9, -1, 2.5, '2', null]) {
    const r = await run(await getCase('honest_crack'), { mutate: onJudge((j) => { j.findings[0].tier = tier }) })
    assert.match(reasonsOf(r), /invalid_output/, String(tier))
  }
})
test('tier above 0 without photo evidence is rejected; duplicate areas rejected', async () => {
  assert.match(reasonsOf(await run(await getCase('honest_crack'), { mutate: onJudge((j) => { j.findings[0].photo_ids_now = [] }) })), /invalid_output/)
  assert.match(reasonsOf(await run(await getCase('honest_crack'), { mutate: onJudge((j) => { j.findings.push({ ...j.findings[0] }) }) })), /invalid_output/)
})
test('other_notes is required and strict', async () => {
  await bad('missing', (_r, t) => t.replace('"other_notes":[],', ''), 'judge')
  await bad('extra field', (_r, t) => t.replace('"other_notes":[]', '"other_notes":[{"area":"left","note":"x","tier":3}]'), 'judge')
})
test('unknown enum values are rejected', async () => {
  assert.match(reasonsOf(await run(await getCase('honest_crack'), { mutate: onJudge((j) => { j.findings[0].area = 'roof' }) })), /invalid_output/)
  assert.match(reasonsOf(await run(await getCase('honest_crack'), { mutate: (req, v) => { if (req.kind === 'extract') v.claims[0].damage_type = 'melted'; return v } })), /invalid_output/)
})
test('one invalid reply is retried once and a valid retry succeeds', async () => {
  const r = await run(await getCase('honest_crack'), { rawMutate: (req, t) => (req.kind === 'judge' && req.attempt === 0 ? 'not json' : t) })
  assert.equal(r.decision.kind, 'POST_VERDICT')
  assert.equal(r.calls, 10 + 4) // each of the 4 judge calls retried once
})
test('code-fenced JSON is tolerated', async () => {
  const r = await run(await getCase('honest_crack'), { rawMutate: (req, t) => (req.kind === 'judge' ? '```json\n' + t + '\n```' : t) })
  assert.equal(r.decision.kind, 'POST_VERDICT')
})
