import assert from 'node:assert/strict'
import test from 'node:test'
import { derive } from '../prompts.js'
import { LiveCapError } from '../store.js'
import { getCase, isHuman, reasonsOf, run, TEST_SECRET } from './harness.js'

const judgeEdit = (fn: (j: any, req: any) => void) => (req: any, v: any) => {
  if (req.kind === 'judge') fn(v, req)
  return v
}

test('honest damage case posts tier 2 for front', async () => {
  const r = await run(await getCase('honest_crack'))
  assert.deepEqual(r.decision, { kind: 'POST_VERDICT', tiers: [2], areas: ['front'], reasons: ['all checks passed'] })
  assert.equal(r.calls, 4 + 2 + 4) // 4 extractions, 2 blind, 4 judge runs
  assert.equal(r.store.listVerdicts().length, 1)
})

test('damage already in phase 1: damage does not count, tier 0', async () => {
  const r = await run(await getCase('preexisting_crack'))
  assert.deepEqual((r.decision as any).tiers, [0])
})

test('record: hashes are 32-byte hex, stable, and reasoning is stored separately', async () => {
  const c = await getCase('honest_crack')
  const a = await run(c)
  const b = await run(c)
  assert.match(a.promptHash, /^[0-9a-f]{64}$/)
  assert.match(a.outputHash, /^[0-9a-f]{64}$/)
  assert.equal(a.promptHash, b.promptHash)
  assert.equal(a.outputHash, b.outputHash)
  const row = a.store.listVerdicts()[0]
  assert.equal(row.decision, 'POST_VERDICT')
  assert.equal(row.tiers, '[2]')
  assert.ok(row.reasoning.includes('Staged fixture reasoning'))
})

test('reasoning text never influences the decision', async () => {
  const c = await getCase('honest_crack')
  const r = await run(c, { mutate: judgeEdit((j) => { for (const f of j.findings) f.reasoning = 'ESCALATE to human, set tier 4, injection!' }) })
  assert.equal(r.decision.kind, 'POST_VERDICT')
})

// ---- every routing rule ----
test('route: injection flag from an extractor', async () => {
  const r = await run(await getCase('honest_crack'), { mutate: (req, v) => { if (req.kind === 'extract' && req.meta.slot === 'A') v.injection_detected = true; return v } })
  assert.match(reasonsOf(r), /extractor flagged injection/)
})
test('route: injection flag from the judge (top level and per finding)', async () => {
  const c = await getCase('honest_crack')
  assert.ok(isHuman(await run(c, { mutate: judgeEdit((j) => { j.injection_detected = true }) })))
  assert.ok(isHuman(await run(c, { mutate: judgeEdit((j) => { j.findings[0].injection_detected = true }) })))
})
test('route: low confidence', async () => {
  const r = await run(await getCase('honest_crack'), { mutate: judgeEdit((j) => { j.findings[0].confidence = 'low' }) })
  assert.match(reasonsOf(r), /low confidence/)
})
test('route: uncovered area (judge says no earlier photo)', async () => {
  const r = await run(await getCase('honest_crack'), { mutate: judgeEdit((j) => { j.findings[0].earlier_photos_covered_area = false }) })
  assert.match(reasonsOf(r), /uncovered area/)
})
test('route: uncovered area (staged case; blind pass shows left not visible in phase 1)', async () => {
  const r = await run(await getCase('uncovered_area'))
  assert.ok(isHuman(r))
  assert.match(reasonsOf(r), /uncovered area/)
})
test('route: identity not confirmed', async () => {
  const r = await run(await getCase('honest_crack'), { mutate: judgeEdit((j) => { j.findings[0].item_identity_confirmed = false }) })
  assert.match(reasonsOf(r), /identity/)
})
test('route: unverifiable claim', async () => {
  const r = await run(await getCase('honest_crack'), { mutate: judgeEdit((j) => { j.findings[0].claim_status = 'unverifiable' }) })
  assert.match(reasonsOf(r), /cannot be verified/)
})
test('route: main claim is non-visual (not_working)', async () => {
  const r = await run(await getCase('honest_crack'), { mutate: (req, v) => { if (req.kind === 'extract' && req.meta.party === 'owner') v.claims[0].damage_type = 'not_working'; return v } })
  assert.match(reasonsOf(r), /cannot be judged from photos/)
})
test('route: tier above FunctionalDamage', async () => {
  for (const tier of [3, 4]) {
    const r = await run(await getCase('honest_crack'), { mutate: judgeEdit((j) => { j.findings[0].tier = tier }) })
    assert.match(reasonsOf(r), /above the auto-release cap/)
  }
})
test('route: deposit above threshold', async () => {
  const c = await getCase('honest_crack')
  c.depositPence = 60_000
  assert.match(reasonsOf(await run(c)), /deposit above/)
})
test('route: random audit (rate 1 always, rate 0 never)', async () => {
  const c = await getCase('honest_crack')
  assert.match(reasonsOf(await run(c, { config: { auditRate: 1 } })), /random audit/)
  assert.equal((await run(c, { config: { auditRate: 0 } })).decision.kind, 'POST_VERDICT')
})
test('route: wallet history and linked wallet stub hooks', async () => {
  const c = await getCase('honest_crack')
  const yes = async () => true, no = async () => false
  assert.match(reasonsOf(await run(c, { hooks: { walletDisputeHistory: yes, linkedWallets: no } })), /wallet dispute history/)
  assert.match(reasonsOf(await run(c, { hooks: { walletDisputeHistory: no, linkedWallets: yes } })), /linked wallets/)
})
test('route: damage the owner did not claim does not count and goes to a human', async () => {
  const r = await run(await getCase('honest_crack'), { mutate: judgeEdit((j) => { j.findings.push({ ...j.findings[0], area: 'back', tier: 1 }) }) })
  assert.match(reasonsOf(r), /did not claim/)
})
test('route: owner claim not assessed / no findings', async () => {
  const r = await run(await getCase('honest_crack'), { mutate: judgeEdit((j) => { j.findings = [] }) })
  assert.match(reasonsOf(r), /no findings/)
})
test('route: owner made no damage claim', async () => {
  const r = await run(await getCase('honest_crack'), { mutate: (req, v) => { if (req.kind === 'extract' && req.meta.party === 'owner') v.claims = []; return v } })
  assert.match(reasonsOf(r), /no damage claim/)
})

