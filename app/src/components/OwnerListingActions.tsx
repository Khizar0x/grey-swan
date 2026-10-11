import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { removeListing } from '../lib/mutations'
import { useProgram } from '../lib/program'
import { C } from '../lib/theme'
import { withTimeout } from '../lib/withTimeout'

// Edit and Remove for an owner's own, not-currently-rented listing. Shared by
// Your Listings and the item page so both behave the same way.
export function OwnerListingActions({ listingPubkey, onRemoved }: { listingPubkey: string; onRemoved: () => void }) {
  const { publicKey } = useWallet()
  const program = useProgram()
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRemove = async () => {
    if (!publicKey) return
    setError(null)
    setRemoving(true)
    try {
      await withTimeout(removeListing(program, new PublicKey(listingPubkey), publicKey))
      onRemoved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRemoving(false)
      setConfirming(false)
    }
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-1.5">
        <Link
          to={`/listing/${listingPubkey}/edit`}
          className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-80"
          style={{ color: C.cream, border: `1px solid ${C.border}`, background: 'transparent' }}
        >
          Edit
        </Link>
        {confirming ? (
          <>
            <button
              onClick={handleRemove}
              disabled={removing}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: C.rust, color: C.onAccent }}
            >
              {removing ? 'Waiting for your wallet to approve…' : 'Confirm'}
            </button>
            <button onClick={() => setConfirming(false)} className="whitespace-nowrap rounded-lg px-2 py-1.5 text-xs" style={{ color: C.faint }}>
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-80"
            style={{ color: C.rust, border: '1px solid var(--gs-badge-negative-border)', background: 'transparent' }}
          >
            Remove
          </button>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs" style={{ color: C.rust }}>
          {error}
        </p>
      )}
    </div>
  )
}
