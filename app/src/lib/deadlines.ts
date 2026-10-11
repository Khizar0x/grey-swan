import type { BN } from '@coral-xyz/anchor'

// Everything on the rental page that depends on the clock lives here as plain
// functions, so the rules are in one place and easy to check. The program
// makes the real decision (it reads its own clock); this only decides what to
// show. A rental from before timelines existed has no timeline, so every
// function returns nothing for it.

export type Role = 'owner' | 'renter'

export interface TimelineData {
  arrivalDeadline: number
  arrivedAt: number
  returnDueAt: number
  returnShippedAt: number
  inspectionDeadline: number
  notReturnedAfter: number
}

// The fields of the on-chain RentalTimeline account we use, as unix seconds.
export function toTimelineData(account: {
  arrivalDeadline: BN
  arrivedAt: BN
  returnDueAt: BN
  returnShippedAt: BN
  inspectionDeadline: BN
  notReturnedAfter: BN
}): TimelineData {
  return {
    arrivalDeadline: account.arrivalDeadline.toNumber(),
    arrivedAt: account.arrivedAt.toNumber(),
    returnDueAt: account.returnDueAt.toNumber(),
    returnShippedAt: account.returnShippedAt.toNumber(),
    inspectionDeadline: account.inspectionDeadline.toNumber(),
    notReturnedAfter: account.notReturnedAfter.toNumber(),
  }
}

export interface DeadlineItem {
  key: 'arrival' | 'returnDue' | 'notReturned' | 'inspection'
  label: string
  at: number // unix seconds
  note: string
}

// `phasesDone` is phaseStepIndex(): 0 none, 1 sent, 2 received, 3 sent back,
// 4 checked by the owner.
export function relevantDeadlines(active: boolean, phasesDone: number, t: TimelineData | null, role: Role | null): DeadlineItem[] {
  if (!active || !t || !role) return []
  const items: DeadlineItem[] = []

  if (phasesDone === 1 && t.arrivalDeadline) {
    items.push({
      key: 'arrival',
      label: 'Arrival window',
      at: t.arrivalDeadline,
      note:
        role === 'renter'
          ? "Confirm what arrived, or tell us it hasn't, before this time."
          : 'If the renter has not responded by then, you can mark the item as received.',
    })
  }
  if (phasesDone === 2 && t.returnDueAt) {
    items.push({
      key: 'returnDue',
      label: 'Return due',
      at: t.returnDueAt,
      note: role === 'renter' ? 'Send the item back by this time.' : 'The renter should send the item back by this time.',
    })
    if (t.notReturnedAfter) {
      items.push({
        key: 'notReturned',
        label: 'Not-returned date',
        at: t.notReturnedAfter,
        note: role === 'owner' ? "After this time you can tell us the item hasn't come back." : 'After this time the owner can report the item as not returned.',
      })
    }
  }
  if ((phasesDone === 3 || phasesDone === 4) && t.inspectionDeadline) {
    items.push({
      key: 'inspection',
      label: 'Inspection deadline',
      at: t.inspectionDeadline,
      note:
        role === 'owner'
          ? 'Confirm the return or tell us something is not right before this time.'
          : 'If the owner has not responded by then, you can complete the rental yourself.',
    })
  }
  return items
}

export type TimeoutActionKey = 'notArrived' | 'markReceived' | 'itemNotReturned' | 'returnNeverArrived' | 'completeRental'

// The single set of actions valid right now for this person. Each one needs
// the clock on the right side of its deadline; "after" is strictly after, the
// same as the program.
export function availableActions(active: boolean, phasesDone: number, t: TimelineData | null, role: Role | null, now: number): TimeoutActionKey[] {
  if (!active || !t || !role) return []
  const actions: TimeoutActionKey[] = []

  if (role === 'renter' && phasesDone === 1 && t.arrivalDeadline && now <= t.arrivalDeadline) actions.push('notArrived')
  if (role === 'owner' && phasesDone === 1 && t.arrivalDeadline && now > t.arrivalDeadline) actions.push('markReceived')
  if (role === 'owner' && phasesDone === 2 && t.notReturnedAfter && now > t.notReturnedAfter) actions.push('itemNotReturned')
  if (role === 'owner' && phasesDone === 3 && t.inspectionDeadline && now <= t.inspectionDeadline) actions.push('returnNeverArrived')
  if (role === 'renter' && (phasesDone === 3 || phasesDone === 4) && t.inspectionDeadline && now > t.inspectionDeadline) actions.push('completeRental')
  return actions
}

export function formatDeadlineDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

// "2 days 4 hours", "3 hours 10 minutes", "12 minutes".
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const days = Math.floor(s / 86_400)
  const hours = Math.floor((s % 86_400) / 3_600)
  const minutes = Math.floor((s % 3_600) / 60)
  if (days > 0) return hours > 0 ? `${plural(days, 'day')} ${plural(hours, 'hour')}` : plural(days, 'day')
  if (hours > 0) return minutes > 0 ? `${plural(hours, 'hour')} ${plural(minutes, 'minute')}` : plural(hours, 'hour')
  return plural(Math.max(1, minutes), 'minute')
}

export function formatCountdown(at: number, now: number): string {
  return at >= now ? `${formatDuration(at - now)} left` : `Passed ${formatDuration(now - at)} ago`
}
