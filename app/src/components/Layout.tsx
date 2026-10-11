import { useWallet } from '@solana/wallet-adapter-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import swanLogo from '../assets/swan-logo.png'
import { IconChevronDown, IconPlane } from './icons'
import { useAuthContext } from '../lib/AuthContext'
import { CATEGORIES, isVirtualCategory } from '../lib/listing'
import { geocodeArea, reverseGeocodeArea } from '../lib/mapbox'
import { useSavedArea } from '../lib/SavedAreaContext'
import { C, FONT_HEAD } from '../lib/theme'
import { useSolBalance } from '../lib/useSolBalance'
import { useUnreadMessagesTotal } from '../lib/useUnreadMessagesTotal'
import { useWalletModal } from '../lib/WalletModalContext'

const NAV_LINKS = [
  { to: '/my-rentals', label: 'Your rentals' },
  { to: '/my-listings', label: 'Your listings' },
  { to: '/list-item', label: 'List an item' },
]

function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2">
      {/* Same h-9 w-9 footprint/position the old coral-badge + IconSwanMark
          combo used. The provided logo file has no real transparency (a
          checkered backdrop baked into the pixels, not alpha), so a solid
          color behind it would show through as a clashing square — object-
          cover + its own background fills the badge instead. */}
      <div className="h-9 w-9 overflow-hidden rounded-lg" style={{ background: C.cream }}>
        <img src={swanLogo} alt="Grey Swan" className="h-full w-full object-cover" />
      </div>
      <span className="text-xl font-bold tracking-tight" style={{ fontFamily: FONT_HEAD, color: C.navDarkText }}>
        Grey Swan
      </span>
    </Link>
  )
}

function SearchBar() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [value, setValue] = useState(searchParams.get('q') ?? '')

  useEffect(() => {
    setValue(searchParams.get('q') ?? '')
  }, [searchParams])

  const submit = () => {
    const params = new URLSearchParams(searchParams)
    if (value.trim()) params.set('q', value.trim())
    else params.delete('q')
    navigate(`/?${params.toString()}`)
  }

  return (
    <form
      className="hidden max-w-xl flex-1 items-stretch md:flex"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search cameras, tools, instruments..."
        className="w-full rounded-l-lg py-2.5 pl-4 pr-2 text-sm transition-colors focus:outline-none"
        style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRight: 'none', color: C.cream }}
      />
      <button
        type="submit"
        className="flex items-center justify-center rounded-r-lg px-4 transition-opacity hover:opacity-90"
        style={{ background: C.primary }}
        aria-label="Search"
      >
        <svg className="h-4 w-4" style={{ color: C.onAccent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>
    </form>
  )
}

