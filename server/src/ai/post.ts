import { readFileSync } from 'node:fs'
import { Keypair } from '@solana/web3.js'
import { AREAS } from './types.js'
import type { VerdictRow } from './store.js'

// Posting service — DRY RUN ONLY. It builds exactly what post_verdict would be
// sent and returns it; there is deliberately no code path that signs or sends.
// Real posting (devnet) is a later piece of work.

export interface PostVerdictPlan {
  instruction: 'post_verdict'
  dryRun: true
  verdictSigner: string
  rental: string
  args: { tiers: number[]; promptHash: string; outputHash: string }
}

export function loadVerdictKeypair(keypairPath: string): Keypair {
  const raw = JSON.parse(readFileSync(keypairPath, 'utf8')) as number[]
  return Keypair.fromSecretKey(Uint8Array.from(raw))
}

export function planPostVerdict(
  row: Pick<VerdictRow, 'decision' | 'tiers' | 'prompt_hash' | 'output_hash'>,
  rentalPubkey: string,
  keypairPath = process.env.VERDICT_KEYPAIR_PATH,
): PostVerdictPlan {
  if (row.decision !== 'POST_VERDICT' || !row.tiers) throw new Error('Only POST_VERDICT decisions can be posted')
  if (!keypairPath) throw new Error('VERDICT_KEYPAIR_PATH is not set')
  const tiers = JSON.parse(row.tiers) as number[]
  // Same bounds the program enforces: 1..8 tiers, each 0..4.
  if (tiers.length < 1 || tiers.length > AREAS.length) throw new Error('tiers must contain 1 to 8 entries')
  if (tiers.some((t) => !Number.isInteger(t) || t < 0 || t > 4)) throw new Error('tier out of range')
  for (const h of [row.prompt_hash, row.output_hash]) {
    if (!/^[0-9a-f]{64}$/u.test(h)) throw new Error('hashes must be 32 bytes (64 hex chars)')
  }
  const signer = loadVerdictKeypair(keypairPath)
  return {
    instruction: 'post_verdict', dryRun: true,
    verdictSigner: signer.publicKey.toBase58(), rental: rentalPubkey,
    args: { tiers, promptHash: row.prompt_hash, outputHash: row.output_hash },
  }
}
