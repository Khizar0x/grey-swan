import { randomInt } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(path.join(dataDir, 'greyswan.db'))

// One short code per rental and handover phase. The person writes it on
// paper and includes it in the front shot, so a photo taken before the phase
// opened (or reused from another rental) cannot contain it. The primary key
// on (rental_pubkey, phase) is what makes a code immutable: issuing is an
// INSERT OR IGNORE, so a second request can only ever read the first code.
db.exec(`
  CREATE TABLE IF NOT EXISTS phase_codes (
    rental_pubkey TEXT NOT NULL,
    phase INTEGER NOT NULL,
    code TEXT NOT NULL,
    issued_to TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (rental_pubkey, phase)
  )
`)

// No 0/O or 1/I/L, since the code is copied by hand onto paper.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateCode(): string {
  let suffix = ''
  for (let i = 0; i < 4; i++) suffix += ALPHABET[randomInt(ALPHABET.length)]
  return `SWAN-${suffix}`
}

export function getPhaseCode(rentalPubkey: string, phase: number): string | null {
  const row = db.prepare('SELECT code FROM phase_codes WHERE rental_pubkey = ? AND phase = ?').get(rentalPubkey, phase) as
    | { code: string }
    | undefined
  return row?.code ?? null
}

export function issuePhaseCode(rentalPubkey: string, phase: number, issuedTo: string): string {
  db.prepare('INSERT OR IGNORE INTO phase_codes (rental_pubkey, phase, code, issued_to, created_at) VALUES (?, ?, ?, ?, ?)').run(
    rentalPubkey,
    phase,
    generateCode(),
    issuedTo,
    Date.now(),
  )
  return getPhaseCode(rentalPubkey, phase)!
}
