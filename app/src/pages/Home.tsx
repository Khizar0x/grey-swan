import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ListingCard } from '../components/ListingCard'
import { useListings } from '../lib/useListings'
import { CATEGORIES, enumKey, isVirtualCategory } from '../lib/listing'
import { fetchAllListingAreas } from '../lib/listingAreaApi'
import { geocodeArea, haversineDistanceKm, type GeocodeResult } from '../lib/mapbox'
import { useSavedArea } from '../lib/SavedAreaContext'
import { C, FONT_HEAD } from '../lib/theme'

// Geocoding the same area string (many listings cluster in a few cities)
// twice per render would waste Mapbox calls for no reason — this cache
// lives for the life of the tab, shared across remounts of the page.
const areaGeocodeCache = new Map<string, Promise<GeocodeResult | null>>()
function geocodeAreaCached(area: string): Promise<GeocodeResult | null> {
  let pending = areaGeocodeCache.get(area)
  if (!pending) {
    pending = geocodeArea(area)
    areaGeocodeCache.set(area, pending)
  }
  return pending
}

// Real distance-to-renter for every listing with an owner-set general area —
// powers the automatic nearest-first sort below. `geocodeFailed` is kept
// separate from `distances` so the page can tell "renter area set but it
// didn't geocode" apart from "renter area set, geocoded fine, just no
// listings nearby" — only the former should fall back to random order.
function useListingDistances(renterArea: string | null) {
  const [distances, setDistances] = useState<Record<string, number> | null>(null)
  const [geocodeFailed, setGeocodeFailed] = useState(false)
  const [loading, setLoading] = useState(false)
  const listingAreasRef = useRef<Record<string, string> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchAllListingAreas()
      .then((areas) => {
        if (cancelled) return
        listingAreasRef.current = areas
        if (renterArea) void recompute(renterArea)
      })
      .catch(() => {
        if (!cancelled) listingAreasRef.current = {}
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function recompute(area: string) {
    const listingAreas = listingAreasRef.current
    if (!listingAreas) return
    setLoading(true)
    try {
      const renterGeo = await geocodeAreaCached(area)
      if (!renterGeo) {
        setDistances({})
        setGeocodeFailed(true)
        return
      }
      setGeocodeFailed(false)
      const entries = Object.entries(listingAreas)
      const resolved = await Promise.all(
        entries.map(async ([pubkey, listingArea]) => {
          const listingGeo = await geocodeAreaCached(listingArea)
          return listingGeo ? ([pubkey, haversineDistanceKm(renterGeo, listingGeo)] as const) : null
        }),
      )
      const next: Record<string, number> = {}
      for (const entry of resolved) {
        if (entry) next[entry[0]] = entry[1]
      }
      setDistances(next)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!renterArea) {
      setDistances(null)
      setGeocodeFailed(false)
      return
    }
    void recompute(renterArea)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renterArea])

  return { distances, loading, geocodeFailed }
}

// Fisher-Yates — used only as the no-location fallback order.
function shuffled<T>(items: T[]): T[] {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function Home() {
  const { listings, loading, error } = useListings()
  const [searchParams] = useSearchParams()
  const categoryKey = searchParams.get('category')
  const query = (searchParams.get('q') ?? '').trim().toLowerCase()
  const { area: renterArea, openPrompt: openAreaPrompt } = useSavedArea()
  const { distances, geocodeFailed } = useListingDistances(renterArea)

  const hasArea = !!renterArea
  const stillLocating = hasArea && distances === null
  const locationKnown = hasArea && distances !== null && !geocodeFailed

  // Explore rentals is for things you can actually rent right now — a
  // listing currently out on rent (is_available false on-chain, flipped by
  // rent_item and flipped back by confirm_return) has no business showing
  // up here just because .all() returns every Listing account regardless
  // of status. Digital & Cloud items live in their own view entirely (see
  // the banner below and DigitalCloud.tsx) — they never mix into this grid.
  const physical = listings.filter((l) => l.account.isAvailable && !isVirtualCategory(enumKey(l.account.category)))

  // One random order per distinct set of listings, stable across
  // re-renders and the background "settle" refetches in useListings —
  // re-shuffling on every render would make the grid visibly jump around.
  const idsKey = physical
    .map((l) => l.publicKey.toBase58())
    .sort()
    .join(',')
  const randomOrder = useMemo(() => shuffled(physical), [idsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const pool = locationKnown ? physical : randomOrder
  const byCategory = categoryKey ? pool.filter((l) => enumKey(l.account.category) === categoryKey) : pool
  const byQuery = query ? byCategory.filter((l) => l.account.itemName.toLowerCase().includes(query)) : byCategory

  const filtered = locationKnown
    ? [...byQuery].sort((a, b) => {
        const da = distances![a.publicKey.toBase58()] ?? Infinity
        const db = distances![b.publicKey.toBase58()] ?? Infinity
        return da - db
      })
    : byQuery

  const activeCategory = CATEGORIES.find((c) => c.key === categoryKey)
  const heading = query
    ? `Results for "${searchParams.get('q')}"`
    : activeCategory
      ? activeCategory.label
      : 'Everything available now'

  return (
    <div>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <Link
          to="/digital"
          className="flex items-center justify-between rounded-xl px-4 py-3 transition-opacity hover:opacity-90"
          style={{ background: C.cream, color: C.onAccent }}
        >
          <span className="text-sm font-semibold">Looking for something digital? Browse Digital &amp; Cloud items</span>
          <span aria-hidden>→</span>
        </Link>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          {!hasArea && (
            <button
              type="button"
              onClick={openAreaPrompt}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors hover:opacity-90"
              style={{ background: C.surface2, color: C.muted, border: `1px solid ${C.border}` }}
            >
              Turn on location to see what's near you first
            </button>
          )}
          {hasArea && geocodeFailed && (
            <button
              type="button"
              onClick={openAreaPrompt}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors hover:opacity-90"
              style={{ background: C.surface2, color: C.muted, border: `1px solid ${C.border}` }}
            >
              Couldn't place "{renterArea}". Update your location to see what's near you first
            </button>
          )}
          {stillLocating && !geocodeFailed && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: C.surface2, color: C.faint }}>
              Finding what's near {renterArea}…
            </span>
          )}
        </div>

        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold sm:text-2xl" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
            {heading}
          </h1>
          <span className="text-sm" style={{ color: C.faint }}>
            {filtered.length} available
          </span>
        </div>

        {loading && (
          <p className="py-12 text-center text-sm" style={{ color: C.faint }}>
            Loading listings…
          </p>
        )}

        {error && (
          <p className="py-12 text-center text-sm" style={{ color: C.rust }}>
            Couldn't load listings: {error}
          </p>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className="py-12 text-center text-sm" style={{ color: C.faint }}>
            No items match yet. Try a different category or search.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4">
          {filtered.map((l) => (
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

      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: '3rem' }}>
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:px-6 md:flex-row">
          <span className="text-sm" style={{ color: C.faint }}>
            © 2026 Grey Swan Ltd. All rights reserved.
          </span>
          <div className="flex items-center gap-6 text-sm" style={{ color: C.faint }}>
            <a href="#" className="transition-opacity hover:opacity-70">
              Terms
            </a>
            <a href="#" className="transition-opacity hover:opacity-70">
              Privacy
            </a>
            <a href="#" className="transition-opacity hover:opacity-70">
              Need help?
            </a>
            <span style={{ color: '#4a4440' }}>Built on Solana</span>
          </div>
        </div>
      </div>
    </div>
  )
}
