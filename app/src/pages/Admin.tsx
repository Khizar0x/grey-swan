import type { Program } from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Btn } from '../components/atoms'
import { DisputeAnswersSummary } from '../components/DisputeAnswersSummary'
import { PhaseGallery } from '../components/PhaseGallery'
import { RetryImage } from '../components/RetryImage'
import { ReviewerResolvePanel } from '../components/admin/ReviewerResolvePanel'
import { TwoReviewerFlow } from '../components/admin/TwoReviewerFlow'
import { type DisputeNote, type DisputeReviewStatus, fetchDisputeNotes, saveDisputeNote } from '../lib/adminApi'
import { useAuthContext } from '../lib/AuthContext'
import { type DisputeAnswers, fetchDisputeAnswers } from '../lib/disputeAnswersApi'
import { legacyResolveNeedsTwo } from '../lib/disputeMath'
import { formatDeadlineDate } from '../lib/deadlines'
import { formatSol } from '../lib/format'
import type { Greyswan } from '../idl/greyswan.ts'
import { enumKey } from '../lib/listing'
import { type AdminContext } from './AdminShell'
import { type ConfigAccount, type DisputeAccount, disputePathLabel, groupOf, type Role, type StageGroup, stageOf } from '../lib/adminDisputes'
import { resolveDispute, resolveDisputeTx, voidVerdict } from '../lib/mutations'
import { useProgram } from '../lib/program'
import { C, FONT_HEAD, INPUT_STYLE } from '../lib/theme'
import { useListingsByKeys } from '../lib/useListingsByKeys'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import type { RentalAccountEntry } from '../lib/useRentals'
import { useRentals } from '../lib/useRentals'
import { withTimeout } from '../lib/withTimeout'

function truncate(pubkey: string): string {
  return `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`
}

// Off-chain review status for the admin's own use — deliberately not part
// of rentalStatus.ts's public status list (see CLAUDE.md scope), but styled
// with the same three-tint badge system so it looks native to the app.
const REVIEW_STYLE: Record<DisputeReviewStatus, { background: string; color: string; border: string }> = {
  under_review: { background: 'var(--gs-badge-pending-bg)', color: 'var(--gs-badge-pending-color)', border: '1px solid var(--gs-badge-pending-border)' },
  resolved: { background: 'var(--gs-badge-positive-bg)', color: C.green, border: '1px solid var(--gs-badge-positive-border)' },
}
const REVIEW_LABEL: Record<DisputeReviewStatus, string> = {
  under_review: 'Under review',
  resolved: 'Resolved',
}

