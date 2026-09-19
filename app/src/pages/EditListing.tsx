import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Btn, Field } from '../components/atoms'
import { PhotoManifestField } from '../components/PhotoManifestField'
import { lamportsToSol, solToLamports } from '../lib/format'
import { categoryLabel, rarityLabel } from '../lib/listing'
import { updateListing } from '../lib/mutations'
import { useProgram } from '../lib/program'
import { C, FONT_HEAD, INPUT_STYLE } from '../lib/theme'
import type { ListingAccountEntry } from '../lib/useListings'
import { withTimeout } from '../lib/withTimeout'

const DEPOSIT_CAP_RATIO = 0.45

export function EditListing() {
  const { pubkey } = useParams<{ pubkey: string }>()
  const program = useProgram()
  const { publicKey } = useWallet()

  const [listing, setListing] = useState<ListingAccountEntry['account'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState('')
  const [rentalPrice, setRentalPrice] = useState('')
  const [depositAmount, setDepositAmount] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!pubkey) return
    let cancelled = false
    setLoading(true)
    program.account.listing
      .fetch(new PublicKey(pubkey))
      .then((account) => {
        if (cancelled) return
        setListing(account)
        setDescription(account.description)
        setPhotos(account.photos)
        setRentalPrice(lamportsToSol(account.rentalPrice).toString())
        setDepositAmount(lamportsToSol(account.depositAmount).toString())
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
        <Link to="/my-listings" className="mt-4 inline-block text-sm underline" style={{ color: C.gold }}>
          Back to your listings
        </Link>
      </div>
    )
  }

  if (!publicKey || !publicKey.equals(listing.owner)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
        <p style={{ color: C.muted }}>Only the owner of this listing can edit it.</p>
        <Link to="/my-listings" className="mt-4 inline-block text-sm underline" style={{ color: C.gold }}>
          Back to your listings
        </Link>
      </div>
    )
  }

  const needsEstimatedValue = listing.estimatedValue.toNumber() > 0
  const depositCapLamports = needsEstimatedValue ? Math.floor(listing.estimatedValue.toNumber() * DEPOSIT_CAP_RATIO) : null
  const depositExceedsCap = depositCapLamports !== null && solToLamports(Number(depositAmount) || 0) > depositCapLamports

  if (saved) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center sm:px-6">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: C.primary }}>
          <svg className="h-8 w-8" style={{ color: C.onAccent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mb-3 text-2xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          Listing updated
        </h2>
        <Link to="/my-listings">
          <Btn>Back to your listings</Btn>
        </Link>
      </div>
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (description.length > 1200) {
      setError('Description must be 1200 characters or fewer.')
      return
    }
    if (!photos || photos.length > 200) {
      setError('A photos CID is required (200 characters or fewer).')
      return
    }
    const rentalPriceLamports = solToLamports(Number(rentalPrice))
    const depositAmountLamports = solToLamports(Number(depositAmount))
    if (rentalPriceLamports <= 0) {
      setError('Rental price must be greater than zero.')
      return
    }
    if (depositAmountLamports <= 0) {
      setError('Deposit must be greater than zero.')
      return
    }
    if (needsEstimatedValue && depositExceedsCap) {
      setError("Deposit can't exceed 45% of the item's estimated value for Rare or Antique items.")
      return
    }

    setSubmitting(true)
    try {
      await withTimeout(
        updateListing(program, new PublicKey(pubkey), publicKey, {
          description,
          photos,
          rentalPriceLamports,
          depositAmountLamports,
        }),
      )
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Link to="/my-listings" className="mb-8 flex items-center gap-2 text-sm transition-opacity hover:opacity-70" style={{ color: C.muted }}>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to your listings
      </Link>

      <div className="mb-10">
        <h1 className="mb-2 text-3xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          Edit {listing.itemName}
        </h1>
        <p className="text-sm" style={{ color: C.faint }}>
          {categoryLabel(listing.category)} · {rarityLabel(listing.rarityTier)} — name, category, and rarity can't be changed after listing.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <PhotoManifestField value={photos} onChange={setPhotos} />

        <div className="grid grid-cols-2 gap-4">
          <Field label="Rental price per week (SOL)">
            <input type="number" value={rentalPrice} onChange={(e) => setRentalPrice(e.target.value)} min="0" step="0.01" required style={INPUT_STYLE} />
          </Field>
          <Field label="Refundable deposit (SOL)">
            <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} min="0" step="0.01" required style={INPUT_STYLE} />
            {needsEstimatedValue && (
              <p className="mt-1.5 text-xs" style={{ color: depositExceedsCap ? C.rust : C.faint }}>
                Capped at 45% of estimated value ({depositCapLamports !== null ? (depositCapLamports / 1e9).toFixed(2) : '0'} SOL max).
              </p>
            )}
          </Field>
        </div>

        <Field label="Description">
          <textarea
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1200}
            required
            style={{ ...INPUT_STYLE, resize: 'none' }}
          />
        </Field>

        {error && (
          <p className="text-sm" style={{ color: C.rust }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl py-3.5 text-base font-semibold transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
          style={{ background: C.primary, color: C.onAccent }}
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}
