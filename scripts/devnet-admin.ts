// Helper for scripts/deploy-devnet.sh. Each command is one admin step, with its
// own preconditions checked BEFORE anything is sent. Keypair files are only
// read to sign; their contents are never printed.
//
//   read                                          print Config and the pool (read-only)
//   migrate-config <admin.json>                   grow the legacy 41-byte Config
//   init-pool <admin.json>                        create the user-protection pool
//   update-config <admin.json> <verdictPubkey> <reviewerPubkey> [more reviewers...]
//
// Run with: server/node_modules/.bin/tsx scripts/devnet-admin.ts <command> ...
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// This file's folder, from the path tsx was given (works whether the package is
// treated as CommonJS or as a module).
const here = path.dirname(path.resolve(process.argv[1]))
const RPC_URL = process.env.RPC_URL ?? 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey('2YnarssLwdKPi3Br6C6cUcAuKyyoDagXaHZWo3kykcko')

if (!RPC_URL.includes('devnet')) {
  console.error(`Refusing to run: RPC_URL (${RPC_URL}) does not look like devnet.`)
  process.exit(1)
}

// The freshly built IDL (target/idl), not the app copy, so the helper always
// matches the .so that was just deployed.
const idl = JSON.parse(readFileSync(path.join(here, '..', 'target', 'idl', 'greyswan.json'), 'utf8'))
if (idl.address !== PROGRAM_ID.toBase58()) throw new Error('IDL address does not match the expected program id.')

const connection = new Connection(RPC_URL, 'confirmed')

function loadKeypair(file: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, 'utf8')) as number[]))
}

// The IDL is loaded at run time, so account types are looked up by name.
interface Fetchable<T> {
  fetch(key: PublicKey): Promise<T>
}
interface ConfigAccount {
  admin: PublicKey
  version: number
  paused: boolean
  verdictKey: PublicKey
  reviewerCount: number
  reviewers: PublicKey[]
  rubricBps: number[]
  extraFindingBps: number
  autoReleaseMaxTier: number
  appealWindowSecs: { toString(): string }
  appealExpirySecs: { toString(): string }
  phase2DeadlineSecs: { toString(): string }
  notReturnedGraceSecs: { toString(): string }
  inspectionDeadlineSecs: { toString(): string }
  bondBps: number
  bondMinLamports: { toString(): string }
  largeDepositThresholdLamports: { toString(): string }
  twoReviewerThresholdLamports: { toString(): string }
}
interface PoolAccount {
  totalReceived: { toString(): string }
  totalWithdrawn: { toString(): string }
}
function accounts(program: Program) {
  return program.account as unknown as { config: Fetchable<ConfigAccount>; pool: Fetchable<PoolAccount> }
}

function programFor(signer?: Keypair) {
  const wallet = new Wallet(signer ?? Keypair.generate())
  return new Program(idl, new AnchorProvider(connection, wallet, { commitment: 'confirmed' }))
}

const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID)
const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from('pool')], PROGRAM_ID)

const LEGACY_CONFIG_LEN = 41
const fmt = (k: PublicKey) => k.toBase58()

async function readState() {
  const info = await connection.getAccountInfo(configPda)
  console.log(`Config ${fmt(configPda)}: ${info ? `${info.data.length} bytes` : 'MISSING'}`)
  if (!info) return
  if (info.data.length === LEGACY_CONFIG_LEN) {
    console.log('  legacy layout (not migrated). admin:', fmt(new PublicKey(info.data.subarray(8, 40))))
  } else {
    const cfg = await accounts(programFor()).config.fetch(configPda)
    const reviewers = cfg.reviewers.slice(0, cfg.reviewerCount).map(fmt)
    console.log('  admin:', fmt(cfg.admin))
    console.log('  version:', cfg.version, ' paused:', cfg.paused)
    console.log('  verdict key:', fmt(cfg.verdictKey))
    console.log('  reviewers (' + cfg.reviewerCount + '):', reviewers.length ? reviewers.join(', ') : 'none')
    console.log('  rubric bps:', cfg.rubricBps.join(', '), ' extra finding bps:', cfg.extraFindingBps, ' auto-release max tier:', cfg.autoReleaseMaxTier)
    console.log('  appeal window s:', cfg.appealWindowSecs.toString(), ' appeal expiry s:', cfg.appealExpirySecs.toString())
    console.log('  arrival window s:', cfg.phase2DeadlineSecs.toString(), ' not-returned grace s:', cfg.notReturnedGraceSecs.toString(), ' inspection s:', cfg.inspectionDeadlineSecs.toString())
    console.log('  bond bps:', cfg.bondBps, ' bond min lamports:', cfg.bondMinLamports.toString())
    console.log('  large deposit threshold:', cfg.largeDepositThresholdLamports.toString(), ' two-reviewer threshold:', cfg.twoReviewerThresholdLamports.toString())
  }
  const pool = await connection.getAccountInfo(poolPda)
  if (!pool) {
    console.log(`Pool ${fmt(poolPda)}: not created`)
  } else {
    const p = await accounts(programFor()).pool.fetch(poolPda)
    console.log(`Pool ${fmt(poolPda)}: ${pool.lamports} lamports held, received ${p.totalReceived.toString()}, withdrawn ${p.totalWithdrawn.toString()}`)
  }
}

