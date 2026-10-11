import { Connection, PublicKey } from '@solana/web3.js'

const PROGRAM_ID = new PublicKey('2YnarssLwdKPi3Br6C6cUcAuKyyoDagXaHZWo3kykcko')
const RPC_URL = process.env.RPC_URL ?? 'https://api.devnet.solana.com'

const [CONFIG_PDA] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID)

let cachedAdmin: string | null = null

// The admin page's entire access control rests on this pubkey (see
// CLAUDE.md — Config is initialized once and never touched again), so it's
// read from the deployed account rather than duplicated as a hardcoded
// constant that could silently drift from what's actually on-chain. Cached
// after the first successful read since it can't change during this
// process's lifetime.
export async function getAdminPubkey(): Promise<string> {
  if (cachedAdmin) return cachedAdmin
  const connection = new Connection(RPC_URL, 'confirmed')
  const info = await connection.getAccountInfo(CONFIG_PDA)
  if (!info) throw new Error('Config account not found on-chain.')
  // Anchor account layout: 8-byte discriminator, then `admin: Pubkey` (32 bytes).
  const adminBytes = info.data.subarray(8, 40)
  cachedAdmin = new PublicKey(adminBytes).toBase58()
  return cachedAdmin
}

let cachedReviewers: { at: number; keys: string[] } | null = null
const REVIEWER_CACHE_MS = 60_000

// The admin plus every active reviewer on Config. Reviewers can change, so
// this is re-read from the chain after a minute rather than cached for good
// like the admin. Config layout (state.rs): admin 8..40, bump 40, version 41,
// paused 42, verdict_key 43..75, reviewer_count 75, reviewers from 76.
export async function getReviewerPubkeys(): Promise<string[]> {
  if (cachedReviewers && Date.now() - cachedReviewers.at < REVIEWER_CACHE_MS) return cachedReviewers.keys
  const connection = new Connection(RPC_URL, 'confirmed')
  const info = await connection.getAccountInfo(CONFIG_PDA)
  if (!info) throw new Error('Config account not found on-chain.')
  const keys = [new PublicKey(info.data.subarray(8, 40)).toBase58()]
  if (info.data.length >= 76 + 32 * 10) {
    const count = Math.min(info.data[75], 10)
    for (let i = 0; i < count; i++) keys.push(new PublicKey(info.data.subarray(76 + 32 * i, 108 + 32 * i)).toBase58())
  }
  cachedReviewers = { at: Date.now(), keys }
  return keys
}
