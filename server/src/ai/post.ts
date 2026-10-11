import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import { AREAS } from './types.js'
import type { VerdictRow } from './store.js'

// Posting service. planPostVerdict builds exactly what post_verdict would send
// and signs nothing: that is the default. sendPostVerdict is the only code that
// signs and sends, and it is only reached from an explicit --send (see
// runRental.ts). Both check the chain first so a transaction that is certain to
// be refused is never sent.

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

// ---------------------------------------------------------------- sending

export const PROGRAM_ID = new PublicKey('2YnarssLwdKPi3Br6C6cUcAuKyyoDagXaHZWo3kykcko')
export const CONFIG_PDA = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID)[0]
export const disputePda = (rental: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from('dispute'), rental.toBuffer()], PROGRAM_ID)[0]

// Anchor instruction discriminator: first 8 bytes of sha256("global:<name>").
const POST_VERDICT_DISCRIMINATOR = createHash('sha256').update('global:post_verdict').digest().subarray(0, 8)

// post_verdict(tiers: bytes, prompt_hash: [u8; 32], output_hash: [u8; 32])
export function encodePostVerdictData(tiers: number[], promptHashHex: string, outputHashHex: string): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32LE(tiers.length)
  return Buffer.concat([POST_VERDICT_DISCRIMINATOR, len, Buffer.from(tiers), Buffer.from(promptHashHex, 'hex'), Buffer.from(outputHashHex, 'hex')])
}

export function buildPostVerdictInstruction(signer: PublicKey, rental: PublicKey, plan: PostVerdictPlan): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: CONFIG_PDA, isSigner: false, isWritable: false },
      { pubkey: rental, isSigner: false, isWritable: false },
      { pubkey: disputePda(rental), isSigner: false, isWritable: true },
      { pubkey: signer, isSigner: true, isWritable: false },
    ],
    data: encodePostVerdictData(plan.args.tiers, plan.args.promptHash, plan.args.outputHash),
  })
}

export type DisputeStatusName = 'open' | 'verdictPosted' | 'appealed' | 'resolved' | 'voided'
const DISPUTE_STATUSES: DisputeStatusName[] = ['open', 'verdictPosted', 'appealed', 'resolved', 'voided']

export interface DisputeReadback {
  kind: number // 1 = ReturnIssue
  status: DisputeStatusName
  tiers: number[]
  verdictOwnerBps: number
  promptHash: string
  outputHash: string
  verdictPostedAt: number
  appealDeadline: number
  appealExpiresAt: number
}

// Dispute layout (state.rs): discriminator 8, rental 32, kind 1, opened_at 8,
// status 1, bump 1, tier_count 1, tiers 8, verdict_owner_bps 2, prompt_hash 32,
// output_hash 32, verdict_posted_at 8, appeal_deadline 8, appeal_expires_at 8.
export function parseDispute(data: Buffer): DisputeReadback {
  const tierCount = data[51]
  return {
    kind: data[40],
    status: DISPUTE_STATUSES[data[49]] ?? 'open',
    tiers: [...data.subarray(52, 52 + Math.min(tierCount, 8))],
    verdictOwnerBps: data.readUInt16LE(60),
    promptHash: data.subarray(62, 94).toString('hex'),
    outputHash: data.subarray(94, 126).toString('hex'),
    verdictPostedAt: Number(data.readBigInt64LE(126)),
    appealDeadline: Number(data.readBigInt64LE(134)),
    appealExpiresAt: Number(data.readBigInt64LE(142)),
  }
}

export interface ConfigForPosting {
  version: number
  paused: boolean
  verdictKey: string
  rubricBps: number[]
  extraFindingBps: number
  autoReleaseMaxTier: number
  largeDepositThresholdLamports: number
}

// Config layout (state.rs): discriminator 8, admin 32, bump 1, version 1,
// paused 1, verdict_key 32, reviewer_count 1, reviewers 320, rubric_bps 10,
// extra_finding_bps 2, auto_release_max_tier 1, then four i64 timings and
// bond_bps 2, bond_min 8, large_deposit_threshold 8.
export function parseConfigForPosting(data: Buffer): ConfigForPosting {
  return {
    version: data[41],
    paused: data[42] === 1,
    verdictKey: new PublicKey(data.subarray(43, 75)).toBase58(),
    rubricBps: [0, 1, 2, 3, 4].map((i) => data.readUInt16LE(396 + 2 * i)),
    extraFindingBps: data.readUInt16LE(406),
    autoReleaseMaxTier: data[408],
    largeDepositThresholdLamports: Number(data.readBigUInt64LE(443)),
  }
}

export interface ChainReader {
  getAccountInfo(key: PublicKey): Promise<{ data: Buffer; owner: PublicKey } | null>
}

