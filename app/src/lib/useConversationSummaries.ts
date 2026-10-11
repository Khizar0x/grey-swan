import { useEffect, useState } from 'react'
import { fetchConversationsSummary, type ConversationSummary } from './messageApi'

const POLL_MS = 15000

// One batched fetch for every rental pubkey passed in, keyed by rental
// pubkey, only including entries that actually have a conversation.
// `poll`: false for a one-shot read (the header nav badge), true to also
// refresh on an interval well below an open conversation's own 7s poll
// (ConversationThread.tsx) — used only while the /messages inbox itself is
// mounted, not as a global background poll.
export function useConversationSummaries(rentalPubkeys: string[], token: string | null, poll = false) {
  const [summaries, setSummaries] = useState<Map<string, ConversationSummary>>(new Map())
  const [loading, setLoading] = useState(true)
  const key = rentalPubkeys.slice().sort().join(',')

  useEffect(() => {
    if (!token || rentalPubkeys.length === 0) {
      setSummaries(new Map())
      setLoading(false)
      return
    }
    let cancelled = false

    const load = () => {
      fetchConversationsSummary(rentalPubkeys, token)
        .then((map) => {
          if (!cancelled) setSummaries(new Map(Object.entries(map)))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }

    setLoading(true)
    load()
    const interval = poll ? setInterval(load, POLL_MS) : null
    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, token, poll])

  return { summaries, loading }
}
