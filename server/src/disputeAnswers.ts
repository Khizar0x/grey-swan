import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { AREAS, DAMAGE_TYPES } from './ai/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(path.join(dataDir, 'greyswan.db'))

// What each party told us about a damage dispute, kept off-chain. One row per
// rental and party, written once: evidence that could be quietly edited after
// the other side has seen it would not be much use to a reviewer.
db.exec(`
  CREATE TABLE IF NOT EXISTS dispute_answers (
    rental_pubkey TEXT NOT NULL,
    party TEXT NOT NULL,
    answers TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (rental_pubkey, party)
  )
`)

export const STATEMENT_MAX = 1000
export const ACCESSORIES_NOTE_MAX = 200

export type Party = 'owner' | 'renter'
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

function text(value: unknown, max: number, required: boolean): string | null {
  if (typeof value !== 'string') return required ? null : ''
  const trimmed = value.trim()
  if (trimmed.length > max) return null
  if (required && trimmed.length === 0) return null
  return trimmed
}

const isOneOf = <T extends string>(value: unknown, list: readonly T[]): value is T => typeof value === 'string' && (list as readonly string[]).includes(value)

// Returns the cleaned answers, or null when anything is missing or out of range.
export function validateOwnerAnswers(body: unknown): OwnerAnswers | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (!Array.isArray(b.areas) || b.areas.length === 0 || !b.areas.every((a) => isOneOf(a, AREAS))) return null
  const areas = [...new Set(b.areas as string[])]
  if (!isOneOf(b.damageType, DAMAGE_TYPES)) return null
  if (!isOneOf(b.severity, ['cosmetic', 'functional'] as const)) return null
  const missingAccessories = text(b.missingAccessories, ACCESSORIES_NOTE_MAX, false)
  const photosCid = text(b.photosCid, 200, true)
  const statement = text(b.statement, STATEMENT_MAX, true)
  if (missingAccessories === null || photosCid === null || statement === null) return null
  return { areas, damageType: b.damageType, severity: b.severity, missingAccessories, photosCid, statement }
}

export function validateRenterAnswers(body: unknown): RenterAnswers | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (!isOneOf(b.agrees, ['yes', 'no'] as const)) return null
  if (!isOneOf(b.duringUse, ['yes', 'no', 'unsure'] as const)) return null
  if (!isOneOf(b.duringPacking, ['yes', 'no', 'unsure'] as const)) return null
  const statement = text(b.statement, STATEMENT_MAX, true)
  if (statement === null) return null
  return { agrees: b.agrees, duringUse: b.duringUse, duringPacking: b.duringPacking, statement }
}

// False when this party has already answered (the first answer stands).
export function insertAnswers(rentalPubkey: string, party: Party, answers: OwnerAnswers | RenterAnswers): boolean {
  const result = db
    .prepare('INSERT OR IGNORE INTO dispute_answers (rental_pubkey, party, answers, created_at) VALUES (?, ?, ?, ?)')
    .run(rentalPubkey, party, JSON.stringify(answers), Date.now())
  return Number(result.changes) === 1
}

export function getAnswers(rentalPubkey: string): { owner: OwnerAnswers | null; renter: RenterAnswers | null } {
  const rows = db.prepare('SELECT party, answers FROM dispute_answers WHERE rental_pubkey = ?').all(rentalPubkey) as { party: Party; answers: string }[]
  const out: { owner: OwnerAnswers | null; renter: RenterAnswers | null } = { owner: null, renter: null }
  for (const row of rows) {
    if (row.party === 'owner') out.owner = JSON.parse(row.answers) as OwnerAnswers
    else out.renter = JSON.parse(row.answers) as RenterAnswers
  }
  return out
}
