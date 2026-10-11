import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { loadAiConfig } from '../config.js'
import { prepareImage } from '../images.js'
import { cacheKey, LiveClient, type LlmRequest } from '../llm.js'
import { planPostVerdict } from '../post.js'
import { AiStore, LiveCapError } from '../store.js'
import { getCase, run, testConfig } from './harness.js'

const req = (over: Partial<LlmRequest> = {}): LlmRequest => ({
  kind: 'extract', model: 'm', system: 's', parts: [{ type: 'text', text: 'hello' }], maxTokens: 10,
  runIndex: 0, attempt: 0, meta: { caseId: 'c', slot: 'A' }, ...over,
})

// A LiveClient whose SDK is replaced by a stub: the real API is never reachable here.
function fakeLive(cap: number) {
  const store = new AiStore(':memory:')
  const lines: string[] = []
  const live = new LiveClient(testConfig({ mode: 'live', apiKey: 'sk-test-not-real', dailyLiveCap: cap }), store, (l) => lines.push(l))
  let sdkCalls = 0
  ;(live as any).sdk = {
    messages: { create: async () => { sdkCalls++; return { usage: { input_tokens: 123, output_tokens: 45 }, stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok":true}' }] } } },
  }
  return { live, store, lines, calls: () => sdkCalls }
}

test('mode defaults to mock; only the exact string "live" enables live', () => {
  assert.equal(loadAiConfig({}).mode, 'mock')
  assert.equal(loadAiConfig({ AI_MODE: 'LIVE ' }).mode, 'mock')
  assert.equal(loadAiConfig({ AI_MODE: 'live' }).mode, 'live')
  assert.equal(loadAiConfig({}).dailyLiveCap, 40)
  assert.equal(loadAiConfig({}).modelA, 'claude-haiku-5-5')
  assert.equal(loadAiConfig({}).modelB, 'claude-sonnet-5-5')
})

test('mock mode never constructs a live client or needs a key', async () => {
  const r = await run(await getCase('honest_crack'))
  assert.equal(r.decision.kind, 'POST_VERDICT')
  assert.throws(() => new LiveClient(testConfig({ mode: 'live', apiKey: undefined }), new AiStore(':memory:')), /ANTHROPIC_API_KEY/)
})

test('responses are cached by exact input: repeat costs nothing', async () => {
  const f = fakeLive(40)
  const a = await f.live.call(req())
  const b = await f.live.call(req())
  assert.equal(f.calls(), 1)
  assert.equal(b.cached, true)
  assert.equal(a.text, b.text)
  assert.notEqual(cacheKey(req()), cacheKey(req({ runIndex: 1 })))
  assert.notEqual(cacheKey(req()), cacheKey(req({ parts: [{ type: 'text', text: 'hello!' }] })))
  await f.live.call(req({ runIndex: 1 }))
  assert.equal(f.calls(), 2)
})

test('daily cap refuses live calls past the limit, and a failed call still counts', async () => {
  const f = fakeLive(2)
  await f.live.call(req({ parts: [{ type: 'text', text: '1' }] }))
  await f.live.call(req({ parts: [{ type: 'text', text: '2' }] }))
  await assert.rejects(f.live.call(req({ parts: [{ type: 'text', text: '3' }] })), LiveCapError)
  assert.equal(f.calls(), 2)
  assert.equal(f.store.liveCallsToday(), 2)
  // cached answers are still served after the cap is hit
  assert.equal((await f.live.call(req({ parts: [{ type: 'text', text: '1' }] }))).cached, true)

  const g = fakeLive(1)
  ;(g.live as any).sdk = { messages: { create: async () => { throw new Error('boom') } } }
  await assert.rejects(g.live.call(req()), /boom/)
  assert.equal(g.store.liveCallsToday(), 1)
  await assert.rejects(g.live.call(req({ parts: [{ type: 'text', text: 'x' }] })), LiveCapError)
})

test('token counts are logged for every live call, and the key never is', async () => {
  const f = fakeLive(40)
  await f.live.call(req())
  assert.match(f.lines[0], /in=123 out=45/)
  assert.ok(!f.lines.join('\n').includes('sk-test-not-real'))
  const row = f.store.db.prepare('SELECT input_tokens, output_tokens FROM ai_live_calls').get() as any
  assert.equal(row.input_tokens, 123)
  assert.equal(row.output_tokens, 45)
})

test('images are downscaled to ~1024px JPEG before sending', async () => {
  const c = await getCase('honest_crack')
  const big = path.join(path.dirname(c.photos[0].path), 'big.png')
  await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#888' } }).png().toFile(big)
  const img = await prepareImage(big)
  const meta = await sharp(Buffer.from(img.base64, 'base64')).metadata()
  assert.equal(meta.format, 'jpeg')
  assert.equal(Math.max(meta.width!, meta.height!), 1024)
})

test('the API key file is gitignored and no source file contains a key', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const gi = readFileSync(path.join(here, '..', '..', '..', '..', '.gitignore'), 'utf8')
  assert.match(gi, /^\.env$/m)
  for (const f of ['llm.ts', 'cli.ts', 'config.ts', 'pipeline.ts']) {
    assert.ok(!/sk-ant-/.test(readFileSync(path.join(here, '..', f), 'utf8')))
  }
})

test('poster is dry-run only and validates tiers and hashes', async () => {
  const { Keypair } = await import('@solana/web3.js')
  const { writeFileSync, mkdtempSync } = await import('node:fs')
  const os = await import('node:os')
  const kp = path.join(mkdtempSync(path.join(os.tmpdir(), 'gs-kp-')), 'k.json')
  writeFileSync(kp, JSON.stringify([...Keypair.generate().secretKey]))
  assert.ok(existsSync(kp))
  const h = 'a'.repeat(64)
  const plan = planPostVerdict({ decision: 'POST_VERDICT', tiers: '[2,0]', prompt_hash: h, output_hash: h }, 'RentalPubkey', kp)
  assert.equal(plan.dryRun, true)
  assert.deepEqual(plan.args.tiers, [2, 0])
  assert.throws(() => planPostVerdict({ decision: 'HUMAN_REVIEW', tiers: null, prompt_hash: h, output_hash: h }, 'r', kp))
  assert.throws(() => planPostVerdict({ decision: 'POST_VERDICT', tiers: '[5]', prompt_hash: h, output_hash: h }, 'r', kp))
  assert.throws(() => planPostVerdict({ decision: 'POST_VERDICT', tiers: '[]', prompt_hash: h, output_hash: h }, 'r', kp))
  assert.throws(() => planPostVerdict({ decision: 'POST_VERDICT', tiers: '[1]', prompt_hash: 'abc', output_hash: h }, 'r', kp))
})
