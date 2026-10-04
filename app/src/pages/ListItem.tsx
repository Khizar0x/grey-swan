import { useWallet } from '@solana/wallet-adapter-react'
import { useEffect, useRef, useState } from 'react'
import { Field, SuccessPill } from '../components/atoms'
import { PhotoManifestField } from '../components/PhotoManifestField'
import { ProfileForm } from '../components/ProfileForm'
import { useAuthContext } from '../lib/AuthContext'
import { solToLamports } from '../lib/format'
import { saveListingArea } from '../lib/listingAreaApi'
import { CATEGORIES, RARITY_TIERS, type CategoryKey, type RarityKey } from '../lib/listing'
import { listItem } from '../lib/mutations'
import { saveProfile } from '../lib/profileApi'
import { useProgram } from '../lib/program'
import { C, FONT_HEAD, INPUT_STYLE } from '../lib/theme'
import { useProfile } from '../lib/ProfileContext'
import { useWalletModal } from '../lib/WalletModalContext'
import { withTimeout } from '../lib/withTimeout'

const DEPOSIT_CAP_RATIO = 0.45

export function ListItem() {
  const { connected, publicKey } = useWallet()
  const program = useProgram()
  const { token, signedIn, signingIn, error: authError, signIn, clearSession } = useAuthContext()
  const { profile, checked, refetch } = useProfile()
  const { open: openWalletModal } = useWalletModal()

  const [itemName, setItemName] = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState('')
  const [rentalPrice, setRentalPrice] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [estimatedValue, setEstimatedValue] = useState('')
  const [category, setCategory] = useState<CategoryKey | ''>('')
  const [rarityTier, setRarityTier] = useState<RarityKey>('common')
  // General area (city/postcode, never the exact address) — public, shown
  // to renters considering local pickup so they can judge distance without
  // seeing exactly where the owner lives. Stored off-chain against the
  // listing's own pubkey (see listingAreaApi.ts), separate from the exact
  // addresses in addressApi.ts, which only exist once a rental does.
  const [generalArea, setGeneralArea] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ signature: string; itemName: string; areaSaveFailed: boolean } | null>(null)

  // Same "carry the click forward" pattern as the rent flow (ListingDetail):
  // set once someone clicks "Create a listing" before every prerequisite
  // (connected, signed in, email on file) is met, then picked back up by
  // the effect below as each one clears.
  const [pendingList, setPendingList] = useState(false)
  const [showEmailStep, setShowEmailStep] = useState(false)
  const handleSubmitRef = useRef<(() => Promise<void>) | null>(null)

  const needsEstimatedValue = rarityTier !== 'common'
  const depositCapLamports = needsEstimatedValue
    ? Math.floor(solToLamports(Number(estimatedValue) || 0) * DEPOSIT_CAP_RATIO)
    : null
  const depositExceedsCap =
    depositCapLamports !== null && solToLamports(Number(depositAmount) || 0) > depositCapLamports

  const needsEmail = checked && (!profile || !profile.email)

  useEffect(() => {
    if (!pendingList) return
    if (!connected || signingIn) return
    if (!signedIn) {
      // There's a real gap between "wallet just connected" and "AuthContext's
      // own effect notices and calls signIn()" — during that gap connected
      // is already true but signingIn/signedIn are both still false. That's
      // not a rejection, just not started yet, so only give up once an
      // actual auth error shows up; otherwise keep waiting for the next run
      // of this effect (signingIn flipping true, then signedIn flipping
      // true, will each re-trigger it).
      if (authError) setPendingList(false)
      return
    }
    // Same race as the signedIn check above, one step later: connected and
    // signed in can both flip true before the profile fetch (`checked`) has
    // resolved, which would make `needsEmail` read false regardless of
    // whether an email is actually on file. Settling pendingList here
    // regardless would both skip the email requirement incorrectly and mean
    // this effect can never act once `checked` does resolve (its top guard
    // would block it) — so wait for it first.
    if (!checked) return
    setPendingList(false)
    if (needsEmail) setShowEmailStep(true)
    else handleSubmitRef.current?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingList, connected, signingIn, signedIn, needsEmail, checked, authError])

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
        <p className="mb-2 font-mono text-xs" style={{ color: C.faint }}>
          {result.signature}
        </p>
        {result.areaSaveFailed ? (
          <p className="mb-6 max-w-sm rounded-xl p-3 text-sm" style={{ background: 'rgba(201,162,62,0.08)', border: '1px solid rgba(201,162,62,0.25)', color: '#B5893A' }}>
            The listing is live, but we couldn't save your general area. Renters won't see a pickup distance estimate yet, but you can try again from the listing later.
          </p>
        ) : (
          <div className="mb-6" />
        )}
        <SuccessPill message="View your listings" to="/my-listings" actionLabel="View your listings" />
      </div>
    )
  }

  const handleSubmit = async () => {
    setError(null)

    if (!publicKey || !token) {
      setError('Connect a wallet first.')
      return
    }
    if (!category) {
      setError('Choose a category.')
      return
    }
    if (!generalArea.trim() || generalArea.length > 120) {
      setError("Add a general area (city or postcode) so renters considering pickup can judge distance. Not your exact address.")
      return
    }
    if (itemName.length > 50) {
      setError('Item name must be 50 characters or fewer.')
      return
    }
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
      const { signature, listing } = await withTimeout(
        listItem(program, publicKey, {
          itemName,
          description,
          photos,
          rentalPriceLamports,
          depositAmountLamports,
          estimatedValueLamports,
          category,
          rarityTier,
        }),
      )
      let areaSaveFailed = false
      try {
        await saveListingArea(listing.toBase58(), publicKey.toBase58(), generalArea.trim(), token)
      } catch {
        areaSaveFailed = true
      }
      setResult({ signature, itemName, areaSaveFailed })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }
  handleSubmitRef.current = handleSubmit

  // Single entry point for the "Create a listing" button — mirrors
  // attemptRent in ListingDetail. Each branch does the next required thing
  // right now, or hands off to the effect above for the two async wallet
  // steps, so connecting, signing in, and a first-time email all lead
  // straight back to submitting the listing without a second click.
  const attemptList = () => {
    if (!connected) {
      setPendingList(true)
      openWalletModal()
      return
    }
    if (!signedIn) {
      setPendingList(true)
      if (!signingIn) void signIn()
      return
    }
    if (needsEmail) {
      setShowEmailStep(true)
      return
    }
    void handleSubmit()
  }

  const submitButtonLabel = !connected
    ? 'Create a listing'
    : signingIn
      ? 'Waiting for signature…'
      : !signedIn
        ? authError
          ? 'Try signing in again'
          : 'Signing in…'
        : submitting
          ? 'Creating listing…'
          : 'Create a listing'

  const selectedCategoryColor = CATEGORIES.find((c) => c.key === category)?.color ?? C.border

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="mb-10">
        <span
          className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide"
          style={{ background: 'rgba(255,107,53,0.12)', color: C.primary }}
        >
          Sell on Grey Swan
        </span>
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

      <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            attemptList()
          }}
          className="flex flex-col gap-6"
        >
          <section className="rounded-2xl p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <h2 className="mb-4 text-lg font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
              Photos
            </h2>
            <PhotoManifestField value={photos} onChange={setPhotos} />
          </section>

          <section className="flex flex-col gap-5 rounded-2xl p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <h2 className="text-lg font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
              The basics
            </h2>
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

            <Field label="Description">
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your item, its condition, and what's included"
                maxLength={1200}
                required
                style={{ ...INPUT_STYLE, resize: 'none' }}
              />
            </Field>
          </section>

          <section className="flex flex-col gap-5 rounded-2xl p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <h2 className="text-lg font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
              Category &amp; condition
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: selectedCategoryColor }} />
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as CategoryKey)}
                    required
                    className="w-full"
                    style={{ ...INPUT_STYLE, cursor: 'pointer', appearance: 'none', background: C.surface, borderColor: category ? selectedCategoryColor : C.border }}
                  >
                    <option value="">Select a category</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
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
          </section>

          <section className="flex flex-col gap-5 rounded-2xl p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <h2 className="text-lg font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
              Pricing &amp; deposit
            </h2>
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
          </section>

          <section className="flex flex-col gap-5 rounded-2xl p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <h2 className="text-lg font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
              Location
            </h2>
            <Field label="General area (city or postcode)">
              <input
                type="text"
                value={generalArea}
                onChange={(e) => setGeneralArea(e.target.value)}
                placeholder="e.g. Shoreditch, London"
                maxLength={120}
                required
                style={INPUT_STYLE}
              />
              <p className="mt-1.5 text-xs" style={{ color: C.faint }}>
                Shown to renters considering local pickup, so they can judge distance. Never your exact address.
              </p>
            </Field>
          </section>

          {error && (
            <p className="text-sm" style={{ color: C.rust }}>
              {error}
            </p>
          )}
          {authError && (
            <p className="text-sm" style={{ color: C.rust }}>
              {authError}
            </p>
          )}

          {showEmailStep && publicKey && token ? (
            <div className="rounded-2xl p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <p className="mb-1 text-sm font-bold" style={{ color: C.cream }}>
                Add your email to list items
              </p>
              <p className="mb-3 text-xs leading-relaxed" style={{ color: C.faint }}>
                Owners need an email on file so we can send rental notifications: confirmation deadlines, handover reminders, and deposit release updates.
              </p>
              <ProfileForm
                showNameField={!profile}
                emailRequired
                submitLabel="Continue listing"
                onSubmit={async (name, email) => {
                  try {
                    await saveProfile(publicKey.toBase58(), profile ? profile.name : name, email, token)
                    refetch()
                    setShowEmailStep(false)
                    await handleSubmit()
                  } catch (err) {
                    // A 401 here means this token is dead server-side (expired
                    // despite passing the local check, or a session secret
                    // rotation) — clear it so sign-in is required again instead
                    // of leaving the person stuck resubmitting the same form
                    // against the same bad token forever.
                    if (err instanceof Error && (err as Error & { status?: number }).status === 401) clearSession()
                    throw err
                  }
                }}
              />
            </div>
          ) : (
            <button
              type="submit"
              disabled={submitting || signingIn}
              className="w-full rounded-2xl py-4 text-base font-bold transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
              style={{ background: C.primary, color: C.onAccent, boxShadow: '0 4px 16px rgba(255,107,53,0.32)' }}
            >
              {submitButtonLabel}
            </button>
          )}
        </form>

        <div className="flex h-fit flex-col gap-4">
          {[
            { icon: '💷', color: C.primary, title: 'You choose the price.', body: 'Set whatever weekly rate works for you. You can adjust it any time.' },
            { icon: '🔒', color: C.trust, title: 'You choose the deposit.', body: 'Decide on a deposit amount that gives you peace of mind.' },
            { icon: '📸', color: C.green, title: 'Photos protect everyone.', body: 'A few photos at handover keep the rental clear and fair for both sides.' },
          ].map((tip) => (
            <div key={tip.title} className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div
                className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-full text-base"
                style={{ background: `${tip.color}1A` }}
              >
                {tip.icon}
              </div>
              <p className="mb-1 text-sm font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
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
