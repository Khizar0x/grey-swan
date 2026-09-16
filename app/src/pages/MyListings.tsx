import { useWallet } from '@solana/wallet-adapter-react'
import { Link } from 'react-router-dom'
import { IconCamera, IconCheck } from '../components/icons'
import { formatSol } from '../lib/format'
import { enumKey } from '../lib/listing'
import { rentalStatusLabel, rentalStatusStyle } from '../lib/rentalStatus'
import { C, FONT_HEAD } from '../lib/theme'
import { useListingsByKeys } from '../lib/useListingsByKeys'
import { useRentals } from '../lib/useRentals'

export function MyListings() {
  const { publicKey } = useWallet()
  const { rentals, loading, error } = useRentals()

  const mine = publicKey ? rentals.filter((r) => r.account.owner.equals(publicKey)) : []
  const listingsMap = useListingsByKeys(mine.map((r) => r.account.listing))

  const active = mine.filter((r) => {
    const status = enumKey(r.account.status)
    return status !== 'completed' && status !== 'refundedAuto' && status !== 'resolved'
  })
  const totalDeposit = active.reduce((sum, r) => sum + r.account.depositAmount.toNumber(), 0)

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-3xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
            Your listings
          </h1>
          <p className="text-sm" style={{ color: C.faint }}>
            Rentals in progress on items you've listed.
          </p>
        </div>
        {publicKey && (
          <div className="shrink-0 text-right">
            <p className="font-semibold" style={{ color: C.cream }}>
              {active.length} active rental{active.length === 1 ? '' : 's'}
            </p>
            <p className="text-sm" style={{ color: C.faint }}>
              {formatSol(totalDeposit)} deposit safely held
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
      {error && (
        <p className="text-sm" style={{ color: C.rust }}>
          {error}
        </p>
      )}
      {publicKey && !loading && !error && mine.length === 0 && (
        <p className="text-sm" style={{ color: C.faint }}>
          No one has rented your items yet.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {mine.map((r) => {
          const listing = listingsMap.get(r.account.listing.toBase58())
          const style = rentalStatusStyle(r.account.status)
          const statusKey = enumKey(r.account.status)
          return (
            <div key={r.publicKey.toBase58()} className="overflow-hidden rounded-2xl" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="flex flex-col gap-5 p-5 sm:flex-row">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
                      {listing?.itemName ?? 'Item'}
                    </h3>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" style={style}>
                      {rentalStatusLabel(r.account.status)}
                    </span>
                  </div>
                  <p className="mb-1 text-sm" style={{ color: C.muted }}>
                    Rented by{' '}
                    <span style={{ color: C.cream }}>
                      {r.account.renter.toBase58().slice(0, 4)}...{r.account.renter.toBase58().slice(-4)}
                    </span>
                  </p>
                  <p className="text-xs" style={{ color: C.faint }}>
                    {formatSol(r.account.depositAmount)} deposit safely held
                  </p>
                </div>
                <div className="flex shrink-0 gap-2 sm:flex-col">
                  <Link
                    to={`/rental/${r.publicKey.toBase58()}`}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all hover:opacity-80"
                    style={{ color: C.cream, border: `1px solid ${C.border}`, background: 'transparent' }}
                  >
                    <IconCamera />
                    Handover photos
                  </Link>
                  {statusKey === 'awaitingConfirmation' && (
                    <Link
                      to={`/rental/${r.publicKey.toBase58()}`}
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-all hover:opacity-90"
                      style={{ background: C.primary, color: C.onAccent }}
                    >
                      <IconCheck />
                      Confirm return
                    </Link>
                  )}
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
