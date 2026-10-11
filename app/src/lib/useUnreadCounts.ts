import { useEffect, useState } from 'react'
import { fetchUnreadCount } from './messageApi'

// One-shot fetch for a list page's badges (MyRentals/MyListings) — per spec,
// these pages fetch once on load rather than polling; only an open
// ChatPanel polls continuously.
export function useUnreadCounts(rentalPubkeys: string[], token: string | null): Map<string, number> {
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const key = rentalPubkeys.slice().sort().join(',')

  useEffect(() => {
    if (!token || rentalPubkeys.length === 0) {
      setCounts(new Map())
      return
    }
    let cancelled = false
    Promise.all(
      rentalPubkeys.map((pk) =>
        fetchUnreadCount(pk, token)
          .then((count) => [pk, count] as const)
          .catch(() => [pk, 0] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) setCounts(new Map(pairs))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, token])

  return counts
}
