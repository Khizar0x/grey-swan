import type { Program } from '@coral-xyz/anchor'
import type { PublicKey } from '@solana/web3.js'
import { useState } from 'react'
import type { Greyswan } from '../../idl/greyswan.ts'
import { depositSplit, formatLamports, reviewerResolveNeedsTwo } from '../../lib/disputeMath'
import { reviewerResolve, reviewerResolveTx } from '../../lib/mutations'
import { C } from '../../lib/theme'
import type { RentalAccountEntry } from '../../lib/useRentals'
import { withTimeout } from '../../lib/withTimeout'
import { Btn } from '../atoms'
import { TwoReviewerFlow } from './TwoReviewerFlow'

// A reviewer decides a damage dispute by choosing how much of the deposit goes
// to the owner. The slider is whole percentages; the program takes basis
// points (percent x 100).
export function ReviewerResolvePanel({
  program,
  rental,
  reviewer,
  otherReviewers,
  aiOwnerBps,
  majorBps,
  threshold,
  appealed,
  onResolved,
}: {
  program: Program<Greyswan>
  rental: RentalAccountEntry
  reviewer: PublicKey
  otherReviewers: PublicKey[]
  // The first review's suggestion, or null when none was posted.
  aiOwnerBps: number | null
  majorBps: number
  threshold: bigint
  appealed: boolean
  onResolved: () => void
}) {
  const [percent, setPercent] = useState(aiOwnerBps === null ? 50 : Math.round(aiOwnerBps / 100))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const acc = rental.account
  const deposit = BigInt(acc.depositAmount.toString())
  const ownerBps = percent * 100
  const split = depositSplit(deposit, ownerBps)
  const needsTwo = reviewerResolveNeedsTwo({ majorBps, threshold, deposit, ownerBps })

  const resolve = async () => {
    setBusy(true)
    setError(null)
    try {
      // Same longer wallet timeout as the legacy payout: a real money
      // decision that a reviewer reads carefully before approving.
      await withTimeout(reviewerResolve(program, acc.listing, rental.publicKey, acc.owner, acc.renter, reviewer, ownerBps), 30_000)
      onResolved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {aiOwnerBps !== null && (
        <p className="text-xs" style={{ color: C.faint }}>
          The first review suggested {aiOwnerBps / 100}% of the deposit to the owner.
          {appealed ? ' It was appealed. Moving the split towards the appealing side returns their bond; otherwise the bond is forfeited.' : ''}
        </p>
      )}

      <div>
        <label htmlFor={`split-${rental.publicKey.toBase58()}`} className="mb-1.5 flex justify-between text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
          <span>Deposit to the owner</span>
          <span style={{ color: C.cream }}>{percent}%</span>
        </label>
        <input
          id={`split-${rental.publicKey.toBase58()}`}
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          onChange={(e) => setPercent(Number(e.target.value))}
          disabled={busy}
          className="w-full"
          style={{ accentColor: C.primary }}
        />
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="block text-xs" style={{ color: C.faint }}>
              Owner receives
            </span>
            <span className="font-bold" style={{ color: C.cream }}>
              {formatLamports(split.toOwner)}
            </span>
          </div>
          <div>
            <span className="block text-xs" style={{ color: C.faint }}>
              Renter receives
            </span>
            <span className="font-bold" style={{ color: C.cream }}>
              {formatLamports(split.toRenter)}
            </span>
          </div>
        </div>
        <p className="mt-1 text-xs" style={{ color: C.faint }}>
          The rental fee is paid to the owner separately, less the platform fee. This can't be undone.
        </p>
      </div>

      {needsTwo ? (
        <TwoReviewerFlow
          program={program}
          why={
            ownerBps >= majorBps
              ? 'A share this large to the owner needs a second reviewer.'
              : 'A deposit this large needs a second reviewer.'
          }
          candidates={otherReviewers}
          buildTx={(second) => reviewerResolveTx(program, acc.listing, rental.publicKey, acc.owner, acc.renter, reviewer, second, ownerBps)}
          onDone={() => onResolved()}
        />
      ) : (
        <div>
          <Btn disabled={busy} onClick={() => void resolve()}>
            {busy ? 'Sending…' : `Decide: ${percent}% to the owner`}
          </Btn>
        </div>
      )}

      {error && (
        <p className="text-sm" style={{ color: C.rust }}>
          {error}
        </p>
      )}
    </div>
  )
}
