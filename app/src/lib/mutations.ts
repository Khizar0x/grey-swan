import type { Program } from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'
import type { Greyswan } from '../idl/greyswan.ts'
import type { CategoryKey, RarityKey } from './listing'
import { categoryArg, rarityArg } from './listing'

// Anchor's typed client (Program<Greyswan>) auto-resolves any account the
// IDL can derive on its own — PDA-seeded accounts (like `listing` in
// list_item, from seeds ["listing", owner, item_name]) and fixed-address
// accounts (like `system_program`, `platform_wallet`). Its generated types
// actually forbid passing those explicitly (a compile error, not just
// redundant) — so `.accounts({})` below only lists what Anchor can't infer:
// signers and accounts with no fixed seed of their own (e.g. `rental`,
// which is a fresh keypair, not a PDA).

function listingPda(programId: PublicKey, owner: PublicKey, itemName: string) {
  return PublicKey.findProgramAddressSync([Buffer.from('listing'), owner.toBuffer(), Buffer.from(itemName)], programId)[0]
}

export async function listItem(
  program: Program<Greyswan>,
  owner: PublicKey,
  args: {
    itemName: string
    description: string
    photos: string
    rentalPriceLamports: number
    depositAmountLamports: number
    estimatedValueLamports: number
    category: CategoryKey
    rarityTier: RarityKey
  },
) {
  const listing = listingPda(program.programId, owner, args.itemName)

  const signature = await program.methods
    .listItem(
      args.itemName,
      args.description,
      args.photos,
      new BN(args.rentalPriceLamports),
      new BN(args.depositAmountLamports),
      new BN(args.estimatedValueLamports),
      categoryArg(args.category),
      rarityArg(args.rarityTier),
    )
    .accounts({
      owner,
    })
    .rpc()

  return { signature, listing }
}

export async function rentItem(program: Program<Greyswan>, listing: PublicKey, renter: PublicKey, weeks: number) {
  // `rental` has no PDA seeds in the IDL (unlike `listing`) — it's a fresh
  // account, so it needs its own freshly generated keypair to co-sign the
  // transaction alongside the connected wallet.
  const rentalKeypair = Keypair.generate()

  const signature = await program.methods
    .rentItem(weeks)
    .accounts({
      listing,
      rental: rentalKeypair.publicKey,
      renter,
    })
    .signers([rentalKeypair])
    .rpc()

  return { signature, rental: rentalKeypair.publicKey }
}

export async function submitPhase1(program: Program<Greyswan>, rental: PublicKey, owner: PublicKey, photos: string, trackingNumber: string) {
  return program.methods.submitPhase1(photos, trackingNumber).accounts({ rental, owner }).rpc()
}

export async function submitPhase2(program: Program<Greyswan>, rental: PublicKey, renter: PublicKey, photos: string) {
  return program.methods.submitPhase2(photos).accounts({ rental, renter }).rpc()
}

export async function submitPhase3(program: Program<Greyswan>, rental: PublicKey, renter: PublicKey, photos: string, trackingNumber: string) {
  return program.methods.submitPhase3(photos, trackingNumber).accounts({ rental, renter }).rpc()
}

export async function submitPhase4(program: Program<Greyswan>, rental: PublicKey, owner: PublicKey, photos: string) {
  return program.methods.submitPhase4(photos).accounts({ rental, owner }).rpc()
}

export async function confirmReturn(
  program: Program<Greyswan>,
  listing: PublicKey,
  rental: PublicKey,
  owner: PublicKey,
  renter: PublicKey,
) {
  return program.methods
    .confirmReturn()
    .accounts({
      listing,
      rental,
      owner,
      renter,
    })
    .rpc()
}

export async function flagReturnIssue(program: Program<Greyswan>, rental: PublicKey, owner: PublicKey, reason: string) {
  return program.methods.flagReturnIssue(reason).accounts({ rental, owner }).rpc()
}

export async function rejectOnArrival(program: Program<Greyswan>, rental: PublicKey, renter: PublicKey, photos: string, reason: string) {
  return program.methods.rejectOnArrival(photos, reason).accounts({ rental, renter }).rpc()
}

export async function claimRefund(program: Program<Greyswan>, listing: PublicKey, rental: PublicKey, renter: PublicKey) {
  return program.methods
    .claimRefund()
    .accounts({
      listing,
      rental,
      renter,
    })
    .rpc()
}
