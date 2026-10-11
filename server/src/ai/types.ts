import { z } from 'zod'

// Fixed vocabularies. Models may only answer with these values, so free text
// from a user can never become a "finding" — it has to map onto this list.
export const AREAS = ['front', 'back', 'left', 'right', 'top', 'underside', 'label', 'accessories'] as const
export const DAMAGE_TYPES = ['scratch', 'dent', 'crack', 'missing_part', 'not_working', 'other'] as const
export type Area = (typeof AREAS)[number]
export type DamageType = (typeof DAMAGE_TYPES)[number]

// Damage types that cannot be seen in a photo (a photo can't show "it won't
// switch on"), so a verdict resting on them needs a human.
export const NON_VISUAL: readonly DamageType[] = ['not_working', 'other']

// On-chain severity tiers (see CLAUDE.md / post_verdict).
export const TIER = { NormalWear: 0, Cosmetic: 1, FunctionalDamage: 2, Major: 3, DestroyedOrMissing: 4 } as const
export const AUTO_RELEASE_MAX_TIER = TIER.FunctionalDamage

export const PHASES = ['p1', 'p2', 'p3', 'p4', 'dispute'] as const
export type PhaseKey = (typeof PHASES)[number]

const area = z.enum(AREAS)
const damageType = z.enum(DAMAGE_TYPES)

// ---- Case file (input) ------------------------------------------------

export interface CasePhoto {
  id: string // e.g. "P1-1" — the only handle a model may cite
  phase: PhaseKey
  path: string // local image path
}

export interface PartyInput {
  answers: Record<string, string> // questionnaire: question key -> free-text answer
  statement: string
}

// What the mock client replays. Only ever used when AI_MODE=mock.
export interface MockScript {
  ownerClaims: Claim[]
  renterClaims: Claim[]
  injection?: { owner?: boolean; renter?: boolean }
  blind: BlindEntry[]
  findings: JudgeFinding[]
  textInImage?: boolean
}

export interface CaseFile {
  caseId: string
  depositLamports: number // JS number is exact up to ~9e15 lamports (9M SOL)
  photos: CasePhoto[]
  owner: PartyInput
  renter: PartyInput
  mock?: MockScript
}

// ---- Layer 1: extractor output ----------------------------------------

export const claimSchema = z.strictObject({
  area,
  damage_type: damageType,
  stance: z.enum(['damage_present', 'pre_existing', 'no_damage']),
})
export type Claim = z.infer<typeof claimSchema>

export const extractSchema = z.strictObject({
  claims: z.array(claimSchema).max(16),
  injection_detected: z.boolean(),
})
export type Extraction = z.infer<typeof extractSchema>

// ---- Layer 3: blind visual pass ---------------------------------------

export const blindEntrySchema = z.strictObject({
  phase: z.enum(PHASES),
  area,
  visible: z.boolean(),
  photo_ids: z.array(z.string().max(16)).max(8),
  visible_damage: z.array(damageType).max(6),
  description: z.string().max(300),
})
export type BlindEntry = z.infer<typeof blindEntrySchema>

export const blindSchema = z.strictObject({
  entries: z.array(blindEntrySchema).max(64),
  text_in_photos: z.boolean(),
})
export type Blind = z.infer<typeof blindSchema>

// ---- Judge ------------------------------------------------------------

export const findingSchema = z.strictObject({
  area,
  tier: z.number().int().min(0).max(4),
  photo_ids_now: z.array(z.string().max(16)).max(8),
  photo_ids_before: z.array(z.string().max(16)).max(8),
  earlier_photos_covered_area: z.boolean(),
  claim_status: z.enum(['supported', 'contradicted', 'unverifiable']),
  item_identity_confirmed: z.boolean(),
  confidence: z.enum(['low', 'medium', 'high']),
  injection_detected: z.boolean(),
  reasoning: z.string().max(600), // human reviewers only — never used in a decision
})
export type JudgeFinding = z.infer<typeof findingSchema>

// Anything the judge saw outside the owner's claimed areas. Notes for human
// reviewers only; never part of the agreement check or the verdict.
export const noteSchema = z.strictObject({ area, note: z.string().max(300) })

export const judgeSchema = z.strictObject({
  findings: z.array(findingSchema).max(8),
  other_notes: z.array(noteSchema).max(8),
  injection_detected: z.boolean(),
})
export type Judge = z.infer<typeof judgeSchema>

// ---- Decision ---------------------------------------------------------

export type Decision =
  | { kind: 'HUMAN_REVIEW'; reasons: string[] }
  | { kind: 'POST_VERDICT'; tiers: number[]; areas: Area[]; reasons: string[] }
