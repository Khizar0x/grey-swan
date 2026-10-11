import 'dotenv/config'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Connection, PublicKey } from '@solana/web3.js'
import { buildCaseFile } from '../disputeCase.js'
import { getAnswers } from '../disputeAnswers.js'
import { fetchRentalDetail } from '../rentalChain.js'
import { loadAiConfig } from './config.js'
import { LiveClient, type LlmClient, type LlmRequest, type LlmResponse } from './llm.js'
import { runCase } from './pipeline.js'
import { CONFIG_PDA, disputePda, loadVerdictKeypair, parseConfigForPosting, parseDispute, planPostVerdict, preflightPostVerdict, sendPostVerdict } from './post.js'
import { AiStore } from './store.js'

// usage: npm run ai:run-rental -- <rentalPubkey> [--send]
//
// Builds the case file from the real rental (its four photo manifests, plus the
// owner's close-ups and both parties' saved answers), runs the pipeline LIVE
// (this spends capped API credit), and prints the decision. With --send, and
// only if the decision is POST_VERDICT, it signs post_verdict with the verdict
// key and sends it to devnet. Without --send nothing is signed or sent.
//
// Re-running is cheap: every model answer is cached, so a second run with --send
// after a first run without it makes no new billed calls.

const here = path.dirname(fileURLToPath(import.meta.url))

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

// Public gateways are slow or return 404 for a few seconds after pinning.
async function fetchBytesWithRetry(url: string, attempts = 5): Promise<Uint8Array> {
  let last = ''
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return new Uint8Array(await res.arrayBuffer())
      last = `HTTP ${res.status}`
    } catch (err) {
      last = err instanceof Error ? err.message : String(err)
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
  }
  throw new Error(`Could not fetch ${url}: ${last}`)
}

// Counts what this run actually used, so the cost line is real, not estimated.
class CountingClient implements LlmClient {
  live = 0
  cached = 0
  tokensIn = 0
  tokensOut = 0
  constructor(private inner: LlmClient) {}
  async call(req: LlmRequest): Promise<LlmResponse> {
    const res = await this.inner.call(req)
    if (res.cached) this.cached++
    else {
      this.live++
      this.tokensIn += res.usage?.input ?? 0
      this.tokensOut += res.usage?.output ?? 0
    }
    return res
  }
}

