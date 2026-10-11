import { C } from './theme'
import { enumKey } from './listing'

export type StatusStyle = { background: string; color: string; border: string }

// Same three-tint system as CLAUDE.md's status badges: green (positive),
// amber (pending), rust (attention). Mapped from the real RentalStatus enum
// rather than the mockup's ad-hoc status strings.
const POSITIVE: StatusStyle = { background: 'var(--gs-badge-positive-bg)', color: C.green, border: '1px solid var(--gs-badge-positive-border)' }
const PENDING: StatusStyle = { background: 'var(--gs-badge-pending-bg)', color: 'var(--gs-badge-pending-color)', border: '1px solid var(--gs-badge-pending-border)' }
const ATTENTION: StatusStyle = { background: 'var(--gs-badge-attention-bg)', color: C.rust, border: '1px solid var(--gs-badge-attention-border)' }
const NEUTRAL: StatusStyle = { background: 'var(--gs-badge-neutral-bg)', color: C.muted, border: '1px solid var(--gs-badge-neutral-border)' }

export function rentalStatusLabel(status: Record<string, object>): string {
  switch (enumKey(status)) {
    case 'active':
      return 'Rental in progress'
    case 'awaitingReturn':
      return 'Return in progress'
    case 'awaitingConfirmation':
      return 'Ready for owner to confirm'
    case 'disputed':
      return "Something's not right"
    case 'completed':
      return 'Rental completed'
    case 'refundedAuto':
      return 'Refunded automatically'
    case 'resolved':
      return 'Resolved'
    default:
      return enumKey(status)
  }
}

export function rentalStatusStyle(status: Record<string, object>): StatusStyle {
  switch (enumKey(status)) {
    case 'active':
      return POSITIVE
    case 'awaitingReturn':
    case 'awaitingConfirmation':
      return PENDING
    case 'disputed':
      return ATTENTION
    case 'completed':
    case 'resolved':
      return NEUTRAL
    case 'refundedAuto':
      return POSITIVE
    default:
      return NEUTRAL
  }
}

// HandoverPhase enum order mirrors the four handover steps in
// RentalHandover.tsx: None (not started) -> BeforeSending -> OnArrival ->
// BeforeReturning -> OnReturn (all done).
const PHASE_ORDER = ['none', 'beforeSending', 'onArrival', 'beforeReturning', 'onReturn'] as const

export function phaseStepIndex(phase: Record<string, object>): number {
  const key = enumKey(phase)
  const index = PHASE_ORDER.indexOf(key as (typeof PHASE_ORDER)[number])
  return index === -1 ? 0 : index
}
