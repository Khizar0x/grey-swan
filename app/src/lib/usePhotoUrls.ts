import { useEffect, useState } from 'react'
import { gatewayUrl, resolveManifest } from './ipfs'

export function usePhotoUrls(manifestCid: string | undefined) {
  const [urls, setUrls] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!manifestCid) {
      setUrls([])
      return
    }

    let cancelled = false
    setLoading(true)
    resolveManifest(manifestCid)
      .then((cids) => {
        if (!cancelled) setUrls(cids.map(gatewayUrl))
      })
      .catch(() => {
        if (!cancelled) setUrls([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [manifestCid])

  return { urls, loading }
}
