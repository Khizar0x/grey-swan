import { useWallet } from '@solana/wallet-adapter-react'
import { Link } from 'react-router-dom'
import { IconEye } from '../components/icons'
import { formatSol } from '../lib/format'
import { rentalStatusLabel, rentalStatusStyle } from '../lib/rentalStatus'
import { C, FONT_HEAD } from '../lib/theme'
import { useListingsByKeys } from '../lib/useListingsByKeys'
import { useRentals } from '../lib/useRentals'

export function MyRentals() {
  const { publicKey } = useWallet()
  const { rentals, loading, error } = useRentals()

  const mine = publicKey ? rentals.filter((r) => r.account.renter.equals(publicKey)) : []
  const listingsMap = useListingsByKeys(mine.map((r) => r.account.listing))

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
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

      <div className="flex flex-col gap-4">
        {mine.map((r) => {
          const listing = listingsMap.get(r.account.listing.toBase58())
          const style = rentalStatusStyle(r.account.status)
          return (
            <div key={r.publicKey.toBase58()} className="overflow-hidden rounded-2xl" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="p-5">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
                    {listing?.itemName ?? 'Item'}
                  </h3>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" style={style}>
                    {rentalStatusLabel(r.account.status)}
                  </span>
                </div>
                <p className="mb-1 text-sm" style={{ color: C.muted }}>
                  {r.account.weeks} week{r.account.weeks === 1 ? '' : 's'}
                </p>
                <p className="text-xs" style={{ color: C.faint }}>
                  {formatSol(r.account.depositAmount)} deposit safely held
                </p>
              </div>
              <div className="px-5 pb-5">
                <Link
                  to={`/rental/${r.publicKey.toBase58()}`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all hover:opacity-80"
                  style={{ color: C.cream, border: `1px solid ${C.border}`, background: 'transparent' }}
                >
                  <IconEye />
                  View rental
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
