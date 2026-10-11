import { useState } from 'react'
import { shotLabel } from '../lib/handoverShots'
import { C } from '../lib/theme'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import { Lightbox } from './Lightbox'
import { RetryImage } from './RetryImage'

// One handover phase's photos as click-to-enlarge thumbnails, with the shot
// names, the photo code and anything skipped on purpose. Used on the review
// page, where a reviewer needs every photo in one place.
export function PhaseGallery({ title, manifestCid }: { title: string; manifestCid: string }) {
  const { urls, shots, skipped, phaseCode, loading, error, retry } = usePhotoUrls(manifestCid || undefined)
  const [open, setOpen] = useState<number | null>(null)
  if (!manifestCid) return null
  return (
    <div className="rounded-xl p-3" style={{ background: C.subtleBg, border: `1px solid ${C.border}` }}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.muted }}>
          {title}
        </p>
        {phaseCode && (
          <span className="text-xs" style={{ color: C.faint }}>
            Photo code {phaseCode}
          </span>
        )}
      </div>
      {loading ? (
        <p className="text-xs" style={{ color: C.faint }}>
          Loading photos…
        </p>
      ) : error ? (
        <div className="flex items-center gap-3">
          <p className="text-xs" style={{ color: C.rust }}>
            Couldn't load these photos.
          </p>
          <button type="button" onClick={retry} className="text-xs underline" style={{ color: C.gold }}>
            Try again
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {urls.map((url, i) => {
            const shot = shots[i]
            return (
              <div key={url}>
                <button
                  type="button"
                  onClick={() => setOpen(i)}
                  className="block aspect-square w-full cursor-zoom-in overflow-hidden rounded-lg"
                  style={{ border: `1px solid ${C.border}`, background: C.surface2 }}
                  aria-label={`Enlarge ${shot ? shotLabel(shot.shot) : `photo ${i + 1}`}`}
                >
                  <RetryImage src={url} alt={`${title}, ${shot ? shotLabel(shot.shot) : `photo ${i + 1}`}`} className="h-full w-full object-cover" />
                </button>
                {shot && (
                  <p className="mt-1 text-[11px] leading-tight" style={{ color: shot.capture === 'uploaded' ? C.rust : C.faint }}>
                    {shotLabel(shot.shot)}
                    {shot.capture === 'uploaded' ? ', uploaded, not captured' : ''}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
      {skipped.length > 0 && (
        <p className="mt-2 text-xs" style={{ color: C.faint }}>
          Skipped on purpose: {skipped.map(shotLabel).join(', ')}
        </p>
      )}
      {open !== null && urls[open] && <Lightbox urls={urls} index={open} alt={title} onClose={() => setOpen(null)} onNavigate={setOpen} />}
    </div>
  )
}
