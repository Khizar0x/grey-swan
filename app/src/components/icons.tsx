// Bold logo mark: a solid, confident swan silhouette (thick continuous
// shape, no thin strokes) — sits in a colored badge in the header, the way
// eBay/Amazon's wordmarks anchor their nav.
export const IconSwanMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" fill="currentColor" className={className}>
    <path d="M4 23.5C4 17.7 8.7 13 14.5 13c.7 0 1.4.06 2.05.19-1.7-1.94-2.75-3.7-2.75-5.19a2.2 2.2 0 1 1 4.4 0c0 1.2.98 2.5 2.55 3.86 1.9 1.64 3.75 3.5 3.75 6.14 0 5.5-5.4 9.5-12 9.5H6.2A2.2 2.2 0 0 1 4 25.3v-1.8Z" />
    <circle cx="19.6" cy="9.6" r="1.35" fill="#FAF7F2" />
  </svg>
)

export const IconCamera = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
)

export const IconCheck = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export const IconAlert = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

export const IconArrowRight = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
)

export const IconEye = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)
