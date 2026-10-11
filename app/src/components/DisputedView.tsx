import { useCallback, useEffect, useState } from 'react'
import { type DisputeAnswers, fetchDisputeAnswers, type OwnerAnswers, type RenterAnswers, saveDisputeAnswers } from '../lib/disputeAnswersApi'
import { enumKey } from '../lib/listing'
import { C, FONT_HEAD } from '../lib/theme'
import type { RentalAccountEntry } from '../lib/useRentals'
import { DisputeAnswersSummary } from './DisputeAnswersSummary'
import { MessagesEntryRow } from './MessagesEntryRow'
import { OwnerDisputeForm } from './OwnerDisputeForm'
import { RenterDisputeResponse } from './RenterDisputeResponse'

// The screen for a rental that is in review: what was reported, what each
// side said, and the replies still owed.
export function DisputedView({
  rentalPubkey,
  rental,
  token,
  isOwner,
  isRenter,
}: {
  rentalPubkey: string
  rental: RentalAccountEntry['account']
  token: string | null
  isOwner: boolean
  isRenter: boolean
}) {
  const isParty = isOwner || isRenter
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
          <p className="mt-4 rounded-xl p-4 text-sm" style={{ background: 'rgba(184,92,66,0.08)', border: '1px solid rgba(184,92,66,0.28)', color: C.rust }}>
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
