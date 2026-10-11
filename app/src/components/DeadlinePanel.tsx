import {
  type DeadlineItem,
  formatCountdown,
  formatDeadlineDate,
  type TimeoutActionKey,
} from '../lib/deadlines'
import { C, FONT_HEAD } from '../lib/theme'
import { Btn } from './atoms'

const ACTION_COPY: Record<TimeoutActionKey, { button: string; body: string; variant?: 'danger' }> = {
  notArrived: {
    button: "Item hasn't arrived",
    body: "If your item hasn't turned up, tell us and the funds stay safely held while we look into it.",
    variant: 'danger',
  },
  markReceived: {
    button: 'Mark as received',
    body: 'The renter did not respond in time. You can confirm the item arrived so the rental period can start.',
  },
  itemNotReturned: {
    button: 'Item not returned',
    body: "The return date and grace period have passed. Tell us the item hasn't come back and the funds are held for review.",
    variant: 'danger',
  },
  returnNeverArrived: {
    button: 'Return never arrived',
    body: "The renter says they sent it back, but it hasn't reached you. Tell us and the funds are held for review.",
    variant: 'danger',
  },
  completeRental: {
    button: 'Complete rental',
    body: 'The owner has not responded within the inspection window, so you can complete the rental and get your deposit back.',
  },
}

// Deadlines for the connected person, then the one or two actions that are
// valid right now. `onAction` is the page's own mutation runner.
export function DeadlinePanel({
  deadlines,
  actions,
  now,
  busy,
  onAction,
}: {
  deadlines: DeadlineItem[]
  actions: TimeoutActionKey[]
  now: number
  busy: boolean
  onAction: (action: TimeoutActionKey) => void
}) {
  if (deadlines.length === 0 && actions.length === 0) return null
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      {deadlines.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
            Key dates
          </p>
          {deadlines.map((d) => (
            <div key={d.key} className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
                  {d.label}
                </span>
                <span className="text-xs font-medium" style={{ color: d.at >= now ? C.muted : C.rust }}>
                  {formatCountdown(d.at, now)}
                </span>
              </div>
              <span className="text-xs" style={{ color: C.muted }}>
                {formatDeadlineDate(d.at)}
              </span>
              <span className="text-xs" style={{ color: C.faint }}>
                {d.note}
              </span>
            </div>
          ))}
        </div>
      )}
      {actions.map((key) => (
        <div key={key} className="flex flex-col gap-2 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
          <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
            {ACTION_COPY[key].body}
          </p>
          <div>
            <Btn variant={ACTION_COPY[key].variant === 'danger' ? 'danger' : 'primary'} disabled={busy} onClick={() => onAction(key)}>
              {busy ? 'Submitting…' : ACTION_COPY[key].button}
            </Btn>
          </div>
        </div>
      ))}
    </div>
  )
}
