export type DisputeReviewStatus = 'under_review' | 'resolved'

export interface DisputeNote {
  rental_pubkey: string
  status: DisputeReviewStatus
  note: string
  updated_at: number
}

export async function fetchDisputeNotes(token: string): Promise<DisputeNote[]> {
  const res = await fetch('/api/admin/dispute-notes', { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Could not load review notes.')
  const { notes } = (await res.json()) as { notes: DisputeNote[] }
  return notes
}

export async function saveDisputeNote(rentalPubkey: string, status: DisputeReviewStatus, note: string, token: string): Promise<DisputeNote> {
  const res = await fetch('/api/admin/dispute-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rentalPubkey, status, note }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Could not save.')
  }
  const { note: row } = (await res.json()) as { note: DisputeNote }
  return row
}
