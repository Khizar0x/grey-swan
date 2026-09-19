import type { Program } from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Btn } from '../components/atoms'
import { type DisputeNote, type DisputeReviewStatus, fetchDisputeNotes, saveDisputeNote } from '../lib/adminApi'
import { useAuthContext } from '../lib/AuthContext'
import { formatSol } from '../lib/format'
import type { Greyswan } from '../idl/greyswan.ts'
import { gatewayUrl } from '../lib/ipfs'
import { enumKey } from '../lib/listing'
import { resolveDispute } from '../lib/mutations'
import { useProgram } from '../lib/program'
import { C, FONT_HEAD, INPUT_STYLE } from '../lib/theme'
import { useListingsByKeys } from '../lib/useListingsByKeys'
import type { RentalAccountEntry } from '../lib/useRentals'
import { useRentals } from '../lib/useRentals'
import { withTimeout } from '../lib/withTimeout'

function truncate(pubkey: string): string {
  return `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`
}

function disputePathLabel(kind: Record<string, object>): string {
  switch (enumKey(kind)) {
    case 'returnIssue':
      return 'Owner flagged after return'
    case 'arrivalIssue':
      return 'Renter rejected on arrival'
    default:
      return enumKey(kind)
  }
}

// Off-chain review status for the admin's own use — deliberately not part
// of rentalStatus.ts's public status list (see CLAUDE.md scope), but styled
// with the same three-tint badge system so it looks native to the app.
const REVIEW_STYLE: Record<DisputeReviewStatus, { background: string; color: string; border: string }> = {
  under_review: { background: 'rgba(201,162,62,0.10)', color: '#B5893A', border: '1px solid rgba(201,162,62,0.22)' },
  resolved: { background: 'rgba(62,138,95,0.10)', color: C.green, border: '1px solid rgba(62,138,95,0.22)' },
}
const REVIEW_LABEL: Record<DisputeReviewStatus, string> = {
  under_review: 'Under review',
  resolved: 'Resolved',
}

type AdminCheck = 'checking' | 'allowed' | 'denied'

