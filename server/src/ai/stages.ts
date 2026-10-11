import { z } from 'zod'
import type { LlmClient, LlmRequest, Part } from './llm.js'
import type { PreparedImage } from './images.js'
import * as P from './prompts.js'
import {
  blindSchema, extractSchema, judgeSchema,
  type Blind, type CaseFile, type Claim, type Extraction, type Judge, type PhaseKey,
} from './types.js'

export class PipelineError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

// Everything the models were sent and said, in call order, for the hashes.
export interface RunLog {
  prompts: string[]
  outputs: string[]
}

export interface Ctx {
  client: LlmClient
  log: RunLog
  secret: string
  caseFile: CaseFile
  images: Map<string, PreparedImage> // photo id -> prepared image
  models: { A: string; B: string } // extractors + blind pass
  judgeModels: { A: string; B: string }
}

const promptText = (req: LlmRequest) =>
  req.system + '\n' + req.parts.map((p) => (p.type === 'text' ? p.text : '[image]')).join('\n')

function parseJson(raw: string): unknown {
  const t = raw.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '')
  return JSON.parse(t)
}

// One model call with strict validation. On invalid output: one retry (a real,
// counted call), then give up and let the pipeline route to a human.
async function callValidated<S extends z.ZodTypeAny>(
  ctx: Ctx,
  base: Omit<LlmRequest, 'attempt'>,
  canary: string,
  schema: S,
  check: (v: z.infer<S>) => string | null,
): Promise<z.infer<S>> {
  let lastProblem = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const parts: Part[] = attempt === 0 ? base.parts : [...base.parts, { type: 'text', text: P.RETRY_NOTE }]
    const req: LlmRequest = { ...base, parts, attempt }
    ctx.log.prompts.push(promptText(req) + `\n[model=${req.model}]`)
    const res = await ctx.client.call(req)
    ctx.log.outputs.push(res.text)
    if (res.text.includes(canary)) throw new PipelineError('canary_leak', `Canary leaked in ${base.kind} output`)
    let value: unknown
    try {
      value = parseJson(res.text)
    } catch {
      lastProblem = 'not valid JSON'
      continue
    }
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      lastProblem = 'schema mismatch'
      continue
    }
    const problem = check(parsed.data)
    if (problem) {
      lastProblem = problem
      continue
    }
    return parsed.data
  }
  throw new PipelineError('invalid_output', `${base.kind} output invalid after retry (${lastProblem})`)
}

const NOW_PHASES: PhaseKey[] = ['p3', 'p4', 'dispute']
const BEFORE_PHASES: PhaseKey[] = ['p1', 'p2']

const claimKey = (c: Claim) => `${c.area}|${c.damage_type}|${c.stance}`
export const normaliseClaims = (cs: Claim[]): string[] => [...new Set(cs.map(claimKey))].sort()

// ---- Layer 1: extractors ----------------------------------------------

export async function extractClaims(
  ctx: Ctx,
  party: 'owner' | 'renter',
  body: string,
): Promise<{ claims: Claim[]; injection: boolean }> {
  const results: Extraction[] = []
  for (const slot of ['A', 'B'] as const) {
    const { tag, canary } = P.derive(ctx.secret, ctx.caseFile.caseId, `extract|${party}|${slot}`)
    results.push(
      await callValidated(
        ctx,
        {
          kind: 'extract', model: ctx.models[slot], system: P.extractorSystem(canary),
          parts: [{ type: 'text', text: P.extractorUser(tag, party, body) }],
          maxTokens: 1500, runIndex: 0, meta: { caseId: ctx.caseFile.caseId, party, slot },
        },
        canary, extractSchema, () => null,
      ),
    )
  }
  const [a, b] = results
  const injection = a.injection_detected || b.injection_detected
  if (normaliseClaims(a.claims).join(';') !== normaliseClaims(b.claims).join(';')) {
    throw new PipelineError('claims_mismatch', `The two models extracted different ${party} claims`)
  }
  return { claims: a.claims, injection }
}

// ---- Photo plumbing ---------------------------------------------------

export function photoParts(ctx: Ctx): Part[] {
  const parts: Part[] = []
  for (const p of ctx.caseFile.photos) {
    parts.push({ type: 'text', text: `Photo ${p.id} (phase ${p.phase}):` })
    parts.push({ type: 'image', image: ctx.images.get(p.id)! })
  }
  return parts
}

const photoPhase = (ctx: Ctx): Map<string, PhaseKey> => new Map(ctx.caseFile.photos.map((p) => [p.id, p.phase]))

const photoListText = (ctx: Ctx) => ctx.caseFile.photos.map((p) => `${p.id} = phase ${p.phase}`).join('\n')

// ---- Layer 3: blind visual pass ---------------------------------------

export async function blindPass(ctx: Ctx, slot: 'A' | 'B'): Promise<Blind> {
  const { canary } = P.derive(ctx.secret, ctx.caseFile.caseId, `blind|${slot}`)
  const phases = photoPhase(ctx)
  return callValidated(
    ctx,
    {
      kind: 'blind', model: ctx.models[slot], system: P.blindSystem(canary),
      parts: [{ type: 'text', text: P.blindUser(photoListText(ctx)) }, ...photoParts(ctx)],
      maxTokens: 8000, runIndex: 0, meta: { caseId: ctx.caseFile.caseId, slot },
    },
    canary, blindSchema,
    (v) => {
      for (const e of v.entries) {
        for (const id of e.photo_ids) {
          if (!phases.has(id)) return `unknown photo id ${id}`
          if (phases.get(id) !== e.phase) return `photo ${id} cited under wrong phase`
        }
        if (e.visible && e.photo_ids.length === 0) return 'visible entry without photo ids'
      }
      return null
    },
  )
}

// ---- Judge ------------------------------------------------------------

export async function judge(
  ctx: Ctx, slot: 'A' | 'B', runIndex: number,
  claims: { owner: Claim[]; renter: Claim[] }, blind: Blind,
): Promise<Judge> {
  const { tag, canary } = P.derive(ctx.secret, ctx.caseFile.caseId, `judge|${slot}`)
  const phases = photoPhase(ctx)
  return callValidated(
    ctx,
    {
      kind: 'judge', model: ctx.judgeModels[slot], system: P.judgeSystem(canary),
      parts: [
        { type: 'text', text: P.judgeUser(tag, JSON.stringify(claims), JSON.stringify(blind.entries), photoListText(ctx)) },
        ...photoParts(ctx),
      ],
      maxTokens: 4000, runIndex, meta: { caseId: ctx.caseFile.caseId, slot },
    },
    canary, judgeSchema,
    (v) => {
      const seen = new Set<string>()
      for (const f of v.findings) {
        if (seen.has(f.area)) return `duplicate finding for ${f.area}`
        seen.add(f.area)
        for (const id of [...f.photo_ids_now, ...f.photo_ids_before]) if (!phases.has(id)) return `unknown photo id ${id}`
        // current condition comes from p3/p4/dispute photos, the baseline from p1/p2
        for (const id of f.photo_ids_now) if (!NOW_PHASES.includes(phases.get(id)!)) return `photo ${id} is not a current-condition photo`
        for (const id of f.photo_ids_before) if (!BEFORE_PHASES.includes(phases.get(id)!)) return `photo ${id} is not an earlier photo`
        if (f.tier > 0 && f.photo_ids_now.length === 0) return 'tier above 0 without photo evidence'
      }
      return null
    },
  )
}
