export const MESSAGE_MAX_LEN = 5000

export interface ChatMessage {
  id: number
  senderPubkey: string
  text: string
  createdAt: number
  isMine: boolean
  wasUnread: boolean
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return body?.error ?? fallback
}

// Marks everything not sent by the requesting wallet as read, as a side
// effect server-side (see server/src/index.ts) — this is the only read path,
// there's no separate mark-as-read call.
export async function fetchMessages(rentalPubkey: string, token: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/messages/${rentalPubkey}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(await readError(res, 'Could not load messages.'))
  const { messages } = (await res.json()) as { messages: ChatMessage[] }
  return messages
}

export async function sendChatMessage(rentalPubkey: string, text: string, token: string): Promise<ChatMessage> {
  const res = await fetch(`/api/messages/${rentalPubkey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(await readError(res, 'Could not send message.'))
  const { message } = (await res.json()) as { message: ChatMessage }
  return message
}

export async function fetchUnreadCount(rentalPubkey: string, token: string): Promise<number> {
  const res = await fetch(`/api/messages/${rentalPubkey}/unread-count`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return 0
  const { count } = (await res.json()) as { count: number }
  return count
}

export interface ConversationSummary {
  lastMessageText: string
  lastMessageAt: number
  lastMessageIsMine: boolean
  unreadCount: number
}

// Powers the /messages inbox — one batched call for every rental the wallet
// might have a conversation on, rather than fetching each one individually.
// Only ever returns entries for rentals that actually have a message.
export async function fetchConversationsSummary(rentalPubkeys: string[], token: string): Promise<Record<string, ConversationSummary>> {
  if (rentalPubkeys.length === 0) return {}
  const res = await fetch('/api/messages/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rentalPubkeys }),
  })
  if (!res.ok) return {}
  const { conversations } = (await res.json()) as { conversations: Record<string, ConversationSummary> }
  return conversations
}
