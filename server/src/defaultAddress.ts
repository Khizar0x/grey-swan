import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(path.join(dataDir, 'greyswan.db'))

// A wallet's own standing delivery address, independent of any one rental —
// distinct from addresses.ts, which is keyed by (rental_pubkey, role) and
// only exists once a specific rental is underway. This is what the Account
// Settings page reads/writes; a new rental's address form can still prefill
// from here (or from addresses.ts's getLatestRenterAddress) without this
// table ever being written to by that flow.
db.exec(`
  CREATE TABLE IF NOT EXISTS default_addresses (
    pubkey TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)

export interface DefaultAddressRow {
  pubkey: string
  address: string
  updated_at: number
}

export function getDefaultAddress(pubkey: string): DefaultAddressRow | undefined {
  return db.prepare('SELECT * FROM default_addresses WHERE pubkey = ?').get(pubkey) as DefaultAddressRow | undefined
}

export function upsertDefaultAddress(pubkey: string, address: string): DefaultAddressRow {
  const now = Date.now()
  db.prepare(
    `INSERT INTO default_addresses (pubkey, address, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(pubkey) DO UPDATE SET address = excluded.address, updated_at = excluded.updated_at`,
  ).run(pubkey, address, now)
  return getDefaultAddress(pubkey)!
}
