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

async function pinBlob(blob: Blob, filename: string): Promise<string> {
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

// Uploads each photo individually, then wraps their CIDs in a manifest and
// pins that too — CLAUDE.md's contract is that on-chain `photos` fields
// hold one CID pointing at a JSON manifest, not a list of URLs. Returns the
// manifest's CID, which is what goes into the Anchor instruction argument.
export async function pinPhotos(files: File[]): Promise<string> {
  if (files.length === 0) throw new Error('Select at least one photo.')

  const photoCids = await Promise.all(files.map((file) => pinBlob(file, file.name)))
  const manifest: PhotoManifest = { photos: photoCids }
  const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' })

  return pinBlob(manifestBlob, 'manifest.json')
}

export async function resolveManifest(cid: string): Promise<string[]> {
  const res = await fetch(gatewayUrl(cid))
  if (!res.ok) throw new Error('Could not load photos.')
  const manifest = (await res.json()) as PhotoManifest
  return manifest.photos
}
