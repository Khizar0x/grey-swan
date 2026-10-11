import type { CSSProperties } from 'react'

// Ported from the Figma Make export (figma-export/src/App.tsx) — this is the
// canonical brand palette from CLAUDE.md, kept as plain JS objects (rather
// than folded into Tailwind's @theme tokens) so every screen ported from the
// mockup keeps its exact inline-style values instead of drifting during
// translation.
//
// Every value here is a CSS custom property reference, not a literal — the
// actual light/dark values live in index.css (:root and :root[data-theme=
// 'dark']). This means toggling the theme (ThemeContext.tsx, which just sets
// the data-theme attribute on <html>) repaints every C.xxx consumer in the
// app instantly with no React re-render needed, since the browser resolves
// var() at paint time. The dark values are a deliberately designed second
// palette (layered near-black surfaces, off-white text, softened accents),
// not an automatic inversion of the light one.
export const C = {
  bg: 'var(--gs-bg)',
  surface: 'var(--gs-surface)',
  surface2: 'var(--gs-surface2)',
  surfaceHover: 'var(--gs-surface-hover)',
  // Gold is retired — every remaining reference to it now resolves to the
  // same coral as `primary`, so call sites don't need touching one by one.
  gold: 'var(--gs-primary)',
  accentSoft: 'var(--gs-accent-soft)',
  primary: 'var(--gs-primary)',
  primaryHov: 'var(--gs-primary-hov)',
  // Deep teal reserved specifically for trust/security messaging — the
  // trust strip and anything about deposits being held safely. Keep this
  // separate from `primary`: coral means "take an action", teal means
  // "your money is safe here."
  trust: 'var(--gs-trust)',
  trustSoft: 'var(--gs-trust-soft)',
  rust: 'var(--gs-rust)',
  // Scoped specifically to the viewer's own chat bubbles (ChatPanel) —
  // standard indigo/purple chat-bubble convention, distinct from `primary`
  // (coral) which is reserved for calls-to-action elsewhere in the app.
  chatMine: 'var(--gs-chat-mine)',
  green: 'var(--gs-green)',
  emerald: 'var(--gs-emerald)',
  cream: 'var(--gs-cream)',
  muted: 'var(--gs-muted)',
  faint: 'var(--gs-faint)',
  border: 'var(--gs-border)',
  navBg: 'var(--gs-nav-bg)',
  onAccent: 'var(--gs-on-accent)',
  // Bold marketplace header treatment (Amazon/eBay-style): a dark bar under
  // the search row that carries the always-visible categories, plus the
  // department accent colors it uses for hover/active states.
  navDark: 'var(--gs-nav-dark)',
  navDarkText: 'var(--gs-nav-dark-text)',
  navDarkMuted: 'var(--gs-nav-dark-muted)',
  navDarkHover: 'var(--gs-nav-dark-hover)',
  // The top row (logo/search/wallet) is deliberately darker than navDark
  // above it — the darkest element in the header — so the two dark bars
  // still read as visually distinct rather than one flat block.
  headerDark: 'var(--gs-header-dark)',
  // Shared semantic fills reused ad hoc across many pages as inline
  // literals before this token existed — kept here now so they also follow
  // the dark palette instead of staying frozen at their light-mode values.
  inputBg: 'var(--gs-input-bg)',
  subtleBg: 'var(--gs-subtle-bg)',
  // Photo overlays and badges on top of media
  overlayBg: 'var(--gs-overlay-bg)',
  overlayText: 'var(--gs-overlay-text)',
  primaryGlow: 'var(--gs-primary-glow)',
  shadowAttention: 'var(--gs-shadow-attention)',
  shadowPending: 'var(--gs-shadow-pending)',
} as const

export const FONT_HEAD = "Helvetica, 'Helvetica Neue', Inter, sans-serif"

export const INPUT_STYLE: CSSProperties = {
  background: C.inputBg,
  border: `1px solid ${C.border}`,
  color: C.cream,
  borderRadius: '0.75rem',
  padding: '0.75rem 1rem',
  width: '100%',
  outline: 'none',
  fontFamily: 'inherit',
}
