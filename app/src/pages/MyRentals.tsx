import { useWallet } from '@solana/wallet-adapter-react'
import { Link } from 'react-router-dom'
import { IconCamera, IconEye } from '../components/icons'
import { RetryImage } from '../components/RetryImage'
import { formatSol } from '../lib/format'
import { categoryColor, categoryLabel } from '../lib/listing'
import { rentalStatusLabel, rentalStatusStyle } from '../lib/rentalStatus'
import { C, FONT_HEAD } from '../lib/theme'
import type { ListingAccountEntry } from '../lib/useListings'
import { useListingsByKeys } from '../lib/useListingsByKeys'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import type { RentalAccountEntry } from '../lib/useRentals'
import { useRentals } from '../lib/useRentals'

function PhotoPlaceholder({ loading }: { loading?: boolean }) {
  return (
    <div className={`flex aspect-square items-center justify-center ${loading ? 'animate-pulse' : ''}`} style={{ background: C.surface2 }}>
      <div style={{ color: C.faint }}>
        <IconCamera />
      </div>
    </div>
  )
}

// Same card language as ListingCard.tsx (homepage) and MyListings.tsx — a
// rental is still "an item in the marketplace," just one already in hand.
function RentalCard({ rental, listing }: { rental: RentalAccountEntry; listing: ListingAccountEntry['account'] | undefined }) {
  const { urls, loading: photosLoading } = usePhotoUrls(listing?.photos)
  const style = rentalStatusStyle(rental.account.status)

  return (
    <div className="flex flex-col overflow-hidden rounded-xl transition-all hover:shadow-md" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <Link to={`/rental/${rental.publicKey.toBase58()}`} className="relative block">
        {urls[0] ? (
          <div className="aspect-square overflow-hidden" style={{ background: C.surface2 }}>
            <RetryImage src={urls[0]} alt={listing?.itemName ?? 'Item'} className="h-full w-full object-cover" />
          </div>
        ) : (
          <PhotoPlaceholder loading={photosLoading} />
        )}
        {listing && (
          <span
            className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: categoryColor(listing.category), color: '#FFFFFF' }}
          >
            {categoryLabel(listing.category)}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
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

        <div className="mt-auto pt-1.5">
          <Link
            to={`/rental/${rental.publicKey.toBase58()}`}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all hover:opacity-80"
            style={{ color: C.cream, border: `1px solid ${C.border}`, background: 'transparent' }}
          >
            <IconEye />
            View rental
          </Link>
        </div>
      </div>
    </div>
  )
}

export function MyRentals() {
  const { publicKey } = useWallet()
  const { rentals, loading, error } = useRentals()

  const mine = publicKey ? rentals.filter((r) => r.account.renter.equals(publicKey)) : []
  const listingsMap = useListingsByKeys(mine.map((r) => r.account.listing))

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-3xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
        Your rentals
      </h1>
      <p className="mb-8 text-sm" style={{ color: C.faint }}>
        Items you're currently renting from others.
      </p>

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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {mine.map((r) => (
          <RentalCard key={r.publicKey.toBase58()} rental={r} listing={listingsMap.get(r.account.listing.toBase58())} />
        ))}
      </div>
    </div>
  )
}
