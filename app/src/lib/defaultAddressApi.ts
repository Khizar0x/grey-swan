// A wallet's own standing delivery address — independent of any one rental.
// See server/src/defaultAddress.ts; distinct from addressApi.ts, which is
// scoped to a specific rental's delivery/return address.

export async function fetchMyAddress(pubkey: string, token: string): Promise<string | null> {
  const res = await fetch(`/api/my-address/${pubkey}`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Could not load your saved address.')
  const { address } = (await res.json()) as { address: string }
  return address
}

export async function saveMyAddress(pubkey: string, address: string, token: string): Promise<void> {
  const res = await fetch('/api/my-address', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pubkey, address }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Could not save your address.')
  }
}
