import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchUnreadCount } from '../lib/messageApi'
import { C, FONT_HEAD } from '../lib/theme'

// Replaces the old full chat box embedded in the rental detail view — a
// compact row that deep-links into this rental's conversation on the
// /messages inbox instead, so the full thread UI only lives in one place.
export function MessagesEntryRow({ rentalPubkey, token }: { rentalPubkey: string; token: string }) {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchUnreadCount(rentalPubkey, token).then((count) => {
      if (!cancelled) setUnread(count)
    })
    return () => {
      cancelled = true
    }
  }, [rentalPubkey, token])

  return (
    <Link
      to={`/messages/${rentalPubkey}`}
      className="flex items-center justify-between rounded-2xl px-6 py-4 transition-opacity hover:opacity-90"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      <span className="font-semibold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
        Messages
      </span>
      <span className="flex items-center gap-2">
        {unread > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold" style={{ background: C.rust, color: C.onAccent }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
        <svg className="h-4 w-4" style={{ color: C.faint }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
        </svg>
      </span>
    </Link>
  )
}
