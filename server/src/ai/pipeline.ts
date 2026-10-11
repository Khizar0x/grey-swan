import { randomBytes } from 'node:crypto'
import type { AiConfig } from './config.js'
import { prepareImage, type PreparedImage } from './images.js'
import { sha256, type LlmClient } from './llm.js'
import { route } from './route.js'
import { LIMITS, looksLikeInjection, sanitiseAnswers, sanitiseText } from './sanitise.js'
import { blindPass, extractClaims, judge, PipelineError, type Ctx, type RunLog } from './stages.js'
import type { AiStore } from './store.js'
import type { Blind, CaseFile, Claim, Decision, Judge, PartyInput } from './types.js'

// Stub hooks: wallet dispute history and linked-wallet detection come later.
// true means "risky, send to a human".
export interface RiskHooks {
  walletDisputeHistory(c: CaseFile): Promise<boolean>
  linkedWallets(c: CaseFile): Promise<boolean>
}
export const noRiskHooks: RiskHooks = { walletDisputeHistory: async () => false, linkedWallets: async () => false }

export interface PipelineDeps {
  config: AiConfig
  store: AiStore
  client: LlmClient
  hooks?: RiskHooks
}

export interface PipelineResult {
  decision: Decision
  promptHash: string
  outputHash: string
  reasoning: string[]
}

// The secret seeds per-case delimiters and canaries. Never logged.
function secretFor(config: AiConfig, store: AiStore): string {
  if (config.secret) return config.secret
  store.db.exec('CREATE TABLE IF NOT EXISTS ai_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)')
  const row = store.db.prepare("SELECT v FROM ai_meta WHERE k='secret'").get() as { v: string } | undefined
  if (row) return row.v
  const v = randomBytes(32).toString('hex')
  store.db.prepare("INSERT INTO ai_meta (k, v) VALUES ('secret', ?)").run(v)
  return v
}

function renderParty(party: PartyInput): { body: string; signals: string[] } {
  const a = sanitiseAnswers(party.answers)
  const s = sanitiseText(party.statement, LIMITS.statement)
  const lines = Object.entries(a.answers).map(([k, v]) => `${k}: ${v}`)
  const body = `Answers:\n${lines.join('\n') || '(none)'}\nStatement:\n${s.text}`
  const signals = [...a.suspicious, ...s.suspicious].map((x) => `sanitiser:${x}`)
  if (looksLikeInjection(body)) signals.push('heuristic:instruction-like text')
  return { body, signals }
}

export async function runCase(caseFile: CaseFile, deps: PipelineDeps): Promise<PipelineResult> {
  const { config, store, client } = deps
  const log: RunLog = { prompts: [], outputs: [] }
  const reasoning: string[] = []
  let decision: Decision

  try {
    const secret = secretFor(config, store)
    const owner = renderParty(caseFile.owner)
    const renter = renderParty(caseFile.renter)
    const signals = [...owner.signals.map((s) => `owner ${s}`), ...renter.signals.map((s) => `renter ${s}`)]

    // Suspicious text never reaches a model: stop here, spend nothing.
    if (signals.length) {
      decision = { kind: 'HUMAN_REVIEW', reasons: signals.map((s) => `injection signal: ${s}`) }
    } else {
      const images = new Map<string, PreparedImage>()
      for (const p of caseFile.photos) images.set(p.id, await prepareImage(p.path))
      const ctx: Ctx = { client, log, secret, caseFile, images, models: { A: config.modelA, B: config.modelB } }

      const o = await extractClaims(ctx, 'owner', owner.body)
      const r = await extractClaims(ctx, 'renter', renter.body)
      const extractorSignals = [o.injection && 'owner extractor flagged injection', r.injection && 'renter extractor flagged injection'].filter(Boolean) as string[]

      const blinds: Record<'A' | 'B', Blind> = { A: await blindPass(ctx, 'A'), B: await blindPass(ctx, 'B') }
      const claims: { owner: Claim[]; renter: Claim[] } = { owner: o.claims, renter: r.claims }
      const judges: Judge[] = []
      for (const slot of ['A', 'B'] as const) {
        for (const run of [0, 1]) judges.push(await judge(ctx, slot, run, claims, blinds[slot]))
      }
      for (const j of judges) for (const f of j.findings) reasoning.push(`[${f.area}] ${f.reasoning}`)

      decision = route({
        caseId: caseFile.caseId, depositPence: caseFile.depositPence, ownerClaims: o.claims,
        injectionSignals: extractorSignals, blinds: [blinds.A, blinds.B], judges,
        depositThresholdPence: config.depositThresholdPence, auditRate: config.auditRate,
        walletRisk: await (deps.hooks ?? noRiskHooks).walletDisputeHistory(caseFile),
        linkedWallets: await (deps.hooks ?? noRiskHooks).linkedWallets(caseFile),
      })
    }
  } catch (e) {
    // Fail closed: any error, timeout, cap hit or invalid output goes to a human.
    const code = e instanceof PipelineError ? e.code : 'error'
    const msg = e instanceof Error ? e.message : String(e)
    decision = { kind: 'HUMAN_REVIEW', reasons: [`${code}: ${msg}`] }
  }

  const promptHash = sha256(log.prompts.join('\n---\n') + `\nmodels=${config.modelA},${config.modelB}`)
  const outputHash = sha256(log.outputs.join('\n---\n'))
  store.insertVerdict({
    case_id: caseFile.caseId, mode: config.mode, decision: decision.kind,
    tiers: decision.kind === 'POST_VERDICT' ? JSON.stringify(decision.tiers) : null,
    reasons: JSON.stringify(decision.reasons), prompt_hash: promptHash, output_hash: outputHash,
    models: `${config.modelA},${config.modelB}`, reasoning: reasoning.join('\n'),
  })
  return { decision, promptHash, outputHash, reasoning }
}
