import type { Program } from '@coral-xyz/anchor'
import { useCallback, useEffect, useState } from 'react'
import type { Greyswan } from '../idl/greyswan.ts'
import { useProgram } from './program'

export type RentalAccountEntry = Awaited<ReturnType<Program<Greyswan>['account']['rental']['all']>>[number]

// Same reasoning as useListings.ts: getProgramAccounts on a shared public
// RPC endpoint can briefly lag behind a just-confirmed write, so a rental
// created moments ago might not show up on the first fetch. These silent
// background refetches catch up without polling indefinitely.
const SETTLE_DELAYS_MS = [2000, 5000]

export function useRentals() {
  const program = useProgram()
  const [rentals, setRentals] = useState<RentalAccountEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOnce = useCallback(
    (cancelledRef: { current: boolean }) =>
      program.account.rental
        .all()
        .then((accounts) => {
          if (!cancelledRef.current) {
            setRentals(accounts)
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

  return { rentals, loading, error }
}
