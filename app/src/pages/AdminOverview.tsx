import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { type DisputeAccount, groupOf } from '../lib/adminDisputes'
import { formatDeadlineDate } from '../lib/deadlines'
import { enumKey } from '../lib/listing'
import { useProgram } from '../lib/program'
import { C, FONT_HEAD } from '../lib/theme'
import { useListings } from '../lib/useListings'
import { useListingsByKeys } from '../lib/useListingsByKeys'
import { useRentals } from '../lib/useRentals'

type TimelineRow = { rental: string; shippedAt: number; arrivedAt: number; returnShippedAt: number }

interface ActivityEvent {
  at: number
  label: string
  rental: string
  listing: string
}

// Every number here is counted from what is actually on the chain right now.
// Nothing is estimated or stored separately, and anything the chain does not
// record (for example when a listing was created) is simply not shown.
export function AdminOverview() {
  const program = useProgram()
  const { listings, loading: listingsLoading } = useListings()
  const { rentals, loading: rentalsLoading } = useRentals()
  const [disputes, setDisputes] = useState<Map<string, DisputeAccount>>(new Map())
  const [timelines, setTimelines] = useState<TimelineRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([program.account.dispute.all(), program.account.rentalTimeline.all()])
      .then(([d, t]) => {
        if (cancelled) return
        setDisputes(new Map(d.map((r) => [r.account.rental.toBase58(), r.account])))
        setTimelines(
          t.map((r) => ({
            rental: r.account.rental.toBase58(),
            shippedAt: r.account.shippedAt.toNumber(),
            arrivedAt: r.account.arrivedAt.toNumber(),
            returnShippedAt: r.account.returnShippedAt.toNumber(),
          })),
        )
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [program])

  const stats = useMemo(() => {
    const wallets = new Set<string>()
    for (const l of listings) wallets.add(l.account.owner.toBase58())
    let activeRentals = 0
    let awaitingHandover = 0
    let openDisputes = 0
    let needsReviewer = 0
    let waitingFirst = 0
    for (const r of rentals) {
      wallets.add(r.account.owner.toBase58())
      wallets.add(r.account.renter.toBase58())
      const status = enumKey(r.account.status)
      if (status === 'active') {
        activeRentals += 1
        if (enumKey(r.account.currentPhase) !== 'onReturn') awaitingHandover += 1
      }
      if (status === 'disputed') {
        openDisputes += 1
        const group = groupOf(r, disputes.get(r.publicKey.toBase58()) ?? null)
        if (group === 'needs') needsReviewer += 1
        if (group === 'waiting') waitingFirst += 1
      }
    }
    return { wallets: wallets.size, activeRentals, awaitingHandover, openDisputes, needsReviewer, waitingFirst }
  }, [listings, rentals, disputes])

  const events = useMemo(() => {
    const out: ActivityEvent[] = []
    const byRental = new Map(rentals.map((r) => [r.publicKey.toBase58(), r]))
    const add = (at: number, label: string, rental: string) => {
      const r = byRental.get(rental)
      if (at > 0 && r) out.push({ at, label, rental, listing: r.account.listing.toBase58() })
    }
    for (const r of rentals) add(r.account.createdAt.toNumber(), 'Rental started', r.publicKey.toBase58())
    for (const t of timelines) {
      add(t.shippedAt, 'Owner handed the item over', t.rental)
      add(t.arrivedAt, 'Renter confirmed it arrived', t.rental)
      add(t.returnShippedAt, 'Renter sent the item back', t.rental)
    }
    for (const [rental, d] of disputes) {
      add(d.openedAt.toNumber(), 'Dispute opened', rental)
      add(d.verdictPostedAt.toNumber(), 'First review posted', rental)
      add(d.resolvedAt.toNumber(), 'Dispute resolved', rental)
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 10)
  }, [rentals, timelines, disputes])

  const listingKeys = useMemo(() => {
    const seen = new Map(rentals.map((r) => [r.account.listing.toBase58(), r.account.listing]))
    return events.map((e) => seen.get(e.listing)).filter((k): k is NonNullable<typeof k> => !!k)
  }, [events, rentals])
  const names = useListingsByKeys(listingKeys)

  const loading = listingsLoading || rentalsLoading
  const needsAttention = stats.needsReviewer + stats.waitingFirst

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-3xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
        Overview
      </h1>
      <p className="mb-6 text-sm" style={{ color: C.faint }}>
        Counted live from the chain. Nothing here is estimated.
      </p>
      {error && (
        <p className="mb-4 text-sm" style={{ color: C.rust }}>
          {error}
        </p>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Listings" value={listings.length} loading={loading} />
        <Stat label="Active rentals" value={stats.activeRentals} loading={loading} />
        <Stat label="Open disputes" value={stats.openDisputes} loading={loading} tone={stats.openDisputes > 0 ? 'attention' : undefined} />
        <Stat label="Wallets seen" value={stats.wallets} loading={loading} note="Distinct owners and renters" />
      </div>

      <Link
        to="/admin/disputes"
        className="mb-8 flex items-center justify-between gap-4 rounded-2xl p-5 transition-opacity hover:opacity-90"
        style={{
          background: needsAttention > 0 ? 'var(--gs-badge-attention-bg)' : C.surface,
          border: `1px solid ${needsAttention > 0 ? 'var(--gs-badge-attention-border)' : C.border}`,
        }}
      >
        <div>
          <p className="text-lg font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
            Disputes
          </p>
          <p className="text-sm" style={{ color: C.muted }}>
            {loading ? 'Loading…' : needsAttention > 0 ? `${needsAttention} need attention` : 'Nothing needs attention right now'}
          </p>
        </div>
        <span className="text-sm font-semibold" style={{ color: C.primary }}>
          Open disputes
        </span>
      </Link>

      <h2 className="mb-3 text-lg font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
        Pending actions
      </h2>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Rentals awaiting a handover step" value={stats.awaitingHandover} loading={loading} />
        <Stat label="Disputes needing a reviewer" value={stats.needsReviewer} loading={loading} tone={stats.needsReviewer > 0 ? 'attention' : undefined} />
        <Stat label="Waiting for the first review" value={stats.waitingFirst} loading={loading} tone={stats.waitingFirst > 0 ? 'pending' : undefined} />
      </div>

      <h2 className="mb-3 text-lg font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
        Recent activity
      </h2>
      {events.length === 0 ? (
        <p className="text-sm" style={{ color: C.faint }}>
          {loading ? 'Loading…' : 'No activity yet.'}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          {events.map((e, i) => (
            <li key={`${e.rental}-${e.label}-${e.at}`} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}>
              <Link to={`/rental/${e.rental}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-opacity hover:opacity-80">
                <span style={{ color: C.cream }}>
                  {e.label}
                  <span style={{ color: C.muted }}> · {names.get(e.listing)?.itemName ?? 'Item'}</span>
                </span>
                <span className="shrink-0 text-xs" style={{ color: C.faint }}>
                  {formatDeadlineDate(e.at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs" style={{ color: C.faint }}>
        Listings are not dated on the chain, so new listings do not appear here.
      </p>
    </div>
  )
}

function Stat({ label, value, loading, note, tone }: { label: string; value: number; loading: boolean; note?: string; tone?: 'attention' | 'pending' }) {
  const color = tone === 'attention' ? C.rust : tone === 'pending' ? 'var(--gs-badge-pending-color)' : C.cream
  return (
    <div className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold" style={{ color }}>
        {loading ? '…' : value}
      </p>
      {note && (
        <p className="mt-0.5 text-[11px]" style={{ color: C.faint }}>
          {note}
        </p>
      )}
    </div>
  )
}
