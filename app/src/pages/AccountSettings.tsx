import { useWallet } from '@solana/wallet-adapter-react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { Btn, SectionHeading } from '../components/atoms'
import { IconCopy, IconMoon, IconPlane, IconSun } from '../components/icons'
import { ProfileForm } from '../components/ProfileForm'
import { useAuthContext } from '../lib/AuthContext'
import { fetchMyAddress, saveMyAddress } from '../lib/defaultAddressApi'
import { enumKey } from '../lib/listing'
import { useProfile } from '../lib/ProfileContext'
import { saveProfile } from '../lib/profileApi'
import { C, FONT_HEAD, INPUT_STYLE } from '../lib/theme'
import { useTheme } from '../lib/ThemeContext'
import { useListings } from '../lib/useListings'
import { useRentals } from '../lib/useRentals'
import { useSolBalance } from '../lib/useSolBalance'
import { useUnreadMessagesTotal } from '../lib/useUnreadMessagesTotal'

function Gate({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <p className="text-sm" style={{ color: C.muted }}>
        {message}
      </p>
    </div>
  )
}

// scroll-mt-32 keeps a section's heading clear of the sticky header (the
// nav row plus the categories bar below it) when a sidebar link scrolls to it.
function Card({ children, id, sectionRef }: { children: ReactNode; id?: string; sectionRef?: RefObject<HTMLElement | null> }) {
  return (
    <section id={id} ref={sectionRef} className="scroll-mt-32 rounded-2xl p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      {children}
    </section>
  )
}

// A rental counts toward "active" until it reaches a terminal state, same
// definition MyListings.tsx uses for its own active-rental count.
function isTerminalRentalStatus(status: Record<string, object>): boolean {
  const key = enumKey(status)
  return key === 'completed' || key === 'refundedAuto' || key === 'resolved'
}

