import { C } from './theme'
import { enumKey } from './listing'

export type StatusStyle = { background: string; color: string; border: string }

// Same three-tint system as CLAUDE.md's status badges: green (positive),
// amber (pending), rust (attention). Mapped from the real RentalStatus enum
// rather than the mockup's ad-hoc status strings.
const POSITIVE: StatusStyle = { background: 'rgba(62,138,95,0.10)', color: C.green, border: '1px solid rgba(62,138,95,0.22)' }
const PENDING: StatusStyle = { background: 'rgba(201,162,62,0.10)', color: '#B5893A', border: '1px solid rgba(201,162,62,0.22)' }
const ATTENTION: StatusStyle = { background: 'rgba(184,92,66,0.10)', color: C.rust, border: '1px solid rgba(184,92,66,0.22)' }
const NEUTRAL: StatusStyle = { background: 'rgba(38,34,32,0.06)', color: C.muted, border: '1px solid rgba(38,34,32,0.12)' }

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
