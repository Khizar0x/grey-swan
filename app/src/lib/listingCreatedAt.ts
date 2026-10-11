import type { Connection } from '@solana/web3.js'
import { PublicKey } from '@solana/web3.js'

// Listing accounts carry no on-chain timestamp (see CLAUDE.md — the data
// model is frozen for this MVP), so "newest first" for Digital & Cloud is
// derived from the PDA's own transaction history instead: the oldest
// signature against it is the list_item call that created it. One page of
// 1000 signatures is far more than any listing PDA accumulates in practice
// (create, the occasional update, a rent/return cycle), so no pagination.
async function fetchCreatedAt(connection: Connection, pubkey: string): Promise<number | null> {
  const signatures = await connection.getSignaturesForAddress(new PublicKey(pubkey), { limit: 1000 })
  if (signatures.length === 0) return null
  const oldest = signatures[signatures.length - 1]
  return oldest.blockTime ?? null
}

// Lives for the life of the tab — a listing's creation time never changes,
// so there's nothing to invalidate.
const createdAtCache = new Map<string, Promise<number | null>>()

export function getListingCreatedAtCached(connection: Connection, pubkey: string): Promise<number | null> {
  let pending = createdAtCache.get(pubkey)
  if (!pending) {
    pending = fetchCreatedAt(connection, pubkey)
    createdAtCache.set(pubkey, pending)
  }
  return pending
}
