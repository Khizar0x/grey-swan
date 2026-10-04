import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { IconCamera, IconCheck } from '../components/icons'
import { RetryImage } from '../components/RetryImage'
import { formatSol } from '../lib/format'
import { categoryColor, categoryLabel, enumKey } from '../lib/listing'
import { removeListing } from '../lib/mutations'
import { useProgram } from '../lib/program'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import { rentalStatusLabel, rentalStatusStyle, type StatusStyle } from '../lib/rentalStatus'
import { C, FONT_HEAD } from '../lib/theme'
import { useListings, type ListingAccountEntry } from '../lib/useListings'
import type { RentalAccountEntry } from '../lib/useRentals'
import { useRentals } from '../lib/useRentals'
import { withTimeout } from '../lib/withTimeout'

const AVAILABLE_STYLE: StatusStyle = { background: 'rgba(22,163,74,0.10)', color: C.green, border: '1px solid rgba(22,163,74,0.22)' }

// A rental is "in progress" for this page's purposes if it hasn't reached a
// terminal state yet — used to find the one active rental (if any) tied to
// each of the owner's listings.
function isTerminalStatus(status: Record<string, object>): boolean {
  const key = enumKey(status)
  return key === 'completed' || key === 'refundedAuto' || key === 'resolved'
}

function PhotoPlaceholder({ loading }: { loading?: boolean }) {
  return (
    <div className={`flex aspect-square items-center justify-center ${loading ? 'animate-pulse' : ''}`} style={{ background: C.surface2 }}>
      <div style={{ color: C.faint }}>
        <IconCamera />
      </div>
    </div>
  )
}

// Card style deliberately matches ListingCard.tsx (the homepage grid) —
// same photo aspect ratio, category badge, and bold price — so this reads
// as the same marketplace rather than a separate admin-y list.
function ListingCard({
  listing,
  rental,
  removing,
  confirmingRemove,
  onConfirmRemove,
  onCancelRemove,
  onRemove,
}: {
  listing: ListingAccountEntry
  rental: RentalAccountEntry | undefined
  removing: boolean
  confirmingRemove: boolean
  onConfirmRemove: () => void
  onCancelRemove: () => void
  onRemove: () => void
}) {
  const pubkeyStr = listing.publicKey.toBase58()
  const { urls, loading: photosLoading } = usePhotoUrls(listing.account.photos)
  const catColor = categoryColor(listing.account.category)
  const style = rental ? rentalStatusStyle(rental.account.status) : AVAILABLE_STYLE
  const label = rental ? rentalStatusLabel(rental.account.status) : 'Available to rent'
  const statusKey = rental ? enumKey(rental.account.status) : null

  return (
    <div className="flex flex-col overflow-hidden rounded-xl transition-all hover:shadow-md" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <Link to={`/listing/${pubkeyStr}`} className="relative block">
        {urls[0] ? (
          <div className="aspect-square overflow-hidden" style={{ background: C.surface2 }}>
            <RetryImage src={urls[0]} alt={listing.account.itemName} className="h-full w-full object-cover" />
          </div>
        ) : (
          <PhotoPlaceholder loading={photosLoading} />
        )}
        <span className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: catColor, color: '#FFFFFF' }}>
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

        <div>
          <span className="text-sm font-bold" style={{ color: C.cream }}>
            {formatSol(listing.account.rentalPrice)}
          </span>
          <span className="text-xs" style={{ color: C.faint }}>
            {' '}
            /week + {formatSol(listing.account.depositAmount)} deposit
          </span>
        </div>

        {rental && (
          <p className="text-xs" style={{ color: C.faint }}>
            Rented by {rental.account.renter.toBase58().slice(0, 4)}...{rental.account.renter.toBase58().slice(-4)}
            <br />
            <span style={{ color: C.trust, fontWeight: 600 }}>{formatSol(rental.account.depositAmount)} deposit safely held</span>
          </p>
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
            <>
              <Link
                to={`/listing/${pubkeyStr}/edit`}
                className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-80"
                style={{ color: C.cream, border: `1px solid ${C.border}`, background: 'transparent' }}
              >
                Edit
              </Link>
              {confirmingRemove ? (
                <>
                  <button
                    onClick={onRemove}
                    disabled={removing}
                    className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: C.rust, color: C.onAccent }}
                  >
                    {removing ? 'Removing…' : 'Confirm'}
                  </button>
                  <button onClick={onCancelRemove} className="whitespace-nowrap rounded-lg px-2 py-1.5 text-xs" style={{ color: C.faint }}>
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={onConfirmRemove}
                  className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-80"
                  style={{ color: C.rust, border: '1px solid rgba(184,92,66,0.35)', background: 'transparent' }}
                >
                  Remove
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function MyListings() {
  const { publicKey } = useWallet()
  const program = useProgram()
  const { listings, loading: listingsLoading, error: listingsError, refetch } = useListings()
  const { rentals, loading: rentalsLoading } = useRentals()

  const [removing, setRemoving] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const myListings = publicKey ? listings.filter((l) => l.account.owner.equals(publicKey)) : []

  const activeRentalByListing = new Map<string, RentalAccountEntry>()
  for (const r of rentals) {
    if (!isTerminalStatus(r.account.status)) {
      activeRentalByListing.set(r.account.listing.toBase58(), r)
    }
  }

  const activeCount = myListings.filter((l) => activeRentalByListing.has(l.publicKey.toBase58())).length
  const totalDepositHeld = myListings.reduce((sum, l) => {
    const rental = activeRentalByListing.get(l.publicKey.toBase58())
    return rental ? sum + rental.account.depositAmount.toNumber() : sum
  }, 0)

  const handleRemove = async (listingPubkey: string) => {
    if (!publicKey) return
    setRemoveError(null)
    setRemoving(listingPubkey)
    try {
      await withTimeout(removeListing(program, new PublicKey(listingPubkey), publicKey))
      refetch()
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : String(err))
    } finally {
      setRemoving(null)
      setConfirmingRemove(null)
    }
  }

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
      {removeError && (
        <p className="mb-4 text-sm" style={{ color: C.rust }}>
          {removeError}
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
              removing={removing === pubkeyStr}
              confirmingRemove={confirmingRemove === pubkeyStr}
              onConfirmRemove={() => setConfirmingRemove(pubkeyStr)}
              onCancelRemove={() => setConfirmingRemove(null)}
              onRemove={() => handleRemove(pubkeyStr)}
            />
          )
        })}
      </div>

      <div className="mt-8 flex items-center gap-4 rounded-2xl p-5" style={{ background: 'rgba(38,34,32,0.03)', border: `1px solid ${C.border}` }}>
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
