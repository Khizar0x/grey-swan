import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildStagedCases } from '../cases.js'
import type { AiConfig } from '../config.js'
import type { LlmClient, LlmRequest } from '../llm.js'
import { scriptedMock, tamper } from '../mock.js'
import { runCase, type PipelineResult, type RiskHooks } from '../pipeline.js'
import { AiStore } from '../store.js'
import type { CaseFile } from '../types.js'

export const TEST_SECRET = 'test-secret-not-real'

let cached: Promise<Map<string, CaseFile>> | undefined
export function stagedCases(): Promise<Map<string, CaseFile>> {
  cached ??= buildStagedCases(mkdtempSync(path.join(os.tmpdir(), 'gs-ai-'))).then((l) => new Map(l.map((c) => [c.caseId, c])))
  return cached
}

export async function getCase(name: string): Promise<CaseFile> {
  return structuredClone((await stagedCases()).get(name)!)
}

export const testConfig = (over: Partial<AiConfig> = {}): AiConfig => ({
  mode: 'mock', modelA: 'model-a', modelB: 'model-b', judgeModelA: 'judge-a', judgeModelB: 'judge-b', dailyLiveCap: 40, dbPath: ':memory:',
  largeDepositThresholdLamports: 5_000_000_000, auditRate: 0, apiKey: undefined, secret: TEST_SECRET, ...over,
})

export interface RunOpts {
  config?: Partial<AiConfig>
  mutate?: (req: LlmRequest, parsed: any) => any // edit the parsed model reply; return it
  rawMutate?: (req: LlmRequest, text: string) => string
  client?: LlmClient
  hooks?: RiskHooks
}

export async function run(c: CaseFile, o: RunOpts = {}): Promise<PipelineResult & { calls: number; store: AiStore }> {
  let calls = 0
  const inner = o.client ?? scriptedMock(c)
  const counting: LlmClient = { call: (r) => { calls++; return inner.call(r) } }
  const base = tamper(counting, (req, text) => {
    if (o.rawMutate) return o.rawMutate(req, text)
    if (!o.mutate) return text
    return JSON.stringify(o.mutate(req, JSON.parse(text)))
  })
  const store = new AiStore(':memory:')
  const res = await runCase(c, { config: testConfig(o.config), store, client: base, hooks: o.hooks })
  return { ...res, calls, store }
}

export const isHuman = (r: PipelineResult) => r.decision.kind === 'HUMAN_REVIEW'
export const reasonsOf = (r: PipelineResult) => r.decision.reasons.join(' | ')
