import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

// node:sqlite is built into Node 22.5+ (still flagged experimental, but
// stable enough for this) — avoids adding a native-compiled dependency
// (better-sqlite3) just to persist a handful of profile rows.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(path.join(dataDir, 'greyswan.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    pubkey TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)

export interface Profile {
  pubkey: string
  name: string
  email: string | null
  created_at: number
  updated_at: number
}

export function getProfile(pubkey: string): Profile | undefined {
  return db.prepare('SELECT * FROM profiles WHERE pubkey = ?').get(pubkey) as Profile | undefined
}

export function upsertProfile(pubkey: string, name: string, email: string | null): Profile {
  const now = Date.now()
  db.prepare(
    `INSERT INTO profiles (pubkey, name, email, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(pubkey) DO UPDATE SET name = excluded.name, email = excluded.email, updated_at = excluded.updated_at`,
  ).run(pubkey, name, email, now, now)
  return getProfile(pubkey)!
}
