import { useMemo, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { Link } from 'react-router-dom'
import { UnreadBadge } from '../components/atoms'
import { IconAlert, IconCamera, IconEye } from '../components/icons'
import { RetryImage } from '../components/RetryImage'
import { useAuthContext } from '../lib/AuthContext'
import { formatSol } from '../lib/format'
import { categoryColor, categoryLabel, enumKey } from '../lib/listing'
import { phaseStepIndex, rentalStatusLabel, rentalStatusStyle } from '../lib/rentalStatus'
import { C, FONT_HEAD } from '../lib/theme'
import { useUnreadCounts } from '../lib/useUnreadCounts'
import type { ListingAccountEntry } from '../lib/useListings'
import { useListingsByKeys } from '../lib/useListingsByKeys'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import type { RentalAccountEntry } from '../lib/useRentals'
import { useRentals } from '../lib/useRentals'

function RentalPhotoFallback({
  type,
}: {
  type: 'loading' | 'missing' | 'failed'
}) {
  const isFailed = type === 'failed'
  const isLoading = type === 'loading'

  return (
    <div
      className={`flex aspect-square w-full flex-col items-center justify-center gap-2.5 p-4 text-center transition-colors ${
        isLoading ? 'animate-pulse' : ''
      }`}
      style={{
        background: C.surface2,
      }}
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full transition-transform"
        style={{
          background: C.subtleBg,
          border: `1px solid ${C.border}`,
          color: isFailed ? C.rust : C.muted,
        }}
      >
        {isFailed ? <IconAlert /> : <IconCamera />}
      </div>
      <span
        className="text-xs font-medium tracking-tight"
        style={{ color: isFailed ? C.rust : C.muted }}
      >
        {isLoading
          ? 'Loading photo…'
          : isFailed
            ? "Couldn't load photo"
            : 'No photo yet'}
      </span>
    </div>
  )
}

// Status-aware rental card with designed fallbacks and distinct visual styling
// for rentals requiring action, under dispute, or completed.
function RentalCard({ rental, listing, unread }: { rental: RentalAccountEntry; listing: ListingAccountEntry['account'] | undefined; unread: number }) {
  const { urls, loading: photosLoading } = usePhotoUrls(listing?.photos)
  const style = rentalStatusStyle(rental.account.status)
  const statusKey = enumKey(rental.account.status)
  const phaseStep = phaseStepIndex(rental.account.currentPhase)

  const isDisputed = statusKey === 'disputed'
  const isCompleted = statusKey === 'completed' || statusKey === 'resolved' || statusKey === 'refundedAuto'
  const needsAction = !isCompleted && !isDisputed && (phaseStep === 1 || statusKey === 'awaitingReturn' || phaseStep === 2)

  let actionText = ''
  if (phaseStep === 1) {
    actionText = 'Confirm receipt'
  } else if (statusKey === 'awaitingReturn' || phaseStep === 2) {
    actionText = 'Return item'
  }

  const borderStyle = isDisputed
    ? '1px solid var(--gs-badge-attention-border)'
    : needsAction
      ? '1px solid var(--gs-badge-pending-border)'
      : `1px solid ${C.border}`

  const shadowStyle = isDisputed
    ? C.shadowAttention
    : needsAction
      ? C.shadowPending
      : undefined

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-xl transition-all hover:shadow-md ${
        isCompleted ? 'opacity-85' : ''
      }`}
      style={{
        background: C.surface,
        border: borderStyle,
        boxShadow: shadowStyle,
      }}
    >
      <UnreadBadge count={unread} />

      {/* Status callout banner for high-attention states */}
      {isDisputed && (
        <div
          className="flex items-center justify-between px-3.5 py-2 text-xs font-semibold"
          style={{
            background: 'var(--gs-badge-attention-bg)',
            color: C.rust,
            borderBottom: '1px solid var(--gs-badge-attention-border)',
          }}
        >
          <div className="flex items-center gap-1.5">
            <IconAlert />
            <span>Something's not right · In review</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-85">Attention</span>
        </div>
      )}

      {needsAction && (
        <div
          className="flex items-center justify-between px-3.5 py-2 text-xs font-semibold"
          style={{
            background: 'var(--gs-badge-pending-bg)',
            color: 'var(--gs-badge-pending-color)',
            borderBottom: '1px solid var(--gs-badge-pending-border)',
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                style={{ background: 'var(--gs-badge-pending-color)' }}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ background: 'var(--gs-badge-pending-color)' }}
              />
            </span>
            <span>Action needed: {actionText}</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-85">Next step</span>
        </div>
      )}

      <Link to={`/rental/${rental.publicKey.toBase58()}`} className="relative block">
        {urls[0] ? (
          <div className="aspect-square overflow-hidden" style={{ background: C.surface2 }}>
            <RetryImage
              src={urls[0]}
              alt={listing?.itemName ?? 'Item'}
              className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
              fallback={<RentalPhotoFallback type="failed" />}
            />
          </div>
        ) : photosLoading ? (
          <RentalPhotoFallback type="loading" />
        ) : (
          <RentalPhotoFallback type="missing" />
        )}
        {listing && (
          <span
            className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: categoryColor(listing.category), color: C.overlayText }}
          >
            {categoryLabel(listing.category)}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/rental/${rental.publicKey.toBase58()}`} className="min-w-0">
            <h3 className="truncate text-sm font-bold leading-snug" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
              {listing?.itemName ?? 'Item'}
            </h3>
          </Link>
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={style}>
            {rentalStatusLabel(rental.account.status)}
          </span>
        </div>

        <p className="text-sm font-bold" style={{ color: C.cream }}>
          {rental.account.weeks} week{rental.account.weeks === 1 ? '' : 's'}
        </p>
        <p className="text-xs font-semibold" style={{ color: C.trust }}>
          {formatSol(rental.account.depositAmount)} deposit safely held
        </p>

        <div className="mt-auto pt-2">
          {needsAction ? (
            <Link
              to={`/rental/${rental.publicKey.toBase58()}`}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold shadow-sm transition-all hover:opacity-90 active:scale-[0.99]"
              style={{ background: C.primary, color: C.onAccent }}
            >
              Take action: {actionText}
              <span aria-hidden>→</span>
            </Link>
          ) : isDisputed ? (
            <Link
              to={`/rental/${rental.publicKey.toBase58()}`}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-all hover:opacity-90"
              style={{
                background: 'var(--gs-badge-attention-bg)',
                color: C.rust,
                border: '1px solid var(--gs-badge-attention-border)',
              }}
            >
              <IconEye />
              View dispute details
            </Link>
          ) : isCompleted ? (
            <Link
              to={`/rental/${rental.publicKey.toBase58()}`}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all hover:opacity-80"
              style={{ color: C.muted, border: `1px solid ${C.border}`, background: 'transparent' }}
            >
              <IconEye />
              View completed rental
            </Link>
          ) : (
            <Link
              to={`/rental/${rental.publicKey.toBase58()}`}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all hover:opacity-80"
              style={{ color: C.cream, border: `1px solid ${C.border}`, background: 'transparent' }}
            >
              <IconEye />
              View rental
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

export function MyRentals() {
  const { publicKey } = useWallet()
  const { token } = useAuthContext()
  const { rentals, loading, error } = useRentals()
  const [filter, setFilter] = useState<'all' | 'action' | 'active' | 'completed'>('all')

  const mine = useMemo(() => {
    return publicKey ? rentals.filter((r) => r.account.renter.equals(publicKey)) : []
  }, [publicKey, rentals])

  const listingsMap = useListingsByKeys(mine.map((r) => r.account.listing))
  const unreadCounts = useUnreadCounts(mine.map((r) => r.publicKey.toBase58()), token)

  // Sort rentals by urgency: disputed and action-needed first, then in-progress, then completed.
  const sortedMine = useMemo(() => {
    return [...mine].sort((a, b) => {
      const priority = (r: RentalAccountEntry) => {
        const s = enumKey(r.account.status)
        const p = phaseStepIndex(r.account.currentPhase)
        if (s === 'disputed') return 0
        if (p === 1 || s === 'awaitingReturn' || p === 2) return 1
        if (s === 'completed' || s === 'resolved' || s === 'refundedAuto') return 3
        return 2
      }
      return priority(a) - priority(b)
    })
  }, [mine])

  // Count summaries for filter pills
  const actionCount = useMemo(() => {
    return mine.filter((r) => {
      const s = enumKey(r.account.status)
      const p = phaseStepIndex(r.account.currentPhase)
      const isCompleted = s === 'completed' || s === 'resolved' || s === 'refundedAuto'
      return s === 'disputed' || (!isCompleted && (p === 1 || s === 'awaitingReturn' || p === 2))
    }).length
  }, [mine])

  const completedCount = useMemo(() => {
    return mine.filter((r) => {
      const s = enumKey(r.account.status)
      return s === 'completed' || s === 'resolved' || s === 'refundedAuto'
    }).length
  }, [mine])

  const displayedRentals = useMemo(() => {
    if (filter === 'action') {
      return sortedMine.filter((r) => {
        const s = enumKey(r.account.status)
        const p = phaseStepIndex(r.account.currentPhase)
        const isCompleted = s === 'completed' || s === 'resolved' || s === 'refundedAuto'
        return s === 'disputed' || (!isCompleted && (p === 1 || s === 'awaitingReturn' || p === 2))
      })
    }
    if (filter === 'completed') {
      return sortedMine.filter((r) => {
        const s = enumKey(r.account.status)
        return s === 'completed' || s === 'resolved' || s === 'refundedAuto'
      })
    }
    if (filter === 'active') {
      return sortedMine.filter((r) => {
        const s = enumKey(r.account.status)
        return s !== 'completed' && s !== 'resolved' && s !== 'refundedAuto'
      })
    }
    return sortedMine
  }, [sortedMine, filter])

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
            Your rentals
          </h1>
          <p className="text-sm" style={{ color: C.faint }}>
            Items you're currently renting from others.
          </p>
        </div>

        {publicKey && mine.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 sm:pt-0">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="rounded-full px-3 py-1 text-xs font-semibold transition-all"
              style={{
                background: filter === 'all' ? C.cream : C.surface2,
                color: filter === 'all' ? C.onAccent : C.muted,
                border: `1px solid ${filter === 'all' ? C.cream : C.border}`,
              }}
            >
              All ({mine.length})
            </button>
            {actionCount > 0 && (
              <button
                type="button"
                onClick={() => setFilter('action')}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all"
                style={{
                  background: filter === 'action' ? 'var(--gs-badge-pending-color)' : 'var(--gs-badge-pending-bg)',
                  color: filter === 'action' ? C.overlayText : 'var(--gs-badge-pending-color)',
                  border: '1px solid var(--gs-badge-pending-border)',
                }}
              >
                Needs action ({actionCount})
              </button>
            )}
            <button
              type="button"
              onClick={() => setFilter('active')}
              className="rounded-full px-3 py-1 text-xs font-semibold transition-all"
              style={{
                background: filter === 'active' ? C.cream : C.surface2,
                color: filter === 'active' ? C.onAccent : C.muted,
                border: `1px solid ${filter === 'active' ? C.cream : C.border}`,
              }}
            >
              Active ({mine.length - completedCount})
            </button>
            {completedCount > 0 && (
              <button
                type="button"
                onClick={() => setFilter('completed')}
                className="rounded-full px-3 py-1 text-xs font-semibold transition-all"
                style={{
                  background: filter === 'completed' ? C.cream : C.surface2,
                  color: filter === 'completed' ? C.onAccent : C.muted,
                  border: `1px solid ${filter === 'completed' ? C.cream : C.border}`,
                }}
              >
                Completed ({completedCount})
              </button>
            )}
          </div>
        )}
      </div>

      {!publicKey && (
        <p className="text-sm" style={{ color: C.muted }}>
          Connect a wallet to see your rentals.
        </p>
      )}
      {publicKey && loading && (
        <p className="text-sm" style={{ color: C.faint }}>
          Loading…
        </p>
      )}
      {error && (
        <p className="text-sm" style={{ color: C.rust }}>
          {error}
        </p>
      )}
      {publicKey && !loading && !error && mine.length === 0 && (
        <p className="text-sm" style={{ color: C.faint }}>
          You haven't rented anything yet.
        </p>
      )}

      {displayedRentals.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {displayedRentals.map((r) => (
            <RentalCard
              key={r.publicKey.toBase58()}
              rental={r}
              listing={listingsMap.get(r.account.listing.toBase58())}
              unread={unreadCounts.get(r.publicKey.toBase58()) ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}