// Amazon-style "Deliver to" element — positioned near the logo/search per
// the brief. Reads/writes the one shared saved-area value (SavedAreaContext)
// so a listing page's pickup-distance estimate picks up whatever's set here
// without asking the renter to type it again.
function LocationPill() {
  const { area, setArea, promptOpen, closePrompt } = useSavedArea()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(area ?? '')
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Display-only: the pill shows just the city (e.g. "London"), never the
  // full saved string — but the saved string itself (`area`, in
  // SavedAreaContext/localStorage) is untouched, since Home.tsx's and
  // ListingDetail.tsx's distance estimates re-geocode that exact string and
  // need its full precision. Re-geocoding here just to extract a shorter
  // label is a second Mapbox call, but it's cheap (fires only when `area`
  // changes, not on every render) and works the same way regardless of
  // whether `area` came from "Use my current location" or was typed by
  // hand — there's no structured Mapbox data left to reuse for a typed
  // string anyway, so both paths need this same derivation.
  const [displayCity, setDisplayCity] = useState<string | null>(null)

  useEffect(() => {
    if (!area) {
      setDisplayCity(null)
      return
    }
    let cancelled = false
    geocodeArea(area)
      .then((result) => {
        if (!cancelled) setDisplayCity(result?.city ?? null)
      })
      .catch(() => {
        if (!cancelled) setDisplayCity(null)
      })
    return () => {
      cancelled = true
    }
  }, [area])

  useEffect(() => {
    if (promptOpen) setOpen(true)
  }, [promptOpen])

  useEffect(() => {
    if (open) setDraft(area ?? '')
  }, [open, area])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        closePrompt()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, closePrompt])

  const save = () => {
    setArea(draft)
    setOpen(false)
    closePrompt()
  }

  // Pre-fills the input with a readable area name from the browser's
  // location — never saves on its own, so the renter still confirms (or
  // edits) before it takes effect, same as typing it manually.
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setDetectError("Location isn't available in this browser.")
      return
    }
    setDetecting(true)
    setDetectError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        reverseGeocodeArea(position.coords.latitude, position.coords.longitude)
          .then((place) => {
            if (place) setDraft(place)
            else setDetectError("Couldn't figure out your area. Enter it manually.")
          })
          .catch((err) => {
            setDetectError(err instanceof Error ? err.message : "Couldn't detect your location.")
          })
          .finally(() => setDetecting(false))
      },
      (err) => {
        setDetecting(false)
        // Permission denied specifically gets no message at all, per the
        // brief — manual entry is right there either way. Other failures
        // (position unavailable, timeout) still get a quiet inline note.
        if (err.code !== err.PERMISSION_DENIED) {
          setDetectError("Couldn't detect your location. Enter it manually.")
        }
      },
      { timeout: 8000 },
    )
  }

  return (
    <div ref={containerRef} className="relative hidden max-w-[240px] shrink-0 lg:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-col items-start overflow-hidden rounded-lg px-2 py-1 text-left transition-colors hover:bg-white/5"
      >
        <span className="text-[10px] leading-none" style={{ color: C.navDarkMuted }}>
          {area ? 'Delivering to' : 'Your area'}
        </span>
        <span className="flex w-full min-w-0 items-baseline gap-1 text-xs font-semibold leading-tight">
          {/* Shows just the city (displayCity) once it resolves — never the
              full saved string, which can run long (e.g. "Charing Cross,
              Westminster, London, Greater London, England, United
              Kingdom"). The saved string itself is untouched (see the
              effect above); this is display-only. truncate/min-w-0 stay as
              a second line of defense for an unresolved or unusually long
              city name. "Update location" never shrinks, since it's the
              actionable part. */}
          <span className="min-w-0 truncate" style={{ color: C.navDarkText }}>
            {displayCity ?? area ?? 'Set your area'}
          </span>
          <span className="shrink-0" style={{ color: C.navDarkMuted, textDecoration: 'underline' }}>
            · Update location
          </span>
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl p-4 shadow-lg"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
        >
          <label className="mb-1.5 block text-xs font-medium" style={{ color: C.muted }}>
            Your area or postcode
          </label>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                save()
              }
            }}
            placeholder="e.g. Shoreditch, London"
            autoFocus
            className="w-full rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none"
            style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.cream }}
          />
          <button
            type="button"
            onClick={useMyLocation}
            disabled={detecting}
            className="mt-1.5 flex items-center gap-1 text-xs font-semibold underline disabled:no-underline disabled:opacity-60"
            style={{ color: C.primary }}
          >
            {detecting ? 'Detecting…' : 'Use my current location'}
          </button>
          {detectError && (
            <p className="mt-1 text-xs" style={{ color: C.rust }}>
              {detectError}
            </p>
          )}
          <p className="mb-3 mt-1.5 text-xs" style={{ color: C.faint }}>
            Used to estimate distance on items you can collect in person. Never shared with anyone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={save}
              className="flex-1 rounded-lg py-2 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: C.primary, color: C.onAccent }}
            >
              Save
            </button>
            <button
              onClick={() => {
                setOpen(false)
                closePrompt()
              }}
              className="rounded-lg px-3 py-2 text-sm"
              style={{ color: C.faint }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function WalletCorner() {
  const { connected, publicKey, disconnect } = useWallet()
  const { signedIn, signingIn, signIn } = useAuthContext()
  const balance = useSolBalance()
  const { open } = useWalletModal()
  const navigate = useNavigate()
  const address = publicKey ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}` : ''

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // Small, corner-only, secondary-styled — a persistent affordance, not a
  // gate. Browsing never needs this; it only matters once someone rents or lists.
  if (connected && publicKey) {
    // Connecting always auto-triggers the sign-in signature as part of the
    // same motion (see AuthContext) — but if that signature gets rejected
    // or fails, this is the only place that state is visible from anywhere
    // in the app. Without this branch, the header would keep showing the
    // normal "connected" pill and the person would have no way to tell
    // they're not actually signed in, or to retry.
    if (!signedIn) {
      return (
        <button
          onClick={() => {
            if (!signingIn) void signIn()
          }}
          disabled={signingIn}
          title={signingIn ? 'Confirm the signature request in your wallet' : 'Click to finish signing in'}
          className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 transition-all disabled:opacity-70"
          style={
            signingIn
              ? { background: C.surface2, border: `1px solid ${C.border}` }
              : { background: 'rgba(184,92,66,0.22)', border: '1px solid rgba(184,92,66,0.5)' }
          }
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: signingIn ? C.faint : '#FF9478' }} />
          <span className="text-xs font-semibold" style={{ color: signingIn ? C.muted : '#FF9478' }}>
            {signingIn ? 'Confirm in wallet…' : 'Finish signing in'}
          </span>
        </button>
      )
    }

    return (
      <div ref={menuRef} className="relative shrink-0">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          title="Account menu"
          className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 transition-all"
          style={{ background: C.surface2, border: `1px solid ${C.border}` }}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.green }} />
          <span className="font-mono text-xs" style={{ color: C.muted }}>
            {address}
          </span>
          <span className="text-xs font-semibold" style={{ color: C.gold }}>
            {balance === null ? '…' : balance.toFixed(2)} SOL
          </span>
          <span style={{ color: C.faint, transform: menuOpen ? 'rotate(180deg)' : 'none' }}>
            <IconChevronDown />
          </span>
        </button>

        {menuOpen && (
          <div
            className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl py-1 shadow-lg"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            <button
              onClick={() => {
                setMenuOpen(false)
                navigate('/account')
              }}
              className="block w-full px-4 py-2.5 text-left text-sm transition-colors hover:opacity-80"
              style={{ color: C.cream }}
            >
              Account settings
            </button>
            <button
              onClick={() => {
                setMenuOpen(false)
                open()
              }}
              className="block w-full px-4 py-2.5 text-left text-sm transition-colors hover:opacity-80"
              style={{ color: C.cream }}
            >
              Switch wallet
            </button>
            <button
              onClick={() => {
                setMenuOpen(false)
                void disconnect()
              }}
              className="block w-full px-4 py-2.5 text-left text-sm transition-colors hover:opacity-80"
              style={{ color: C.rust, borderTop: `1px solid ${C.border}` }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={open}
      className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all hover:opacity-90"
      style={{ background: C.primary, color: C.onAccent }}
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="2" y="6" width="20" height="13" rx="2" strokeWidth={1.6} />
        <path d="M16 12h.01" strokeWidth={2} strokeLinecap="round" />
        <path d="M2 9h20" strokeWidth={1.6} />
      </svg>
      Connect Wallet
    </button>
  )
}

function CategoriesBar() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const activeCategory = location.pathname === '/' ? searchParams.get('category') : null

  return (
    <div style={{ background: C.navDark }}>
      <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 sm:px-6">
        <Link
          to="/"
          className="whitespace-nowrap rounded-md px-3 py-2.5 text-sm font-semibold transition-colors"
          style={{ color: !activeCategory ? C.navDarkText : C.navDarkMuted, background: !activeCategory ? C.navDarkHover : 'transparent' }}
        >
          All items
        </Link>
        {/* Digital & Cloud never appears as a department chip here — it has
            its own entry point (the Home page banner, to /digital) and its
            own newest-first view, never mixed into the physical grid. */}
        {CATEGORIES.filter((cat) => !isVirtualCategory(cat.key)).map((cat) => {
          const active = activeCategory === cat.key
          return (
            <Link
              key={cat.key}
              to={`/?category=${cat.key}`}
              className="whitespace-nowrap rounded-md px-3 py-2.5 text-sm font-semibold transition-colors"
              style={{ color: active ? cat.color : C.navDarkMuted, background: active ? C.navDarkHover : 'transparent' }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.color = '#FFFFFF'
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.color = C.navDarkMuted
              }}
            >
              {cat.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// Account-area links — deliberately plain text, not pill-shaped, so they
// never read as extra category badges. Lives in the persistent header row
// (Amazon pattern: account actions stay put; only the department list
// scrolls), not inside the scrollable CategoriesBar below, where 11
// categories would push them off-screen and out of reach.
function AccountLinks() {
  const location = useLocation()
  const unreadTotal = useUnreadMessagesTotal()
  const messagesActive = location.pathname.startsWith('/messages')
  return (
    <div className="hidden shrink-0 items-center gap-5 md:flex">
      <Link
        to="/messages"
        title="Messages"
        aria-label="Messages"
        className="relative flex items-center transition-colors hover:text-white"
        style={{ color: messagesActive ? C.navDarkText : C.navDarkMuted }}
      >
        <IconPlane />
        {unreadTotal > 0 && (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
            style={{ background: C.rust, color: C.onAccent }}
          >
            {unreadTotal > 9 ? '9+' : unreadTotal}
          </span>
        )}
      </Link>
      {NAV_LINKS.map((link) => {
        const active = location.pathname.startsWith(link.to)
        return (
          <Link
            key={link.to}
            to={link.to}
            className="whitespace-nowrap text-sm font-medium transition-colors hover:text-white"
            style={{ color: active ? C.navDarkText : C.navDarkMuted }}
          >
            {link.label}
          </Link>
        )
      })}
    </div>
  )
}

function Nav() {
  return (
    <div className="sticky top-0 z-40">
      <div style={{ background: C.headerDark, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <LocationPill />
          <SearchBar />
          <div className="ml-auto flex items-center gap-5">
            <AccountLinks />
            <WalletCorner />
          </div>
        </div>
      </div>
      <CategoriesBar />
    </div>
  )
}

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: C.bg }}>
      <Nav />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
