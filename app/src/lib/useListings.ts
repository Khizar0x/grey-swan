import type { Program } from '@coral-xyz/anchor'
import { useEffect, useState } from 'react'
import type { Greyswan } from '../idl/greyswan.ts'
import { useProgram } from './program'

export type ListingAccountEntry = Awaited<ReturnType<Program<Greyswan>['account']['listing']['all']>>[number]

export function useListings() {
  const program = useProgram()
  const [listings, setListings] = useState<ListingAccountEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    program.account.listing
      .all()
      .then((accounts) => {
        if (!cancelled) {
          setListings(accounts)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [program])

  return { listings, loading, error }
}
