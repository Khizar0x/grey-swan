import { useWallet } from '@solana/wallet-adapter-react'
import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuthContext } from '../lib/AuthContext'
import { saveProfile } from '../lib/profileApi'
import { C, FONT_HEAD } from '../lib/theme'
import { useProfile } from '../lib/ProfileContext'
import { useSolBalance } from '../lib/useSolBalance'
import { ConnectWalletModal } from './ConnectWalletModal'
import { ProfileModal } from './ProfileModal'

const NAV_LINKS = [
  { to: '/', label: 'Explore rentals' },
  { to: '/my-rentals', label: 'Your rentals' },
  { to: '/my-listings', label: 'Your listings' },
]

function Nav({ isHero, onConnectClick }: { isHero: boolean; onConnectClick: () => void }) {
  const location = useLocation()
  const { connected, publicKey, disconnect } = useWallet()
  const balance = useSolBalance()

  // Floating transparent over the home hero photo; warm frosted backing
  // everywhere else — matches the mockup's isHero treatment.
  const navText = isHero ? '#FFFFFF' : C.cream
  const navMuted = isHero ? 'rgba(255,255,255,0.72)' : C.muted
  const navActiveBg = isHero ? 'rgba(255,255,255,0.14)' : 'rgba(38,34,32,0.06)'
  const searchBg = isHero ? 'rgba(255,255,255,0.12)' : 'rgba(38,34,32,0.05)'
  const searchBorder = isHero ? 'rgba(255,255,255,0.28)' : C.border
  const searchColor = isHero ? '#FFFFFF' : C.cream
  const searchPlaceholder = isHero ? 'rgba(255,255,255,0.55)' : C.faint

  const address = publicKey ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}` : ''

  return (
    <nav
      className="sticky top-0 z-40 transition-all duration-200"
      style={
        isHero
          ? { background: 'transparent', borderBottom: 'none' }
          : { background: C.navBg, backdropFilter: 'blur(16px)', borderBottom: `1px solid ${C.border}` }
      }
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: C.primary }}>
            <svg className="h-4 w-4" style={{ color: C.onAccent }} fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: FONT_HEAD, color: navText }}>
            Grey Swan
          </span>
        </Link>

        <div className="hidden max-w-md flex-1 md:flex">
          <div className="relative w-full">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: searchPlaceholder }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search for cameras, tools, instruments..."
              className="w-full rounded-lg py-2 pl-9 pr-4 text-sm transition-colors focus:outline-none"
              style={{
                background: searchBg,
                border: `1px solid ${searchBorder}`,
                color: searchColor,
                backdropFilter: isHero ? 'blur(8px)' : undefined,
              }}
            />
          </div>
        </div>

        <div className="ml-2 hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = location.pathname === link.to
            return (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
                style={{ color: active ? navText : navMuted, background: active ? navActiveBg : 'transparent' }}
              >
                {link.label}
              </Link>
            )
          })}
        </div>

        <div className="ml-auto shrink-0">
          {connected && publicKey ? (
            <button
              onClick={() => void disconnect()}
              title="Disconnect"
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all"
              style={
                isHero
                  ? { background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.28)', backdropFilter: 'blur(8px)' }
                  : { background: 'rgba(38,34,32,0.05)', border: `1px solid ${C.border}` }
              }
            >
              <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: C.green }} />
              <span className="font-mono text-sm" style={{ color: isHero ? 'rgba(255,255,255,0.85)' : C.muted }}>
                {address}
              </span>
              <span className="text-sm font-semibold" style={{ color: isHero ? '#FFFFFF' : C.gold }}>
                {balance === null ? '…' : balance.toFixed(2)} SOL
              </span>
            </button>
          ) : (
            <button
              onClick={onConnectClick}
              className="rounded-xl px-4 py-2 text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
              style={
                isHero
                  ? { background: '#FFFFFF', color: '#1A1A1A', boxShadow: '0 1px 8px rgba(0,0,0,0.18)' }
                  : { background: C.primary, color: C.onAccent }
              }
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}

export function Layout() {
  const location = useLocation()
  const { publicKey } = useWallet()
  const { token, signedIn } = useAuthContext()
  const { profile, checked, refetch } = useProfile()
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [dismissedProfile, setDismissedProfile] = useState(false)
  const isHero = location.pathname === '/'

  // Reset the dismissal per connection, not permanently — switching wallets
  // (or reconnecting after disconnecting) should prompt again, matching
  // CLAUDE.md's "on first connect" wording.
  useEffect(() => {
    setDismissedProfile(false)
  }, [publicKey])

  const showProfileModal = Boolean(publicKey) && signedIn && checked && !profile && !dismissedProfile

  return (
    <div className="flex min-h-screen flex-col" style={{ background: C.bg }}>
      <Nav isHero={isHero} onConnectClick={() => setShowWalletModal(true)} />
      <main className="flex-1">
        <Outlet />
      </main>
      {showWalletModal && <ConnectWalletModal onClose={() => setShowWalletModal(false)} />}
      {showProfileModal && publicKey && token && (
        <ProfileModal
          onClose={() => setDismissedProfile(true)}
          onSubmit={async (name, email) => {
            await saveProfile(publicKey.toBase58(), name, email, token)
            refetch()
          }}
        />
      )}
    </div>
  )
}
