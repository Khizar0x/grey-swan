// Mirrors the program's own arithmetic (verdict.rs and confirm_return.rs) so
// the page can show exact amounts before anyone signs. All in lamports as
// bigint, rounding down like the program's bps_of.

export const MAX_BPS = 10_000

export function bpsOf(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / BigInt(MAX_BPS)
}

// The deposit split the verdict gives each side.
export function depositSplit(deposit: bigint, ownerBps: number): { toOwner: bigint; toRenter: bigint } {
  const toOwner = bpsOf(deposit, ownerBps)
  return { toOwner, toRenter: deposit - toOwner }
}

// An appeal can only help the appellant if the verdict leaves them something
// to gain: the owner can't win more than all of the deposit, the renter can't
// win more than all of it back.
export function appealCanWin(verdictOwnerBps: number, byOwner: boolean): boolean {
  return byOwner ? verdictOwnerBps !== MAX_BPS : verdictOwnerBps !== 0
}

// bond_bps of what the appellant stands to lose under the verdict, but never
// less than the configured minimum.
export function appealBond(params: { deposit: bigint; verdictOwnerBps: number; bondBps: number; bondMin: bigint; byOwner: boolean }): bigint {
  const ownerShare = bpsOf(params.deposit, params.verdictOwnerBps)
  const atStake = params.byOwner ? params.deposit - ownerShare : ownerShare
  const bond = bpsOf(atStake, params.bondBps)
  return bond > params.bondMin ? bond : params.bondMin
}

// Exact, never rounded: this is what someone is about to sign for. Trailing
// zeros are dropped but at least two decimals are kept ("1.50 SOL").
export function formatLamports(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n
  const fraction = (lamports % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '').padEnd(2, '0')
  return `${whole}.${fraction} SOL`
}
