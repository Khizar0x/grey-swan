import { useRef, useState } from 'react'
import { gatewayUrl, pinPhotos } from '../lib/ipfs'
import { C } from '../lib/theme'
import { IconCamera } from './icons'

export function PhotoManifestField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setError(null)
    setUploading(true)
    try {
      const cid = await pinPhotos(Array.from(fileList))
      onChange(cid)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl py-8 transition-all"
        style={{ border: `2px dashed ${value ? C.green : C.border}`, background: 'transparent' }}
        onMouseEnter={(e) => {
          if (!value) (e.currentTarget as HTMLDivElement).style.borderColor = C.gold
        }}
        onMouseLeave={(e) => {
          if (!value) (e.currentTarget as HTMLDivElement).style.borderColor = C.border
        }}
      >
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
        <div
          className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: 'rgba(38,34,32,0.05)', border: `1px solid ${C.border}` }}
        >
          <svg className="h-5 w-5" style={{ color: C.faint }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <div className="flex items-center gap-1.5" style={{ color: value ? C.green : C.muted }}>
          <IconCamera />
          <p className="text-sm font-medium">{uploading ? 'Uploading…' : value ? 'Photos uploaded' : 'Upload photos'}</p>
        </div>
        <p className="mt-0.5 text-xs" style={{ color: C.faint }}>
          PNG, JPG · 2–3 photos
        </p>
      </div>

      {value && !uploading && (
        <a href={gatewayUrl(value)} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: C.faint }}>
          View uploaded photos
        </a>
      )}
      {error && (
        <p className="text-xs" style={{ color: C.rust }}>
          {error}
        </p>
      )}
    </div>
  )
}
