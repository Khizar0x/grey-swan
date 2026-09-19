import type { CSSProperties, ReactNode } from 'react'
import { C, FONT_HEAD } from '../lib/theme'

export function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-1">
      <svg className="h-3.5 w-3.5" style={{ fill: C.gold, color: C.gold }} viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      <span className="text-sm font-medium" style={{ color: C.cream }}>
        {rating}
      </span>
    </span>
  )
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger'

export function Btn({
  children,
  onClick,
  variant = 'primary',
  full,
  type,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: BtnVariant
  full?: boolean
  type?: 'submit' | 'button'
  disabled?: boolean
}) {
  const base = `${full ? 'w-full' : ''} px-5 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none`
  const styles: Record<BtnVariant, CSSProperties> = {
    primary: { background: C.primary, color: C.onAccent },
    secondary: { background: 'transparent', color: C.cream, border: `1px solid ${C.border}` },
    ghost: { background: 'transparent', color: C.cream, border: `1px solid ${C.border}` },
    success: { background: C.green, color: C.onAccent },
    danger: { background: 'transparent', color: C.rust, border: '1px solid rgba(184,92,66,0.35)' },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={base} style={styles[variant]}>
      {children}
    </button>
  )
}


export function TrustNote() {
  return (
    <div className="flex items-start gap-2.5">
      <svg className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.faint }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-xs leading-relaxed" style={{ color: C.faint }}>
        A few photos at each handover help keep the rental clear and fair for everyone.
      </p>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium" style={{ color: C.muted }}>
        {label}
      </label>
      {children}
    </div>
  )
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 font-semibold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
      {children}
    </h3>
  )
}
