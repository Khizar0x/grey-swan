import { useWallet } from '@solana/wallet-adapter-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Btn, Field } from '../components/atoms'
import { PhotoManifestField } from '../components/PhotoManifestField'
import { ProfileForm } from '../components/ProfileForm'
import { useAuthContext } from '../lib/AuthContext'
import { solToLamports } from '../lib/format'
import { CATEGORIES, RARITY_TIERS, type CategoryKey, type RarityKey } from '../lib/listing'
import { listItem } from '../lib/mutations'
import { saveProfile } from '../lib/profileApi'
import { useProgram } from '../lib/program'
import { C, FONT_HEAD, INPUT_STYLE } from '../lib/theme'
import { useProfile } from '../lib/useProfile'

const DEPOSIT_CAP_RATIO = 0.45

export function ListItem() {
  const { connected, publicKey } = useWallet()
  const program = useProgram()
  const { token, signedIn, signingIn, error: authError, signIn } = useAuthContext()
  const { profile, checked, refetch } = useProfile()

  const [itemName, setItemName] = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState('')
  const [rentalPrice, setRentalPrice] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [estimatedValue, setEstimatedValue] = useState('')
  const [category, setCategory] = useState<CategoryKey | ''>('')
  const [rarityTier, setRarityTier] = useState<RarityKey>('common')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ signature: string; itemName: string } | null>(null)

  const needsEstimatedValue = rarityTier !== 'common'
  const depositCapLamports = needsEstimatedValue
    ? Math.floor(solToLamports(Number(estimatedValue) || 0) * DEPOSIT_CAP_RATIO)
    : null
  const depositExceedsCap =
    depositCapLamports !== null && solToLamports(Number(depositAmount) || 0) > depositCapLamports

  if (connected && !signedIn) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
        <h1 className="mb-2 text-2xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          Sign in to continue
        </h1>
        <p className="mb-8 text-sm leading-relaxed" style={{ color: C.muted }}>
          We need your wallet to sign a message proving you hold it, before you can list an item.
        </p>
        {authError && (
          <p className="mb-4 text-sm" style={{ color: C.rust }}>
            {authError}
          </p>
        )}
        <Btn onClick={() => void signIn()} disabled={signingIn}>
          {signingIn ? 'Waiting for signature…' : 'Sign in with wallet'}
        </Btn>
      </div>
    )
  }

  const needsEmail = connected && signedIn && checked && (!profile || !profile.email)

  if (needsEmail && publicKey && token) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 sm:px-6">
        <h1 className="mb-2 text-2xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          Add your email to list items
        </h1>
        <p className="mb-8 text-sm leading-relaxed" style={{ color: C.muted }}>
          Owners need an email on file so we can send rental notifications — confirmation deadlines, handover reminders, and deposit release updates.
        </p>
        <ProfileForm
          showNameField={!profile}
          emailRequired
          submitLabel="Continue"
          onSubmit={async (name, email) => {
            await saveProfile(publicKey.toBase58(), profile ? profile.name : name, email, token)
            refetch()
          }}
        />
      </div>
    )
  }

  if (result) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center sm:px-6">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: C.primary }}>
          <svg className="h-8 w-8" style={{ color: C.onAccent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mb-3 text-2xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          Listing created
        </h2>
        <p className="mb-2" style={{ color: C.muted }}>
          {result.itemName} is now visible to people looking to rent.
        </p>
        <p className="mb-8 font-mono text-xs" style={{ color: C.faint }}>
          {result.signature}
        </p>
        <Link to="/my-listings">
          <Btn>View your listings</Btn>
        </Link>
      </div>
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!publicKey) {
      setError('Connect a wallet first.')
      return
    }
    if (!category) {
      setError('Choose a category.')
      return
    }
    if (itemName.length > 50) {
      setError('Item name must be 50 characters or fewer.')
      return
    }
    if (description.length > 500) {
      setError('Description must be 500 characters or fewer.')
      return
    }
    if (!photos || photos.length > 200) {
      setError('A photos CID is required (200 characters or fewer).')
      return
    }
    const rentalPriceLamports = solToLamports(Number(rentalPrice))
    const depositAmountLamports = solToLamports(Number(depositAmount))
    const estimatedValueLamports = solToLamports(Number(estimatedValue) || 0)
    if (rentalPriceLamports <= 0) {
      setError('Rental price must be greater than zero.')
      return
    }
    if (depositAmountLamports <= 0) {
      setError('Deposit must be greater than zero.')
      return
    }
    if (needsEstimatedValue && estimatedValueLamports <= 0) {
      setError('Estimated value is required for Rare or Antique items.')
      return
    }
    if (needsEstimatedValue && depositExceedsCap) {
      setError("Deposit can't exceed 45% of the item's estimated value for Rare or Antique items.")
      return
    }

    setSubmitting(true)
    try {
      const { signature } = await listItem(program, publicKey, {
        itemName,
        description,
        photos,
        rentalPriceLamports,
        depositAmountLamports,
        estimatedValueLamports,
        category,
        rarityTier,
      })
      setResult({ signature, itemName })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="mb-10">
        <h1 className="mb-3 text-3xl font-bold md:text-4xl" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          Put what you own to work
        </h1>
        <p className="text-lg" style={{ color: C.muted }}>
          List something you're not using and decide when you're happy to rent it out.
        </p>
      </div>

      {!connected && (
        <div className="mb-8 rounded-xl p-4 text-sm" style={{ background: 'rgba(38,34,32,0.04)', border: `1px solid ${C.border}`, color: C.muted }}>
          Connect a wallet to create a listing.
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-[1fr_240px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <PhotoManifestField value={photos} onChange={setPhotos} />

          <Field label="Item name">
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Canon EOS Camera"
              maxLength={50}
              required
              style={INPUT_STYLE}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Rental price per week (SOL)">
              <input
                type="number"
                value={rentalPrice}
                onChange={(e) => setRentalPrice(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
                required
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="Refundable deposit (SOL)">
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
                required
                style={INPUT_STYLE}
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your item, its condition, and what's included"
              maxLength={500}
              required
              style={{ ...INPUT_STYLE, resize: 'none' }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CategoryKey)}
                required
                style={{ ...INPUT_STYLE, cursor: 'pointer', appearance: 'none', background: C.surface }}
              >
                <option value="">Select a category</option>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Rarity">
              <select
                value={rarityTier}
                onChange={(e) => setRarityTier(e.target.value as RarityKey)}
                style={{ ...INPUT_STYLE, cursor: 'pointer', appearance: 'none', background: C.surface }}
              >
                {RARITY_TIERS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {needsEstimatedValue && (
            <Field label="Estimated value (SOL)">
              <input
                type="number"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
                required
                style={INPUT_STYLE}
              />
              <p className="mt-1.5 text-xs" style={{ color: depositExceedsCap ? C.rust : C.faint }}>
                Rare and Antique items cap the deposit at 45% of estimated value
                {depositCapLamports !== null && ` (max ${(depositCapLamports / 1e9).toFixed(2)} SOL here)`}.
              </p>
            </Field>
          )}

          {error && (
            <p className="text-sm" style={{ color: C.rust }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!connected || submitting}
            className="w-full rounded-xl py-3.5 text-base font-semibold transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
            style={{ background: C.primary, color: C.onAccent }}
          >
            {submitting ? 'Creating listing…' : 'Create a listing'}
          </button>
        </form>

        <div className="flex h-fit flex-col gap-4">
          {[
            { icon: '💷', title: 'You choose the price.', body: 'Set whatever weekly rate works for you. You can adjust it any time.' },
            { icon: '🔒', title: 'You choose the deposit.', body: 'Decide on a deposit amount that gives you peace of mind.' },
            { icon: '📸', title: 'Photos protect everyone.', body: 'A few photos at handover keep the rental clear and fair for both sides.' },
          ].map((tip) => (
            <div key={tip.title} className="rounded-xl p-4" style={{ background: 'rgba(38,34,32,0.03)', border: `1px solid ${C.border}` }}>
              <div className="mb-2 text-xl">{tip.icon}</div>
              <p className="mb-1 text-sm font-semibold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
                {tip.title}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: C.faint }}>
                {tip.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
