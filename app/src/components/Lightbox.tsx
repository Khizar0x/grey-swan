import { C } from '../lib/theme'
import { RetryImage } from './RetryImage'

// Full-screen photo viewer shared by the item page and the review pages.
export function Lightbox({
  urls,
  index,
  alt,
  onClose,
  onNavigate,
}: {
  urls: string[]
  index: number
  alt: string
  onClose: () => void
  onNavigate: (i: number) => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: C.overlayBg }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-lg shadow-md transition-opacity hover:opacity-80"
        style={{ background: C.surface, color: C.cream, border: `1px solid ${C.border}` }}
        aria-label="Close"
      >
        ×
      </button>

      {urls.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate((index - 1 + urls.length) % urls.length)
          }}
          className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full text-xl shadow-md transition-opacity hover:opacity-80"
          style={{ background: C.surface, color: C.cream, border: `1px solid ${C.border}` }}
          aria-label="Previous photo"
        >
          ‹
        </button>
      )}

      <RetryImage
        src={urls[index]}
        alt={`${alt}, photo ${index + 1}`}
        className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {urls.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate((index + 1) % urls.length)
          }}
          className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full text-xl shadow-md transition-opacity hover:opacity-80"
          style={{ background: C.surface, color: C.cream, border: `1px solid ${C.border}` }}
          aria-label="Next photo"
        >
          ›
        </button>
      )}

      {urls.length > 1 && (
        <div className="absolute bottom-4 rounded-full px-3 py-1 text-xs font-medium shadow-md" style={{ background: C.surface, color: C.cream, border: `1px solid ${C.border}` }}>
          {index + 1} / {urls.length}
        </div>
      )}
    </div>
  )
}
