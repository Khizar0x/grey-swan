// Talks to our own pinning server (server/src/index.ts), never to Pinata
// directly — the browser must never hold the Pinata JWT. See that file's
// top comment for why.
const PIN_ENDPOINT = '/api/pin'

const GATEWAY = 'https://gateway.pinata.cloud/ipfs/'

export function gatewayUrl(cid: string): string {
  return `${GATEWAY}${cid}`
}

// The shared public gateway answers "429" when a page asks for many files at
// once (the review page does). Our server keeps a cached copy of each file it
// has fetched, so a second attempt goes there instead. Same content, since a
// CID always names the same bytes.
export function cachedUrl(cid: string): string {
  return `/api/ipfs/${cid}`
}

// Gateway URL on the first try, the cached copy on every retry.
export function urlForAttempt(url: string, attempt: number): string {
  if (attempt > 0 && url.startsWith(GATEWAY)) return cachedUrl(url.slice(GATEWAY.length))
  return url
}

// How a handover photo got into the manifest. "captured" means it came from
// the in-app camera stream; "uploaded" is the labelled fallback used only
// when no camera could be started. Neither is cryptographic proof, it is
// what the app itself observed.
export type CaptureSource = 'captured' | 'uploaded'

export interface ManifestShot {
  shot: string
  capture: CaptureSource
}

// `photos` stays a plain list of CIDs so older readers keep working. The
// remaining fields are optional and only present on handover manifests made
// by the guided camera flow: `shots[i]` describes `photos[i]`.
interface PhotoManifest {
  photos: string[]
  shots?: ManifestShot[]
  // Optional shots the person deliberately skipped (for example "label" when
  // the item has none). Absent on older manifests.
  skipped?: string[]
  phaseCode?: string
}

export interface ManifestDetail {
  photos: string[]
  // Same length as `photos`; an entry is undefined for photos without shot
  // info (old manifests, listing photos).
  shots: (ManifestShot | undefined)[]
  // Shot ids skipped on purpose, as opposed to simply not photographed.
  skipped: string[]
  phaseCode: string | null
}

// XMLHttpRequest rather than fetch() specifically because fetch has no
// portable way to observe upload progress on the request body — XHR's
// `upload.onprogress` (bytes actually sent to the server) is what a real
// percentage bar needs; fetch can only tell you when the whole thing
// finishes.
export function pinFile(blob: Blob, filename: string, onProgress?: (loadedBytes: number, totalBytes: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', blob, filename)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', PIN_ENDPOINT)

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total)
      })
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { cid } = JSON.parse(xhr.responseText) as { cid: string }
          resolve(cid)
        } catch {
          reject(new Error('Upload succeeded but the response was invalid.'))
        }
        return
      }
      let message = `Upload failed (${xhr.status}).`
      try {
        const body = JSON.parse(xhr.responseText) as { error?: string }
        if (body?.error) message = body.error
      } catch {
        // Response wasn't JSON — keep the generic status-based message.
      }
      reject(new Error(message))
    }
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'))

    xhr.send(form)
  })
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

// Handover manifest: same CID list as pinManifest, plus what each photo shows,
// how it was taken and the server-issued phase code.
export async function pinHandoverManifest(photoCids: string[], shots: ManifestShot[], phaseCode: string, skipped: string[] = []): Promise<string> {
  const manifest: PhotoManifest = { photos: photoCids, shots, ...(skipped.length ? { skipped } : {}), phaseCode }
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
async function fetchWithRetry(url: string, attempts = 8, delayMs = 2500): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(urlForAttempt(url, attempt))
      if (res.ok) return res
      lastError = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastError = err
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throw lastError instanceof Error ? lastError : new Error('Could not load photos.')
}

function parseShot(value: unknown): ManifestShot | undefined {
  if (!value || typeof value !== 'object') return undefined
  const { shot, capture } = value as Partial<ManifestShot>
  if (typeof shot !== 'string') return undefined
  return { shot, capture: capture === 'uploaded' ? 'uploaded' : 'captured' }
}

// Tolerant of every manifest shape ever pinned: the original `{ photos }`
// and the handover form with shots and a phase code.
export async function resolveManifestDetail(cid: string): Promise<ManifestDetail> {
  const res = await fetchWithRetry(gatewayUrl(cid))
  const manifest = (await res.json()) as Partial<PhotoManifest>
  const photos = Array.isArray(manifest.photos) ? manifest.photos : []
  const rawShots: unknown[] = Array.isArray(manifest.shots) ? manifest.shots : []
  return {
    photos,
    shots: photos.map((_, i) => parseShot(rawShots[i])),
    skipped: Array.isArray(manifest.skipped) ? manifest.skipped.filter((x): x is string => typeof x === 'string') : [],
    phaseCode: typeof manifest.phaseCode === 'string' ? manifest.phaseCode : null,
  }
}

export async function resolveManifest(cid: string): Promise<string[]> {
  return (await resolveManifestDetail(cid)).photos
}
