import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(path.join(dataDir, 'greyswan.db'))

export const MESSAGE_MAX_LEN = 5000

// Off-chain only, same as addresses/delivery/dispute notes — a rental-tied
// chat, not a standing conversation between two pubkeys, so it's keyed by
// rental pubkey. Indexed on rental_pubkey since every query here (thread
// fetch, mark-read, unread count) filters by it first.
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rental_pubkey TEXT NOT NULL,
    sender_pubkey TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    read_at INTEGER
  )
`)
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_rental_pubkey ON messages (rental_pubkey)')

export interface MessageRow {
  id: number
  rental_pubkey: string
  sender_pubkey: string
  body: string
  created_at: number
  read_at: number | null
}

function getMessageById(id: number | bigint): MessageRow | undefined {
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined
}

export function insertMessage(rentalPubkey: string, senderPubkey: string, body: string): MessageRow {
  const now = Date.now()
  const result = db
    .prepare('INSERT INTO messages (rental_pubkey, sender_pubkey, body, created_at, read_at) VALUES (?, ?, ?, ?, NULL)')
    .run(rentalPubkey, senderPubkey, body, now)
  return getMessageById(result.lastInsertRowid)!
}

export function listMessages(rentalPubkey: string): MessageRow[] {
  return db.prepare('SELECT * FROM messages WHERE rental_pubkey = ? ORDER BY created_at ASC, id ASC').all(rentalPubkey) as unknown as MessageRow[]
}

// Powers the inbox list (GET /api/messages/summary) — unlike listMessages,
// this never marks anything read, since just seeing a preview in the inbox
// isn't the same as actually opening the conversation.
export function getLastMessage(rentalPubkey: string): MessageRow | undefined {
  return db.prepare('SELECT * FROM messages WHERE rental_pubkey = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(rentalPubkey) as MessageRow | undefined
}

// Simplest "mark as read" approach, per design: called as a side effect of
// fetching the thread, never a separate endpoint. Only ever marks the
// *other* party's messages — a sender's own messages were never unread for
// them in the first place.
export function markReadExceptSender(rentalPubkey: string, readerPubkey: string): void {
  db.prepare('UPDATE messages SET read_at = ? WHERE rental_pubkey = ? AND sender_pubkey != ? AND read_at IS NULL').run(
    Date.now(),
    rentalPubkey,
    readerPubkey,
  )
}

export function countUnread(rentalPubkey: string, readerPubkey: string): number {
  const row = db
    .prepare('SELECT COUNT(*) as count FROM messages WHERE rental_pubkey = ? AND sender_pubkey != ? AND read_at IS NULL')
    .get(rentalPubkey, readerPubkey) as { count: number }
  return row.count
}
