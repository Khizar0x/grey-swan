import type { CSSProperties } from 'react'

// Ported from the Figma Make export (figma-export/src/App.tsx) — this is the
// canonical brand palette from CLAUDE.md, kept as plain JS objects (rather
// than folded into Tailwind's @theme tokens) so every screen ported from the
// mockup keeps its exact inline-style values instead of drifting during
// translation.
export const C = {
  bg: '#FAF7F2',
  surface: '#FFFFFF',
  surface2: '#F0EBE3',
  surfaceHover: '#F5F0E8',
  gold: '#C9A24B',
  accentSoft: '#F0E8D4',
  primary: '#C9A24B',
  primaryHov: '#D9B25B',
  rust: '#B85C42',
  green: '#3E8A5F',
  emerald: '#2C6B4F',
  cream: '#262220',
  muted: '#6B6259',
  faint: '#9A9088',
  border: 'rgba(38,34,32,0.1)',
  navBg: 'rgba(250,247,242,0.96)',
  onAccent: '#FFFFFF',
} as const

export const FONT_HEAD = "Helvetica, 'Helvetica Neue', Inter, sans-serif"

export const INPUT_STYLE: CSSProperties = {
  background: 'rgba(38,34,32,0.04)',
  border: `1px solid ${C.border}`,
  color: C.cream,
  borderRadius: '0.75rem',
  padding: '0.75rem 1rem',
  width: '100%',
  outline: 'none',
  fontFamily: 'inherit',
}
