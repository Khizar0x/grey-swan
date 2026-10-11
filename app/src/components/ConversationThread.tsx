import { useEffect, useRef, useState } from 'react'
import { formatMessageTime } from '../lib/formatMessageTime'
import { fetchMessages, MESSAGE_MAX_LEN, sendChatMessage, type ChatMessage } from '../lib/messageApi'
import { C, FONT_HEAD, INPUT_STYLE } from '../lib/theme'

const POLL_MS = 7000
const GROUP_GAP_MS = 5 * 60 * 1000

// The actual message list + composer, extracted from the old embedded
// ChatPanel so the /messages inbox (Messages.tsx) can give it a real,
// always-open home instead of a collapsible accordion. Same fetch/send/poll
// logic as before, just always mounted rather than gated behind an "open"
// toggle — polling starts as soon as this is on screen and stops when it
// unmounts (switching conversations, or navigating away).
export function ConversationThread({
  rentalPubkey,
  counterpartyPubkey,
  counterpartyRole,
  token,
  locked,
}: {
  rentalPubkey: string
  counterpartyPubkey: string
  counterpartyRole: 'Owner' | 'Renter'
  token: string
  locked: boolean
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [dividerBeforeId, setDividerBeforeId] = useState<number | null>(null)

  // Set once per mount (a new conversation remounts this component, since
  // Messages.tsx keys it by rentalPubkey) — a message's wasUnread flag only
  // reflects the truth on the very first fetch, since the server marks
  // everything read as a side effect of that same fetch.
  const dividerComputedRef = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const next = await fetchMessages(rentalPubkey, token)
        if (cancelled) return
        if (!dividerComputedRef.current) {
          const firstUnread = next.find((m) => m.wasUnread)
          setDividerBeforeId(firstUnread ? firstUnread.id : null)
          dividerComputedRef.current = true
        }
        setMessages(next)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    setLoading(true)
    void load()
    const interval = setInterval(() => void load(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [rentalPubkey, token])

  useEffect(() => {
    if (messages.length > prevCountRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
    prevCountRef.current = messages.length
  }, [messages])

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || text.length > MESSAGE_MAX_LEN || sending) return
    setSending(true)
    setSendError(null)
    try {
      const sent = await sendChatMessage(rentalPubkey, text, token)
      setMessages((prev) => [...prev, sent])
      setDraft('')
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  const remaining = MESSAGE_MAX_LEN - draft.length
  const showCounter = remaining <= 200

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4 sm:p-5">
      <p className="shrink-0 text-xs font-medium uppercase tracking-wide" style={{ fontFamily: FONT_HEAD, color: C.faint }}>
        Chatting with {counterpartyRole} · {counterpartyPubkey.slice(0, 4)}...{counterpartyPubkey.slice(-4)}
      </p>

      {error && (
        <p className="shrink-0 text-sm" style={{ color: C.rust }}>
          {error}
        </p>
      )}

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded-xl p-3" style={{ background: C.subtleBg }}>
        {loading && messages.length === 0 ? (
          <p className="py-6 text-center text-xs" style={{ color: C.faint }}>
            Loading messages…
          </p>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-xs" style={{ color: C.faint }}>
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1]
            const showTimestamp = !prev || prev.senderPubkey !== m.senderPubkey || m.createdAt - prev.createdAt > GROUP_GAP_MS
            return (
              <div key={m.id}>
                {dividerBeforeId === m.id && (
                  <div className="my-3 flex items-center gap-2">
                    <div className="h-px flex-1" style={{ background: C.border }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: C.rust }}>
                      New messages
                    </span>
                    <div className="h-px flex-1" style={{ background: C.border }} />
                  </div>
                )}
                {showTimestamp && (
                  <p className={`mb-0.5 mt-2 text-[10px] ${m.isMine ? 'text-right' : 'text-left'}`} style={{ color: C.faint }}>
                    {formatMessageTime(m.createdAt)}
                  </p>
                )}
                <div className={`flex items-end gap-2 ${m.isMine ? 'justify-end' : 'justify-start'}`}>
                  {!m.isMine && (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: C.surface2, color: C.muted }}>
                      {counterpartyRole === 'Owner' ? 'O' : 'R'}
                    </span>
                  )}
                  <p
                    className="max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm"
                    style={m.isMine ? { background: C.chatMine, color: C.onAccent } : { background: C.surface2, color: C.cream }}
                  >
                    {m.text}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {locked ? (
        <p className="shrink-0 rounded-xl p-3 text-center text-xs" style={{ background: C.subtleBg, border: `1px solid ${C.border}`, color: C.faint }}>
          This rental is complete.
        </p>
      ) : (
        <div className="flex shrink-0 flex-col gap-1.5">
          {sendError && (
            <p className="text-xs" style={{ color: C.rust }}>
              {sendError}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX_LEN))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSend()
                }
              }}
              placeholder="Write a message…"
              style={{ ...INPUT_STYLE, resize: 'none', flex: 1 }}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || !draft.trim()}
              className="shrink-0 rounded-xl px-4 py-3 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: C.primary, color: C.onAccent }}
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
          {showCounter && (
            <p className="text-right text-[10px]" style={{ color: remaining <= 0 ? C.rust : C.faint }}>
              {remaining} characters left
            </p>
          )}
        </div>
      )}
    </div>
  )
}
