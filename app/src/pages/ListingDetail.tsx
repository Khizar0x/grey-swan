import { AddressAutofill } from '@mapbox/search-js-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SuccessPill } from '../components/atoms'
import { IconCamera } from '../components/icons'
import { Lightbox } from '../components/Lightbox'
import { OwnerListingActions } from '../components/OwnerListingActions'
import { ProfileForm, type ProfileFormHandle } from '../components/ProfileForm'
import { RetryImage } from '../components/RetryImage'
import { fetchLatestRenterAddress, saveAddress } from '../lib/addressApi'
import { useAuthContext } from '../lib/AuthContext'
import { type DeliveryMethod, saveDeliveryMethod } from '../lib/deliveryApi'
import { formatSol } from '../lib/format'
import { fetchListingArea } from '../lib/listingAreaApi'
import { categoryColor, categoryLabel, rarityLabel, enumKey, isVirtualCategory } from '../lib/listing'
import { geocodeAddress, geocodeArea, haversineDistanceKm, MAPBOX_TOKEN } from '../lib/mapbox'
import { rentItem } from '../lib/mutations'
import { useProfile } from '../lib/ProfileContext'
import { rentalStatusLabel, rentalStatusStyle } from '../lib/rentalStatus'
import { useRentals } from '../lib/useRentals'
import { useProgram } from '../lib/program'
import { saveProfile } from '../lib/profileApi'
import { useSavedArea } from '../lib/SavedAreaContext'
import type { ListingAccountEntry } from '../lib/useListings'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import { C, FONT_HEAD, INPUT_STYLE } from '../lib/theme'
import { useWalletModal } from '../lib/WalletModalContext'
import { withTimeout } from '../lib/withTimeout'

function PhotoStageFallback({ loading, failed }: { loading?: boolean; failed?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6 text-center" style={{ color: C.faint }}>
      <div className="h-8 w-8">
        <IconCamera />
      </div>
      <p className="text-sm font-medium">
        {loading ? 'Loading photos…' : failed ? "Couldn't load photo" : 'No photos uploaded yet'}
      </p>
    </div>
  )
}


