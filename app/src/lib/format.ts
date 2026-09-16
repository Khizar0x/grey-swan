import type { BN } from '@coral-xyz/anchor'

const LAMPORTS_PER_SOL = 1_000_000_000

// The mockup prices everything in "£" — but these fields are u64 lamports on
// a Solana program, not GBP pence. Showing "£85" next to an actual-money SOL
// figure would misrepresent what's at stake, so amounts are shown in SOL
// instead. CLAUDE.md's "£X deposit safely held" is read as a tone/phrasing
// example (warm, not clinical), not a literal currency mandate — worth
// double-checking with the user if that reading's wrong.
export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL)
}

export function lamportsToSol(lamports: BN | number): number {
  const n = typeof lamports === 'number' ? lamports : lamports.toNumber()
  return n / LAMPORTS_PER_SOL
}

export function formatSol(lamports: BN | number): string {
  return `${lamportsToSol(lamports).toFixed(2)} SOL`
}
