import { useConnection } from '@solana/wallet-adapter-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ListingCard } from '../components/ListingCard'
import { enumKey, isVirtualCategory } from '../lib/listing'
import { getListingCreatedAtCached } from '../lib/listingCreatedAt'
import { C, FONT_HEAD } from '../lib/theme'
import { useListings } from '../lib/useListings'

// No distance logic applies here at all — Digital & Cloud items have no
// physical handover, so "near you" is meaningless. Sorted newest-first
// instead, via each listing's on-chain creation time (see listingCreatedAt.ts).
function useCreatedAtTimes(pubkeys: string[]) {
  const { connection } = useConnection()
  const [times, setTimes] = useState<Record<string, number | null>>({})
  const [loading, setLoading] = useState(false)
  const key = pubkeys.slice().sort().join(',')

  useEffect(() => {
    if (pubkeys.length === 0) {
      setTimes({})
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all(pubkeys.map(async (pk) => [pk, await getListingCreatedAtCached(connection, pk)] as const))
      .then((entries) => {
        if (!cancelled) setTimes(Object.fromEntries(entries))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, connection])

  return { times, loading }
}

export function DigitalCloud() {
  const { listings, loading, error } = useListings()
  const digital = useMemo(
    () => listings.filter((l) => l.account.isAvailable && isVirtualCategory(enumKey(l.account.category))),
    [listings],
  )
  const pubkeys = useMemo(() => digital.map((l) => l.publicKey.toBase58()), [digital])
  const { times, loading: timesLoading } = useCreatedAtTimes(pubkeys)

  const sorted = useMemo(
    () =>
      [...digital].sort((a, b) => {
        const ta = times[a.publicKey.toBase58()] ?? 0
        const tb = times[b.publicKey.toBase58()] ?? 0
        return tb - ta
      }),
    [digital, times],
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <Link to="/" className="mb-3 inline-block text-xs font-semibold underline" style={{ color: C.muted }}>
        ← All items
      </Link>

      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          Digital &amp; Cloud
        </h1>
        <span className="text-sm" style={{ color: C.faint }}>
          {sorted.length} available
        </span>
      </div>

      {(loading || timesLoading) && sorted.length === 0 && (
        <p className="py-12 text-center text-sm" style={{ color: C.faint }}>
          Loading listings…
        </p>
      )}

      {error && (
        <p className="py-12 text-center text-sm" style={{ color: C.rust }}>
          Couldn't load listings: {error}
        </p>
      )}

      {!loading && !error && sorted.length === 0 && (
        <p className="py-12 text-center text-sm" style={{ color: C.faint }}>
          No digital or cloud items are available right now.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4">
        {sorted.map((l) => (
          <ListingCard
            key={l.publicKey.toBase58()}
            listing={{
              publicKey: l.publicKey,
              itemName: l.account.itemName,
              owner: l.account.owner,
              category: l.account.category,
              rarityTier: l.account.rarityTier,
              rentalPrice: l.account.rentalPrice,
              depositAmount: l.account.depositAmount,
              photos: l.account.photos,
            }}
          />
        ))}
      </div>
    </div>
  )
}