export interface ChainClient extends ChainReader {
  getLatestBlockhash(commitment?: 'confirmed'): Promise<{ blockhash: string; lastValidBlockHeight: number }>
  sendRawTransaction(raw: Buffer): Promise<string>
  confirmTransaction(args: { signature: string; blockhash: string; lastValidBlockHeight: number }, commitment?: 'confirmed'): Promise<{ value: { err: unknown } }>
}

const MAJOR_TIER = 3

// Mirrors the program's own conditions for post_verdict (verdict.rs) using
// live chain state, so every reason it would refuse is reported up front.
// Returns the problems found; an empty list means the program should accept it.
export async function preflightPostVerdict(chain: ChainReader, rentalPubkey: string, signer: PublicKey, tiers: number[]): Promise<string[]> {
  const problems: string[] = []
  const rental = new PublicKey(rentalPubkey)

  const configInfo = await chain.getAccountInfo(CONFIG_PDA)
  if (!configInfo || configInfo.data.length < 459) return ['Config is missing or not migrated to the new layout.']
  const config = parseConfigForPosting(configInfo.data)
  if (config.verdictKey !== signer.toBase58()) problems.push(`This keypair (${signer.toBase58()}) is not the verdict key set on Config (${config.verdictKey}).`)
  if (config.paused) problems.push('Disputes are paused on Config.')

  const rentalInfo = await chain.getAccountInfo(rental)
  if (!rentalInfo || !rentalInfo.owner.equals(PROGRAM_ID)) return [...problems, 'Rental account not found.']
  const status = rentalInfo.data[138]
  const deposit = Number(rentalInfo.data.readBigUInt64LE(122))
  if (status !== 3) problems.push('The rental is not in review (status is not Disputed).')

  const disputeInfo = await chain.getAccountInfo(disputePda(rental))
  if (!disputeInfo) {
    problems.push('This rental has no Dispute account (disputed before they existed), so it cannot take a verdict.')
  } else {
    const dispute = parseDispute(disputeInfo.data)
    if (dispute.kind !== 1) problems.push('Only damage reports (ReturnIssue) get a verdict.')
    if (dispute.status !== 'open' || dispute.verdictPostedAt !== 0) problems.push(`A verdict was already posted (dispute status: ${dispute.status}).`)
  }

  const worst = Math.max(...tiers)
  if (worst > config.autoReleaseMaxTier) problems.push(`Worst tier ${worst} is above the auto-release limit (${config.autoReleaseMaxTier}); a human must decide.`)
  if (deposit > config.largeDepositThresholdLamports) problems.push(`Deposit ${deposit} lamports is above the large-deposit threshold (${config.largeDepositThresholdLamports}); a human must decide.`)
  const ownerBps = Math.min(10_000, config.rubricBps[worst] + config.extraFindingBps * (tiers.length - 1))
  if (ownerBps >= config.rubricBps[MAJOR_TIER]) problems.push(`The resulting owner share (${ownerBps / 100}%) reaches the Major value; a human must decide.`)
  return problems
}

export interface SendResult {
  signature: string
  dispute: DisputeReadback
}

// Signs post_verdict with the verdict key, sends it, waits for confirmation and
// reads the Dispute account back to prove the verdict landed as intended.
export async function sendPostVerdict(chain: ChainClient, keypair: Keypair, rentalPubkey: string, plan: PostVerdictPlan): Promise<SendResult> {
  const rental = new PublicKey(rentalPubkey)
  const problems = await preflightPostVerdict(chain, rentalPubkey, keypair.publicKey, plan.args.tiers)
  if (problems.length) throw new Error(`Not sending:\n - ${problems.join('\n - ')}`)

  const { blockhash, lastValidBlockHeight } = await chain.getLatestBlockhash('confirmed')
  const tx = new Transaction({ feePayer: keypair.publicKey, blockhash, lastValidBlockHeight }).add(buildPostVerdictInstruction(keypair.publicKey, rental, plan))
  tx.sign(keypair)
  const signature = await chain.sendRawTransaction(tx.serialize())
  const confirmation = await chain.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  if (confirmation.value.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(confirmation.value.err)}`)

  const info = await chain.getAccountInfo(disputePda(rental))
  if (!info) throw new Error(`Sent ${signature} but the Dispute account could not be read back.`)
  const dispute = parseDispute(info.data)
  const matches =
    dispute.status === 'verdictPosted' &&
    dispute.promptHash === plan.args.promptHash &&
    dispute.outputHash === plan.args.outputHash &&
    dispute.tiers.join() === plan.args.tiers.join()
  if (!matches) throw new Error(`Sent ${signature} but the Dispute account does not show the expected verdict (status ${dispute.status}).`)
  return { signature, dispute }
}
