import { Connection, PublicKey } from '@solana/web3.js'

const PROGRAM_ID = new PublicKey('2YnarssLwdKPi3Br6C6cUcAuKyyoDagXaHZWo3kykcko')
const RPC_URL = process.env.RPC_URL ?? 'https://api.devnet.solana.com'
const connection = new Connection(RPC_URL, 'confirmed')

// RentalStatus enum discriminant order (state.rs): Active=0, AwaitingReturn=1,
// AwaitingConfirmation=2, Disputed=3, Completed=4, RefundedAuto=5, Resolved=6.
const RENTAL_STATUS_COMPLETED = 4

export interface OnChainRentalSummary {
  owner: string
  renter: string
  isCompleted: boolean
  // Handover phases already submitted (0 to 4): HandoverPhase discriminant.
  // Phase N is open for its party exactly when this equals N - 1.
  currentPhase: number
}

// Chat needs to know who the two real parties are and whether the rental is
// done, straight from the account the program itself maintains — never from
// client-supplied pubkeys (unlike addresses.ts/delivery.ts, which trust a
// rental's owner/renter from the request body because those rows are only
// ever written once, right after rent_item, by one of the two people they
// name). There's no Anchor client dependency in this server, so this reads
// the fixed-offset fields directly: 8-byte discriminator, then `listing`
// (32 bytes), then `owner` and `renter` (32 bytes each), then several more
// fixed-size fields before `status` — all before Rental's variable-length
// String fields, so a full IDL-based decode isn't needed for just these.
export async function fetchRentalSummary(rentalPubkey: string): Promise<OnChainRentalSummary | null> {
  let pubkey: PublicKey
  try {
    pubkey = new PublicKey(rentalPubkey)
  } catch {
    return null
  }

  const info = await connection.getAccountInfo(pubkey)
  if (!info || !info.owner.equals(PROGRAM_ID)) return null

  const data = info.data
  const owner = new PublicKey(data.subarray(40, 72)).toBase58()
  const renter = new PublicKey(data.subarray(72, 104)).toBase58()
  const status = data[138]
  const currentPhase = data[139]

  return { owner, renter, isCompleted: status === RENTAL_STATUS_COMPLETED, currentPhase }
}
