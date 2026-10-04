import { AddressAutofill } from '@mapbox/search-js-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SuccessPill } from '../components/atoms'
import { ProfileForm } from '../components/ProfileForm'
import { RetryImage } from '../components/RetryImage'
import { fetchLatestRenterAddress, saveAddress } from '../lib/addressApi'
import { useAuthContext } from '../lib/AuthContext'
import { type DeliveryMethod, saveDeliveryMethod } from '../lib/deliveryApi'
import { formatSol } from '../lib/format'
import { fetchListingArea } from '../lib/listingAreaApi'
import { categoryLabel, rarityLabel, enumKey, isVirtualCategory } from '../lib/listing'
import { geocodeAddress, geocodeArea, haversineDistanceKm, MAPBOX_TOKEN } from '../lib/mapbox'
import { rentItem } from '../lib/mutations'
import { useProfile } from '../lib/ProfileContext'
import { useProgram } from '../lib/program'
import { saveProfile } from '../lib/profileApi'
import { useSavedArea } from '../lib/SavedAreaContext'
import type { ListingAccountEntry } from '../lib/useListings'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import { C, FONT_HEAD, INPUT_STYLE } from '../lib/theme'
import { useWalletModal } from '../lib/WalletModalContext'
import { withTimeout } from '../lib/withTimeout'

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
  const [showProfileStep, setShowProfileStep] = useState(false)
  const handleRentRef = useRef<(() => Promise<void>) | null>(null)

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
  useEffect(() => {
    if (deliveryMethod !== 'ship' || !publicKey || !token) return
    if (street || city || postcode || country) return
    let cancelled = false
    fetchLatestRenterAddress(publicKey.toBase58(), token)
      .then((saved) => {
        if (cancelled || !saved) return
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
    // over directly.
    if (!profile) setShowProfileStep(true)
    else handleRentRef.current?.()
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
              <p key={i} className="rounded-xl p-3 text-sm" style={{ background: 'rgba(201,162,62,0.08)', border: '1px solid rgba(201,162,62,0.25)', color: '#B5893A' }}>
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

  const handleRent = async () => {
    if (!publicKey || !token) return
    setError(null)

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

    setRenting(true)
    try {
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
    if (profileChecked && !profile) {
      setShowProfileStep(true)
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
            ? 'Confirming…'
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
              className={`mb-2 flex aspect-[16/9] items-center justify-center overflow-hidden rounded-2xl ${photosLoading ? 'animate-pulse' : ''} ${photoUrls[selectedPhoto] ? 'cursor-zoom-in' : ''}`}
              style={{ background: C.surface2 }}
              onClick={() => {
                if (photoUrls[selectedPhoto]) setLightboxOpen(true)
              }}
            >
              {photoUrls[selectedPhoto] ? (
                <RetryImage src={photoUrls[selectedPhoto]} alt={`${listing.itemName}, photo ${selectedPhoto + 1}`} className="h-full w-full object-cover" />
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
                    <RetryImage src={url} alt={`${listing.itemName}, photo ${i + 1}`} className="h-full w-full object-cover" />
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
              <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: 'rgba(255,107,53,0.14)', color: C.gold, border: '1px solid rgba(255,107,53,0.35)' }}>
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

            {isVirtual ? (
              <div className="mb-5 rounded-xl p-3.5 text-sm" style={{ background: 'rgba(38,34,32,0.03)', border: `1px solid ${C.border}`, color: C.muted }}>
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
                          ? { background: 'rgba(255,107,53,0.12)', border: `1px solid ${C.primary}`, color: C.primary }
                          : { background: 'rgba(38,34,32,0.04)', border: `1px solid ${C.border}`, color: C.muted }
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
                          ? { background: 'rgba(255,107,53,0.12)', border: `1px solid ${C.primary}`, color: C.primary }
                          : { background: 'rgba(38,34,32,0.04)', border: `1px solid ${C.border}`, color: C.muted }
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
                      <div className="rounded-xl p-3 text-sm" style={{ background: 'rgba(38,34,32,0.03)', border: `1px solid ${C.border}` }}>
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
                  {formatSol(listing.rentalPrice)} × {weeks} week{weeks === 1 ? '' : 's'}
                </span>
                <span style={{ color: C.muted }}>{formatSol(rentalCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: C.muted }}>Refundable deposit</span>
                <span style={{ color: C.muted }}>{formatSol(listing.depositAmount)}</span>
              </div>
              <div className="mt-1 flex justify-between pt-2.5 font-bold" style={{ borderTop: `1px solid ${C.border}` }}>
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

            {showProfileStep && publicKey && token ? (
              <div className="mb-3 rounded-xl p-4" style={{ background: 'rgba(38,34,32,0.03)', border: `1px solid ${C.border}` }}>
                <p className="mb-3 text-sm font-medium" style={{ color: C.cream }}>
                  Tell the owner who's renting
                </p>
                <ProfileForm
                  showNameField
                  emailRequired={false}
                  submitLabel="Confirm rental"
                  onSubmit={async (name, email) => {
                    await saveProfile(publicKey.toBase58(), name, email, token)
                    refetchProfile()
                    setShowProfileStep(false)
                    await handleRent()
                  }}
                />
              </div>
            ) : (
              <button
                onClick={attemptRent}
                disabled={renting || signingIn || validatingAddress}
                className="mb-3 w-full rounded-xl py-3.5 text-base font-semibold transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
                style={{ background: C.primary, color: C.onAccent }}
              >
                {rentButtonLabel}
              </button>
            )}

            <div className="flex items-start gap-2.5 rounded-xl p-3.5" style={{ border: '1px solid rgba(15,118,110,0.22)', background: C.trustSoft }}>
              <svg className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.trust }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <p className="text-xs leading-relaxed" style={{ color: C.trust }}>
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
        alt={`${alt}, photo ${index + 1}`}
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
