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

export async function updateListing(
  program: Program<Greyswan>,
  listing: PublicKey,
  owner: PublicKey,
  args: {
    description: string
    photos: string
    rentalPriceLamports: number
    depositAmountLamports: number
  },
) {
  return program.methods
    .updateListing(args.description, args.photos, new BN(args.rentalPriceLamports), new BN(args.depositAmountLamports))
    .accounts({ listing, owner })
    .rpc()
}

export async function removeListing(program: Program<Greyswan>, listing: PublicKey, owner: PublicKey) {
  return program.methods.removeListing().accounts({ listing, owner }).rpc()
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

// Also sends `timeline` (PDA ["timeline", rental], created here and paid by
// the owner), `config` (read once to fix the arrival deadline) and
// `system_program`, all derived by Anchor from the IDL.
export async function submitPhase1(program: Program<Greyswan>, rental: PublicKey, owner: PublicKey, photos: string, trackingNumber: string) {
  return program.methods.submitPhase1(photos, trackingNumber).accounts({ rental, owner }).rpc()
}

// Also sends `timeline`, derived by Anchor from the IDL. The program reads
// the arrival deadline from it.
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

// Also sends `dispute` (PDA ["dispute", rental], created here and paid by the
// owner) and `system_program`, derived by Anchor from the IDL.
export async function flagReturnIssue(program: Program<Greyswan>, rental: PublicKey, owner: PublicKey, reason: string) {
  return program.methods.flagReturnIssue(reason).accounts({ rental, owner }).rpc()
}

// Also sends `timeline` (arrival deadline) and `dispute` (PDA ["dispute",
// rental], created here and paid by the renter), both derived by Anchor from
// the IDL.
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

// Admin-only — the program checks the signer against the Config PDA's admin
// field itself (see dispute.rs), this is just the client-side call. Takes
// two explicit amounts rather than a single recipient because the program
// supports a partial split; the admin page only ever calls this with one of
// the two at zero (see Admin.tsx) for an all-or-nothing payout, but the
// program enforces the real invariant regardless of what the client sends:
// ownerAmount + renterAmount must exactly equal the rental's frozen total,
// and the rental must currently be Disputed (flipping to Resolved on
// success), so a second call against the same rental fails cleanly instead
// of double-paying.
export async function resolveDispute(
  program: Program<Greyswan>,
  listing: PublicKey,
  rental: PublicKey,
  admin: PublicKey,
  owner: PublicKey,
  renter: PublicKey,
  ownerAmount: BN,
  renterAmount: BN,
) {
  return program.methods
    .resolveDispute(ownerAmount, renterAmount)
    .accounts({
      listing,
      rental,
      admin,
      owner,
      renter,
    })
    .rpc()
}

// ---------- Deadlines and timeouts ----------
// Each of these only succeeds once the program's own clock check passes (see
// handover.rs and dispute.rs); the rental page only offers a button once the
// matching deadline has passed, but the program is the one that enforces it.

// Owner: the renter missed the arrival deadline, so the owner confirms the
// item arrived for them. Also sends `timeline` and `config`, derived by
// Anchor.
export async function confirmArrivalAfterDeadline(program: Program<Greyswan>, rental: PublicKey, owner: PublicKey) {
  return program.methods.confirmArrivalAfterDeadline().accounts({ rental, owner }).rpc()
}

// Owner: the renter still has the item after the return date plus grace.
// Freezes the funds for a reviewer. Also sends `timeline` and `dispute`.
export async function flagNotReturned(program: Program<Greyswan>, rental: PublicKey, owner: PublicKey) {
  return program.methods.flagNotReturned().accounts({ rental, owner }).rpc()
}

// Owner: the renter says they sent it back but it never reached the owner.
// Only allowed up to the inspection deadline. Also sends `timeline` and
// `dispute`.
export async function flagReturnNotReceived(program: Program<Greyswan>, rental: PublicKey, owner: PublicKey) {
  return program.methods.flagReturnNotReceived().accounts({ rental, owner }).rpc()
}

// Renter: the owner let the inspection deadline pass without confirming or
// flagging, so the rental completes as if confirmed. The renter signs; the
// owner is paid out, so it is passed as a plain account.
export async function completeAfterInspectionDeadline(
  program: Program<Greyswan>,
  listing: PublicKey,
  rental: PublicKey,
  owner: PublicKey,
  renter: PublicKey,
) {
  return program.methods.completeAfterInspectionDeadline().accounts({ listing, rental, owner, renter }).rpc()
}

// ---------- Verdict, appeal and payout ----------

// Either party appeals an AI verdict. The bond is moved into the dispute
// account by the program, so the page shows the exact amount (appealBond in
// disputeMath.ts) before this is called. Also sends `config`, `dispute` and
// `system_program`.
export async function appeal(program: Program<Greyswan>, rental: PublicKey, appellant: PublicKey) {
  return program.methods.appeal().accounts({ rental, appellant }).rpc()
}

// Anyone can release an unappealed verdict once the appeal window has closed.
// The caller only pays the network fee; the money can only go to the rental's
// recorded owner, renter and the platform wallet.
export async function finalizeVerdict(
  program: Program<Greyswan>,
  listing: PublicKey,
  rental: PublicKey,
  owner: PublicKey,
  renter: PublicKey,
  caller: PublicKey,
) {
  return program.methods.finalizeVerdict().accounts({ listing, rental, owner, renter, caller }).rpc()
}

// Anyone can settle an appeal that no reviewer got to in time: the verdict
// stands and every bond goes back.
export async function expireAppeal(
  program: Program<Greyswan>,
  listing: PublicKey,
  rental: PublicKey,
  owner: PublicKey,
  renter: PublicKey,
  caller: PublicKey,
) {
  return program.methods.expireAppeal().accounts({ listing, rental, owner, renter, caller }).rpc()
}

// ---------- Reviewer and admin ----------

// Reviewer decides a damage dispute with a deposit split, in basis points to
// the owner (0 to 10000). When the program wants a second reviewer, build the
// transaction with `reviewerResolveTx` and use the two-signature flow in
// twoReviewer.ts instead: one wallet can't sign for both.
export async function reviewerResolve(
  program: Program<Greyswan>,
  listing: PublicKey,
  rental: PublicKey,
  owner: PublicKey,
  renter: PublicKey,
  reviewer: PublicKey,
  ownerBps: number,
) {
  return program.methods
    .reviewerResolve(ownerBps)
    .accounts({ listing, rental, owner, renter, reviewer })
    .rpc()
}

export async function reviewerResolveTx(
  program: Program<Greyswan>,
  listing: PublicKey,
  rental: PublicKey,
  owner: PublicKey,
  renter: PublicKey,
  reviewer: PublicKey,
  secondReviewer: PublicKey,
  ownerBps: number,
) {
  return program.methods.reviewerResolve(ownerBps).accounts({ listing, rental, owner, renter, reviewer, secondReviewer }).transaction()
}

// The same two-signature variant for the older resolve_dispute (named
// `admin` in the IDL, but any reviewer may sign it). The first reviewer is
// the connected wallet, which Anchor fills in for the `admin` signer.
export async function resolveDisputeTx(
  program: Program<Greyswan>,
  listing: PublicKey,
  rental: PublicKey,
  secondReviewer: PublicKey,
  owner: PublicKey,
  renter: PublicKey,
  ownerAmount: BN,
  renterAmount: BN,
) {
  return program.methods
    .resolveDispute(ownerAmount, renterAmount)
    .accounts({ listing, rental, secondReviewer, owner, renter })
    .transaction()
}

// Admin only: sets an unappealed AI verdict aside so a reviewer decides
// instead. Any bonds held come back to the parties. The admin signer is the
// connected wallet, which Anchor fills in.
export async function voidVerdict(program: Program<Greyswan>, rental: PublicKey, owner: PublicKey, renter: PublicKey) {
  return program.methods.voidVerdict().accounts({ rental, owner, renter }).rpc()
}
