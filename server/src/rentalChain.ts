import { Connection, PublicKey } from '@solana/web3.js'

const PROGRAM_ID = new PublicKey('2YnarssLwdKPi3Br6C6cUcAuKyyoDagXaHZWo3kykcko')
const RPC_URL = process.env.RPC_URL ?? 'https://api.devnet.solana.com'
const connection = new Connection(RPC_URL, 'confirmed')

// RentalStatus enum discriminant order (state.rs): Active=0, AwaitingReturn=1,
// AwaitingConfirmation=2, Disputed=3, Completed=4, RefundedAuto=5, Resolved=6.
const RENTAL_STATUS_COMPLETED = 4
export const RENTAL_STATUS_DISPUTED = 3

export interface OnChainRentalSummary {
  owner: string
  renter: string
  isCompleted: boolean
  // Handover phases already submitted (0 to 4): HandoverPhase discriminant.
  // Phase N is open for its party exactly when this equals N - 1.
  currentPhase: number
  // RentalStatus discriminant (see the comment above RENTAL_STATUS_COMPLETED).
  status: number
  // The deposit amount in lamports (not the rental cost).
  depositLamports: number
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
  // Rental layout: discriminator 8, listing 32, owner 32, renter 32, weekly_price 8,
  // weeks 2, total_rental_cost 8, then deposit_amount (u64) at byte 122.
  const depositLamports = Number(data.readBigUInt64LE(122))

  return { owner, renter, isCompleted: status === RENTAL_STATUS_COMPLETED, currentPhase, status, depositLamports }
}

export interface RentalDetail extends OnChainRentalSummary {
  listing: string
  phase1Photos: string
  phase2Photos: string
  phase3Photos: string
  phase4Photos: string
  // DisputeKind discriminant (state.rs): 0 None, 1 ReturnIssue, 2 ArrivalIssue,
  // 3 NotReturned, 4 AdminOpened, 5 ReturnNotReceived.
  disputeKind: number
}

// Reads Rental's variable-length tail (the photo manifest CIDs) on top of the
// fixed fields above. Layout after current_phase (byte 139): phase1_photos,
// outbound_tracking, phase2_photos, phase3_photos, return_tracking,
// phase4_photos (each a u32 length then UTF-8 bytes), dispute_kind (u8).
export function parseRentalDetail(data: Buffer): RentalDetail {
  const owner = new PublicKey(data.subarray(40, 72)).toBase58()
  const renter = new PublicKey(data.subarray(72, 104)).toBase58()
  const status = data[138]
  let offset = 140
  const readString = () => {
    const len = data.readUInt32LE(offset)
    const value = data.subarray(offset + 4, offset + 4 + len).toString('utf8')
    offset += 4 + len
    return value
  }
  const phase1Photos = readString()
  readString() // outbound_tracking
  const phase2Photos = readString()
  const phase3Photos = readString()
  readString() // return_tracking
  const phase4Photos = readString()
  const disputeKind = data[offset]
  return {
    owner,
    renter,
    isCompleted: status === RENTAL_STATUS_COMPLETED,
    currentPhase: data[139],
    status,
    depositLamports: Number(data.readBigUInt64LE(122)),
    listing: new PublicKey(data.subarray(8, 40)).toBase58(),
    phase1Photos,
    phase2Photos,
    phase3Photos,
    phase4Photos,
    disputeKind,
  }
}

export async function fetchRentalDetail(rentalPubkey: string): Promise<RentalDetail | null> {
  const info = await connection.getAccountInfo(new PublicKey(rentalPubkey))
  if (!info || !info.owner.equals(PROGRAM_ID)) return null
  return parseRentalDetail(info.data)
}
