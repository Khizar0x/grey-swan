// Mirrors server/src/disputeAnswers.ts. Answers are saved once per party.
export type Severity = 'cosmetic' | 'functional'
export type YesNoUnsure = 'yes' | 'no' | 'unsure'

export interface OwnerAnswers {
  areas: string[]
  damageType: string
  severity: Severity
  missingAccessories: string
  photosCid: string
  statement: string
}

export interface RenterAnswers {
  agrees: 'yes' | 'no'
  duringUse: YesNoUnsure
  duringPacking: YesNoUnsure
  statement: string
}

export interface DisputeAnswers {
  owner: OwnerAnswers | null
  renter: RenterAnswers | null
}

export const STATEMENT_MAX = 1000

export const DAMAGE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'scratch', label: 'Scratch' },
  { value: 'dent', label: 'Dent' },
  { value: 'crack', label: 'Crack' },
  { value: 'missing_part', label: 'Missing part' },
  { value: 'not_working', label: 'Not working' },
  { value: 'other', label: 'Something else' },
]

export function damageTypeLabel(value: string): string {
  return DAMAGE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value
}

export async function fetchDisputeAnswers(rentalPubkey: string, token: string): Promise<DisputeAnswers> {
  const res = await fetch(`/api/dispute-answers/${rentalPubkey}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error("Couldn't load the answers for this rental.")
  return (await res.json()) as DisputeAnswers
}

export async function saveDisputeAnswers(rentalPubkey: string, body: OwnerAnswers | RenterAnswers, token: string): Promise<DisputeAnswers> {
  const res = await fetch(`/api/dispute-answers/${rentalPubkey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(err?.error ?? "Couldn't save your answers. Try again.")
  }
  return (await res.json()) as DisputeAnswers
}

// The on-chain reason is capped at 300 characters, so it carries a short
// summary; the full answers and statement live in the answers above.
export function composeReason(a: Pick<OwnerAnswers, 'areas' | 'damageType' | 'severity' | 'statement'>, areaLabel: (id: string) => string): string {
  const head = `${damageTypeLabel(a.damageType)} (${a.severity}) on ${a.areas.map(areaLabel).join(', ')}. `
  return (head + a.statement).slice(0, 300)
}
