import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { IconCamera, IconCheck } from '../components/icons'
import { formatSol } from '../lib/format'
import { enumKey } from '../lib/listing'
import { removeListing } from '../lib/mutations'
import { useProgram } from '../lib/program'
import { rentalStatusLabel, rentalStatusStyle, type StatusStyle } from '../lib/rentalStatus'
import { C, FONT_HEAD } from '../lib/theme'
import { useListings } from '../lib/useListings'
import type { RentalAccountEntry } from '../lib/useRentals'
import { useRentals } from '../lib/useRentals'
import { withTimeout } from '../lib/withTimeout'

const AVAILABLE_STYLE: StatusStyle = { background: 'rgba(62,138,95,0.10)', color: C.green, border: '1px solid rgba(62,138,95,0.22)' }

// A rental is "in progress" for this page's purposes if it hasn't reached a
// terminal state yet — used to find the one active rental (if any) tied to
// each of the owner's listings.
function isTerminalStatus(status: Record<string, object>): boolean {
  const key = enumKey(status)
  return key === 'completed' || key === 'refundedAuto' || key === 'resolved'
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
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
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
            <p className="font-semibold" style={{ color: C.cream }}>
              {activeCount} active rental{activeCount === 1 ? '' : 's'}
            </p>
            <p className="text-sm" style={{ color: C.faint }}>
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

      <div className="flex flex-col gap-4">
        {myListings.map((l) => {
          const pubkeyStr = l.publicKey.toBase58()
          const rental = activeRentalByListing.get(pubkeyStr)
          const style = rental ? rentalStatusStyle(rental.account.status) : AVAILABLE_STYLE
          const label = rental ? rentalStatusLabel(rental.account.status) : 'Available to rent'
          const statusKey = rental ? enumKey(rental.account.status) : null
          const isConfirmingRemove = confirmingRemove === pubkeyStr

          return (
            <div key={pubkeyStr} className="overflow-hidden rounded-2xl" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="flex flex-col gap-5 p-5 sm:flex-row">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
                      {l.account.itemName}
                    </h3>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" style={style}>
                      {label}
                    </span>
                  </div>
                  <p className="mb-1 text-sm" style={{ color: C.muted }}>
                    {formatSol(l.account.rentalPrice)}/week + {formatSol(l.account.depositAmount)} deposit
                  </p>
                  {rental && (
                    <p className="text-xs" style={{ color: C.faint }}>
                      Rented by {rental.account.renter.toBase58().slice(0, 4)}...{rental.account.renter.toBase58().slice(-4)} ·{' '}
                      {formatSol(rental.account.depositAmount)} deposit safely held
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                  {rental && (
                    <>
                      <Link
                        to={`/rental/${rental.publicKey.toBase58()}`}
                        className="flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all hover:opacity-80"
                        style={{ color: C.cream, border: `1px solid ${C.border}`, background: 'transparent' }}
                      >
                        <IconCamera />
                        Handover photos
                      </Link>
                      {statusKey === 'awaitingConfirmation' && (
                        <Link
                          to={`/rental/${rental.publicKey.toBase58()}`}
                          className="flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-all hover:opacity-90"
                          style={{ background: C.primary, color: C.onAccent }}
                        >
                          <IconCheck />
                          Confirm return
                        </Link>
                      )}
                    </>
                  )}
                  <Link
                    to={`/listing/${pubkeyStr}/edit`}
                    className="whitespace-nowrap rounded-xl px-4 py-2 text-center text-sm font-medium transition-all hover:opacity-80"
                    style={{ color: C.cream, border: `1px solid ${C.border}`, background: 'transparent' }}
                  >
                    Edit
                  </Link>
                  {!rental &&
                    (isConfirmingRemove ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRemove(pubkeyStr)}
                          disabled={removing === pubkeyStr}
                          className="whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                          style={{ background: C.rust, color: C.onAccent }}
                        >
                          {removing === pubkeyStr ? 'Removing…' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setConfirmingRemove(null)}
                          className="whitespace-nowrap rounded-xl px-3 py-2 text-sm"
                          style={{ color: C.faint }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingRemove(pubkeyStr)}
                        className="whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all hover:opacity-80"
                        style={{ color: C.rust, border: '1px solid rgba(184,92,66,0.35)', background: 'transparent' }}
                      >
                        Remove
                      </button>
                    ))}
                </div>
              </div>
            </div>
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
