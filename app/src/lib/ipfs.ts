// Talks to our own pinning server (server/src/index.ts), never to Pinata
// directly — the browser must never hold the Pinata JWT. See that file's
// top comment for why.
const PIN_ENDPOINT = '/api/pin'

const GATEWAY = 'https://gateway.pinata.cloud/ipfs/'

export function gatewayUrl(cid: string): string {
  return `${GATEWAY}${cid}`
}

interface PhotoManifest {
  photos: string[]
}

export async function pinFile(blob: Blob, filename: string): Promise<string> {
  const form = new FormData()
  form.append('file', blob, filename)

  const res = await fetch(PIN_ENDPOINT, { method: 'POST', body: form })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Upload failed (${res.status}).`)
  }
  const { cid } = (await res.json()) as { cid: string }
  return cid
}

// Wraps a set of already-pinned photo CIDs in a manifest and pins that too
// — CLAUDE.md's contract is that on-chain `photos` fields hold one CID
// pointing at a JSON manifest, not a list of URLs. Split out from
// pinPhotos() so removing or adding one photo (PhotoManifestField) can
// rebuild the manifest from the CIDs it already has without re-uploading
// files that haven't changed.
export async function pinManifest(photoCids: string[]): Promise<string> {
  const manifest: PhotoManifest = { photos: photoCids }
  const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' })
  return pinFile(manifestBlob, 'manifest.json')
}

// Uploads each photo individually, then pins the manifest referencing them.
// Returns the manifest's CID, which is what goes into the Anchor
// instruction argument.
export async function pinPhotos(files: File[]): Promise<string> {
  if (files.length === 0) throw new Error('Select at least one photo.')
  const photoCids = await Promise.all(files.map((file) => pinFile(file, file.name)))
  return pinManifest(photoCids)
}

// A freshly-pinned CID can take a few seconds to become resolvable through
// a public gateway — it's not always available the instant Pinata's upload
// API returns. Without a retry, a listing page viewed moments after
// creation would fetch once, fail, and permanently show the placeholder
// even though the exact same request would succeed a few seconds later.
async function fetchWithRetry(url: string, attempts = 5, delayMs = 1500): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
      lastError = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastError = err
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throw lastError instanceof Error ? lastError : new Error('Could not load photos.')
}

export async function resolveManifest(cid: string): Promise<string[]> {
  const res = await fetchWithRetry(gatewayUrl(cid))
  const manifest = (await res.json()) as PhotoManifest
  return manifest.photos
}
