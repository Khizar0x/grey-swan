import type { Program } from '@coral-xyz/anchor'
import { useCallback, useEffect, useState } from 'react'
import type { Greyswan } from '../idl/greyswan.ts'
import { useProgram } from './program'

export type ListingAccountEntry = Awaited<ReturnType<Program<Greyswan>['account']['listing']['all']>>[number]

// getProgramAccounts on a shared public RPC endpoint can briefly lag behind
// a just-confirmed write — the specific node serving this read may not
// have caught up with whichever node processed the transaction yet. A
// single fetch right after creating a listing can come back missing it,
// with nothing to ever correct it. These silent background refetches catch
// up without polling indefinitely or flickering the loading state.
const SETTLE_DELAYS_MS = [2000, 5000]

export function useListings() {
  const program = useProgram()
  const [listings, setListings] = useState<ListingAccountEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOnce = useCallback(
    (cancelledRef: { current: boolean }) =>
      program.account.listing
        .all()
        .then((accounts) => {
          if (!cancelledRef.current) {
            setListings(accounts)
            setError(null)
          }
        })
        .catch((err: unknown) => {
          if (!cancelledRef.current) setError(err instanceof Error ? err.message : String(err))
        }),
    [program],
  )

  useEffect(() => {
    const cancelledRef = { current: false }
    setLoading(true)

    void fetchOnce(cancelledRef).finally(() => {
      if (!cancelledRef.current) setLoading(false)
    })

    const timers = SETTLE_DELAYS_MS.map((delay) => setTimeout(() => void fetchOnce(cancelledRef), delay))

    return () => {
      cancelledRef.current = true
      timers.forEach(clearTimeout)
    }
  }, [fetchOnce])

  const refetch = useCallback(() => {
    void fetchOnce({ current: false })
  }, [fetchOnce])

  return { listings, loading, error, refetch }
}
