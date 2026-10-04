import { useEffect, useRef, useState } from 'react'
import { gatewayUrl, pinFile, pinManifest, resolveManifest } from '../lib/ipfs'
import { C } from '../lib/theme'
import { IconCamera } from './icons'
import { RetryImage } from './RetryImage'

export const MAX_PHOTOS = 5

interface PhotoEntry {
  cid: string
  url: string
}

export function PhotoManifestField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  // True once we've either bootstrapped from an incoming manifest or taken
  // over via our own add/remove — guards against a re-fetch loop, since
  // every add/remove calls onChange, which comes back around as a new
  // `value` prop. Not just "ran once on mount": EditListing fetches the
  // listing asynchronously, so this field mounts with value="" first and
  // only gets the real CID a moment later — the bootstrap has to wait for
  // that, not fire (and lock itself out) on the empty first render.
  const initializedRef = useRef(false)
  const [entries, setEntries] = useState<PhotoEntry[]>([])
  const [uploading, setUploading] = useState(false)
  // Only set during addFiles (real file uploads worth showing a percentage
  // for) — null during removePhoto's manifest-only re-pin, which is small
  // enough not to need one.
  const [uploadPercent, setUploadPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initializedRef.current || !value) return
    initializedRef.current = true
    resolveManifest(value)
      .then((cids) => setEntries(cids.map((cid) => ({ cid, url: gatewayUrl(cid) }))))
      .catch(() => setError('Could not load the existing photos.'))
  }, [value])

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setError(null)
    initializedRef.current = true

    const files = Array.from(fileList)
    if (entries.length + files.length > MAX_PHOTOS) {
      setError(`Choose up to ${MAX_PHOTOS} photos total (already have ${entries.length}, tried to add ${files.length}).`)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setUploading(true)
    setUploadPercent(0)
    // Aggregate percentage across every file in this batch (uploaded in
    // parallel), weighted by each file's actual size — a bar that just
    // averaged per-file fractions would jump unevenly if one photo is much
    // bigger than the others.
    const loadedByFile = new Array<number>(files.length).fill(0)
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0) || 1
    const reportProgress = () => {
      const loaded = loadedByFile.reduce((a, b) => a + b, 0)
      setUploadPercent(Math.min(100, Math.round((loaded / totalBytes) * 100)))
    }
    try {
      const newCids = await Promise.all(
        files.map((file, i) =>
          pinFile(file, file.name, (loadedBytes) => {
            loadedByFile[i] = loadedBytes
            reportProgress()
          }),
        ),
      )
      const nextEntries = [...entries, ...newCids.map((cid) => ({ cid, url: gatewayUrl(cid) }))]
      const manifestCid = await pinManifest(nextEntries.map((e) => e.cid))
      setEntries(nextEntries)
      onChange(manifestCid)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
      setUploadPercent(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removePhoto = async (index: number) => {
    setError(null)
    initializedRef.current = true
    const nextEntries = entries.filter((_, i) => i !== index)
    setUploading(true)
    try {
      if (nextEntries.length === 0) {
        onChange('')
      } else {
        const manifestCid = await pinManifest(nextEntries.map((e) => e.cid))
        onChange(manifestCid)
      }
      setEntries(nextEntries)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  const atLimit = entries.length >= MAX_PHOTOS

  return (
    <div className="flex flex-col gap-3">
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entries.map((entry, i) => (
            <div key={entry.cid} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg" style={{ background: C.surface2 }}>
              <RetryImage src={entry.url} alt={`Upload ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                disabled={uploading}
                title="Remove photo"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold disabled:opacity-50"
                style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {!atLimit && (
        <div
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl py-8 transition-all"
          style={{ border: `2px dashed ${C.border}`, background: 'transparent' }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLDivElement).style.borderColor = C.gold
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLDivElement).style.borderColor = C.border
          }}
        >
          <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          {uploadPercent !== null ? (
            <div className="w-full max-w-[220px] px-4">
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium" style={{ color: C.muted }}>
                <span>Uploading…</span>
                <span>{uploadPercent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: C.border }}>
                <div className="h-full rounded-full transition-[width]" style={{ width: `${uploadPercent}%`, background: C.primary }} />
              </div>
            </div>
          ) : (
            <>
              <div
                className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'rgba(38,34,32,0.05)', border: `1px solid ${C.border}` }}
              >
                <svg className="h-5 w-5" style={{ color: C.faint }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div className="flex items-center gap-1.5" style={{ color: C.muted }}>
                <IconCamera />
                <p className="text-sm font-medium">{uploading ? 'Updating…' : entries.length > 0 ? 'Add more photos' : 'Upload photos'}</p>
              </div>
              <p className="mt-0.5 text-xs" style={{ color: C.faint }}>
                PNG, JPG · up to {MAX_PHOTOS} photos
              </p>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: C.rust }}>
          {error}
        </p>
      )}
    </div>
  )
}
