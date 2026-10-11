import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

// A cached copy of public IPFS content, so the shared Pinata gateway is asked
// for each file once. That gateway answers "429, you need a dedicated
// gateway" when a page asks for many files at once (the review page does),
// and the browser then gives up on thumbnails. Content addressing makes this
// safe: a CID always names the same bytes, so a cached copy never goes stale.

const GATEWAY = 'https://gateway.pinata.cloud/ipfs/'
const CID_PATTERN = /^[a-zA-Z0-9]{46,100}$/
const MAX_BYTES = 20 * 1024 * 1024
const MAX_CONCURRENT = 2

export interface CachedFile {
  bytes: Uint8Array
  contentType: string
}

export function isCid(value: string): boolean {
  return CID_PATTERN.test(value)
}

let active = 0
const waiting: (() => void)[] = []
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve))
  active += 1
  try {
    return await fn()
  } finally {
    active -= 1
    waiting.shift()?.()
  }
}

const inFlight = new Map<string, Promise<CachedFile>>()

export function getIpfsFile(
  cid: string,
  dir: string,
  fetchImpl: typeof fetch = fetch,
  retryDelayMs = 2000,
  attempts = 5,
): Promise<CachedFile> {
  const pending = inFlight.get(cid)
  if (pending) return pending
  const job = load(cid, dir, fetchImpl, retryDelayMs, attempts).finally(() => inFlight.delete(cid))
  inFlight.set(cid, job)
  return job
}

async function load(cid: string, dir: string, fetchImpl: typeof fetch, retryDelayMs: number, attempts: number): Promise<CachedFile> {
  const file = path.join(dir, cid)
  try {
    const [bytes, type] = await Promise.all([readFile(file), readFile(`${file}.type`, 'utf8')])
    return { bytes, contentType: type }
  } catch {
    // Not cached yet.
  }

  let lastStatus = 0
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt))
    const res = await slot(() => fetchImpl(`${GATEWAY}${cid}`)).catch(() => null)
    if (!res) continue
    lastStatus = res.status
    if (res.status === 429 || res.status >= 500 || res.status === 504) continue
    if (!res.ok) throw new Error(`Gateway answered ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length > MAX_BYTES) throw new Error('File too large')
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
    // Only keep what a browser can show or what a manifest is; never an error page.
    if (!/^(image\/|application\/json)/.test(contentType)) throw new Error('Not an image or manifest')
    await mkdir(dir, { recursive: true })
    const tmp = `${file}.tmp`
    await writeFile(tmp, bytes)
    await writeFile(`${file}.type`, contentType)
    await rename(tmp, file)
    return { bytes, contentType }
  }
  throw new Error(`Gateway not available (last status ${lastStatus})`)
}
