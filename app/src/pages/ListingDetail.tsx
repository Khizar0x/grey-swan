import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Btn } from '../components/atoms'
import { RetryImage } from '../components/RetryImage'
import { saveAddress } from '../lib/addressApi'
import { useAuthContext } from '../lib/AuthContext'
import { formatSol } from '../lib/format'
import { categoryLabel, rarityLabel, enumKey } from '../lib/listing'
import { rentItem } from '../lib/mutations'
import { useProgram } from '../lib/program'
import type { ListingAccountEntry } from '../lib/useListings'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import { C, FONT_HEAD, INPUT_STYLE } from '../lib/theme'
import { withTimeout } from '../lib/withTimeout'

export function ListingDetail() {
  const { pubkey } = useParams<{ pubkey: string }>()
  const navigate = useNavigate()
  const program = useProgram()
  const { connected, publicKey } = useWallet()
  const { token, signedIn, signingIn, error: authError, signIn } = useAuthContext()

  const [listing, setListing] = useState<ListingAccountEntry['account'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [weeks, setWeeks] = useState(1)
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [renting, setRenting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ signature: string; addressSaveFailed: boolean } | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => {
    if (!pubkey) return
    let cancelled = false
    setLoading(true)
    program.account.listing
      .fetch(new PublicKey(pubkey))
      .then((account) => {
        if (!cancelled) setListing(account)
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [program, pubkey])

  const { urls: photoUrls, loading: photosLoading } = usePhotoUrls(listing?.photos)

  // Reset to the first photo whenever the set of photos changes (e.g.
  // navigating from one listing's detail page straight to another's) so a
  // stale index from the previous listing can't point past the end.
  useEffect(() => {
    setSelectedPhoto(0)
  }, [listing?.photos])

  useEffect(() => {
    if (!lightboxOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false)
      else if (e.key === 'ArrowRight') setSelectedPhoto((i) => (i + 1) % photoUrls.length)
      else if (e.key === 'ArrowLeft') setSelectedPhoto((i) => (i - 1 + photoUrls.length) % photoUrls.length)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightboxOpen, photoUrls.length])

  if (loading) {
    return (
      <p className="px-4 py-24 text-center text-sm sm:px-6" style={{ color: C.faint }}>
        Loading…
      </p>
    )
  }

  if (notFound || !listing || !pubkey) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
        <p style={{ color: C.muted }}>Couldn't find that listing.</p>
        <Link to="/" className="mt-4 inline-block text-sm underline" style={{ color: C.gold }}>
          Back to browsing
        </Link>
      </div>
    )
  }

  if (result) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center sm:px-6">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: C.primary }}>
          <svg className="h-8 w-8" style={{ color: C.onAccent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mb-3 text-2xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          Rental confirmed!
        </h2>
        <p className="mb-2" style={{ color: C.muted }}>
          Your rental for the {listing.itemName} has been confirmed. You can track it in your rentals dashboard.
        </p>
        <p className="mb-2 font-mono text-xs" style={{ color: C.faint }}>
          {result.signature}
        </p>
        {result.addressSaveFailed ? (
          <p className="mb-6 max-w-sm rounded-xl p-3 text-sm" style={{ background: 'rgba(201,162,62,0.08)', border: '1px solid rgba(201,162,62,0.25)', color: '#B5893A' }}>
            The rental is confirmed, but we couldn't save your delivery address — the owner may see "not provided yet." Reach out to them directly with it in the meantime.
          </p>
        ) : (
          <div className="mb-6" />
        )}
        <Btn onClick={() => navigate('/my-rentals')}>View your rentals</Btn>
      </div>
    )
  }

  const rarity = enumKey(listing.rarityTier)
  const rentalCost = listing.rentalPrice.toNumber() * weeks
  const total = rentalCost + listing.depositAmount.toNumber()

  const handleRent = async () => {
    if (!publicKey || !token) return
    if (!deliveryAddress.trim()) {
      setError('Enter a delivery address so the owner knows where to send it.')
      return
    }
    setError(null)
    setRenting(true)
    try {
      const { signature, rental } = await withTimeout(rentItem(program, new PublicKey(pubkey), publicKey, weeks))
      // The rental now exists on-chain — save the delivery address against
      // its real pubkey so the owner can look it up before shipping. If
      // this save fails (e.g. connection drop right after the tx lands),
      // the rental is confirmed either way; we still show success rather
      // than misreporting the rent itself as failed, but the failure is
      // surfaced below rather than swallowed — a silently-lost delivery
      // address is exactly what shows up later as the owner seeing "not
      // provided yet" with no indication anything went wrong.
      let addressSaveFailed = false
      try {
        await saveAddress(rental.toBase58(), 'renter_delivery', listing.owner.toBase58(), publicKey.toBase58(), deliveryAddress.trim(), token)
      } catch {
        addressSaveFailed = true
      }
      setResult({ signature, addressSaveFailed })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRenting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link to="/" className="mb-8 flex items-center gap-2 text-sm transition-opacity hover:opacity-70" style={{ color: C.muted }}>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to listings
      </Link>

      <div className="grid gap-10 md:grid-cols-[1fr_380px]">
        <div>
          <div className="mb-6">
            <div
              className={`mb-2 flex aspect-[16/9] items-center justify-center overflow-hidden rounded-2xl ${photosLoading ? 'animate-pulse' : ''} ${photoUrls[selectedPhoto] ? 'cursor-zoom-in' : ''}`}
              style={{ background: C.surface2 }}
              onClick={() => {
                if (photoUrls[selectedPhoto]) setLightboxOpen(true)
              }}
            >
              {photoUrls[selectedPhoto] ? (
                <RetryImage src={photoUrls[selectedPhoto]} alt={`${listing.itemName} — photo ${selectedPhoto + 1}`} className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm" style={{ color: C.faint }}>
                  {photosLoading ? 'Loading photos…' : 'Photos coming soon'}
                </span>
              )}
            </div>
            {photoUrls.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {photoUrls.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setSelectedPhoto(i)}
                    className="h-16 w-24 shrink-0 overflow-hidden rounded-lg transition-opacity"
                    style={{
                      background: C.surface2,
                      outline: i === selectedPhoto ? `2px solid ${C.gold}` : 'none',
                      outlineOffset: '-2px',
                      opacity: i === selectedPhoto ? 1 : 0.7,
                    }}
                  >
                    <RetryImage src={url} alt={`${listing.itemName} — photo ${i + 1}`} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: 'rgba(38,34,32,0.05)', border: `1px solid ${C.border}`, color: C.muted }}>
              {categoryLabel(listing.category)}
            </span>
            {rarity !== 'common' && (
              <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: 'rgba(201,162,75,0.14)', color: C.gold, border: '1px solid rgba(201,162,75,0.35)' }}>
                {rarityLabel(listing.rarityTier)}
              </span>
            )}
          </div>
          <h1 className="mb-2 text-3xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
            {listing.itemName}
          </h1>
          <p className="mb-6 text-sm" style={{ color: C.muted }}>
            Listed by {listing.owner.toBase58().slice(0, 4)}...{listing.owner.toBase58().slice(-4)}
          </p>
          <div className="pt-6" style={{ borderTop: `1px solid ${C.border}` }}>
            <h3 className="mb-3 font-semibold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
              About this item
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
              {listing.description}
            </p>
          </div>
        </div>

        <div>
          <div className="sticky top-24 rounded-2xl p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="mb-5">
              <span className="text-3xl font-bold" style={{ color: C.cream }}>
                {formatSol(listing.rentalPrice)}
              </span>
              <span className="text-base" style={{ color: C.faint }}>
                /week
              </span>
            </div>

            <div className="mb-6">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
                Number of weeks (1–12)
              </label>
              <input
                type="number"
                min={1}
                max={12}
                value={weeks}
                onChange={(e) => setWeeks(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
                className="w-full rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none"
                style={{ background: 'rgba(38,34,32,0.04)', border: `1px solid ${C.border}`, color: C.cream }}
              />
            </div>

            {connected && (
              <div className="mb-5">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
                  Delivery address
                </label>
                <textarea
                  rows={3}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Where should the owner send this?"
                  maxLength={500}
                  className="w-full rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none"
                  style={{ ...INPUT_STYLE, resize: 'none' }}
                />
                <p className="mt-1 text-xs" style={{ color: C.faint }}>
                  Only visible to the owner of this item, once you've rented it.
                </p>
              </div>
            )}

            <div className="mb-5 flex flex-col gap-2.5" style={{ borderTop: `1px solid ${C.border}`, paddingTop: '1rem' }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: C.muted }}>
                  {formatSol(listing.rentalPrice)} × {weeks} week{weeks === 1 ? '' : 's'}
                </span>
                <span style={{ color: C.muted }}>{formatSol(rentalCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: C.muted }}>Refundable deposit</span>
                <span style={{ color: C.muted }}>{formatSol(listing.depositAmount)}</span>
              </div>
              <div className="mt-1 flex justify-between pt-2.5 font-semibold" style={{ borderTop: `1px solid ${C.border}` }}>
                <span style={{ color: C.cream }}>Total due now</span>
                <span style={{ color: C.cream }}>{formatSol(total)}</span>
              </div>
            </div>

            {error && (
              <p className="mb-3 text-sm" style={{ color: C.rust }}>
                {error}
              </p>
            )}
            {authError && (
              <p className="mb-3 text-sm" style={{ color: C.rust }}>
                {authError}
              </p>
            )}

            {connected && !signedIn ? (
              <button
                onClick={() => void signIn()}
                disabled={signingIn}
                className="mb-3 w-full rounded-xl py-3.5 text-base font-semibold transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
                style={{ background: C.primary, color: C.onAccent }}
              >
                {signingIn ? 'Waiting for signature…' : 'Sign in to rent'}
              </button>
            ) : (
              <button
                onClick={handleRent}
                disabled={!connected || renting}
                className="mb-3 w-full rounded-xl py-3.5 text-base font-semibold transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
                style={{ background: C.primary, color: C.onAccent }}
              >
                {!connected ? 'Connect a wallet to rent' : renting ? 'Confirming…' : 'Rent Now'}
              </button>
            )}

            <div className="flex items-start gap-2.5 rounded-xl p-3.5" style={{ border: '1px solid rgba(62,138,95,0.22)', background: 'rgba(62,138,95,0.08)' }}>
              <svg className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.green }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <p className="text-xs leading-relaxed" style={{ color: C.green }}>
                Your {formatSol(listing.depositAmount)} deposit stays safely held until the rental is completed.
              </p>
            </div>
          </div>
        </div>
      </div>

      {lightboxOpen && photoUrls[selectedPhoto] && (
        <Lightbox
          urls={photoUrls}
          index={selectedPhoto}
          alt={listing.itemName}
          onClose={() => setLightboxOpen(false)}
          onNavigate={setSelectedPhoto}
        />
      )}
    </div>
  )
}

function Lightbox({
  urls,
  index,
  alt,
  onClose,
  onNavigate,
}: {
  urls: string[]
  index: number
  alt: string
  onClose: () => void
  onNavigate: (i: number) => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.88)' }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-lg"
        style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
        aria-label="Close"
      >
        ×
      </button>

      {urls.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate((index - 1 + urls.length) % urls.length)
          }}
          className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full text-xl"
          style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
          aria-label="Previous photo"
        >
          ‹
        </button>
      )}

      <RetryImage
        src={urls[index]}
        alt={`${alt} — photo ${index + 1}`}
        className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {urls.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate((index + 1) % urls.length)
          }}
          className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full text-xl"
          style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
          aria-label="Next photo"
        >
          ›
        </button>
      )}

      {urls.length > 1 && (
        <div className="absolute bottom-4 text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
          {index + 1} / {urls.length}
        </div>
      )}
    </div>
  )
}
