import type { Program } from '@coral-xyz/anchor'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useCallback, useEffect, useState } from 'react'
import type { Greyswan } from '../idl/greyswan.ts'
import { type DisputeAnswers, fetchDisputeAnswers, type OwnerAnswers, type RenterAnswers, saveDisputeAnswers } from '../lib/disputeAnswersApi'
import { enumKey } from '../lib/listing'
import { appeal, expireAppeal, finalizeVerdict } from '../lib/mutations'
import { C, FONT_HEAD } from '../lib/theme'
import { useDispute } from '../lib/useDispute'
import { useNow } from '../lib/useNow'
import type { RentalAccountEntry } from '../lib/useRentals'
import { DisputeAnswersSummary } from './DisputeAnswersSummary'
import { MessagesEntryRow } from './MessagesEntryRow'
import { OwnerDisputeForm } from './OwnerDisputeForm'
import { RenterDisputeResponse } from './RenterDisputeResponse'
import { VerdictPanel } from './VerdictPanel'

// The screen for a rental that is in review: what was reported, what each
// side said, and the replies still owed.
export function DisputedView({
  program,
  onRun,
  busy,
  error,
  rentalPubkey,
  rental,
  token,
  isOwner,
  isRenter,
}: {
  program: Program<Greyswan>
  // The page's own mutation runner: it guards double submits and re-reads
  // the rental afterwards.
  onRun: (fn: () => Promise<unknown>) => void
  busy: boolean
  error: string | null
  rentalPubkey: string
  rental: RentalAccountEntry['account']
  token: string | null
  isOwner: boolean
  isRenter: boolean
}) {
  const isParty = isOwner || isRenter
  const { publicKey } = useWallet()
  const now = useNow(15_000)
  const disputeState = useDispute(program, rentalPubkey, rental)
  const isDamageReport = enumKey(rental.disputeKind) === 'returnIssue'

  const [answers, setAnswers] = useState<DisputeAnswers | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !isParty) return
    let cancelled = false
    fetchDisputeAnswers(rentalPubkey, token)
      .then((a) => {
        if (!cancelled) setAnswers(a)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [rentalPubkey, token, isParty])

  const save = useCallback(
    async (body: OwnerAnswers | RenterAnswers) => {
      if (!token) return
      setSaving(true)
      setSaveError(null)
      try {
        setAnswers(await saveDisputeAnswers(rentalPubkey, body, token))
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err))
      } finally {
        setSaving(false)
      }
    },
    [rentalPubkey, token],
  )

  const runVerdictAction = (action: 'appeal' | 'release') => {
    if (!publicKey) return
    const rentalKey = new PublicKey(rentalPubkey)
    if (action === 'appeal') return onRun(() => appeal(program, rentalKey, publicKey))
    const settle = disputeState.dispute && enumKey(disputeState.dispute.status) === 'appealed' ? expireAppeal : finalizeVerdict
    onRun(() => settle(program, rental.listing, rentalKey, rental.owner, rental.renter, publicKey))
  }

  const ownerMissing = isOwner && isDamageReport && answers !== null && !answers.owner
  const renterCanRespond = isRenter && isDamageReport && answers !== null && !!answers.owner && !answers.renter

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <div className="mb-8 text-center">
        <h2 className="mb-3 text-2xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          Something's not right
        </h2>
        <p className="mb-2" style={{ color: C.muted }}>
          We'll review the photos from each stage of the rental and look into what happened. Our team will be in touch within 24 hours.
        </p>
        {rental.disputeReason && (
          <p className="mt-4 rounded-xl p-4 text-sm" style={{ background: 'var(--gs-badge-attention-bg)', border: '1px solid var(--gs-badge-attention-border)', color: C.rust }}>
            "{rental.disputeReason}"
          </p>
        )}
      </div>

      <div className="flex flex-col gap-6">
        {loadError && (
          <p className="text-sm" style={{ color: C.rust }}>
            {loadError}
          </p>
        )}
        <VerdictPanel
          state={disputeState}
          deposit={BigInt(rental.depositAmount.toString())}
          isOwner={isOwner}
          isRenter={isRenter}
          canSign={!!publicKey}
          now={now}
          busy={busy}
          onAction={runVerdictAction}
        />
        {error && (
          <p className="text-sm" style={{ color: C.rust }}>
            {error}
          </p>
        )}
        {answers && <DisputeAnswersSummary answers={answers} />}

        {ownerMissing && token && (
          <div>
            <p className="mb-3 text-sm" style={{ color: C.muted }}>
              Your report is in. Please add the details below so we can look into it properly.
            </p>
            <OwnerDisputeForm
              rentalPubkey={rentalPubkey}
              token={token}
              busy={saving}
              submitLabel="Save my answers"
              onSubmit={(_reason, a) => void save(a)}
              onCancel={() => undefined}
            />
            {saveError && (
              <p className="mt-2 text-sm" style={{ color: C.rust }}>
                {saveError}
              </p>
            )}
          </div>
        )}

        {renterCanRespond && <RenterDisputeResponse busy={saving} error={saveError} onSubmit={(a) => void save(a)} />}

        {isParty && token && <MessagesEntryRow rentalPubkey={rentalPubkey} token={token} />}
      </div>
    </div>
  )
}
