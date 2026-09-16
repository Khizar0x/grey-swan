import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Btn, TrustNote } from '../components/atoms'
import { IconAlert, IconCheck } from '../components/icons'
import { PhotoManifestField } from '../components/PhotoManifestField'
import { enumKey } from '../lib/listing'
import { confirmReturn, flagReturnIssue, rejectOnArrival, submitPhase1, submitPhase2, submitPhase3, submitPhase4 } from '../lib/mutations'
import { useProgram } from '../lib/program'
import { phaseStepIndex, rentalStatusLabel } from '../lib/rentalStatus'
import { C, FONT_HEAD, INPUT_STYLE } from '../lib/theme'
import type { RentalAccountEntry } from '../lib/useRentals'

export function RentalHandover() {
  const { pubkey } = useParams<{ pubkey: string }>()
  const program = useProgram()
  const { publicKey } = useWallet()

  const [rental, setRental] = useState<RentalAccountEntry['account'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const [photos, setPhotos] = useState('')
  const [tracking, setTracking] = useState('')
  const [reason, setReason] = useState('')
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pubkey) return
    let cancelled = false
    setLoading(true)
    program.account.rental
      .fetch(new PublicKey(pubkey))
      .then((account) => {
        if (!cancelled) setRental(account)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [program, pubkey, refreshKey])

  if (loading) {
    return (
      <p className="px-4 py-24 text-center text-sm sm:px-6" style={{ color: C.faint }}>
        Loading…
      </p>
    )
  }

  if (!rental || !pubkey) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
        <p style={{ color: C.muted }}>Couldn't find that rental.</p>
      </div>
    )
  }

  const rentalPubkey = new PublicKey(pubkey)
  const isOwner = publicKey ? publicKey.equals(rental.owner) : false
  const isRenter = publicKey ? publicKey.equals(rental.renter) : false
  const statusKey = enumKey(rental.status)
  const step = Math.min(phaseStepIndex(rental.currentPhase) + 1, 4)
  const allPhasesDone = phaseStepIndex(rental.currentPhase) >= 4

  const refresh = () => setRefreshKey((k) => k + 1)

  const runMutation = async (fn: () => Promise<unknown>) => {
    setError(null)
    setBusy(true)
    try {
      await fn()
      setPhotos('')
      setTracking('')
      setReason('')
      setShowDisputeForm(false)
      setShowRejectForm(false)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (statusKey === 'disputed') {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
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
    )
  }

  if (statusKey === 'completed' || statusKey === 'resolved' || statusKey === 'refundedAuto') {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: C.primary }}>
          <IconCheck />
        </div>
        <h2 className="mb-3 text-2xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          {rentalStatusLabel(rental.status)}
        </h2>
        <p className="mb-8" style={{ color: C.muted }}>Thank you for using Grey Swan.</p>
        <Link to="/my-rentals">
          <Btn>Back to your rentals</Btn>
        </Link>
      </div>
    )
  }

  const stepLabels = ['Send item', 'Renter receives', 'Return item', 'Owner checks']

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link to={isOwner ? '/my-listings' : '/my-rentals'} className="mb-8 flex items-center gap-2 text-sm transition-opacity hover:opacity-70" style={{ color: C.muted }}>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </Link>

      <div className="mb-10 flex items-center gap-0">
        {[1, 2, 3, 4].map((s, i) => (
          <div key={s} className="flex flex-1 items-center last:flex-none">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all"
              style={step > s || allPhasesDone ? { background: C.primary, color: C.onAccent } : step === s ? { background: C.primary, color: C.onAccent } : { background: 'rgba(38,34,32,0.04)', border: `1px solid ${C.border}`, color: C.faint }}
            >
              {step > s || (allPhasesDone && s <= 4) ? <IconCheck /> : s}
            </div>
            {i < 3 && <div className="mx-1 h-px flex-1 transition-all" style={{ background: step > s ? 'rgba(62,138,95,0.35)' : C.border }} />}
          </div>
        ))}
      </div>
      <div className="mb-6 flex justify-between text-xs" style={{ color: C.faint }}>
        {stepLabels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>

      <div className="rounded-2xl p-8" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        {error && (
          <p className="mb-4 text-sm" style={{ color: C.rust }}>
            {error}
          </p>
        )}

        {!allPhasesDone && step === 1 && (
          <div className="flex flex-col gap-6">
            <StepHeader tint="gold" role="Owner · Before sending" title="Show the item before it's sent" body="Add 2–3 clear photos showing its current condition." />
            {isOwner ? (
              <>
                <PhotoManifestField value={photos} onChange={setPhotos} />
                <div className="pt-6" style={{ borderTop: `1px solid ${C.border}` }}>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: C.muted }}>Tracking number</label>
                  <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Enter tracking number" maxLength={40} style={INPUT_STYLE} />
                </div>
                <TrustNote />
                <Btn full disabled={busy || !photos || !tracking} onClick={() => runMutation(() => submitPhase1(program, rentalPubkey, rental.owner, photos, tracking))}>
                  {busy ? 'Submitting…' : 'Continue'}
                </Btn>
              </>
            ) : (
              <WaitingNote text="Waiting for the owner to send the item." />
            )}
          </div>
        )}

        {!allPhasesDone && step === 2 && (
          <div className="flex flex-col gap-6">
            <StepHeader tint="rust" role="Renter · On arrival" title="Show us what arrived" body="Add 2–3 clear photos of the item as you received it." />
            {isRenter ? (
              showRejectForm ? (
                <>
                  <PhotoManifestField value={photos} onChange={setPhotos} />
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" style={{ color: C.muted }}>What's wrong?</label>
                    <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} style={{ ...INPUT_STYLE, resize: 'none' }} />
                  </div>
                  <Btn variant="danger" full disabled={busy || !photos || !reason} onClick={() => runMutation(() => rejectOnArrival(program, rentalPubkey, rental.renter, photos, reason))}>
                    {busy ? 'Submitting…' : 'Report a problem'}
                  </Btn>
                  <button onClick={() => setShowRejectForm(false)} className="text-xs underline" style={{ color: C.faint }}>Cancel</button>
                </>
              ) : (
                <>
                  <PhotoManifestField value={photos} onChange={setPhotos} />
                  <div className="pt-6" style={{ borderTop: `1px solid ${C.border}` }}>
                    <h3 className="mb-1 font-semibold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>Everything arrived as expected</h3>
                    <p className="mb-4 text-sm" style={{ color: C.muted }}>Confirm once you've received the item and had a chance to check it.</p>
                    <Btn full disabled={busy || !photos} onClick={() => runMutation(() => submitPhase2(program, rentalPubkey, rental.renter, photos))}>
                      {busy ? 'Submitting…' : 'Confirm receipt'}
                    </Btn>
                  </div>
                  <TrustNote />
                  <button onClick={() => setShowRejectForm(true)} className="flex items-center gap-1.5 text-xs underline" style={{ color: C.rust }}>
                    <IconAlert /> Item arrived wrong or broken
                  </button>
                </>
              )
            ) : (
              <WaitingNote text="Waiting for the renter to confirm what arrived." />
            )}
          </div>
        )}

        {!allPhasesDone && step === 3 && (
          <div className="flex flex-col gap-6">
            <StepHeader tint="gold" role="Renter · Before returning" title="Show the item before you send it back" body="Add 2–3 clear photos showing its condition before return." />
            {isRenter ? (
              <>
                <PhotoManifestField value={photos} onChange={setPhotos} />
                <div className="pt-6" style={{ borderTop: `1px solid ${C.border}` }}>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: C.muted }}>Return tracking number</label>
                  <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Enter tracking number" maxLength={40} style={INPUT_STYLE} />
                </div>
                <TrustNote />
                <Btn full disabled={busy || !photos || !tracking} onClick={() => runMutation(() => submitPhase3(program, rentalPubkey, rental.renter, photos, tracking))}>
                  {busy ? 'Submitting…' : 'Continue'}
                </Btn>
              </>
            ) : (
              <WaitingNote text="Waiting for the renter to send the item back." />
            )}
          </div>
        )}

        {!allPhasesDone && step === 4 && (
          <div className="flex flex-col gap-6">
            <StepHeader tint="green" role="Owner · On return" title="Check the item after its return" body="Add 2–3 clear photos showing the condition it arrived back in." />
            {isOwner ? (
              <>
                <PhotoManifestField value={photos} onChange={setPhotos} />
                <TrustNote />
                <Btn full disabled={busy || !photos} onClick={() => runMutation(() => submitPhase4(program, rentalPubkey, rental.owner, photos))}>
                  {busy ? 'Submitting…' : 'Continue'}
                </Btn>
              </>
            ) : (
              <WaitingNote text="Waiting for the owner to check the returned item." />
            )}
          </div>
        )}

        {allPhasesDone && (
          <div className="flex flex-col gap-6">
            <StepHeader tint="green" role="Owner · Final review" title="All handover photos are in" body="Confirm the return to release the deposit, or flag an issue for review." />
            {isOwner ? (
              showDisputeForm ? (
                <div className="rounded-xl p-4" style={{ border: '1px solid rgba(184,92,66,0.28)', background: 'rgba(184,92,66,0.08)' }}>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: C.rust }}>What's not right?</label>
                  <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} style={{ ...INPUT_STYLE, resize: 'none' }} />
                  <div className="mt-3 flex gap-2">
                    <Btn variant="danger" disabled={busy || !reason} onClick={() => runMutation(() => flagReturnIssue(program, rentalPubkey, rental.owner, reason))}>
                      {busy ? 'Submitting…' : 'Flag this rental'}
                    </Btn>
                    <button onClick={() => setShowDisputeForm(false)} className="text-xs underline" style={{ color: C.faint }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => runMutation(() => confirmReturn(program, rental.listing, rentalPubkey, rental.owner, rental.renter))}
                      disabled={busy}
                      className="flex items-center justify-center gap-2 rounded-xl py-3 font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                      style={{ background: C.primary, color: C.onAccent }}
                    >
                      <IconCheck />
                      Confirm everything's fine
                    </button>
                    <p className="text-center text-xs leading-relaxed" style={{ color: C.faint }}>Confirm the return and the renter's deposit will be released automatically.</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => setShowDisputeForm(true)}
                      className="flex items-center justify-center gap-2 rounded-xl py-3 font-semibold transition-all hover:opacity-80"
                      style={{ color: C.rust, border: '1px solid rgba(184,92,66,0.35)', background: 'rgba(184,92,66,0.07)' }}
                    >
                      <IconAlert />
                      Something's not right
                    </button>
                    <p className="text-center text-xs leading-relaxed" style={{ color: C.faint }}>If something has changed or isn't as expected, let us know.</p>
                  </div>
                </div>
              )
            ) : (
              <WaitingNote text="Waiting for the owner to confirm the return." />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StepHeader({ tint, role, title, body }: { tint: 'gold' | 'rust' | 'green'; role: string; title: string; body: string }) {
  const tints = {
    gold: { background: 'rgba(201,162,75,0.12)', border: '1px solid rgba(201,162,75,0.25)', color: C.gold },
    rust: { background: 'rgba(196,102,79,0.12)', border: '1px solid rgba(196,102,79,0.25)', color: C.rust },
    green: { background: 'rgba(62,138,95,0.10)', border: '1px solid rgba(62,138,95,0.22)', color: C.green },
  }
  return (
    <div>
      <div className="mb-4 inline-flex rounded-full px-2.5 py-1 text-xs font-medium" style={tints[tint]}>
        {role}
      </div>
      <h2 className="mb-2 text-xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
        {title}
      </h2>
      <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
        {body}
      </p>
    </div>
  )
}

function WaitingNote({ text }: { text: string }) {
  return (
    <p className="rounded-xl p-4 text-sm" style={{ background: 'rgba(38,34,32,0.03)', border: `1px solid ${C.border}`, color: C.muted }}>
      {text}
    </p>
  )
}