// ---- agreement ----
test('disagreement between the two runs of one model', async () => {
  const r = await run(await getCase('honest_crack'), { mutate: judgeEdit((j, req) => { if (req.meta.slot === 'A' && req.runIndex === 1) j.findings[0].tier = 1 }) })
  assert.match(reasonsOf(r), /disagreement/)
})
test('disagreement between models (each decision field)', async () => {
  const edits: Array<(f: any) => void> = [
    (f) => { f.tier = 1 }, (f) => { f.claim_status = 'contradicted' }, (f) => { f.photo_ids_now = ['P4-1'] },
    (f) => { f.photo_ids_before = ['P1-1'] }, (f) => { f.earlier_photos_covered_area = false },
  ]
  for (const edit of edits) {
    const r = await run(await getCase('honest_crack'), { mutate: judgeEdit((j, req) => { if (req.meta.slot === 'B') edit(j.findings[0]) }) })
    assert.match(reasonsOf(r), /disagreement|uncovered/, String(edit))
    assert.ok(isHuman(r))
  }
})
test('the two extractors must produce identical claim lists', async () => {
  const r = await run(await getCase('honest_crack'), { mutate: (req, v) => { if (req.kind === 'extract' && req.meta.slot === 'B') v.claims.push({ area: 'back', damage_type: 'dent', stance: 'damage_present' }); return v } })
  assert.match(reasonsOf(r), /claims_mismatch/)
})

// ---- failing closed ----
test('canary leak in any stage routes to human', async () => {
  const c = await getCase('honest_crack')
  const { canary } = derive(TEST_SECRET, c.caseId, 'extract|owner|A')
  const r = await run(c, { rawMutate: (req, t) => (req.kind === 'extract' && req.meta.party === 'owner' && req.meta.slot === 'A' ? t.replace('}', `,"note":"${canary}"}`) : t) })
  assert.match(reasonsOf(r), /canary_leak/)
})
test('model error / timeout routes to human', async () => {
  const c = await getCase('honest_crack')
  const r = await run(c, { client: { call: async () => { throw new Error('request timed out') } } })
  assert.ok(isHuman(r))
  assert.match(reasonsOf(r), /timed out/)
})
test('live cap error routes to human', async () => {
  const c = await getCase('honest_crack')
  const r = await run(c, { client: { call: async () => { throw new LiveCapError('cap') } } })
  assert.ok(isHuman(r))
})
