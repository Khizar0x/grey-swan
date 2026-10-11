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

export function PhotoManifestField({
  value,
  onChange,
  hero = false,
}: {
  value: string
  onChange: (v: string) => void
  hero?: boolean
}) {
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
  const [isDragging, setIsDragging] = useState(false)
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void addFiles(e.dataTransfer.files)
    }
  }

  // Hero variant: photos are the visual anchor of the page
  if (hero) {
    return (
      <div className="flex flex-col gap-4">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />

        {entries.length === 0 ? (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="group flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-2xl p-8 text-center transition-all"
            style={{
              border: `2px dashed ${isDragging ? C.primary : C.border}`,
              background: isDragging ? C.accentSoft : C.subtleBg,
            }}
          >
            {uploadPercent !== null ? (
              <div className="w-full max-w-[280px] px-4">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold" style={{ color: C.muted }}>
                  <span>Uploading photos…</span>
                  <span>{uploadPercent}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: C.border }}>
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{ width: `${uploadPercent}%`, background: C.primary }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div
                  className="mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl transition-transform group-hover:scale-105"
                  style={{ background: C.surface, border: `1px solid ${C.border}` }}
                >
                  <svg className="h-7 w-7" style={{ color: C.primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <h3 className="mb-1 text-base font-bold sm:text-lg" style={{ color: C.cream }}>
                  {uploading ? 'Processing photos…' : 'Drag and drop photos here, or click to browse'}
                </h3>
                <p className="mb-4 max-w-md text-xs leading-relaxed" style={{ color: C.faint }}>
                  Add up to {MAX_PHOTOS} high-quality photos. The first photo will serve as your listing cover.
                </p>
                <span
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all group-hover:opacity-90"
                  style={{ background: C.primary, color: C.onAccent }}
                >
                  <IconCamera />
                  Choose photos
                </span>
              </>
            )}
          </div>
        ) : (
          <div
            className="flex flex-col gap-4 rounded-2xl p-4 sm:p-5"
            style={{ background: C.subtleBg, border: `1px solid ${C.border}` }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Gallery grid with large cover photo anchor */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
              {/* Cover photo */}
              <div
                className={`relative overflow-hidden rounded-xl sm:col-span-7 lg:col-span-7 aspect-[16/11] transition-shadow ${
                  isDragging ? 'ring-2' : ''
                }`}
                style={{ background: C.surface2 }}
              >
                <RetryImage
                  src={entries[0].url}
                  alt="Listing cover"
                  className="h-full w-full object-cover"
                />
                <span
                  className="absolute left-3 top-3 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-sm"
                  style={{ background: C.cream, color: C.onAccent }}
                >
                  Cover photo
                </span>
                <button
                  type="button"
                  onClick={() => removePhoto(0)}
                  disabled={uploading}
                  title="Remove cover photo"
                  className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold shadow-sm transition-transform hover:scale-110 disabled:opacity-50"
                  style={{ background: 'rgba(0,0,0,0.65)', color: '#FFFFFF' }}
                >
                  ×
                </button>
              </div>

              {/* Secondary thumbnails grid */}
              <div className="grid grid-cols-2 gap-3 sm:col-span-5 lg:col-span-5">
                {entries.slice(1).map((entry, index) => {
                  const actualIndex = index + 1
                  return (
                    <div
                      key={entry.cid}
                      className="relative aspect-square overflow-hidden rounded-xl"
                      style={{ background: C.surface2 }}
                    >
                      <RetryImage
                        src={entry.url}
                        alt={`Photo ${actualIndex + 1}`}
                        className="h-full w-full object-cover"
                      />
                      <span
                        className="absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: 'rgba(0,0,0,0.5)', color: '#FFFFFF' }}
                      >
                        #{actualIndex + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePhoto(actualIndex)}
                        disabled={uploading}
                        title="Remove photo"
                        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-transform hover:scale-110 disabled:opacity-50"
                        style={{ background: 'rgba(0,0,0,0.65)', color: '#FFFFFF' }}
                      >
                        ×
                      </button>
                    </div>
                  )
                })}

                {/* Slot to add more photos if under limit */}
                {!atLimit && (
                  <div
                    onClick={() => inputRef.current?.click()}
                    className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl p-3 text-center transition-all hover:opacity-90"
                    style={{
                      border: `2px dashed ${C.border}`,
                      background: C.surface,
                    }}
                  >
                    <div
                      className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ background: C.subtleBg }}
                    >
                      <svg className="h-4 w-4" style={{ color: C.primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold" style={{ color: C.muted }}>
                      Add photo
                    </span>
                    <span className="text-[10px]" style={{ color: C.faint }}>
                      {entries.length}/{MAX_PHOTOS}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Gallery footer status */}
            <div className="flex items-center justify-between pt-1 text-xs" style={{ color: C.faint }}>
              <span>
                {entries.length} of {MAX_PHOTOS} photos added · Drag additional files to add
              </span>
              {!atLimit && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="font-semibold underline hover:opacity-80"
                  style={{ color: C.primary }}
                >
                  Add more
                </button>
              )}
            </div>

            {uploadPercent !== null && (
              <div className="w-full pt-1">
                <div className="mb-1 flex items-center justify-between text-xs" style={{ color: C.muted }}>
                  <span>Uploading…</span>
                  <span>{uploadPercent}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: C.border }}>
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{ width: `${uploadPercent}%`, background: C.primary }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs font-medium" style={{ color: C.rust }}>
            {error}
          </p>
        )}
      </div>
    )
  }

  // Standard compact layout for non-hero callers (EditListing, etc.)
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
                style={{ background: C.subtleBg, border: `1px solid ${C.border}` }}
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