async function requireAdminSigner(file: string): Promise<Keypair> {
  const admin = loadKeypair(file)
  const info = await connection.getAccountInfo(configPda)
  if (!info) throw new Error('Config account not found.')
  const onChainAdmin = new PublicKey(info.data.subarray(8, 40))
  if (!onChainAdmin.equals(admin.publicKey)) {
    throw new Error(`This keypair (${fmt(admin.publicKey)}) is not the Config admin (${fmt(onChainAdmin)}).`)
  }
  return admin
}

async function main() {
  const [command, ...args] = process.argv.slice(2)

  if (command === 'read') return readState()

  if (command === 'migrate-config') {
    const admin = await requireAdminSigner(args[0])
    const info = await connection.getAccountInfo(configPda)
    if (info?.data.length !== LEGACY_CONFIG_LEN) throw new Error(`Config is ${info?.data.length} bytes, not the legacy ${LEGACY_CONFIG_LEN}. Already migrated?`)
    const signature = await programFor(admin).methods.migrateConfig().rpc()
    console.log('migrate_config sent:', signature)
    return
  }

  if (command === 'init-pool') {
    const admin = await requireAdminSigner(args[0])
    if (await connection.getAccountInfo(poolPda)) throw new Error('Pool already exists.')
    const signature = await programFor(admin).methods.initPool().rpc()
    console.log('init_pool sent:', signature)
    return
  }

  if (command === 'update-config') {
    const [adminFile, verdictArg, ...reviewerArgs] = args
    const admin = await requireAdminSigner(adminFile)
    const verdictKey = new PublicKey(verdictArg)
    const reviewers = reviewerArgs.map((r) => new PublicKey(r))
    if (reviewers.length === 0) throw new Error('At least one reviewer is required.')
    // The program refuses these too; checking first gives a clear message and
    // avoids spending a fee on a transaction that is certain to fail.
    if (verdictKey.equals(admin.publicKey)) throw new Error('The verdict key must not be the admin.')
    if (reviewers.some((r) => r.equals(admin.publicKey))) throw new Error('A reviewer must not be the admin (the admin already counts as a reviewer).')
    if (reviewers.some((r) => r.equals(verdictKey))) throw new Error('A reviewer must not be the verdict key.')
    if (new Set(reviewers.map(fmt)).size !== reviewers.length) throw new Error('Duplicate reviewer.')
    const info = await connection.getAccountInfo(configPda)
    if (!info || info.data.length === LEGACY_CONFIG_LEN) throw new Error('Config is not migrated yet. Run migrate-config first.')
    const signature = await programFor(admin)
      .methods.updateConfig({
        paused: null,
        verdictKey,
        reviewers,
        rubricBps: null,
        extraFindingBps: null,
        autoReleaseMaxTier: null,
        appealWindowSecs: null,
        appealExpirySecs: null,
        phase2DeadlineSecs: null,
        bondBps: null,
        bondMinLamports: null,
        largeDepositThresholdLamports: null,
        twoReviewerThresholdLamports: null,
        notReturnedGraceSecs: null,
        inspectionDeadlineSecs: null,
      })
      .rpc()
    console.log('update_config sent:', signature)
    return
  }

  console.error('Commands: read | migrate-config <admin.json> | init-pool <admin.json> | update-config <admin.json> <verdict> <reviewer...>')
  process.exit(1)
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
