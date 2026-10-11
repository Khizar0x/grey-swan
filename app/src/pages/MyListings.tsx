import { useWallet } from '@solana/wallet-adapter-react'
import { Link } from 'react-router-dom'
import { UnreadBadge } from '../components/atoms'
import { OwnerListingActions } from '../components/OwnerListingActions'
import { IconCamera, IconCheck } from '../components/icons'
import { RetryImage } from '../components/RetryImage'
import { useAuthContext } from '../lib/AuthContext'
import { formatSol } from '../lib/format'
import { categoryColor, categoryLabel, enumKey } from '../lib/listing'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import { rentalStatusLabel, rentalStatusStyle, type StatusStyle } from '../lib/rentalStatus'
import { C, FONT_HEAD } from '../lib/theme'
import { useListings, type ListingAccountEntry } from '../lib/useListings'
import { useUnreadCounts } from '../lib/useUnreadCounts'
import type { RentalAccountEntry } from '../lib/useRentals'
import { useRentals } from '../lib/useRentals'

const AVAILABLE_STYLE: StatusStyle = { background: 'var(--gs-badge-positive-bg)', color: C.green, border: '1px solid var(--gs-badge-positive-border)' }

// A rental is "in progress" for this page's purposes if it hasn't reached a
// terminal state yet: used to find the one active rental (if any) tied to
// each of the owner's listings.
function isTerminalStatus(status: Record<string, object>): boolean {
  const key = enumKey(status)
  return key === 'completed' || key === 'refundedAuto' || key === 'resolved'
}

function PhotoPlaceholder({ loading, failed }: { loading?: boolean; failed?: boolean }) {
  return (
    <div
      className={`flex aspect-square flex-col items-center justify-center gap-1.5 p-4 text-center ${loading ? 'animate-pulse' : ''}`}
      style={{ background: C.surface2, color: C.faint }}
    >
      <div className="h-6 w-6">
        <IconCamera />
      </div>
      <span className="text-xs font-medium">
        {loading ? 'Loading photo…' : failed ? "Couldn't load photo" : 'No photo yet'}
      </span>
    </div>
  )
}

