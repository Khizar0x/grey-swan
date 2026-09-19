import { useState } from 'react'
import { Link } from 'react-router-dom'
import heroBg from '../assets/hero.jpeg'
import { ListingCard } from '../components/ListingCard'
import { useListings } from '../lib/useListings'
import { CATEGORIES, type CategoryKey, enumKey } from '../lib/listing'
import { C, FONT_HEAD } from '../lib/theme'

export function Home() {
  const { listings, loading, error } = useListings()
  const [activeCategory, setActiveCategory] = useState<CategoryKey | 'all'>('all')

  // Explore rentals is for things you can actually rent right now — a
  // listing currently out on rent (is_available false on-chain, flipped by
  // rent_item and flipped back by confirm_return) has no business showing
  // up here just because .all() returns every Listing account regardless
  // of status.
  const available = listings.filter((l) => l.account.isAvailable)
  const filtered =
    activeCategory === 'all' ? available : available.filter((l) => enumKey(l.account.category) === activeCategory)

  return (
    <div>
      {/* Hero — pulled up so the image sits behind the transparent nav */}
      <div
        className="relative overflow-hidden"
        style={{
          marginTop: '-64px',
          backgroundImage: `url(${heroBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 28%',
        }}
      >
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-32"
          style={{ background: 'linear-gradient(to bottom, transparent, rgba(250,247,242,0.85))' }}
        />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6" style={{ paddingTop: 'calc(64px + 6rem)', paddingBottom: '6rem' }}>
          <div className="relative max-w-2xl">
            <div
              className="pointer-events-none absolute"
              style={{
                inset: '-3rem -4rem -4rem -3rem',
                background: 'radial-gradient(ellipse at 30% 60%, rgba(8,14,24,0.52) 0%, rgba(8,14,24,0.28) 55%, transparent 80%)',
                filter: 'blur(8px)',
                zIndex: 0,
              }}
            />

            <div className="relative" style={{ zIndex: 1 }}>
              <div
                className="mb-7 inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{ border: '1px solid rgba(255,255,255,0.30)', background: 'rgba(255,255,255,0.10)', backdropFilter: 'blur(10px)' }}
              >
                <div className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: '#fff' }} />
                <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.93)' }}>
                  Available in your area
                </span>
              </div>

              <h1
                className="mb-5 text-4xl font-bold leading-tight md:text-5xl lg:text-6xl"
                style={{ fontFamily: FONT_HEAD, color: '#FFFFFF', textShadow: '0 1px 12px rgba(0,0,0,0.20)' }}
              >
                Rent what you need.
                <br />
                Earn from what you own.
              </h1>

              <p className="mb-8 max-w-xl text-lg leading-relaxed md:text-xl" style={{ color: 'rgba(255,255,255,0.76)' }}>
                Grey Swan brings people together to rent useful things simply, safely, and on clear terms.
              </p>

              <div className="mb-10 flex flex-wrap gap-3">
                <a
                  href="#listings"
                  className="rounded-xl px-6 py-3 text-base font-semibold transition-all hover:opacity-90 active:scale-95"
                  style={{ background: '#16191E', color: '#FFFFFF', boxShadow: '0 2px 14px rgba(0,0,0,0.32)' }}
                >
                  Explore rentals
                </a>
                <Link
                  to="/list-item"
                  className="rounded-xl px-6 py-3 text-base font-semibold transition-all active:scale-95"
                  style={{ color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.42)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)' }}
                >
                  List something
                </Link>
              </div>

              <div className="pt-7" style={{ borderTop: '1px solid rgba(255,255,255,0.18)' }}>
                <p className="mb-1 text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.90)' }}>
                  A better way to rent between people.
                </p>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.58)' }}>
                  Clear terms. Protected payments. More control for everyone involved.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Listings */}
      <div id="listings" className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveCategory('all')}
            className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all"
            style={
              activeCategory === 'all'
                ? { background: 'rgba(201,162,75,0.14)', color: C.gold, border: '1px solid rgba(201,162,75,0.4)' }
                : { background: 'rgba(38,34,32,0.04)', color: C.muted, border: `1px solid ${C.border}` }
            }
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all"
              style={
                activeCategory === cat.key
                  ? { background: 'rgba(201,162,75,0.14)', color: C.gold, border: '1px solid rgba(201,162,75,0.4)' }
                  : { background: 'rgba(38,34,32,0.04)', color: C.muted, border: `1px solid ${C.border}` }
              }
            >
              {cat.label}
            </button>
          ))}
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
            No items listed yet.
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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

      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: '4rem' }}>
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
