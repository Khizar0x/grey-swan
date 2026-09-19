import { useCallback, useEffect, useState } from 'react'
import { gatewayUrl, resolveManifest } from './ipfs'

export function usePhotoUrls(manifestCid: string | undefined) {
  const [urls, setUrls] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  // resolveManifest's own retry budget (lib/ipfs.ts) is bounded — measured
  // gateway latency runs 3-7s per request even for old, already-propagated
  // content, so a page reading several manifests at once (e.g. all four
  // handover phases) can genuinely exhaust it without ever being "wrong,"
  // just unlucky on timing. `retry` lets the caller try again without a
  // full page reload instead of the photos being silently gone for good.
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!manifestCid) {
      setUrls([])
      setError(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(false)
    resolveManifest(manifestCid)
      .then((cids) => {
        if (!cancelled) setUrls(cids.map(gatewayUrl))
      })
      .catch(() => {
        if (!cancelled) {
          setUrls([])
          setError(true)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [manifestCid, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])

  return { urls, loading, error, retry }
}
