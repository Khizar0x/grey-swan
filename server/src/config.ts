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
