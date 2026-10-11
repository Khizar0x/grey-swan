import assert from 'node:assert/strict'
import test from 'node:test'
import { Keypair, PublicKey, Transaction } from '@solana/web3.js'
import {
  CONFIG_PDA,
  type ChainClient,
  disputePda,
  encodePostVerdictData,
  PROGRAM_ID,
  parseDispute,
  planPostVerdict,
  preflightPostVerdict,
  sendPostVerdict,
} from '../post.js'
import { writeFileSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Fixtures write bytes at the account layouts in state.rs. The same layouts were
// cross-checked against Anchor's own encoder when this was written.
const HASH_P = 'ab'.repeat(32)
const HASH_O = 'cd'.repeat(32)

function config(over: { verdictKey: PublicKey; paused?: boolean; rubric?: number[]; large?: bigint; maxTier?: number }): Buffer {
  const b = Buffer.alloc(587)
  b[41] = 2
  b[42] = over.paused ? 1 : 0
  over.verdictKey.toBuffer().copy(b, 43)
  ;(over.rubric ?? [0, 1500, 5000, 8000, 10000]).forEach((v, i) => b.writeUInt16LE(v, 396 + 2 * i))
  b.writeUInt16LE(500, 406)
  b[408] = over.maxTier ?? 2
  b.writeBigUInt64LE(over.large ?? 5_000_000_000n, 443)
  return b
}

function rental(status: number, deposit: bigint): Buffer {
  const b = Buffer.alloc(400)
  b[138] = status
  b.writeBigUInt64LE(deposit, 122)
  return b
}

function dispute(over: { kind?: number; status?: number; tiers?: number[]; promptHash?: string; outputHash?: string; postedAt?: number }): Buffer {
  const b = Buffer.alloc(8 + 32 + 1 + 8 + 1 + 1 + 1 + 8 + 2 + 32 + 32 + 8 + 8 + 8 + 400)
  b[40] = over.kind ?? 1
  b[49] = over.status ?? 0
  const tiers = over.tiers ?? []
  b[51] = tiers.length
  tiers.forEach((t, i) => (b[52 + i] = t))
  Buffer.from(over.promptHash ?? '00'.repeat(32), 'hex').copy(b, 62)
  Buffer.from(over.outputHash ?? '00'.repeat(32), 'hex').copy(b, 94)
  b.writeBigInt64LE(BigInt(over.postedAt ?? 0), 126)
  return b
}

class FakeChain implements ChainClient {
  accounts = new Map<string, Buffer>()
  sent: Buffer[] = []
  constructor(private onSend?: (raw: Buffer, chain: FakeChain) => void) {}
  set(key: PublicKey, data: Buffer) {
    this.accounts.set(key.toBase58(), data)
  }
  async getAccountInfo(key: PublicKey) {
    const data = this.accounts.get(key.toBase58())
    return data ? { data, owner: PROGRAM_ID } : null
  }
  async getLatestBlockhash() {
    return { blockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 1 }
  }
  async sendRawTransaction(raw: Buffer) {
    this.sent.push(raw)
    this.onSend?.(raw, this)
    return 'FakeSignature'
  }
  async confirmTransaction() {
    return { value: { err: null } }
  }
}

const signer = Keypair.generate()
const rentalKey = Keypair.generate().publicKey

function ready(over: { status?: number; deposit?: bigint; paused?: boolean; verdictKey?: PublicKey; dispute?: Buffer | null } = {}) {
  const chain = new FakeChain()
  chain.set(CONFIG_PDA, config({ verdictKey: over.verdictKey ?? signer.publicKey, paused: over.paused }))
  chain.set(rentalKey, rental(over.status ?? 3, over.deposit ?? 1_500_000_000n))
  if (over.dispute !== null) chain.set(disputePda(rentalKey), over.dispute ?? dispute({}))
  return chain
}

test('instruction data matches Anchor encoding (verified against its coder)', () => {
  assert.equal(
    encodePostVerdictData([2, 0], HASH_P, HASH_O).toString('hex'),
    'c6fe95065e41b4c5' + '02000000' + '0200' + HASH_P + HASH_O,
  )
})

test('parseDispute reads status, tiers, hashes and deadlines', () => {
  const d = parseDispute(dispute({ status: 1, tiers: [2, 1], promptHash: HASH_P, outputHash: HASH_O, postedAt: 99 }))
  assert.deepEqual([d.status, d.tiers, d.promptHash === HASH_P, d.outputHash === HASH_O, d.verdictPostedAt], ['verdictPosted', [2, 1], true, true, 99])
})

test('preflight accepts a clean case and names every reason to refuse', async () => {
  assert.deepEqual(await preflightPostVerdict(ready(), rentalKey.toBase58(), signer.publicKey, [1]), [])

  const wrongSigner = await preflightPostVerdict(ready({ verdictKey: Keypair.generate().publicKey }), rentalKey.toBase58(), signer.publicKey, [1])
  assert.match(wrongSigner.join(), /not the verdict key/)
  assert.match((await preflightPostVerdict(ready({ paused: true }), rentalKey.toBase58(), signer.publicKey, [1])).join(), /paused/)
  assert.match((await preflightPostVerdict(ready({ status: 0 }), rentalKey.toBase58(), signer.publicKey, [1])).join(), /not in review/)
  assert.match((await preflightPostVerdict(ready({ dispute: null }), rentalKey.toBase58(), signer.publicKey, [1])).join(), /no Dispute account/)
  assert.match((await preflightPostVerdict(ready({ dispute: dispute({ status: 1, postedAt: 5 }) }), rentalKey.toBase58(), signer.publicKey, [1])).join(), /already posted/)
  assert.match((await preflightPostVerdict(ready({ dispute: dispute({ kind: 2 }) }), rentalKey.toBase58(), signer.publicKey, [1])).join(), /ReturnIssue/)
  assert.match((await preflightPostVerdict(ready(), rentalKey.toBase58(), signer.publicKey, [3])).join(), /auto-release limit/)
  assert.match((await preflightPostVerdict(ready({ deposit: 6_000_000_000n }), rentalKey.toBase58(), signer.publicKey, [1])).join(), /large-deposit threshold/)
  // Several findings can add up to the Major share: 50% + 6 x 5% = 80%.
  assert.match((await preflightPostVerdict(ready(), rentalKey.toBase58(), signer.publicKey, [2, 0, 0, 0, 0, 0, 0])).join(), /Major/)
})

test('dry-run planning signs and sends nothing', () => {
  const kp = path.join(mkdtempSync(path.join(os.tmpdir(), 'gs-post-')), 'k.json')
  writeFileSync(kp, JSON.stringify([...signer.secretKey]))
  const plan = planPostVerdict({ decision: 'POST_VERDICT', tiers: '[1]', prompt_hash: HASH_P, output_hash: HASH_O }, rentalKey.toBase58(), kp)
  assert.equal(plan.dryRun, true)
  assert.equal(plan.verdictSigner, signer.publicKey.toBase58())
})

test('sendPostVerdict signs the right transaction, confirms and reads the Dispute back', async () => {
  const chain = ready()
  chain['onSend'] = (_raw, c) => c.set(disputePda(rentalKey), dispute({ status: 1, tiers: [1], promptHash: HASH_P, outputHash: HASH_O, postedAt: 7 }))
  const plan = { instruction: 'post_verdict' as const, dryRun: true as const, verdictSigner: signer.publicKey.toBase58(), rental: rentalKey.toBase58(), args: { tiers: [1], promptHash: HASH_P, outputHash: HASH_O } }
  const result = await sendPostVerdict(chain, signer, rentalKey.toBase58(), plan)
  assert.equal(result.signature, 'FakeSignature')
  assert.equal(result.dispute.status, 'verdictPosted')

  const tx = Transaction.from(chain.sent[0])
  assert.ok(tx.verifySignatures(), 'signed by the verdict key')
  assert.equal(tx.feePayer?.toBase58(), signer.publicKey.toBase58())
  const ix = tx.instructions[0]
  assert.equal(ix.programId.toBase58(), PROGRAM_ID.toBase58())
  assert.deepEqual(ix.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]), [
    [CONFIG_PDA.toBase58(), false, false],
    [rentalKey.toBase58(), false, false],
    [disputePda(rentalKey).toBase58(), false, true],
    // The fee payer is always writable once the message is compiled.
    [signer.publicKey.toBase58(), true, true],
  ])
  assert.equal(ix.data.toString('hex'), encodePostVerdictData([1], HASH_P, HASH_O).toString('hex'))
})

test('sendPostVerdict refuses without sending when preflight fails, and detects a missing readback', async () => {
  const plan = { instruction: 'post_verdict' as const, dryRun: true as const, verdictSigner: '', rental: rentalKey.toBase58(), args: { tiers: [1], promptHash: HASH_P, outputHash: HASH_O } }
  const blocked = ready({ paused: true })
  await assert.rejects(sendPostVerdict(blocked, signer, rentalKey.toBase58(), plan), /Not sending/)
  assert.equal(blocked.sent.length, 0)

  const stale = ready() // sends, but the Dispute never shows the verdict
  await assert.rejects(sendPostVerdict(stale, signer, rentalKey.toBase58(), plan), /does not show the expected verdict/)
})