export function ListingDetail() {
  const { pubkey } = useParams<{ pubkey: string }>()
  const program = useProgram()
  const { connected, publicKey } = useWallet()
  const { token, signedIn, signingIn, error: authError, signIn } = useAuthContext()
  const { profile, checked: profileChecked, refetch: refetchProfile } = useProfile()
  const { open: openWalletModal } = useWalletModal()
  const { area: renterArea, openPrompt: openAreaPrompt } = useSavedArea()

  const [listing, setListing] = useState<ListingAccountEntry['account'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [weeks, setWeeks] = useState(1)
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('ship')
  // Structured in place of one free-text field so Mapbox's Address Autofill
  // (the standard Web2-checkout pattern: autocomplete-as-you-type on the
  // street field, which fills in the rest) has somewhere to put each part.
  // Composed back into one newline-joined string for storage/display, so
  // addressApi.ts and everything that reads an address stay untouched.
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [postcode, setPostcode] = useState('')
  const [country, setCountry] = useState('')
  // Mirrors the four fields above on every render so the prefill effect's
  // fetch callback (below) can re-check what the renter has actually typed
  // by the time it resolves, instead of only the stale snapshot from when
  // the effect started — state captured in that closure never updates.
  const addressFieldsRef = useRef({ street, city, postcode, country })
  addressFieldsRef.current = { street, city, postcode, country }
  const deliveryAddressFilled = Boolean(street.trim() && city.trim() && postcode.trim() && country.trim())
  const composedDeliveryAddress = [street, city, postcode, country].map((s) => s.trim()).join('\n')
  const [validatingAddress, setValidatingAddress] = useState(false)
  // Whether the fields above were pre-filled from a past rental's saved
  // address rather than typed fresh this time — drives the "using your last
  // address" note and its "Clear" link, never submitted without the renter
  // seeing and being able to change it first (the fields are still just
  // normal editable inputs, and Rent Now still requires its own click).
  const [addressPrefilled, setAddressPrefilled] = useState(false)
  // Pickup-only distance estimate — renterArea comes from SavedAreaContext
  // (the header's "Delivering to" element), not typed in fresh per listing.
  const [listingArea, setListingArea] = useState<string | null>(null)
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [distanceError, setDistanceError] = useState<string | null>(null)
  const [distanceLoading, setDistanceLoading] = useState(false)
  const [renting, setRenting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ signature: string; warnings: string[] } | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // Set once someone clicks the single "Rent Now" button before every
  // prerequisite (wallet connected, signed in, profile on file) is met yet.
  // The effect below watches those prerequisites and carries the same
  // intent forward automatically as each one clears, instead of making
  // them click "Rent Now" again after connecting or signing.
  const [pendingRent, setPendingRent] = useState(false)
  const handleRentRef = useRef<(() => Promise<void>) | null>(null)
  // The inline name/email fields (rendered when needsProfile is true, see
  // below) aren't their own <form> — handleRent drives them via this ref
  // instead, so there's one outer submit action, not a second nested form.
  const profileFormRef = useRef<ProfileFormHandle>(null)
  const needsProfile = profileChecked && !profile
  const navigate = useNavigate()
  // The owner sees their own listing page, not the booking panel. Rentals are
  // only fetched for the owner, to show whether the item is out right now.
  const isOwner = Boolean(publicKey && listing && listing.owner.equals(publicKey))
  const { rentals } = useRentals(isOwner)

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

  // Public, non-authenticated — a listing's general area is meant to be
  // visible to anyone considering it, not gated behind a wallet connection.
  useEffect(() => {
    if (!pubkey) return
    let cancelled = false
    fetchListingArea(pubkey)
      .then((area) => {
        if (!cancelled) setListingArea(area)
      })
      .catch(() => {
        if (!cancelled) setListingArea(null)
      })
    return () => {
      cancelled = true
    }
  }, [pubkey])

  // Pickup distance, computed automatically from the saved area (header's
  // "Delivering to") and the listing's own general area — no typing
  // required on this page, per the brief. Re-runs whenever either changes
  // (e.g. someone updates their saved area while this page is open).
  useEffect(() => {
    if (deliveryMethod !== 'pickup' || !renterArea) {
      setDistanceKm(null)
      setDistanceError(null)
      return
    }
    if (!listingArea) {
      setDistanceKm(null)
      setDistanceError("The owner hasn't added a general area yet, so a distance estimate isn't available.")
      return
    }
    let cancelled = false
    setDistanceLoading(true)
    setDistanceError(null)
    setDistanceKm(null)
    Promise.all([geocodeArea(renterArea), geocodeArea(listingArea)])
      .then(([renterGeo, ownerGeo]) => {
        if (cancelled) return
        if (!renterGeo) {
          setDistanceError("We couldn't find your saved area. Try updating your location in the header.")
          return
        }
        if (!ownerGeo) {
          setDistanceError("Couldn't estimate distance right now. Try again shortly.")
          return
        }
        setDistanceKm(haversineDistanceKm(renterGeo, ownerGeo))
      })
      .catch((err) => {
        if (!cancelled) setDistanceError(err instanceof Error ? err.message : 'Could not estimate distance.')
      })
      .finally(() => {
        if (!cancelled) setDistanceLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [deliveryMethod, renterArea, listingArea])

  // Pre-fill a repeat renter's delivery address from their last rental,
  // rather than asking them to retype it every time — only when all four
  // fields are still untouched (never clobbers something they're already
  // typing), and only parsed when it's exactly the four-part shape this page
  // itself writes (`composedDeliveryAddress` below); an address saved before
  // this structured form existed won't split cleanly into four parts, so
  // it's deliberately left alone rather than guessed at.
  //
  // The empty-fields guard below only stops this effect from ever starting
  // a fetch while something's already typed — it does nothing once the
  // fetch is in flight. A renter can still start typing in the real window
  // between "effect starts the fetch" and "fetch resolves" (any normal
  // network/DB latency, even a few hundred ms, is enough), so the same
  // check is repeated against addressFieldsRef.current right before the
  // fields actually get set — reading the ref rather than the closed-over
  // street/city/postcode/country, which are frozen at whatever they were
  // when this effect started and never see later keystrokes.
  useEffect(() => {
    if (deliveryMethod !== 'ship' || !publicKey || !token) return
    if (street || city || postcode || country) return
    let cancelled = false
    fetchLatestRenterAddress(publicKey.toBase58(), token)
      .then((saved) => {
        if (cancelled || !saved) return
        const current = addressFieldsRef.current
        if (current.street || current.city || current.postcode || current.country) return
        const parts = saved.split('\n').map((s) => s.trim())
        if (parts.length !== 4 || parts.some((p) => !p)) return
        const [savedStreet, savedCity, savedPostcode, savedCountry] = parts
        setStreet(savedStreet)
        setCity(savedCity)
        setPostcode(savedPostcode)
        setCountry(savedCountry)
        setAddressPrefilled(true)
      })
      .catch(() => {
        // No saved address, or it couldn't be fetched — the fields just
        // stay blank, same as any first-time renter.
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryMethod, publicKey, token])

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

  // Carries a "Rent Now" click forward through connecting and signing in —
  // see the comment on `pendingRent` above. Declared here, unconditionally,
  // rather than after the early returns below (Rules of Hooks), even though
  // it only matters once the listing has loaded.
  useEffect(() => {
    if (!pendingRent) return
    if (!connected || signingIn) return
    if (!signedIn) {
      // There's a real gap between "wallet just connected" and "AuthContext's
      // own effect notices and calls signIn()" — during that gap connected
      // is already true but signingIn/signedIn are both still false. That's
      // not a rejection, just not started yet, so only give up once an
      // actual auth error shows up; otherwise keep waiting for the next run
      // of this effect (signingIn flipping true, then signedIn flipping
      // true, will each re-trigger it).
      if (authError) setPendingRent(false)
      return
    }
    // Same race as the signedIn check above, one step later: connected and
    // signed in can both flip true before the profile fetch (profileChecked)
    // has resolved. Settling pendingRent here regardless would mean that
    // once profileChecked does resolve, this effect's top guard blocks it
    // from ever acting on it — so wait for it before resetting.
    if (!profileChecked) return
    setPendingRent(false)
    // handleRent isn't defined until after the early returns below (it
    // needs `listing`), so it's called via this ref rather than closed
    // over directly. It checks needsProfile itself and runs the inline
    // profile fields first when that's true — no separate branch here.
    handleRentRef.current?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRent, connected, signingIn, signedIn, profileChecked, profile, authError])

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
        {result.warnings.length > 0 ? (
          <div className="mb-6 flex max-w-sm flex-col gap-2">
            {result.warnings.map((warning, i) => (
              <p key={i} className="rounded-xl p-3 text-sm" style={{ background: C.warningBg, border: `1px solid ${C.warningBorder}`, color: C.warning }}>
                {warning}
              </p>
            ))}
          </div>
        ) : (
          <div className="mb-6" />
        )}
        <SuccessPill message="View your rentals" to="/my-rentals" actionLabel="View your rentals" />
      </div>
    )
  }

  const rarity = enumKey(listing.rarityTier)
  const isVirtual = isVirtualCategory(enumKey(listing.category))
  const rentalCost = listing.rentalPrice.toNumber() * weeks
  const total = rentalCost + listing.depositAmount.toNumber()
  const activeRental = isOwner
    ? rentals.find((r) => {
        if (r.account.listing.toBase58() !== pubkey) return false
        const key = enumKey(r.account.status)
        return key !== 'completed' && key !== 'refundedAuto' && key !== 'resolved'
      })
    : undefined

  const handleRent = async () => {
    if (!publicKey || !token) return
    setError(null)

    // Covers the whole combined action (profile save, if needed, through
    // the on-chain transaction) under one renting/button-label state,
    // matching the single submit click that now triggers both.
    setRenting(true)
    try {
      if (needsProfile) {
        const savedProfile = await profileFormRef.current?.submit()
        if (!savedProfile) return
      }

      if (!isVirtual && deliveryMethod === 'ship') {
        if (!deliveryAddressFilled) {
          setError('Fill in your full delivery address so the owner knows where to send it.')
          return
        }
        setValidatingAddress(true)
        let verified: Awaited<ReturnType<typeof geocodeAddress>> = null
        try {
          verified = await geocodeAddress(composedDeliveryAddress.replace(/\n/g, ', '))
        } catch (err) {
          setValidatingAddress(false)
          setError(err instanceof Error ? err.message : 'Could not verify that address.')
          return
        }
        setValidatingAddress(false)
        if (!verified) {
          setError("We couldn't verify that address. Check it for typos or add more detail (street, city, postcode).")
          return
        }
      }

      const { signature, rental } = await withTimeout(rentItem(program, new PublicKey(pubkey), publicKey, weeks))
      // The rental now exists on-chain — save the delivery address (if
      // shipping) and the chosen delivery method against its real pubkey.
      // If either off-chain save fails (e.g. connection drop right after
      // the tx lands), the rental is confirmed either way; we still show
      // success rather than misreporting the rent itself as failed, but the
      // failure is surfaced below rather than swallowed — a silently-lost
      // delivery address is exactly what shows up later as the owner seeing
      // "not provided yet" with no indication anything went wrong.
      const warnings: string[] = []
      if (!isVirtual) {
        if (deliveryMethod === 'ship') {
          try {
            await saveAddress(rental.toBase58(), 'renter_delivery', listing.owner.toBase58(), publicKey.toBase58(), composedDeliveryAddress, token)
          } catch {
            warnings.push(
              'We couldn\'t save your delivery address. The owner may see "not provided yet." Reach out to them directly with it in the meantime.',
            )
          }
        }
        try {
          await saveDeliveryMethod(rental.toBase58(), deliveryMethod, listing.owner.toBase58(), publicKey.toBase58(), token)
        } catch {
          warnings.push("We couldn't save your delivery method choice, but the rental itself is confirmed.")
        }
      }
      setResult({ signature, warnings })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRenting(false)
    }
  }
  handleRentRef.current = handleRent

  // Single entry point for the "Rent Now" button. Each branch either does
  // the next required thing right now, or (for the two async wallet steps)
  // hands off to the effect above to pick the intent back up once that step
  // resolves — so connecting a wallet, signing in, and adding a first-time
  // profile all lead straight back to renting without a second click.
  const attemptRent = () => {
    // Checked here, before the wallet-connect/sign-in/profile chain even
    // starts, so a renter who left this blank finds out on this click
    // rather than after reconnecting and re-signing for nothing. handleRent
    // keeps its own copy of this check too, as the final guard right before
    // the actual transaction.
    if (!isVirtual && deliveryMethod === 'ship' && !deliveryAddressFilled) {
      setError('Fill in your full delivery address so the owner knows where to send it.')
      return
    }
    if (!connected) {
      setPendingRent(true)
      openWalletModal()
      return
    }
    if (!signedIn) {
      setPendingRent(true)
      if (!signingIn) void signIn()
      return
    }
    void handleRent()
  }

  const rentButtonLabel = !connected
    ? 'Rent Now'
    : signingIn
      ? 'Waiting for signature…'
      : !signedIn
        ? authError
          ? 'Try signing in again'
          : 'Signing in…'
        : validatingAddress
          ? 'Verifying address…'
          : renting
            ? 'Waiting for your wallet to approve…'
            : 'Rent Now'

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
              className={`relative mb-3 flex aspect-[16/9] items-center justify-center overflow-hidden rounded-2xl transition-all ${photosLoading ? 'animate-pulse' : ''} ${photoUrls[selectedPhoto] ? 'cursor-zoom-in' : ''}`}
              style={{ background: C.surface2, border: `1px solid ${C.border}` }}
              onClick={() => {
                if (photoUrls[selectedPhoto]) setLightboxOpen(true)
              }}
            >
              {photoUrls[selectedPhoto] ? (
                <>
                  <RetryImage
                    src={photoUrls[selectedPhoto]}
                    alt={`${listing.itemName}, photo ${selectedPhoto + 1}`}
                    className="h-full w-full object-cover"
                    fallback={<PhotoStageFallback failed />}
                  />
                  <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
                    <span
                      className="rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide shadow-sm"
                      style={{ background: categoryColor(listing.category), color: C.overlayText }}
                    >
                      {categoryLabel(listing.category)}
                    </span>
                    {rarity !== 'common' && (
                      <span
                        className="rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide shadow-sm"
                        style={{ background: C.gold, color: C.overlayText }}
                      >
                        {rarityLabel(listing.rarityTier)}
                      </span>
                    )}
                  </div>
                  <div
                    className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-sm"
                    style={{ background: C.overlayBg, color: C.overlayText }}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                    <span>Click to enlarge</span>
                  </div>
                  {photoUrls.length > 1 && (
                    <div
                      className="pointer-events-none absolute bottom-3 right-3 rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm backdrop-blur-sm"
                      style={{ background: C.overlayBg, color: C.overlayText }}
                    >
                      {selectedPhoto + 1} / {photoUrls.length}
                    </div>
                  )}
                </>
              ) : (
                <PhotoStageFallback loading={photosLoading} />
              )}
            </div>
            {photoUrls.length > 1 && (
              <div className="flex flex-wrap gap-2.5">
                {photoUrls.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setSelectedPhoto(i)}
                    className="h-16 w-24 shrink-0 overflow-hidden rounded-xl transition-all hover:opacity-100"
                    style={{
                      background: C.surface2,
                      border: i === selectedPhoto ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
                      boxShadow: i === selectedPhoto ? 'var(--gs-primary-glow)' : 'none',
                      opacity: i === selectedPhoto ? 1 : 0.7,
                    }}
                  >
                    <RetryImage
                      src={url}
                      alt={`${listing.itemName}, photo ${i + 1}`}
                      className="h-full w-full object-cover"
                      fallback={<div className="flex h-full w-full items-center justify-center text-[10px]" style={{ color: C.faint }}>Failed</div>}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          {!photoUrls[selectedPhoto] && (
            <div className="mb-4 flex items-center gap-3">
              <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: C.subtleBg, border: `1px solid ${C.border}`, color: C.muted }}>
                {categoryLabel(listing.category)}
              </span>
              {rarity !== 'common' && (
                <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: C.gold, color: C.overlayText }}>
                  {rarityLabel(listing.rarityTier)}
                </span>
              )}
            </div>
          )}
          <h1 className="mb-2 text-3xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
            {listing.itemName}
          </h1>
          <p className="mb-6 text-sm" style={{ color: C.muted }}>
            {isOwner ? 'Listed by you' : `Listed by ${listing.owner.toBase58().slice(0, 4)}...${listing.owner.toBase58().slice(-4)}`}
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
            {isOwner && (
              <h2 className="mb-4 text-lg font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
                This is your listing
              </h2>
            )}
            <div className="mb-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3.5" style={{ background: C.subtleBg, border: `1px solid ${C.border}` }}>
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.faint }}>
                  Rental fee
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold" style={{ color: C.cream }}>
                    {formatSol(listing.rentalPrice)}
                  </span>
                  <span className="text-xs" style={{ color: C.faint }}>
                    /week
                  </span>
                </div>
                <p className="mt-1 text-[11px]" style={{ color: C.muted }}>
                  Billed per week
                </p>
              </div>

              <div className="rounded-xl p-3.5" style={{ background: C.trustSoft, border: '1px solid var(--gs-badge-positive-border)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.trust }}>
                    Deposit
                  </span>
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: C.trust, color: C.overlayText }}>
                    Refundable
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold" style={{ color: C.trust }}>
                    {formatSol(listing.depositAmount)}
                  </span>
                </div>
                <p className="mt-1 text-[11px]" style={{ color: C.trust }}>
                  Returned after return
                </p>
              </div>
            </div>

            {isOwner ? (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl p-3.5 text-sm" style={{ background: C.subtleBg, border: `1px solid ${C.border}` }}>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.faint }}>
                    Status
                  </div>
                  {activeRental ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={rentalStatusStyle(activeRental.account.status)}>
                        {rentalStatusLabel(activeRental.account.status)}
                      </span>
                      <Link to={`/rental/${activeRental.publicKey.toBase58()}`} className="text-xs font-semibold underline" style={{ color: C.primary }}>
                        View this rental
                      </Link>
                    </div>
                  ) : (
                    <span className="font-semibold" style={{ color: C.green }}>
                      Available to rent
                    </span>
                  )}
                </div>
                {!activeRental && <OwnerListingActions listingPubkey={pubkey} onRemoved={() => navigate('/my-listings')} />}
                <Link to="/my-listings" className="text-sm underline" style={{ color: C.muted }}>
                  Go to your listings
                </Link>
              </div>
            ) : (
              <>
            <div className="mb-6">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
                Number of weeks (1 to 12)
              </label>
              <input
                type="number"
                min={1}
                max={12}
                value={weeks}
                onChange={(e) => setWeeks(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
                className="w-full rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none"
                style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.cream }}
              />
            </div>

            {isVirtual ? (
              <div className="mb-5 rounded-xl p-3.5 text-sm" style={{ background: C.subtleBg, border: `1px solid ${C.border}`, color: C.muted }}>
                No physical handover for this item. Nothing to ship or collect.
              </div>
            ) : (
              <>
                <div className="mb-5">
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
                    Delivery method
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('ship')}
                      className="rounded-xl px-3 py-2.5 text-sm font-semibold transition-all"
                      style={
                        deliveryMethod === 'ship'
                          ? { background: C.accentSoft, border: `1px solid ${C.primary}`, color: C.primary }
                          : { background: C.inputBg, border: `1px solid ${C.border}`, color: C.muted }
                      }
                    >
                      Ship to me
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('pickup')}
                      className="rounded-xl px-3 py-2.5 text-sm font-semibold transition-all"
                      style={
                        deliveryMethod === 'pickup'
                          ? { background: C.accentSoft, border: `1px solid ${C.primary}`, color: C.primary }
                          : { background: C.inputBg, border: `1px solid ${C.border}`, color: C.muted }
                      }
                    >
                      Collect in person
                    </button>
                  </div>
                </div>

                {deliveryMethod === 'ship' ? (
                  <div className="mb-5">
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
                      Delivery address
                    </label>
                    {addressPrefilled && (
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
                        Using your last delivery address. Edit any field, or{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setStreet('')
                            setCity('')
                            setPostcode('')
                            setCountry('')
                            setAddressPrefilled(false)
                          }}
                          className="whitespace-nowrap font-semibold underline"
                          style={{ color: C.primary }}
                        >
                          clear it
                        </button>{' '}
                        to start fresh.
                      </p>
                    )}
                    {/* AddressAutofill must be inside a <form>, and sibling
                        fields autofill off their own `autoComplete` values
                        (the WHATWG autofill spec tokens) once a street-
                        address suggestion is picked — same mechanism a
                        standard Web2 checkout billing-address form uses. */}
                    <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-2.5">
                      {MAPBOX_TOKEN ? (
                        <AddressAutofill
                          accessToken={MAPBOX_TOKEN}
                          onRetrieve={(res) => {
                            const props = res.features[0]?.properties
                            if (!props) return
                            if (props.address_line1) setStreet(props.address_line1)
                            if (props.address_level2) setCity(props.address_level2)
                            if (props.postcode) setPostcode(props.postcode)
                            if (props.country) setCountry(props.country)
                          }}
                        >
                          <input
                            type="text"
                            autoComplete="shipping address-line1"
                            value={street}
                            onChange={(e) => setStreet(e.target.value)}
                            placeholder="Street address"
                            maxLength={200}
                            className="w-full rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none"
                            style={INPUT_STYLE}
                          />
                        </AddressAutofill>
                      ) : (
                        <input
                          type="text"
                          autoComplete="shipping address-line1"
                          value={street}
                          onChange={(e) => setStreet(e.target.value)}
                          placeholder="Street address"
                          maxLength={200}
                          className="w-full rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none"
                          style={INPUT_STYLE}
                        />
                      )}
                      <div className="grid grid-cols-2 gap-2.5">
                        <input
                          type="text"
                          autoComplete="shipping address-level2"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="City"
                          maxLength={100}
                          className="w-full rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none"
                          style={INPUT_STYLE}
                        />
                        <input
                          type="text"
                          autoComplete="shipping postal-code"
                          value={postcode}
                          onChange={(e) => setPostcode(e.target.value)}
                          placeholder="Postcode"
                          maxLength={20}
                          className="w-full rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none"
                          style={INPUT_STYLE}
                        />
                      </div>
                      <input
                        type="text"
                        autoComplete="shipping country-name"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="Country"
                        maxLength={100}
                        className="w-full rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none"
                        style={INPUT_STYLE}
                      />
                    </form>
                    <p className="mt-1.5 text-xs" style={{ color: C.faint }}>
                      Only visible to the owner of this item, once you've rented it. We'll check it's a real address before you rent.
                    </p>
                  </div>
                ) : (
                  <div className="mb-5">
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
                      Pickup distance
                    </label>
                    {!renterArea ? (
                      <div className="rounded-xl p-3 text-sm" style={{ background: C.subtleBg, border: `1px solid ${C.border}` }}>
                        <p className="mb-1.5" style={{ color: C.muted }}>
                          Set your area to see roughly how far this is.
                        </p>
                        <button type="button" onClick={openAreaPrompt} className="text-xs font-semibold underline" style={{ color: C.primary }}>
                          Set your location
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs" style={{ color: C.faint }}>
                          Estimated from your saved area ({renterArea}).{' '}
                          <button type="button" onClick={openAreaPrompt} className="underline" style={{ color: C.faint }}>
                            Update location
                          </button>
                        </p>
                        {distanceLoading && (
                          <p className="mt-2 text-xs" style={{ color: C.faint }}>
                            Checking distance…
                          </p>
                        )}
                        {!distanceLoading && distanceKm !== null && (
                          <p className="mt-2 text-sm font-medium" style={{ color: C.trust }}>
                            ~{distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km from {listingArea}
                          </p>
                        )}
                        {!distanceLoading && distanceError && (
                          <p className="mt-2 text-xs" style={{ color: C.rust }}>
                            {distanceError}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="mb-5 flex flex-col gap-2.5" style={{ borderTop: `1px solid ${C.border}`, paddingTop: '1rem' }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: C.muted }}>
                  Rental fee ({weeks} week{weeks === 1 ? '' : 's'})
                </span>
                <span className="font-semibold" style={{ color: C.cream }}>{formatSol(rentalCost)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5">
                  <span style={{ color: C.muted }}>Refundable deposit</span>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: C.trustSoft, color: C.trust }}>
                    100% refundable
                  </span>
                </div>
                <span className="font-semibold" style={{ color: C.cream }}>{formatSol(listing.depositAmount)}</span>
              </div>
              <div className="mt-1 flex justify-between pt-2.5 font-bold" style={{ borderTop: `1px solid ${C.border}` }}>
                <span style={{ color: C.cream }}>Total due now</span>
                <span className="text-lg" style={{ color: C.cream }}>{formatSol(total)}</span>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: C.faint }}>
                Deposit of {formatSol(listing.depositAmount)} is returned automatically upon safe completion.
              </p>
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

            {needsProfile && publicKey && token && (
              <div className="mb-3 rounded-xl p-4" style={{ background: C.subtleBg, border: `1px solid ${C.border}` }}>
                <p className="mb-1 text-sm font-medium" style={{ color: C.cream }}>
                  Tell the owner who's renting
                </p>
                <p className="mb-3 text-xs leading-relaxed" style={{ color: C.faint }}>
                  So the owner knows who they're dealing with. Email is optional, and only used for rental updates like handover reminders.
                </p>
                <ProfileForm
                  ref={profileFormRef}
                  showNameField
                  emailRequired={false}
                  renderFormTag={false}
                  onSubmit={async (name, email) => {
                    await saveProfile(publicKey.toBase58(), name, email, token)
                    refetchProfile()
                  }}
                />
              </div>
            )}
            <button
              onClick={attemptRent}
              disabled={renting || signingIn || validatingAddress}
              className="mb-3 w-full rounded-xl py-3.5 text-base font-semibold transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
              style={{ background: C.primary, color: C.onAccent }}
            >
              {rentButtonLabel}
            </button>

            <div className="flex items-start gap-2.5 rounded-xl p-3.5" style={{ border: '1px solid var(--gs-badge-positive-border)', background: C.trustSoft }}>
              <svg className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.trust }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <p className="text-xs leading-relaxed" style={{ color: C.trust }}>
                Your {formatSol(listing.depositAmount)} deposit stays safely held until the rental is completed.
              </p>
            </div>
              </>
            )}
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
