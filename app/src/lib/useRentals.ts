import type { Program } from '@coral-xyz/anchor'
import { useEffect, useState } from 'react'
import type { Greyswan } from '../idl/greyswan.ts'
import { useProgram } from './program'

export type RentalAccountEntry = Awaited<ReturnType<Program<Greyswan>['account']['rental']['all']>>[number]

export function useRentals() {
  const program = useProgram()
  const [rentals, setRentals] = useState<RentalAccountEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    program.account.rental
      .all()
      .then((accounts) => {
        if (!cancelled) {
          setRentals(accounts)
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

  return { rentals, loading, error }
}
