import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Btn, TrustNote } from '../components/atoms'
import { IconAlert, IconCheck } from '../components/icons'
import { PhotoManifestField } from '../components/PhotoManifestField'
import { RetryImage } from '../components/RetryImage'
import { fetchAddress, saveAddress } from '../lib/addressApi'
import { useAuthContext } from '../lib/AuthContext'
import { formatSol } from '../lib/format'
import { enumKey } from '../lib/listing'
import { confirmReturn, flagReturnIssue, rejectOnArrival, submitPhase1, submitPhase2, submitPhase3, submitPhase4 } from '../lib/mutations'
import { useProgram } from '../lib/program'
import { phaseStepIndex, rentalStatusLabel } from '../lib/rentalStatus'
import { C, FONT_HEAD, INPUT_STYLE } from '../lib/theme'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import type { RentalAccountEntry } from '../lib/useRentals'
import { withTimeout } from '../lib/withTimeout'

export function RentalHandover() {
  const { pubkey } = useParams<{ pubkey: string }>()
  const program = useProgram()
  const { publicKey } = useWallet()
  const { token, signedIn, signingIn, error: authError, signIn } = useAuthContext()

  const [rental, setRental] = useState<RentalAccountEntry['account'] | null>(null)
  const [loading, setLoading] = useState(true)
  // Item name for the completed-rental record — the rental account only
  // stores the listing's pubkey, not its name.
  const [listingName, setListingName] = useState<string | null>(null)

  const [photos, setPhotos] = useState('')
  const [tracking, setTracking] = useState('')
  const [reason, setReason] = useState('')
  const [returnAddress, setReturnAddress] = useState('')
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Surfaced when the on-chain step succeeds but a follow-up off-chain save
  // (currently: the owner's return address at phase 1) fails — previously
  // swallowed silently, which is exactly what made a failed save look like
  // a transient "not provided yet" staleness issue to whoever needed it
  // later, when the data had actually never been written at all.
  const [addressWarning, setAddressWarning] = useState<string | null>(null)
  // True when an on-chain step just succeeded but we couldn't confirm the
  // fresh state afterward — blocks the whole step UI (not just a warning
  // next to a still-clickable button) until a refetch actually confirms
  // where things stand, so a second click can't resubmit an already-done
  // phase and get rejected with PhaseOutOfOrder.
  const [unconfirmed, setUnconfirmed] = useState(false)
  // Synchronous guard against double-submission: `busy` is React state, so
  // its DOM effect (disabling the button) lands on the next paint, not
  // necessarily before a second, near-simultaneous click event is already
  // in flight. A ref is checked and set in the same tick runMutation starts,
  // closing that gap outright rather than relying on render timing — a
  // duplicate submit is exactly how a legitimate first submission plus a
  // panicked second click turns into a PhaseOutOfOrder rejection.
  const mutationInFlightRef = useRef(false)

  // The address the *other* party needs at this step — renter's delivery
  // address for the owner at step 1 (before shipping out), owner's return
  // address for the renter at step 3 (before shipping back).
  const [counterpartyAddress, setCounterpartyAddress] = useState<string | null>(null)
  const [addressLoading, setAddressLoading] = useState(false)

  // Single source of truth for reading the rental back — used both for the
  // initial load and, critically, after every mutation below, so the UI
  // never re-enables an action based on stale local state. Throws on
  // failure rather than swallowing it, so callers can tell "confirmed
  // fresh" apart from "couldn't confirm, don't trust what's on screen".
  const fetchRental = useCallback(async () => {
    if (!pubkey) return
    const account = await program.account.rental.fetch(new PublicKey(pubkey))
    setRental(account)
  }, [program, pubkey])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchRental()
      .catch(() => {
        if (!cancelled) setError("Couldn't load this rental — try reloading.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchRental])

  useEffect(() => {
    if (!rental) {
      setListingName(null)
      return
    }
    let cancelled = false
    program.account.listing
      .fetch(rental.listing)
      .then((l) => {
        if (!cancelled) setListingName(l.itemName)
      })
      .catch(() => {
        if (!cancelled) setListingName(null)
      })
    return () => {
      cancelled = true
    }
  }, [rental, program])

  // Fetch whichever counterparty address is relevant to the step currently
  // being shown — see the field declaration above for which address that is.
  useEffect(() => {
    if (!rental || !publicKey || !token || !pubkey) {
      setCounterpartyAddress(null)
      return
    }
    const isOwnerNow = publicKey.equals(rental.owner)
    const isRenterNow = publicKey.equals(rental.renter)
    const stepNow = Math.min(phaseStepIndex(rental.currentPhase) + 1, 4)
    const allDoneNow = phaseStepIndex(rental.currentPhase) >= 4

    let role: 'renter_delivery' | 'owner_return' | null = null
    if (!allDoneNow && stepNow === 1 && isOwnerNow) role = 'renter_delivery'
    else if (!allDoneNow && stepNow === 3 && isRenterNow) role = 'owner_return'

    if (!role) {
      setCounterpartyAddress(null)
      return
    }

    let cancelled = false
    setAddressLoading(true)
    fetchAddress(pubkey, role, token)
      .then((addr) => {
        if (!cancelled) setCounterpartyAddress(addr)
      })
      .catch(() => {
        if (!cancelled) setCounterpartyAddress(null)
      })
      .finally(() => {
        if (!cancelled) setAddressLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [rental, publicKey, token, pubkey])

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

  if (unconfirmed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
        <p className="mb-4 text-sm" style={{ color: C.rust }}>
          Your last action was submitted, but we couldn't confirm the update afterward. To avoid resubmitting a step
          that's already done, this rental is locked until we can load its current state.
        </p>
        <Btn
          onClick={() =>
            fetchRental()
              .then(() => setUnconfirmed(false))
              .catch(() => setUnconfirmed(true))
          }
        >
          Try loading the latest state
        </Btn>
      </div>
    )
  }

  const rentalPubkey = new PublicKey(pubkey)
  const isOwner = publicKey ? publicKey.equals(rental.owner) : false
  const isRenter = publicKey ? publicKey.equals(rental.renter) : false
  const statusKey = enumKey(rental.status)
  const step = Math.min(phaseStepIndex(rental.currentPhase) + 1, 4)
  const allPhasesDone = phaseStepIndex(rental.currentPhase) >= 4

  if ((isOwner || isRenter) && !signedIn) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
        <h1 className="mb-2 text-2xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          Sign in to continue
        </h1>
        <p className="mb-8 text-sm leading-relaxed" style={{ color: C.muted }}>
          We need your wallet to sign a message proving you hold it — this rental now involves shipping addresses, which are only shown to the two people directly involved.
        </p>
        {authError && (
          <p className="mb-4 text-sm" style={{ color: C.rust }}>
            {authError}
          </p>
        )}
        <Btn onClick={() => void signIn()} disabled={signingIn}>
          {signingIn ? 'Waiting for signature…' : 'Sign in with wallet'}
        </Btn>
      </div>
    )
  }

  // afterSuccess runs *outside* the wallet-signing timeout — it's for
  // follow-up work like saving an address to our own server, which doesn't
  // have the "popup silently dismissed" failure mode withTimeout guards
  // against, and shouldn't share a budget with the wallet approval itself
  // (a slow-but-genuine approval could eat most of a short timeout).
  const runMutation = async (
    fn: () => Promise<unknown>,
    afterSuccess?: () => Promise<void>,
    afterSuccessFailureMessage?: string,
  ) => {
    if (mutationInFlightRef.current) return
    mutationInFlightRef.current = true
    setError(null)
    setAddressWarning(null)
    setUnconfirmed(false)
    setBusy(true)
    try {
      await withTimeout(fn())
      if (afterSuccess) {
        try {
          await afterSuccess()
        } catch {
          // The on-chain step already succeeded — don't present this as a
          // failure of the whole action, but don't hide it either. Silently
          // swallowing this is exactly what turned a failed address save
          // into a confusing, permanent "not provided yet" for whoever
          // needed it later, with no sign anything had gone wrong here.
          if (afterSuccessFailureMessage) setAddressWarning(afterSuccessFailureMessage)
        }
      }
      setPhotos('')
      setTracking('')
      setReason('')
      setReturnAddress('')
      setShowDisputeForm(false)
      setShowRejectForm(false)
      // Wait for the confirmed on-chain state before this function returns
      // (and busy clears) — re-enabling the UI on a fire-and-forget refetch
      // that might still be stale (or might silently fail) is exactly how
      // a second click ends up resubmitting an already-completed phase and
      // getting rejected with PhaseOutOfOrder.
      try {
        await fetchRental()
      } catch {
        setUnconfirmed(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      mutationInFlightRef.current = false
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
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: C.primary }}>
            <IconCheck />
          </div>
          <h2 className="mb-1 text-2xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
            {listingName ?? 'Rental'}
          </h2>
          <p style={{ color: C.muted }}>{rentalStatusLabel(rental.status)}</p>
        </div>

        <div className="mb-6 flex flex-col gap-2 rounded-2xl p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="flex justify-between text-sm">
            <span style={{ color: C.faint }}>Rental cost</span>
            <span style={{ color: C.cream }}>
              {formatSol(rental.totalRentalCost)} · {rental.weeks} week{rental.weeks === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: C.faint }}>Deposit</span>
            <span style={{ color: C.cream }}>{formatSol(rental.depositAmount)}</span>
          </div>
          {rental.disputeReason && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.faint }}>Resolution note</span>
              <span style={{ color: C.cream }}>"{rental.disputeReason}"</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6 rounded-2xl p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <PhaseRecap title="Sent by owner" tracking={rental.outboundTracking} manifestCid={rental.phase1Photos} />
          <PhaseRecap title="Received by renter" manifestCid={rental.phase2Photos} />
          <PhaseRecap title="Returned by renter" tracking={rental.returnTracking} manifestCid={rental.phase3Photos} />
          <PhaseRecap title="Checked by owner" manifestCid={rental.phase4Photos} />
        </div>

        <div className="mt-8 text-center">
          <Link to={isOwner ? '/my-listings' : '/my-rentals'}>
            <Btn>Back to your rentals</Btn>
          </Link>
        </div>
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
        {addressWarning && (
          <p className="mb-4 rounded-xl p-3 text-sm" style={{ background: 'rgba(201,162,62,0.08)', border: '1px solid rgba(201,162,62,0.25)', color: '#B5893A' }}>
            {addressWarning}
          </p>
        )}

        {!allPhasesDone && step === 1 && (
          <div className="flex flex-col gap-6">
            <StepHeader
              tint="gold"
              role="Owner · Before sending"
              title="Show the item before it's sent"
              body="Add up to 5 clear photos showing its current condition, including one clear photo of the shipping label with the tracking number visible."
            />
            {isOwner ? (
              <>
                <AddressPanel loading={addressLoading} address={counterpartyAddress} label="Send the item to" />
                <PhotoManifestField value={photos} onChange={setPhotos} />
                <div className="pt-6" style={{ borderTop: `1px solid ${C.border}` }}>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: C.muted }}>Tracking number</label>
                  <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Enter tracking number" maxLength={40} style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: C.muted }}>Your return address</label>
                  <p className="mb-2 text-xs" style={{ color: C.faint }}>
                    Only shown to the renter, once it's time to send the item back.
                  </p>
                  <textarea
                    rows={3}
                    value={returnAddress}
                    onChange={(e) => setReturnAddress(e.target.value)}
                    placeholder="Where should the item come back to?"
                    maxLength={500}
                    style={{ ...INPUT_STYLE, resize: 'none' }}
                  />
                </div>
                <TrustNote />
                <Btn
                  full
                  disabled={busy || !photos || !tracking || !returnAddress.trim() || !token}
                  onClick={() =>
                    runMutation(
                      () => submitPhase1(program, rentalPubkey, rental.owner, photos, tracking),
                      async () => {
                        if (token) {
                          await saveAddress(rentalPubkey.toBase58(), 'owner_return', rental.owner.toBase58(), rental.renter.toBase58(), returnAddress.trim(), token)
                        }
                      },
                      "The item's status updated, but we couldn't save your return address — the renter may see \"not provided yet\" when it's time to send it back. Reach out to them directly with it in the meantime.",
                    )
                  }
                >
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
            <StepHeader tint="rust" role="Renter · On arrival" title="Show us what arrived" body="Add up to 5 clear photos of the item as you received it." />
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
            <StepHeader
              tint="gold"
              role="Renter · Before returning"
              title="Show the item before you send it back"
              body="Add up to 5 clear photos showing its condition before return, including one clear photo of the shipping label with the tracking number visible."
            />
            {isRenter ? (
              <>
                <AddressPanel loading={addressLoading} address={counterpartyAddress} label="Send it back to" />
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
            <StepHeader tint="green" role="Owner · On return" title="Check the item after its return" body="Add up to 5 clear photos showing the condition it arrived back in." />
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

function PhaseRecap({ title, tracking, manifestCid }: { title: string; tracking?: string; manifestCid: string }) {
  const { urls, loading, error, retry } = usePhotoUrls(manifestCid || undefined)
  if (!manifestCid) return null
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
        {title}
      </p>
      {tracking && (
        <p className="mb-2 text-xs" style={{ color: C.muted }}>
          Tracking: {tracking}
        </p>
      )}
      {loading ? (
        <p className="text-xs" style={{ color: C.faint }}>
          Loading photos…
        </p>
      ) : error ? (
        <div className="flex items-center gap-2">
          <p className="text-xs" style={{ color: C.rust }}>
            Couldn't load these photos.
          </p>
          <button onClick={retry} className="text-xs underline" style={{ color: C.gold }}>
            Try again
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {urls.map((url, i) => (
            <div key={i} className="aspect-square overflow-hidden rounded-lg" style={{ border: `1px solid ${C.border}` }}>
              <RetryImage src={url} alt={`${title} — photo ${i + 1}`} className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AddressPanel({ loading, address, label }: { loading: boolean; address: string | null; label: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(201,162,75,0.08)', border: '1px solid rgba(201,162,75,0.25)' }}>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide" style={{ color: C.gold }}>
        {label}
      </p>
      {loading ? (
        <p className="text-sm" style={{ color: C.muted }}>
          Loading address…
        </p>
      ) : address ? (
        <p className="whitespace-pre-line text-sm" style={{ color: C.cream }}>
          {address}
        </p>
      ) : (
        <p className="text-sm" style={{ color: C.rust }}>
          Not provided yet — check back shortly, or ask them to add it.
        </p>
      )}
    </div>
  )
}
