import { useState } from 'react'
import { appealBond, appealCanWin, depositSplit, formatLamports } from '../lib/disputeMath'
import { formatCountdown, formatDeadlineDate } from '../lib/deadlines'
import { enumKey } from '../lib/listing'
import { C, FONT_HEAD } from '../lib/theme'
import type { DisputeState } from '../lib/useDispute'
import { Btn } from './atoms'

type Action = 'appeal' | 'release'

// The review result for a damage report: what the automatic review suggests,
// how long either side has to appeal, and the buttons that are valid right now.
export function VerdictPanel({
  state,
  deposit,
  isOwner,
  isRenter,
  canSign,
  now,
  busy,
  onAction,
}: {
  state: DisputeState
  deposit: bigint
  isOwner: boolean
  isRenter: boolean
  canSign: boolean
  now: number
  busy: boolean
  onAction: (action: Action) => void
}) {
  const [confirmingAppeal, setConfirmingAppeal] = useState(false)
  const { dispute, config } = state
  if (!dispute || enumKey(dispute.kind) !== 'returnIssue') return null

  const status = enumKey(dispute.status)
  const hasVerdict = dispute.verdictPostedAt.toNumber() !== 0
  const appealDeadline = dispute.appealDeadline.toNumber()
  const appealExpiresAt = dispute.appealExpiresAt.toNumber()
  const ownerBps = dispute.verdictOwnerBps
  const split = depositSplit(deposit, ownerBps)

  const byOwner = isOwner
  const isParty = isOwner || isRenter
  const alreadyAppealed = byOwner ? dispute.ownerAppealed : dispute.renterAppealed
  const myHeldBond = byOwner ? BigInt(dispute.ownerBond.toString()) : BigInt(dispute.renterBond.toString())

  const windowOpen = now <= appealDeadline
  const showAppeal =
    isParty && (status === 'verdictPosted' || status === 'appealed') && windowOpen && !alreadyAppealed && appealCanWin(ownerBps, byOwner) && !!config
  const bond =
    config && showAppeal
      ? appealBond({ deposit, verdictOwnerBps: ownerBps, bondBps: config.bondBps, bondMin: BigInt(config.bondMinLamports.toString()), byOwner })
      : null

  const showRelease = (status === 'verdictPosted' && now > appealDeadline) || (status === 'appealed' && now > appealExpiresAt)

  const headline =
    status === 'open'
      ? 'Waiting for the first review'
      : status === 'verdictPosted'
        ? windowOpen
          ? 'The first review is ready'
          : 'The appeal window has closed'
        : status === 'appealed'
          ? 'Appealed, a person is reviewing'
          : status === 'voided'
            ? 'A person is reviewing this'
            : 'Decided'

  return (
    <div className="flex flex-col gap-4 rounded-xl p-5 text-left" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <h3 className="text-lg font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
        {headline}
      </h3>

      {hasVerdict && status !== 'voided' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
            What the first review suggests for the deposit
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg p-3" style={{ background: C.subtleBg, border: `1px solid ${C.border}` }}>
              <span className="block text-xs" style={{ color: C.faint }}>
                To the owner
              </span>
              <span className="text-base font-bold" style={{ color: C.cream }}>
                {formatLamports(split.toOwner)}
              </span>
            </div>
            <div className="rounded-lg p-3" style={{ background: C.subtleBg, border: `1px solid ${C.border}` }}>
              <span className="block text-xs" style={{ color: C.faint }}>
                Back to the renter
              </span>
              <span className="text-base font-bold" style={{ color: C.cream }}>
                {formatLamports(split.toRenter)}
              </span>
            </div>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: C.faint }}>
            The rental fee is separate: it is paid to the owner, less the platform fee.
          </p>
        </div>
      )}

      {status === 'verdictPosted' && windowOpen && (
        <p className="text-sm" style={{ color: C.muted }}>
          Either of you can appeal until {formatDeadlineDate(appealDeadline)} ({formatCountdown(appealDeadline, now)}).
        </p>
      )}
      {status === 'appealed' && (
        <p className="text-sm" style={{ color: C.muted }}>
          If nobody has reviewed it by {formatDeadlineDate(appealExpiresAt)} ({formatCountdown(appealExpiresAt, now)}), the first review is applied and any bonds are returned.
        </p>
      )}

      <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
        An automatic review looks at the photos first. If you disagree with it, you can appeal, and a person will look at everything and decide. A person always reviews appeals.
      </p>

      {alreadyAppealed && (
        <p className="text-sm" style={{ color: C.green }}>
          You have appealed. Your bond of {formatLamports(myHeldBond)} is held until it is decided.
        </p>
      )}

      {showAppeal && bond !== null && (
        <div className="flex flex-col gap-3 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
          {confirmingAppeal ? (
            <>
              <p className="text-sm leading-relaxed" style={{ color: C.cream }}>
                Appealing needs a bond of <strong>{formatLamports(bond)}</strong>, taken from your wallet when you confirm. It comes back if the decision moves your way. If it does not, it goes to the fund that protects other users.
              </p>
              <div className="flex items-center gap-3">
                <Btn variant="danger" disabled={busy || !canSign} onClick={() => onAction('appeal')}>
                  {busy ? 'Submitting…' : `Confirm and pay ${formatLamports(bond)}`}
                </Btn>
                <button type="button" onClick={() => setConfirmingAppeal(false)} className="text-xs underline" style={{ color: C.faint }}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div>
              <Btn variant="secondary" disabled={busy || !canSign} onClick={() => setConfirmingAppeal(true)}>
                Appeal
              </Btn>
            </div>
          )}
        </div>
      )}

      {showRelease && (
        <div className="flex flex-col gap-2 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
          <p className="text-sm" style={{ color: C.muted }}>
            {status === 'appealed' ? "Nobody reviewed the appeal in time, so the first review stands." : 'Nobody appealed, so the first review stands.'} Anyone can release the funds now.
          </p>
          <div>
            <Btn disabled={busy || !canSign} onClick={() => onAction('release')}>
              {busy ? 'Submitting…' : 'Release funds'}
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}
