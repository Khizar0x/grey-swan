import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(path.join(dataDir, 'greyswan.db'))

// The dispute itself (reason, photos, frozen amount) lives on-chain — this
// is only the admin's own review status and notes on top of it, same as
// addresses.ts is only shipping details on top of a rental. Deliberately
// not a public rental status: it's for the admin page alone.
export type DisputeReviewStatus = 'under_review' | 'resolved'

db.exec(`
  CREATE TABLE IF NOT EXISTS dispute_notes (
    rental_pubkey TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'under_review',
    note TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  )
`)

export interface DisputeNoteRow {
  rental_pubkey: string
  status: DisputeReviewStatus
  note: string
  updated_at: number
}

export function listDisputeNotes(): DisputeNoteRow[] {
  return db.prepare('SELECT * FROM dispute_notes').all() as unknown as DisputeNoteRow[]
}

export function upsertDisputeNote(rentalPubkey: string, status: DisputeReviewStatus, note: string): DisputeNoteRow {
  const now = Date.now()
  db.prepare(
    `INSERT INTO dispute_notes (rental_pubkey, status, note, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(rental_pubkey) DO UPDATE SET
       status = excluded.status,
       note = excluded.note,
       updated_at = excluded.updated_at`,
  ).run(rentalPubkey, status, note, now)
  return db.prepare('SELECT * FROM dispute_notes WHERE rental_pubkey = ?').get(rentalPubkey) as unknown as DisputeNoteRow
}
