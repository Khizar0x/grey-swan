import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(path.join(dataDir, 'greyswan.db'))

// The rental's delivery method (ship vs. local pickup) — chosen by the
// renter at rent time. This is a logistics preference, not PII like a
// shipping address, but it's still specific to one rental (not a standing
// property of a wallet), so it's keyed the same way addresses.ts keys its
// rows: by rental pubkey.
export type DeliveryMethod = 'ship' | 'pickup'

db.exec(`
  CREATE TABLE IF NOT EXISTS rental_delivery (
    rental_pubkey TEXT PRIMARY KEY,
    method TEXT NOT NULL,
    owner_pubkey TEXT NOT NULL,
    renter_pubkey TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)

export interface DeliveryRow {
  rental_pubkey: string
  method: DeliveryMethod
  owner_pubkey: string
  renter_pubkey: string
  created_at: number
  updated_at: number
}

export function getDeliveryMethod(rentalPubkey: string): DeliveryRow | undefined {
  return db.prepare('SELECT * FROM rental_delivery WHERE rental_pubkey = ?').get(rentalPubkey) as DeliveryRow | undefined
}

export function upsertDeliveryMethod(
  rentalPubkey: string,
  method: DeliveryMethod,
  ownerPubkey: string,
  renterPubkey: string,
): DeliveryRow {
  const now = Date.now()
  db.prepare(
    `INSERT INTO rental_delivery (rental_pubkey, method, owner_pubkey, renter_pubkey, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(rental_pubkey) DO UPDATE SET
       method = excluded.method,
       updated_at = excluded.updated_at`,
  ).run(rentalPubkey, method, ownerPubkey, renterPubkey, now, now)
  return getDeliveryMethod(rentalPubkey)!
}
