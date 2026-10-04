import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(path.join(dataDir, 'greyswan.db'))

// A listing's general area (city, neighborhood, or postcode — never a full
// address) so a prospective renter considering local pickup can judge
// roughly how far away the item is before committing to rent it. This is
// deliberately public and coarse: unlike addresses.ts (exact addresses,
// readable only by the two parties of a specific rental, and only once one
// exists), this exists *before* any rental, tied to the listing itself, and
// is meant to be shown to anyone browsing.
db.exec(`
  CREATE TABLE IF NOT EXISTS listing_areas (
    listing_pubkey TEXT PRIMARY KEY,
    owner_pubkey TEXT NOT NULL,
    area TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)

export interface ListingAreaRow {
  listing_pubkey: string
  owner_pubkey: string
  area: string
  created_at: number
  updated_at: number
}

export function getListingArea(listingPubkey: string): ListingAreaRow | undefined {
  return db.prepare('SELECT * FROM listing_areas WHERE listing_pubkey = ?').get(listingPubkey) as
    | ListingAreaRow
    | undefined
}

// Bulk read for the browse page's "available in your area" pill, which
// needs every listing's area at once to compute distances — one query
// instead of a fetch per listing card.
export function getAllListingAreas(): ListingAreaRow[] {
  return db.prepare('SELECT * FROM listing_areas').all() as unknown as ListingAreaRow[]
}

export function upsertListingArea(listingPubkey: string, ownerPubkey: string, area: string): ListingAreaRow {
  const now = Date.now()
  db.prepare(
    `INSERT INTO listing_areas (listing_pubkey, owner_pubkey, area, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(listing_pubkey) DO UPDATE SET
       area = excluded.area,
       updated_at = excluded.updated_at`,
  ).run(listingPubkey, ownerPubkey, area, now, now)
  return getListingArea(listingPubkey)!
}
