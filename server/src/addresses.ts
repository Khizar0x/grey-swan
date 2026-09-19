import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(path.join(dataDir, 'greyswan.db'))

// Shipping addresses are real PII and never belong on a public, permanent
// ledger — kept here, off-chain, same as profiles. Keyed by rental pubkey +
// role rather than by person, since a delivery address is specific to one
// rental (the renter role) and a return address to that same rental (the
// owner role) — not a standing property of a wallet the way a profile is.
export type AddressRole = 'renter_delivery' | 'owner_return'

db.exec(`
  CREATE TABLE IF NOT EXISTS addresses (
    rental_pubkey TEXT NOT NULL,
    role TEXT NOT NULL,
    address TEXT NOT NULL,
    provided_by_pubkey TEXT NOT NULL,
    owner_pubkey TEXT NOT NULL,
    renter_pubkey TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (rental_pubkey, role)
  )
`)

export interface AddressRow {
  rental_pubkey: string
  role: AddressRole
  address: string
  provided_by_pubkey: string
  owner_pubkey: string
  renter_pubkey: string
  created_at: number
  updated_at: number
}

export function getAddress(rentalPubkey: string, role: AddressRole): AddressRow | undefined {
  return db.prepare('SELECT * FROM addresses WHERE rental_pubkey = ? AND role = ?').get(rentalPubkey, role) as
    | AddressRow
    | undefined
}

export function upsertAddress(
  rentalPubkey: string,
  role: AddressRole,
  address: string,
  providedByPubkey: string,
  ownerPubkey: string,
  renterPubkey: string,
): AddressRow {
  const now = Date.now()
  db.prepare(
    `INSERT INTO addresses (rental_pubkey, role, address, provided_by_pubkey, owner_pubkey, renter_pubkey, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(rental_pubkey, role) DO UPDATE SET
       address = excluded.address,
       provided_by_pubkey = excluded.provided_by_pubkey,
       owner_pubkey = excluded.owner_pubkey,
       renter_pubkey = excluded.renter_pubkey,
       updated_at = excluded.updated_at`,
  ).run(rentalPubkey, role, address, providedByPubkey, ownerPubkey, renterPubkey, now, now)
  return getAddress(rentalPubkey, role)!
}
