import type { CSSProperties } from 'react'

// Ported from the Figma Make export (figma-export/src/App.tsx) — this is the
// canonical brand palette from CLAUDE.md, kept as plain JS objects (rather
// than folded into Tailwind's @theme tokens) so every screen ported from the
// mockup keeps its exact inline-style values instead of drifting during
// translation.
export const C = {
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  surface2: '#EFEFEF',
  surfaceHover: '#F2F2F2',
  // Gold is retired — every remaining reference to it now resolves to the
  // same coral as `primary`, so call sites don't need touching one by one.
  gold: '#FF6B35',
  accentSoft: 'rgba(255,107,53,0.12)',
  primary: '#FF6B35',
  primaryHov: '#FF8557',
  // Deep teal reserved specifically for trust/security messaging — the
  // trust strip and anything about deposits being held safely. Keep this
  // separate from `primary`: coral means "take an action", teal means
  // "your money is safe here."
  trust: '#0F766E',
  trustSoft: 'rgba(15,118,110,0.08)',
  rust: '#B85C42',
  green: '#16A34A',
  emerald: '#15803D',
  cream: '#262220',
  muted: '#6B6259',
  faint: '#9A9088',
  border: 'rgba(38,34,32,0.1)',
  navBg: 'rgba(250,250,250,0.96)',
  onAccent: '#FFFFFF',
  // Bold marketplace header treatment (Amazon/eBay-style): a dark bar under
  // the search row that carries the always-visible categories, plus the
  // department accent colors it uses for hover/active states.
  navDark: '#1C1F26',
  navDarkText: '#FFFFFF',
  navDarkMuted: 'rgba(255,255,255,0.62)',
  navDarkHover: 'rgba(255,255,255,0.08)',
  // The top row (logo/search/wallet) is deliberately darker than navDark
  // above it — the darkest element in the header — so the two dark bars
  // still read as visually distinct rather than one flat block.
  headerDark: '#0E1116',
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