export function Admin() {
  const program = useProgram()
  const { publicKey, wallet, connecting } = useWallet()
  const { token, signedIn, signingIn, error: authError, signIn } = useAuthContext()

  const [adminCheck, setAdminCheck] = useState<AdminCheck>('checking')

  // The entire access control for this page: read the Config PDA's `admin`
  // field on-chain and compare it to the connected wallet. No separate
  // login, nothing client-side to trust beyond what's actually on-chain.
  //
  // publicKey starts out null on every fresh page load/refresh even when a
  // wallet is about to auto-reconnect — wallet-adapter's autoConnect is
  // async (it only flips `connected`/`publicKey` after an effect chain runs
  // post-mount), so a direct visit to /admin briefly looks identical to
  // "no wallet." Treating that as an immediate denial fires the redirect
  // below before autoConnect ever gets a chance to resolve the real wallet
  // — bouncing a legitimately-connected admin home. So a missing publicKey
  // only ever means "still checking," never "denied" — the fallback timer
  // further down is what actually settles a genuinely-disconnected visit.
  useEffect(() => {
    if (!publicKey) return
    let cancelled = false

    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], program.programId)

    // A single dropped RPC request here is exactly the same class of bug
    // the wallet-resolve race was: a transient, recoverable condition
    // treated as a permanent verdict. publicKey resolving correctly but
    // this one-shot fetch hiccuping once would previously deny a genuine
    // admin outright, with no way back short of reloading and hoping the
    // next attempt happens to land. Retries before ever committing to
    // "denied" — same shape as ipfs.ts's fetchWithRetry and useRentals'
    // settle-delay retries elsewhere in this codebase.
    const attempts = [0, 800, 2000]
    ;(async () => {
      let lastErr: unknown
      for (const delay of attempts) {
        if (cancelled) return
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
        if (cancelled) return
        try {
          const cfg = await program.account.config.fetch(configPda)
          if (!cancelled) setAdminCheck(cfg.admin.equals(publicKey) ? 'allowed' : 'denied')
          return
        } catch (err) {
          lastErr = err
        }
      }
      console.error('Admin config fetch failed after retries:', lastErr)
      if (!cancelled) setAdminCheck('denied')
    })()

    return () => {
      cancelled = true
    }
  }, [program, publicKey])

  // Bounded fallback: distinguishes "actively reconnecting" from "nothing
  // left to wait for" rather than a single fixed timeout from page load.
  // A wallet account's *first-ever* silent reconnect to this origin can
  // take longer than a few seconds (especially right after importing it),
  // and a flat timer that starts counting from mount doesn't know the
  // difference between "still working" and "already gave up" — it would
  // cut a slow-but-genuine reconnect off just the same as a truly absent
  // one. No wallet selected at all -> nothing will ever reconnect, deny
  // now. Actively connecting -> keep waiting, no countdown yet. Otherwise
  // (selected but idle, not connecting, no publicKey) -> give it a bounded
  // window from *that* point before giving up.
  useEffect(() => {
    if (publicKey) return
    if (!wallet) {
      setAdminCheck('denied')
      return
    }
    if (connecting) return
    const timer = setTimeout(() => {
      setAdminCheck((prev) => (prev === 'checking' ? 'denied' : prev))
    }, 5000)
    return () => clearTimeout(timer)
  }, [publicKey, wallet, connecting])

  const { rentals, loading: rentalsLoading } = useRentals()
  const disputed = useMemo(() => rentals.filter((r) => enumKey(r.account.status) === 'disputed'), [rentals])
  const listingsMap = useListingsByKeys(disputed.map((r) => r.account.listing))

  const [notes, setNotes] = useState<Map<string, DisputeNote>>(new Map())
  const [notesError, setNotesError] = useState<string | null>(null)

  useEffect(() => {
    if (adminCheck !== 'allowed' || !token) return
    let cancelled = false
    fetchDisputeNotes(token)
      .then((rows) => {
        if (!cancelled) setNotes(new Map(rows.map((r) => [r.rental_pubkey, r])))
      })
      .catch((err) => {
        if (!cancelled) setNotesError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [adminCheck, token])

  // Render nothing while the check is in flight or once it's failed — no
  // flash of admin content, no "you're not allowed" message, just a redirect.
  if (adminCheck === 'checking') return null
  if (adminCheck === 'denied') return <Navigate to="/" replace />

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
        <h1 className="mb-2 text-2xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          Sign in to continue
        </h1>
        <p className="mb-8 text-sm leading-relaxed" style={{ color: C.muted }}>
          We need your wallet to sign a message proving you hold it before showing dispute details.
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-3xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
        Rentals needing review
      </h1>
      <p className="mb-8 text-sm" style={{ color: C.faint }}>
        Rentals flagged by an owner after return or rejected by a renter on arrival.
      </p>

      {rentalsLoading && (
        <p className="text-sm" style={{ color: C.faint }}>
          Loading…
        </p>
      )}
      {notesError && (
        <p className="mb-4 text-sm" style={{ color: C.rust }}>
          {notesError}
        </p>
      )}
      {!rentalsLoading && disputed.length === 0 && (
        <p className="text-sm" style={{ color: C.faint }}>
          Nothing needs review right now.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {disputed.map((r) => (
          <DisputeCard
            key={r.publicKey.toBase58()}
            program={program}
            adminPubkey={publicKey!}
            rental={r}
            itemName={listingsMap.get(r.account.listing.toBase58())?.itemName ?? 'Item'}
            existingNote={notes.get(r.publicKey.toBase58())}
            token={token!}
            onSaved={(row) => setNotes((prev) => new Map(prev).set(row.rental_pubkey, row))}
          />
        ))}
      </div>
    </div>
  )
}

function DisputeCard({
  program,
  adminPubkey,
  rental,
  itemName,
  existingNote,
  token,
  onSaved,
}: {
  program: Program<Greyswan>
  adminPubkey: PublicKey
  rental: RentalAccountEntry
  itemName: string
  existingNote: DisputeNote | undefined
  token: string
  onSaved: (note: DisputeNote) => void
}) {
  const [status, setStatus] = useState<DisputeReviewStatus>(existingNote?.status ?? 'under_review')
  const [note, setNote] = useState(existingNote?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Which party is selected in the payout UI for *this* save action.
  const [selectedRecipient, setSelectedRecipient] = useState<'owner' | 'renter' | null>(null)
  // Which party actually got paid, once resolveDispute has succeeded this
  // session — distinct from selectedRecipient so a completed payout can't
  // be re-triggered by the same click state that started it.
  const [paidTo, setPaidTo] = useState<'owner' | 'renter' | null>(null)
  // Surfaced when the on-chain payout succeeds but the follow-up off-chain
  // note save fails — the funds moved either way, so this is never allowed
  // to look like the whole action silently succeeded *or* silently failed.
  const [payoutWarning, setPayoutWarning] = useState<string | null>(null)

  // Reflect a note loaded after this card's first render (the bulk fetch
  // resolving asynchronously, after this card already mounted with
  // existingNote still undefined) — but only the *first* time real data
  // arrives. The previous version re-ran this on every existingNote change,
  // which included the exact moment a slow-to-arrive initial fetch resolves
  // right after the admin has already started editing: it would silently
  // overwrite their in-progress selection back to the old server value
  // before they'd even clicked Save, so the save that followed "succeeded"
  // while persisting the wrong, clobbered value — no error, nothing
  // visibly wrong, just a save that quietly didn't do what was selected.
  const initializedFromServerRef = useRef(false)
  useEffect(() => {
    if (!existingNote || initializedFromServerRef.current) return
    initializedFromServerRef.current = true
    setStatus(existingNote.status)
    setNote(existingNote.note)
  }, [existingNote])

  const acc = rental.account
  const rentalPubkey = rental.publicKey.toBase58()
  const frozen = acc.totalRentalCost.add(acc.depositAmount)

  const phases: [string, string][] = [
    ['Phase 1 — before sending', acc.phase1Photos],
    ['Phase 2 — on arrival', acc.phase2Photos],
    ['Phase 3 — before returning', acc.phase3Photos],
    ['Phase 4 — on return', acc.phase4Photos],
  ]

  // Already resolved from a *previous* session (off-chain status loaded as
  // "resolved" without this component having driven a payout itself) — the
  // off-chain status only ever becomes "resolved" as a result of a
  // successful resolveDispute call (see below), so this is a reliable
  // signal even across a page reload, though which party got paid isn't
  // recorded off-chain and so can't be shown in that case.
  const resolvedElsewhere = status === 'resolved' && !paidTo
  const locked = paidTo !== null || resolvedElsewhere

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setPayoutWarning(null)
    try {
      if (selectedRecipient) {
        const ownerAmount = selectedRecipient === 'owner' ? frozen : new BN(0)
        const renterAmount = selectedRecipient === 'renter' ? frozen : new BN(0)
        // The funds-moving, hard-to-reverse step goes first. If this
        // throws, execution never reaches the note save below — no
        // "resolved" status gets recorded unless a payout actually
        // happened, and the error below is the on-chain failure itself,
        // not a generic message papering over it.
        //
        // Longer timeout than withTimeout's 10s default (used everywhere
        // else in the app) specifically for this one call: this is a real,
        // no-undo money transfer with an explicit "can't be undone" warning
        // right above the button, so an attentive admin reading the wallet
        // popup's own confirmation before approving can easily use up most
        // of a 10s budget on review time alone — on top of that, the
        // measured *network* round trip here is fast, but Phantom's own
        // simulation/preview step runs independently of our RPC choice and
        // can add its own delay before the popup is even clickable. Past
        // 10s, withTimeout doesn't cancel the underlying call — it just
        // stops listening — so the transaction was landing successfully
        // on-chain while the UI reported a false "didn't respond" failure,
        // which is exactly the risky part: retrying a call that already
        // succeeded risks a real NotDisputed rejection on the second try.
        await withTimeout(
          resolveDispute(program, rental.account.listing, rental.publicKey, adminPubkey, acc.owner, acc.renter, ownerAmount, renterAmount),
          30_000,
        )
        // Funds have already moved on-chain at this point — true
        // regardless of what happens next, so the UI reflects it even if
        // the note save that follows fails.
        setPaidTo(selectedRecipient)
        try {
          const row = await saveDisputeNote(rentalPubkey, 'resolved', note, token)
          onSaved(row)
        } catch (err) {
          setPayoutWarning(
            `Funds were sent to the ${selectedRecipient}, but saving the review note failed: ${
              err instanceof Error ? err.message : String(err)
            } The payout is final and on-chain — only this note/status record didn't save.`,
          )
        }
      } else {
        const row = await saveDisputeNote(rentalPubkey, status, note, token)
        onSaved(row)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          {itemName}
        </h3>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" style={REVIEW_STYLE[status]}>
          {REVIEW_LABEL[status]}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="block uppercase tracking-wide" style={{ color: C.faint }}>
            Renter
          </span>
          <span style={{ color: C.muted }}>{truncate(acc.renter.toBase58())}</span>
        </div>
        <div>
          <span className="block uppercase tracking-wide" style={{ color: C.faint }}>
            Owner
          </span>
          <span style={{ color: C.muted }}>{truncate(acc.owner.toBase58())}</span>
        </div>
        <div>
          <span className="block uppercase tracking-wide" style={{ color: C.faint }}>
            Flagged via
          </span>
          <span style={{ color: C.muted }}>{disputePathLabel(acc.disputeKind)}</span>
        </div>
        <div>
          <span className="block uppercase tracking-wide" style={{ color: C.faint }}>
            Frozen amount
          </span>
          <span style={{ color: C.muted }}>{formatSol(frozen)}</span>
        </div>
      </div>

      {acc.disputeReason && (
        <p className="mb-4 rounded-xl p-3 text-sm" style={{ background: 'rgba(184,92,66,0.08)', border: '1px solid rgba(184,92,66,0.28)', color: C.rust }}>
          "{acc.disputeReason}"
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-4 text-xs">
        {phases.map(([label, cid]) =>
          cid ? (
            <a key={label} href={gatewayUrl(cid)} target="_blank" rel="noreferrer" className="underline" style={{ color: C.gold }}>
              {label}
            </a>
          ) : null,
        )}
      </div>

      <div className="flex flex-col gap-3 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
            Review status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as DisputeReviewStatus)}
            disabled={locked}
            style={INPUT_STYLE}
          >
            <option value="under_review">Under review</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
            Note
          </label>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={locked}
            maxLength={1000}
            style={{ ...INPUT_STYLE, resize: 'none' }}
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
            Who gets the funds?
          </p>
          {resolvedElsewhere ? (
            <p className="text-sm" style={{ color: C.muted }}>
              This dispute has already been resolved and paid out.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <PayoutButton
                role="Renter"
                address={acc.renter.toBase58()}
                selected={selectedRecipient === 'renter'}
                paid={paidTo === 'renter'}
                disabled={locked || saving}
                onClick={() => setSelectedRecipient('renter')}
              />
              <PayoutButton
                role="Owner"
                address={acc.owner.toBase58()}
                selected={selectedRecipient === 'owner'}
                paid={paidTo === 'owner'}
                disabled={locked || saving}
                onClick={() => setSelectedRecipient('owner')}
              />
            </div>
          )}
        </div>

        {selectedRecipient && !locked && (
          <p className="text-xs" style={{ color: C.faint }}>
            Saving will send {formatSol(frozen)} to the {selectedRecipient} ({truncate(acc[selectedRecipient].toBase58())}) and mark this dispute resolved. This can't be undone.
          </p>
        )}

        {payoutWarning && (
          <p className="rounded-xl p-3 text-sm" style={{ background: 'rgba(201,162,62,0.08)', border: '1px solid rgba(201,162,62,0.25)', color: '#B5893A' }}>
            {payoutWarning}
          </p>
        )}
        {error && (
          <p className="text-sm" style={{ color: C.rust }}>
            {error}
          </p>
        )}
        <Btn onClick={() => void handleSave()} disabled={saving || locked}>
          {locked ? 'Resolved' : saving ? (selectedRecipient ? 'Sending funds…' : 'Saving…') : 'Save review'}
        </Btn>
      </div>
    </div>
  )
}

function PayoutButton({
  role,
  address,
  selected,
  paid,
  disabled,
  onClick,
}: {
  role: string
  address: string
  selected: boolean
  paid: boolean
  disabled: boolean
  onClick: () => void
}) {
  const style = paid
    ? { background: 'rgba(62,138,95,0.10)', border: '1px solid rgba(62,138,95,0.4)', color: C.green }
    : selected
      ? { background: 'rgba(201,162,75,0.14)', border: `1px solid ${C.gold}`, color: C.gold }
      : { background: 'transparent', border: `1px solid ${C.border}`, color: C.cream }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl px-4 py-3 text-left text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60"
      style={style}
    >
      <span className="block text-xs uppercase tracking-wide" style={{ color: C.faint }}>
        {role}
      </span>
      {truncate(address)}
      {paid && (
        <span className="mt-1 block text-xs font-semibold" style={{ color: C.green }}>
          Paid
        </span>
      )}
    </button>
  )
}
