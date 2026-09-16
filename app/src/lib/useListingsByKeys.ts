import type { PublicKey } from '@solana/web3.js'
import { useEffect, useState } from 'react'
import { useProgram } from './program'
import type { ListingAccountEntry } from './useListings'

// Batch-fetches Listing accounts for a set of pubkeys (e.g. every listing
// referenced by "my rentals") so cards can show the item name instead of a
// bare pubkey. Keyed off a stable joined string rather than the array
// reference, since callers typically pass a freshly-mapped array each render.
export function useListingsByKeys(pubkeys: PublicKey[]) {
  const program = useProgram()
  const [map, setMap] = useState<Map<string, ListingAccountEntry['account']>>(new Map())
  const key = pubkeys.map((k) => k.toBase58()).join(',')

  useEffect(() => {
    if (pubkeys.length === 0) {
      setMap(new Map())
      return
    }
    let cancelled = false
    program.account.listing.fetchMultiple(pubkeys).then((results) => {
      if (cancelled) return
      const next = new Map<string, ListingAccountEntry['account']>()
      results.forEach((account, i) => {
        if (account) next.set(pubkeys[i].toBase58(), account)
      })
      setMap(next)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, key])

  return map
}
