import { createHash } from 'node:crypto'
import {
  AUTO_RELEASE_MAX_TIER, AREAS, NON_VISUAL,
  type Area, type Blind, type Claim, type Decision, type Judge, type JudgeFinding,
} from './types.js'

// Every field a decision could depend on. Reasoning text and confidence are
// deliberately absent: reasoning is for humans only, and confidence is a
// routing input (any "low" escalates) rather than something that must match.
export function decisionKey(j: Judge): string {
  const rows = [...j.findings]
    .sort((a, b) => a.area.localeCompare(b.area))
    .map((f) =>
      [
        f.area, f.tier, f.claim_status, f.earlier_photos_covered_area, f.item_identity_confirmed, f.injection_detected,
        [...f.photo_ids_now].sort().join(','), [...f.photo_ids_before].sort().join(','),
      ].join('|'),
    )
  return `inj=${j.injection_detected};${rows.join(';')}`
}

export interface RouteInput {
  caseId: string
  depositPence: number
  ownerClaims: Claim[]
  injectionSignals: string[] // sanitiser / heuristic / extractor flags, already collected
  blinds: Blind[] // one per model
  judges: Judge[] // all runs of all models
  depositThresholdPence: number
  auditRate: number
  walletRisk: boolean
  linkedWallets: boolean
}

// Reproducible per case (so a re-run doesn't flip the outcome), but unbiased.
export function auditSelected(caseId: string, rate: number): boolean {
  const byte = createHash('sha256').update(`audit|${caseId}`).digest()[0]
  return byte / 256 < rate
}

export function route(input: RouteInput): Decision {
  const reasons: string[] = []
  const human = (r: string) => reasons.push(r)

  // injection flagged anywhere
  if (input.injectionSignals.length) human(`injection signal: ${input.injectionSignals.join(', ')}`)
  if (input.blinds.some((b) => b.text_in_photos)) human('injection signal: text found inside a photo')
  if (input.judges.some((j) => j.injection_detected || j.findings.some((f) => f.injection_detected))) human('injection signal: judge flagged injection')

  if (input.judges.length === 0) human('no judge output')
  else {
    // runs and models must agree exactly
    const keys = new Set(input.judges.map(decisionKey))
    if (keys.size > 1) human('disagreement between runs or models')
  }

  const j = input.judges[0]
  const findings: JudgeFinding[] = j ? j.findings : []
  const claimedAreas = new Set<Area>(input.ownerClaims.filter((c) => c.stance === 'damage_present').map((c) => c.area))

  if (claimedAreas.size === 0) human('owner made no damage claim')
  if (findings.length === 0) human('no findings')

  for (const area of claimedAreas) {
    if (!findings.some((f) => f.area === area)) human(`claimed area ${area} was not assessed`)
    // independent cross-check from the blind passes: area must be shown in the
    // owner's p1 photos (the baseline) and in the current photos
    for (const b of input.blinds) {
      const shown = (phase: string) => b.entries.some((e) => e.area === area && e.phase === phase && e.visible)
      if (!shown('p1')) human(`uncovered area: ${area} not visible in phase 1 photos`)
      if (!shown('p4') && !shown('dispute')) human(`area ${area} not visible in the return photos`)
    }
  }

  for (const f of findings) {
    if (f.confidence === 'low') human(`low confidence on ${f.area}`)
    if (!f.earlier_photos_covered_area && claimedAreas.has(f.area)) human(`uncovered area: no earlier photo of ${f.area}`)
    if (!f.item_identity_confirmed) human(`item identity not confirmed (${f.area})`)
    if (f.claim_status === 'unverifiable' && claimedAreas.has(f.area)) human(`claim on ${f.area} cannot be verified from photos`)
    if (f.tier > 0 && !claimedAreas.has(f.area)) human(`damage seen in ${f.area} that the owner did not claim`)
  }
  for (const c of input.ownerClaims) {
    if (c.stance === 'damage_present' && NON_VISUAL.includes(c.damage_type)) human(`main claim (${c.damage_type}) cannot be judged from photos`)
  }

  const maxTier = Math.max(0, ...findings.map((f) => f.tier))
  if (maxTier > AUTO_RELEASE_MAX_TIER) human(`tier ${maxTier} is above the auto-release cap`)
  if (input.depositPence > input.depositThresholdPence) human('deposit above the auto-release threshold')
  if (auditSelected(input.caseId, input.auditRate)) human('random audit')
  if (input.walletRisk) human('wallet dispute history flagged')
  if (input.linkedWallets) human('linked wallets flagged')

  if (reasons.length) return { kind: 'HUMAN_REVIEW', reasons }

  // Damage only counts when the owner claimed it AND the photos support it.
  const ordered = [...findings].sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area))
  const tiers = ordered.map((f) => (claimedAreas.has(f.area) && f.claim_status === 'supported' && f.photo_ids_now.length > 0 ? f.tier : 0))
  return { kind: 'POST_VERDICT', tiers, areas: ordered.map((f) => f.area), reasons: ['all checks passed'] }
}