export function AdminDisputes() {
  const program = useProgram()
  const { publicKey } = useWallet()
  const { token } = useAuthContext()
  const { config, role } = useOutletContext<AdminContext>()

  const [disputes, setDisputes] = useState<Map<string, DisputeAccount>>(new Map())
  const [reloadKey, setReloadKey] = useState(0)
  const [resolvedOpen, setResolvedOpen] = useState(false)

  const { rentals, loading: rentalsLoading } = useRentals()
  // Open disputes, plus rentals that were settled after one (shown muted).
  const disputed = useMemo(
    () =>
      rentals.filter((r) => {
        const status = enumKey(r.account.status)
        return status === 'disputed' || (status === 'resolved' && enumKey(r.account.disputeKind) !== 'none')
      }),
    [rentals],
  )
  const activeCount = disputed.filter((r) => enumKey(r.account.status) === 'disputed').length
  const listingsMap = useListingsByKeys(disputed.map((r) => r.account.listing))

  // One Dispute account per rental disputed since they were introduced; older
  // disputes have none and are listed as such.
  useEffect(() => {
    let cancelled = false
    program.account.dispute
      .all()
      .then((rows) => {
        if (!cancelled) setDisputes(new Map(rows.map((r) => [r.account.rental.toBase58(), r.account])))
      })
      .catch((err) => console.error('Could not load dispute accounts:', err))
    return () => {
      cancelled = true
    }
  }, [program, reloadKey])

  const [notes, setNotes] = useState<Map<string, DisputeNote>>(new Map())
  const [notesError, setNotesError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
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
  }, [token])

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-3xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
        Disputes
      </h1>
      <p className="mb-8 text-sm" style={{ color: C.faint }}>
        Rentals that were flagged, rejected or timed out, grouped by where they stand.
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
      {!rentalsLoading && activeCount === 0 && (
        <p className="text-sm" style={{ color: C.faint }}>
          Nothing needs review right now.
        </p>
      )}

      {GROUPS.map((g) => {
        const rows = disputed.filter((r) => groupOf(r, disputes.get(r.publicKey.toBase58()) ?? null) === g.key)
        if (rows.length === 0) return null
        return (
          <section
            key={g.key}
            className="mb-8 rounded-2xl p-4 sm:p-5"
            style={{ background: g.bg, border: `1px solid ${g.border}`, borderLeft: `6px solid ${g.accent}`, opacity: g.key === 'resolved' ? 0.9 : 1 }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
                  {g.title}
                </h2>
                <p className="mt-0.5 text-xs" style={{ color: C.muted }}>
                  {g.hint}
                </p>
              </div>
              <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: g.bg, border: `1px solid ${g.border}`, color: g.accent }}>
                {rows.length}
              </span>
            </div>
            {g.key === 'resolved' && (
              <button type="button" onClick={() => setResolvedOpen((o) => !o)} className="mb-3 text-xs font-semibold underline" style={{ color: C.gold }}>
                {resolvedOpen ? 'Hide resolved' : 'Show resolved'}
              </button>
            )}
            <div className="flex flex-col gap-3">
              {(g.key === 'resolved' && !resolvedOpen ? [] : rows).map((r) => (
                <DisputeCard
                  key={r.publicKey.toBase58()}
                  program={program}
                  adminPubkey={publicKey!}
                  rental={r}
                  dispute={disputes.get(r.publicKey.toBase58()) ?? null}
                  config={config}
                  role={role}
                  itemName={listingsMap.get(r.account.listing.toBase58())?.itemName ?? 'Item'}
                  listingPhotos={listingsMap.get(r.account.listing.toBase58())?.photos}
                  tone={g}
                  existingNote={notes.get(r.publicKey.toBase58())}
                  token={token!}
                  onSaved={(row) => setNotes((prev) => new Map(prev).set(row.rental_pubkey, row))}
                  onChanged={() => setReloadKey((k) => k + 1)}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

// Each section has its own tint, drawn from the three status colours: rust for
// attention, amber for waiting, green for settled.
interface GroupTone {
  key: StageGroup
  title: string
  hint: string
  accent: string
  bg: string
  border: string
}
const ATTENTION = { accent: C.rust, bg: 'var(--gs-badge-attention-bg)', border: 'var(--gs-badge-attention-border)' }
const PENDING = { accent: 'var(--gs-badge-pending-color)', bg: 'var(--gs-badge-pending-bg)', border: 'var(--gs-badge-pending-border)' }
const POSITIVE = { accent: C.green, bg: 'var(--gs-badge-positive-bg)', border: 'var(--gs-badge-positive-border)' }
const GROUPS: GroupTone[] = [
  { key: 'needs', title: 'Needs a reviewer', hint: 'Appeals, set-aside reviews, and disputes the automatic review does not handle.', ...ATTENTION },
  { key: 'waiting', title: 'Waiting for the first review', hint: 'Damage reports the automatic review has not looked at yet. A reviewer can still decide them.', ...PENDING },
  { key: 'posted', title: 'First review posted', hint: 'The appeal window is running. Anyone can release the funds once it closes.', ...PENDING },
  { key: 'resolved', title: 'Resolved', hint: 'Settled. Open a card to see what was decided on.', ...POSITIVE },
]

// Everything a reviewer needs to decide fairly, in one place: what each side
// said (the same summary the renter and owner see) and every handover photo.
function Evidence({ rentalPubkey, token, acc }: { rentalPubkey: string; token: string; acc: RentalAccountEntry['account'] }) {
  const [answers, setAnswers] = useState<DisputeAnswers | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchDisputeAnswers(rentalPubkey, token)
      .then((a) => {
        if (!cancelled) setAnswers(a)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [rentalPubkey, token])

  const phases: [string, string][] = [
    ['Phase 1: before sending', acc.phase1Photos],
    ['Phase 2: on arrival', acc.phase2Photos],
    ['Phase 3: before returning', acc.phase3Photos],
    ['Phase 4: on return', acc.phase4Photos],
  ]

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.faint }}>
        What each side said
      </p>
      {error ? (
        <p className="text-sm" style={{ color: C.rust }}>
          {error}
        </p>
      ) : !answers ? (
        <p className="text-sm" style={{ color: C.faint }}>
          Loading…
        </p>
      ) : !answers.owner && !answers.renter ? (
        <p className="text-sm" style={{ color: C.muted }}>
          Nobody has added answers for this one yet.
        </p>
      ) : (
        <DisputeAnswersSummary answers={answers} />
      )}

      <p className="mt-2 text-xs font-semibold uppercase tracking-wide" style={{ color: C.faint }}>
        Photos from each stage
      </p>
      {phases.every(([, cid]) => !cid) ? (
        <p className="text-sm" style={{ color: C.muted }}>
          No handover photos were added.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {phases.map(([label, cid]) => (
            <PhaseGallery key={label} title={label} manifestCid={cid} />
          ))}
        </div>
      )}
    </div>
  )
}

function ListingThumb({ photos, name }: { photos: string | undefined; name: string }) {
  const { urls } = usePhotoUrls(photos)
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
      {urls[0] && <RetryImage src={urls[0]} alt={name} className="h-full w-full object-cover" />}
    </div>
  )
}

function DisputeCard({
  program,
  adminPubkey,
  rental,
  dispute,
  config,
  role,
  itemName,
  listingPhotos,
  tone,
  existingNote,
  token,
  onSaved,
  onChanged,
}: {
  program: Program<Greyswan>
  adminPubkey: PublicKey
  rental: RentalAccountEntry
  dispute: DisputeAccount | null
  config: ConfigAccount | null
  role: Role | null
  itemName: string
  listingPhotos: string | undefined
  tone: GroupTone
  existingNote: DisputeNote | undefined
  token: string
  onSaved: (note: DisputeNote) => void
  onChanged: () => void
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

  // Already resolved from a *previous* session (off-chain status loaded as
  // "resolved" without this component having driven a payout itself) — the
  // off-chain status only ever becomes "resolved" as a result of a
  // successful resolveDispute call (see below), so this is a reliable
  // signal even across a page reload, though which party got paid isn't
  // recorded off-chain and so can't be shown in that case.
  const resolvedElsewhere = status === 'resolved' && !paidTo
  // A decision made through the damage-dispute path this session.
  const [decided, setDecided] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)
  const onChainResolved = enumKey(acc.status) === 'resolved'
  const locked = paidTo !== null || resolvedElsewhere || decided || onChainResolved
  const [expanded, setExpanded] = useState(false)

  const kindKey = enumKey(acc.disputeKind)
  const stage = stageOf(acc.disputeKind, dispute)
  const stageStatus = dispute ? enumKey(dispute.status) : 'legacy'
  // Damage reports with a Dispute account are decided with reviewer_resolve
  // (a percentage split); everything else uses the older exact-amount call.
  const usesVerdictEngine = dispute !== null && kindKey === 'returnIssue'
  const canDecideNow = stageStatus === 'open' || stageStatus === 'appealed' || stageStatus === 'voided'

  const deposit = BigInt(acc.depositAmount.toString())
  const totalHeld = BigInt(frozen.toString())
  const legacyNeedsTwo =
    config !== null && selectedRecipient !== null
      ? legacyResolveNeedsTwo({
          majorBps: config.rubricBps[3],
          threshold: BigInt(config.twoReviewerThresholdLamports.toString()),
          totalHeld,
          deposit,
          ownerAmount: selectedRecipient === 'owner' ? totalHeld : 0n,
          renterAmount: selectedRecipient === 'renter' ? totalHeld : 0n,
        })
      : false
  const otherReviewers = config
    ? [config.admin, ...config.reviewers.slice(0, config.reviewerCount)].filter((k) => !k.equals(adminPubkey))
    : []

  // Funds have moved by now; the review note is a courtesy that must never
  // look like it undid the payout if it fails.
  const finishPayout = async (recipient: 'owner' | 'renter') => {
    setPaidTo(recipient)
    try {
      onSaved(await saveDisputeNote(rentalPubkey, 'resolved', note, token))
    } catch (err) {
      setPayoutWarning(
        `Funds were sent to the ${recipient}, but saving the review note failed: ${err instanceof Error ? err.message : String(err)} The payout is final. Only this note didn't save.`,
      )
    }
  }

  const finishVerdictDecision = async () => {
    setDecided(true)
    onChanged()
    try {
      onSaved(await saveDisputeNote(rentalPubkey, 'resolved', note, token))
    } catch {
      setPayoutWarning("The decision is final. Only the review note didn't save.")
    }
  }

  const handleVoid = async () => {
    setVoiding(true)
    setVoidError(null)
    try {
      await withTimeout(voidVerdict(program, rental.publicKey, acc.owner, acc.renter))
      onChanged()
      setDecided(true)
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : String(err))
    } finally {
      setVoiding(false)
    }
  }

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
        // The wallet timeout is long (three minutes, see withTimeout.ts)
        // because of this one call, among others: this is a real,
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
        )
        // Funds have already moved on-chain at this point — true
        // regardless of what happens next, so the UI reflects it even if
        // the note save that follows fails.
        await finishPayout(selectedRecipient)
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

  const stageStyle = onChainResolved ? POSITIVE : tone
  return (
    <div
      className="rounded-2xl p-3 shadow-sm sm:p-4"
      style={{ background: C.surface, border: `1px solid ${C.border}`, opacity: onChainResolved && !expanded ? 0.8 : 1 }}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 text-left"
      >
        <ListingThumb photos={listingPhotos} name={itemName} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold leading-tight" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
              {itemName}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{ background: stageStyle.bg, color: stageStyle.accent, border: `1px solid ${stageStyle.border}` }}
            >
              {onChainResolved ? 'Resolved' : stage.label}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-sm" style={{ color: C.muted }}>
            {acc.disputeReason ? `"${acc.disputeReason}"` : disputePathLabel(acc.disputeKind)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-bold" style={{ color: C.cream }}>
            {formatSol(frozen)}
          </span>
          <span className="block text-[11px]" style={{ color: C.faint }}>
            held
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold" style={{ color: C.gold }} aria-hidden>
          {expanded ? 'Close' : 'Open'}
        </span>
      </button>

      {expanded && (
        <>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full px-2.5 py-1 font-bold" style={REVIEW_STYLE[status]}>
          {REVIEW_LABEL[status]}
        </span>
        <span style={{ color: C.muted }}>{disputePathLabel(acc.disputeKind)}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl p-3 text-xs" style={{ background: C.subtleBg, border: `1px solid ${C.border}` }}>
        <div>
          <span className="block uppercase tracking-wide" style={{ color: C.faint }}>
            Renter
          </span>
          <span className="font-mono" style={{ color: C.muted }}>{truncate(acc.renter.toBase58())}</span>
        </div>
        <div>
          <span className="block uppercase tracking-wide" style={{ color: C.faint }}>
            Owner
          </span>
          <span className="font-mono" style={{ color: C.muted }}>{truncate(acc.owner.toBase58())}</span>
        </div>
      </div>

      {acc.disputeReason && (
        <p className="mt-3 rounded-xl p-3 text-sm" style={{ background: 'var(--gs-badge-attention-bg)', border: '1px solid var(--gs-badge-attention-border)', color: C.rust }}>
          "{acc.disputeReason}"
        </p>
      )}

      <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
        <Evidence rentalPubkey={rentalPubkey} token={token} acc={acc} />
      </div>

      <div className="mt-4 flex flex-col gap-3 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
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

        {usesVerdictEngine && dispute ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
              Decision
            </p>
            {locked ? (
              <p className="text-sm" style={{ color: C.muted }}>
                This has been decided.
              </p>
            ) : canDecideNow && config ? (
              <ReviewerResolvePanel
                program={program}
                rental={rental}
                reviewer={adminPubkey}
                otherReviewers={otherReviewers}
                aiOwnerBps={dispute.verdictPostedAt.toNumber() !== 0 ? dispute.verdictOwnerBps : null}
                majorBps={config.rubricBps[3]}
                threshold={BigInt(config.twoReviewerThresholdLamports.toString())}
                appealed={stageStatus === 'appealed'}
                onResolved={() => void finishVerdictDecision()}
              />
            ) : (
              <>
                <p className="text-sm" style={{ color: C.muted }}>
                  The first review suggested {dispute.verdictOwnerBps / 100}% of the deposit to the owner. The appeal window runs until {formatDeadlineDate(dispute.appealDeadline.toNumber())}. Nothing to decide unless someone appeals.
                </p>
                {role === 'admin' && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs" style={{ color: C.faint }}>
                      If the first review looks wrong, set it aside. A reviewer then decides, and any bonds are returned.
                    </p>
                    <div>
                      <Btn variant="danger" disabled={voiding} onClick={() => void handleVoid()}>
                        {voiding ? 'Setting aside…' : 'Set the first review aside'}
                      </Btn>
                    </div>
                    {voidError && (
                      <p className="text-sm" style={{ color: C.rust }}>
                        {voidError}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <>
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

          </>
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
        {!usesVerdictEngine && selectedRecipient && legacyNeedsTwo && !locked ? (
          <TwoReviewerFlow
            program={program}
            why="Sending everything held to one side needs a second reviewer."
            candidates={otherReviewers}
            buildTx={(second) =>
              resolveDisputeTx(
                program,
                acc.listing,
                rental.publicKey,
                second,
                acc.owner,
                acc.renter,
                selectedRecipient === 'owner' ? frozen : new BN(0),
                selectedRecipient === 'renter' ? frozen : new BN(0),
              )
            }
            onDone={() => void finishPayout(selectedRecipient)}
          />
        ) : (
          <Btn onClick={() => void handleSave()} disabled={saving || locked}>
            {locked ? 'Resolved' : saving ? (selectedRecipient ? 'Waiting for your wallet to approve…' : 'Saving…') : 'Save review'}
          </Btn>
        )}
      </div>
        </>
      )}
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
    ? { background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.4)', color: C.green }
    : selected
      ? { background: 'rgba(255,107,53,0.14)', border: `1px solid ${C.gold}`, color: C.gold }
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
        <span className="mt-1 block text-xs font-bold" style={{ color: C.green }}>
          Paid
        </span>
      )}
    </button>
  )
}