async function main() {
  const args = process.argv.slice(2)
  const send = args.includes('--send')
  const rentalPubkey = args.find((a) => !a.startsWith('--'))
  if (!rentalPubkey) fail('usage: npm run ai:run-rental -- <rentalPubkey> [--send]')
  try {
    new PublicKey(rentalPubkey)
  } catch {
    fail('That is not a valid rental address.')
  }

  const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com'
  const connection = new Connection(rpcUrl, 'confirmed')
  const rentalKey = new PublicKey(rentalPubkey)

  // ---- Read the chain first: refuse before spending anything if it can't work.
  const rental = await fetchRentalDetail(rentalPubkey)
  if (!rental) fail('Rental account not found on devnet.')
  if (rental.status !== 3) fail('This rental is not in review (status is not Disputed), so there is nothing to judge.')
  if (rental.disputeKind !== 1) fail('Only damage reports (a return issue) get an automatic review.')
  const disputeInfo = await connection.getAccountInfo(disputePda(rentalKey))
  if (!disputeInfo) fail('This rental has no Dispute account (disputed before they existed). A reviewer must decide it.')
  const dispute = parseDispute(disputeInfo.data)
  if (dispute.status !== 'open' || dispute.verdictPostedAt !== 0) fail(`A verdict already exists for this rental (dispute status: ${dispute.status}).`)
  const configInfo = await connection.getAccountInfo(CONFIG_PDA)
  if (!configInfo || configInfo.data.length < 459) fail('Config is not migrated on devnet.')
  const onChainConfig = parseConfigForPosting(configInfo.data)

  // ---- Stored questionnaire answers.
  const answers = getAnswers(rentalPubkey)
  if (!answers.owner) fail("The owner hasn't saved their answers yet, so there is nothing to compare the photos against. Not spending anything.")
  if (!answers.renter) console.log('note: the renter has not responded yet. Running with the owner side only.')

  // ---- AI config: always live here. The large-deposit limit comes from the
  // chain (the admin can change it), not from a local setting.
  const aiConfig = { ...loadAiConfig({ ...process.env, AI_MODE: 'live' }), largeDepositThresholdLamports: onChainConfig.largeDepositThresholdLamports }
  const store = new AiStore(aiConfig.dbPath)
  const remaining = aiConfig.dailyLiveCap - store.liveCallsToday()
  console.log(`rental ${rentalPubkey}`)
  console.log(`models: ${aiConfig.modelA}, ${aiConfig.modelB}; judges ${aiConfig.judgeModelA}, ${aiConfig.judgeModelB}`)
  console.log(`daily cap: ${store.liveCallsToday()}/${aiConfig.dailyLiveCap} used, ${remaining} left (a full run is about 8 calls; cached answers are free)`)

  // ---- Case file from the real rental and photos.
  const caseFile = await buildCaseFile({
    rentalPubkey,
    depositLamports: rental.depositLamports,
    manifests: { p1: rental.phase1Photos, p2: rental.phase2Photos, p3: rental.phase3Photos, p4: rental.phase4Photos, dispute: answers.owner.photosCid },
    owner: answers.owner,
    renter: answers.renter,
    photoDir: path.join(here, '..', '..', 'data', 'ai-cases', `rental-${rentalPubkey}`),
    fetchBytes: fetchBytesWithRetry,
  })
  const perPhase = (p: string) => caseFile.photos.filter((x) => x.phase === p).length
  console.log(`photos: p1=${perPhase('p1')} p2=${perPhase('p2')} p3=${perPhase('p3')} p4=${perPhase('p4')} dispute=${perPhase('dispute')}`)

  // ---- Run the pipeline live.
  const client = new CountingClient(new LiveClient(aiConfig, store, (l) => console.log(l)))
  const result = await runCase(caseFile, { config: aiConfig, store, client })

  console.log('\n=== decision ===')
  console.log(result.decision.kind)
  if (result.decision.kind === 'POST_VERDICT') {
    console.log(`tiers: [${result.decision.tiers.join(', ')}]  areas: ${result.decision.areas.join(', ')}`)
  }
  console.log('reasons:')
  for (const r of result.decision.reasons) console.log(`  - ${r}`)
  console.log(`prompt_hash=${result.promptHash}\noutput_hash=${result.outputHash}`)
  console.log('\n=== cost ===')
  console.log(`billed calls this run: ${client.live}, answered from cache: ${client.cached}`)
  console.log(`tokens this run: ${client.tokensIn} in, ${client.tokensOut} out (no price table is kept, so no dollar figure)`)
  console.log(`daily cap now: ${store.liveCallsToday()}/${aiConfig.dailyLiveCap}`)
  if (result.reasoning.length) console.log('\nreasoning (for human reviewers only):\n' + result.reasoning.slice(0, 4).map((l) => `  ${l}`).join('\n'))

  if (result.decision.kind !== 'POST_VERDICT') {
    console.log('\nNo verdict will be posted: a human reviewer decides this one.')
    return
  }

  // ---- Post (dry run unless --send).
  const keypairPath = (process.env.VERDICT_KEYPAIR_PATH ?? '').replace(/^~(?=\/|$)/, homedir())
  if (!keypairPath) fail('VERDICT_KEYPAIR_PATH is not set in server/.env.')
  const row = store.listVerdicts(caseFile.caseId).at(-1)
  if (!row) fail('The verdict was not stored.')
  const plan = planPostVerdict(row, rentalPubkey, keypairPath)
  console.log('\n=== post_verdict ===')
  console.log(`signer: ${plan.verdictSigner}  tiers: [${plan.args.tiers.join(', ')}]`)
  const problems = await preflightPostVerdict(connection, rentalPubkey, loadVerdictKeypair(keypairPath).publicKey, plan.args.tiers)
  if (problems.length) {
    console.log('The program would refuse this verdict:')
    for (const p of problems) console.log(`  - ${p}`)
    fail('Not sending.')
  }
  console.log('The program should accept this verdict.')

  if (!send) {
    console.log(`\nDRY RUN: nothing was signed or sent. To post it:\n  npm run ai:run-rental -- ${rentalPubkey} --send`)
    return
  }

  const sent = await sendPostVerdict(connection, loadVerdictKeypair(keypairPath), rentalPubkey, plan)
  console.log(`\nSENT. signature: ${sent.signature}`)
  console.log(`https://explorer.solana.com/tx/${sent.signature}?cluster=devnet`)
  console.log('Dispute account read back:')
  console.log(`  status: ${sent.dispute.status}  tiers: [${sent.dispute.tiers.join(', ')}]  owner share: ${sent.dispute.verdictOwnerBps / 100}% of the deposit`)
  console.log(`  appeal deadline: ${new Date(sent.dispute.appealDeadline * 1000).toISOString()}`)
  console.log(`  hashes match what was sent: ${sent.dispute.promptHash === plan.args.promptHash && sent.dispute.outputHash === plan.args.outputHash}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e)) // never print config or keys
  process.exit(1)
})