// Card style deliberately matches ListingCard.tsx (the homepage grid)
// same photo aspect ratio, category badge, and bold price, so this reads
// as the same marketplace rather than a separate admin-y list.
function ListingCard({
  listing,
  rental,
  unread,
  onRemoved,
}: {
  listing: ListingAccountEntry
  rental: RentalAccountEntry | undefined
  unread: number
  onRemoved: () => void
}) {
  const pubkeyStr = listing.publicKey.toBase58()
  const { urls, loading: photosLoading } = usePhotoUrls(listing.account.photos)
  const catColor = categoryColor(listing.account.category)
  const style = rental ? rentalStatusStyle(rental.account.status) : AVAILABLE_STYLE
  const label = rental ? rentalStatusLabel(rental.account.status) : 'Available to rent'
  const statusKey = rental ? enumKey(rental.account.status) : null

  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl transition-all hover:shadow-md" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <UnreadBadge count={unread} />
      <Link to={`/listing/${pubkeyStr}`} className="group relative block overflow-hidden">
        {urls[0] ? (
          <div className="aspect-square overflow-hidden" style={{ background: C.surface2 }}>
            <RetryImage
              src={urls[0]}
              alt={listing.account.itemName}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              fallback={<PhotoPlaceholder failed />}
            />
          </div>
        ) : (
          <PhotoPlaceholder loading={photosLoading} />
        )}
        <span
          className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm"
          style={{ background: catColor, color: C.overlayText }}
        >
          {categoryLabel(listing.account.category)}
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/listing/${pubkeyStr}`} className="min-w-0">
            <h3 className="truncate text-sm font-bold leading-snug" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
              {listing.account.itemName}
            </h3>
          </Link>
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={style}>
            {label}
          </span>
        </div>

        <div className="flex flex-col gap-1.5 rounded-lg p-2.5" style={{ background: C.subtleBg, border: `1px solid ${C.border}` }}>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.faint }}>
              Rental fee
            </span>
            <span className="text-sm font-bold" style={{ color: C.cream }}>
              {formatSol(listing.account.rentalPrice)} <span className="text-xs font-normal" style={{ color: C.faint }}>/week</span>
            </span>
          </div>
          <div className="flex items-baseline justify-between" style={{ borderTop: `1px solid ${C.border}`, paddingTop: '0.25rem' }}>
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.trust }}>
              Deposit
            </span>
            <span className="text-xs font-bold" style={{ color: C.trust }}>
              {formatSol(listing.account.depositAmount)} <span className="text-[10px] font-normal" style={{ color: C.faint }}>(refundable)</span>
            </span>
          </div>
        </div>

        {rental && (
          <div className="rounded-lg p-2 text-xs" style={{ background: C.trustSoft, border: '1px solid var(--gs-badge-positive-border)' }}>
            <p style={{ color: C.muted }}>
              Rented by <span className="font-mono">{rental.account.renter.toBase58().slice(0, 4)}...{rental.account.renter.toBase58().slice(-4)}</span>
            </p>
            <p className="mt-0.5 font-semibold" style={{ color: C.trust }}>
              {formatSol(rental.account.depositAmount)} deposit safely held
            </p>
          </div>
        )}

        <div className="mt-auto flex flex-wrap gap-1.5 pt-1.5">
          {rental ? (
            <>
              <Link
                to={`/rental/${rental.publicKey.toBase58()}`}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-80"
                style={{ color: C.cream, border: `1px solid ${C.border}`, background: 'transparent' }}
              >
                <IconCamera />
                Handover
              </Link>
              {statusKey === 'awaitingConfirmation' && (
                <Link
                  to={`/rental/${rental.publicKey.toBase58()}`}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all hover:opacity-90"
                  style={{ background: C.primary, color: C.onAccent }}
                >
                  <IconCheck />
                  Confirm return
                </Link>
              )}
            </>
          ) : (
            <OwnerListingActions listingPubkey={pubkeyStr} onRemoved={onRemoved} />
          )}
        </div>
      </div>
    </div>
  )
}

export function MyListings() {
  const { publicKey } = useWallet()
  const { token } = useAuthContext()
  const { listings, loading: listingsLoading, error: listingsError, refetch } = useListings()
  const { rentals, loading: rentalsLoading } = useRentals()

  const myListings = publicKey ? listings.filter((l) => l.account.owner.equals(publicKey)) : []

  const activeRentalByListing = new Map<string, RentalAccountEntry>()
  for (const r of rentals) {
    if (!isTerminalStatus(r.account.status)) {
      activeRentalByListing.set(r.account.listing.toBase58(), r)
    }
  }

  const unreadCounts = useUnreadCounts(Array.from(activeRentalByListing.values()).map((r) => r.publicKey.toBase58()), token)

  const activeCount = myListings.filter((l) => activeRentalByListing.has(l.publicKey.toBase58())).length
  const totalDepositHeld = myListings.reduce((sum, l) => {
    const rental = activeRentalByListing.get(l.publicKey.toBase58())
    return rental ? sum + rental.account.depositAmount.toNumber() : sum
  }, 0)

  const loading = listingsLoading || rentalsLoading

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-3xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
            Your listings
          </h1>
          <p className="text-sm" style={{ color: C.faint }}>
            Items you've listed, and any rentals in progress on them.
          </p>
        </div>
        {publicKey && myListings.length > 0 && (
          <div className="shrink-0 text-right">
            <p className="font-bold" style={{ color: C.cream }}>
              {activeCount} active rental{activeCount === 1 ? '' : 's'}
            </p>
            <p className="text-sm font-bold" style={{ color: C.trust }}>
              {formatSol(totalDepositHeld)} deposit safely held
            </p>
          </div>
        )}
      </div>

      {!publicKey && (
        <p className="text-sm" style={{ color: C.muted }}>
          Connect a wallet to see your listings.
        </p>
      )}
      {publicKey && loading && (
        <p className="text-sm" style={{ color: C.faint }}>
          Loading…
        </p>
      )}
      {listingsError && (
        <p className="text-sm" style={{ color: C.rust }}>
          {listingsError}
        </p>
      )}
      {publicKey && !loading && !listingsError && myListings.length === 0 && (
        <p className="text-sm" style={{ color: C.faint }}>
          You haven't listed anything yet.
        </p>
      )}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {myListings.map((l) => {
          const pubkeyStr = l.publicKey.toBase58()
          const rental = activeRentalByListing.get(pubkeyStr)
          return (
            <ListingCard
              key={pubkeyStr}
              listing={l}
              rental={rental}
              unread={rental ? unreadCounts.get(rental.publicKey.toBase58()) ?? 0 : 0}
              onRemoved={refetch}
            />
          )
        })}
      </div>

      <div className="mt-8 flex items-center gap-4 rounded-2xl p-5" style={{ background: C.subtleBg, border: `1px solid ${C.border}` }}>
        <svg className="h-5 w-5 shrink-0" style={{ color: C.gold }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        <div>
          <p className="text-sm font-medium" style={{ color: C.cream }}>
            Have something else to rent out?
          </p>
          <Link to="/list-item" className="text-xs underline" style={{ color: C.faint }}>
            Create a new listing
          </Link>
        </div>
      </div>
    </div>
  )
}
