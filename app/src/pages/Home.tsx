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
      {/* Digital & Cloud Hero Banner */}
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <Link
          to="/digital"
          className="group flex items-center justify-between rounded-xl px-5 py-3.5 shadow-sm transition-all hover:opacity-95"
          style={{ background: C.cream, color: C.onAccent }}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg text-sm" style={{ background: C.accentSoft }}>
              ☁️
            </span>
            <span className="text-sm font-semibold">
              Looking for something digital? Browse Digital &amp; Cloud items
            </span>
          </div>
          <span className="text-sm font-bold transition-transform group-hover:translate-x-1" aria-hidden>
            →
          </span>
        </Link>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Location Filter Prompt */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {!hasArea && (
            <button
              type="button"
              onClick={openAreaPrompt}
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-all hover:opacity-90"
              style={{ background: C.surface, color: C.muted, border: `1px solid ${C.border}` }}
            >
              <span>📍</span>
              <span>Turn on location to see what's near you first</span>
            </button>
          )}
          {hasArea && geocodeFailed && (
            <button
              type="button"
              onClick={openAreaPrompt}
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-all hover:opacity-90"
              style={{ background: 'var(--gs-badge-attention-bg)', color: C.rust, border: '1px solid var(--gs-badge-attention-border)' }}
            >
              <span>📍</span>
              <span>Couldn't place "{renterArea}". Update your location to see what's near you first</span>
            </button>
          )}
          {stillLocating && !geocodeFailed && (
            <span
              className="inline-flex animate-pulse items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold"
              style={{ background: C.surface2, color: C.faint, border: `1px solid ${C.border}` }}
            >
              <span>📍</span>
              <span>Finding what's near {renterArea}…</span>
            </span>
          )}
          {locationKnown && (
            <button
              type="button"
              onClick={openAreaPrompt}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all hover:opacity-90"
              style={{ background: 'var(--gs-badge-positive-bg)', color: C.green, border: '1px solid var(--gs-badge-positive-border)' }}
            >
              <span>📍</span>
              <span>Near {renterArea}</span>
              <span className="ml-1 text-[10px] font-normal underline opacity-80">Change</span>
            </button>
          )}
        </div>

        {/* Section Heading & Counter */}
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold sm:text-2xl" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
                {heading}
              </h1>
              {(activeCategory || query) && (
                <Link
                  to="/"
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium transition-all hover:opacity-80"
                  style={{ background: C.subtleBg, color: C.muted, border: `1px solid ${C.border}` }}
                >
                  ✕ Clear
                </Link>
              )}
            </div>
            {locationKnown && (
              <p className="mt-0.5 text-xs" style={{ color: C.faint }}>
                Sorted by distance from your location
              </p>
            )}
          </div>
          <span
            className="self-start rounded-full px-2.5 py-1 text-xs font-semibold sm:self-auto"
            style={{ background: C.subtleBg, color: C.muted, border: `1px solid ${C.border}` }}
          >
            {filtered.length} {filtered.length === 1 ? 'item' : 'items'} available
          </span>
        </div>

        {/* Loading Skeleton Grid */}
        {loading && (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse overflow-hidden rounded-xl"
                style={{ background: C.surface, border: `1px solid ${C.border}` }}
              >
                <div className="aspect-square w-full" style={{ background: C.surface2 }} />
                <div className="flex flex-col gap-2 p-3">
                  <div className="h-4 w-3/4 rounded" style={{ background: C.surface2 }} />
                  <div className="h-3.5 w-1/2 rounded" style={{ background: C.surface2 }} />
                  <div className="h-3 w-2/3 rounded" style={{ background: C.surface2 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: 'var(--gs-badge-attention-bg)', border: '1px solid var(--gs-badge-attention-border)' }}
          >
            <p className="text-sm font-semibold" style={{ color: C.rust }}>
              Couldn't load items: {error}
            </p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filtered.length === 0 && (
          <div
            className="flex flex-col items-center justify-center rounded-2xl px-4 py-16 text-center"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            <div
              className="mb-3.5 flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: C.subtleBg, border: `1px solid ${C.border}`, color: C.muted }}
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="mb-1 text-base font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
              No items match yet
            </h3>
            <p className="mb-5 max-w-sm text-xs leading-relaxed" style={{ color: C.faint }}>
              Try searching with different keywords or clearing filters to see everything available.
            </p>
            {(categoryKey || query) && (
              <Link
                to="/"
                className="rounded-xl px-4 py-2 text-xs font-bold transition-all hover:opacity-90"
                style={{ background: C.primary, color: C.onAccent }}
              >
                View all items
              </Link>
            )}
          </div>
        )}

        {/* Grid of Listings */}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4">
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
        )}
      </div>

      {/* Footer with theme tokens */}
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
            <span style={{ color: C.muted }}>Built on Solana</span>
          </div>
        </div>
      </div>
    </div>
  )
}