export function AccountSettings() {
  const { publicKey } = useWallet()
  const { token, clearSession } = useAuthContext()
  const { profile, refetch: refetchProfile } = useProfile()
  const { theme, toggleTheme } = useTheme()
  const balance = useSolBalance()
  const { rentals, loading: rentalsLoading } = useRentals()
  const { listings, loading: listingsLoading } = useListings()
  const unreadMessages = useUnreadMessagesTotal()

  const [savedAddress, setSavedAddress] = useState('')
  const [addressDraft, setAddressDraft] = useState('')
  const [addressLoading, setAddressLoading] = useState(true)
  const [savingAddress, setSavingAddress] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [addressSaved, setAddressSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const profileRef = useRef<HTMLElement>(null)
  const addressRef = useRef<HTMLElement>(null)
  const walletRef = useRef<HTMLElement>(null)
  const appearanceRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!publicKey || !token) return
    let cancelled = false
    setAddressLoading(true)
    fetchMyAddress(publicKey.toBase58(), token)
      .then((a) => {
        if (cancelled) return
        setSavedAddress(a ?? '')
        setAddressDraft(a ?? '')
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAddressLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [publicKey, token])

  if (!publicKey) {
    return <Gate message="Connect a wallet to see your account settings." />
  }
  if (!token) {
    return <Gate message="Finish signing in with your wallet to see your account settings." />
  }

  const pubkeyStr = publicKey.toBase58()
  const shortPubkey = `${pubkeyStr.slice(0, 4)}...${pubkeyStr.slice(-4)}`

  const myRentals = rentals.filter((r) => r.account.renter.equals(publicKey))
  const activeRentalsCount = myRentals.filter((r) => !isTerminalRentalStatus(r.account.status)).length
  const myListingsCount = listings.filter((l) => l.account.owner.equals(publicKey)).length
  const activityReady = !rentalsLoading && !listingsLoading

  const scrollToSection = (ref: RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const navItems: { id: string; label: string; ref: RefObject<HTMLElement | null> }[] = [
    { id: 'profile', label: 'Profile', ref: profileRef },
    { id: 'address', label: 'Delivery address', ref: addressRef },
    { id: 'wallet', label: 'Wallet', ref: walletRef },
    { id: 'appearance', label: 'Appearance', ref: appearanceRef },
  ]

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pubkeyStr)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access denied/unavailable — the address is still right
      // there to select and copy by hand.
    }
  }

  const handleSaveAddress = async () => {
    setAddressError(null)
    setAddressSaved(false)
    if (!addressDraft.trim()) {
      setAddressError('Enter an address.')
      return
    }
    setSavingAddress(true)
    try {
      await saveMyAddress(pubkeyStr, addressDraft.trim(), token)
      setSavedAddress(addressDraft.trim())
      setAddressSaved(true)
    } catch (err) {
      if (err instanceof Error && (err as Error & { status?: number }).status === 401) clearSession()
      setAddressError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingAddress(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 text-3xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
        Account settings
      </h1>
      <p className="mb-8 text-sm" style={{ color: C.faint }}>
        Your profile, saved address, and how Grey Swan looks for you.
      </p>

      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <aside className="w-full shrink-0 md:w-64">
          <div className="rounded-2xl p-5 md:sticky md:top-28" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: C.primary, color: C.onAccent }}
              >
                {pubkeyStr.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-semibold" style={{ color: C.cream }}>
                  {shortPubkey}
                </p>
                <p className="text-xs" style={{ color: C.faint }}>
                  Connected wallet
                </p>
              </div>
            </div>

            {activityReady && (
              <p className="mt-3 text-xs leading-relaxed" style={{ color: C.muted }}>
                {activeRentalsCount} active rental{activeRentalsCount === 1 ? '' : 's'} · {myListingsCount} item{myListingsCount === 1 ? '' : 's'} listed
              </p>
            )}

            <nav className="mt-5 flex gap-1.5 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.ref)}
                  className="whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:opacity-80 md:w-full"
                  style={{ color: C.muted }}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="mt-4 flex gap-1.5 overflow-x-auto border-t pt-4 md:flex-col md:overflow-visible" style={{ borderColor: C.border }}>
              <Link
                to="/messages"
                title="Messages"
                aria-label="Messages"
                className="flex items-center rounded-lg px-3 py-2 transition-colors hover:opacity-80 md:w-full"
                style={{ color: C.cream }}
              >
                <span className="relative flex items-center">
                  <IconPlane />
                  {unreadMessages > 0 && (
                    <span
                      className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
                      style={{ background: C.rust, color: C.onAccent }}
                    >
                      {unreadMessages > 9 ? '9+' : unreadMessages}
                    </span>
                  )}
                </span>
              </Link>
              <Link
                to="/my-rentals"
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:opacity-80 md:w-full"
                style={{ color: C.cream }}
              >
                Your rentals
              </Link>
              <Link
                to="/my-listings"
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:opacity-80 md:w-full"
                style={{ color: C.cream }}
              >
                Your listings
              </Link>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <Card id="profile" sectionRef={profileRef}>
            <SectionHeading>Profile</SectionHeading>
            <ProfileForm
              showNameField
              emailRequired={false}
              submitLabel="Save changes"
              initialName={profile?.name ?? ''}
              initialEmail={profile?.email ?? ''}
              onSubmit={async (name, email) => {
                try {
                  await saveProfile(pubkeyStr, name, email, token)
                  refetchProfile()
                } catch (err) {
                  if (err instanceof Error && (err as Error & { status?: number }).status === 401) clearSession()
                  throw err
                }
              }}
            />
          </Card>

          <Card id="address" sectionRef={addressRef}>
            <SectionHeading>Delivery address</SectionHeading>
            <p className="mb-3 text-xs leading-relaxed" style={{ color: C.faint }}>
              Saved once here, so you don't have to retype it the next time you rent something.
            </p>
            {addressLoading ? (
              <p className="text-sm" style={{ color: C.faint }}>
                Loading…
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <textarea
                  rows={3}
                  value={addressDraft}
                  onChange={(e) => {
                    setAddressDraft(e.target.value)
                    setAddressSaved(false)
                  }}
                  maxLength={500}
                  placeholder="Street address, city, postcode"
                  style={{ ...INPUT_STYLE, resize: 'none' }}
                />
                {addressError && (
                  <p className="text-sm" style={{ color: C.rust }}>
                    {addressError}
                  </p>
                )}
                {addressSaved && !addressError && (
                  <p className="text-sm" style={{ color: C.green }}>
                    Address saved.
                  </p>
                )}
                <Btn onClick={() => void handleSaveAddress()} disabled={savingAddress || addressDraft.trim() === savedAddress.trim()}>
                  {savingAddress ? 'Saving…' : 'Save address'}
                </Btn>
              </div>
            )}
          </Card>

          <Card id="wallet" sectionRef={walletRef}>
            <SectionHeading>Wallet</SectionHeading>
            <div
              className="flex items-center justify-between gap-3 rounded-xl p-3"
              style={{ background: C.inputBg, border: `1px solid ${C.border}` }}
            >
              <span className="truncate font-mono text-sm" style={{ color: C.cream }}>
                {pubkeyStr}
              </span>
              <button
                onClick={() => void handleCopy()}
                title="Copy address"
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all hover:opacity-80"
                style={{ color: C.primary }}
              >
                <IconCopy />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-3 text-sm font-semibold" style={{ color: C.cream }}>
              {balance === null ? 'Loading balance…' : `${balance.toFixed(4)} SOL`}
            </p>
          </Card>

          <Card id="appearance" sectionRef={appearanceRef}>
            <SectionHeading>Appearance</SectionHeading>
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: C.muted }}>
                {theme === 'dark' ? 'Dark mode is on.' : 'Light mode is on.'}
              </p>
              <button
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all hover:opacity-80"
                style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.cream }}
              >
                {theme === 'dark' ? <IconSun /> : <IconMoon />}
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
