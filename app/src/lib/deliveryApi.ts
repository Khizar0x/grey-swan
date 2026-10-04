export type DeliveryMethod = 'ship' | 'pickup'

export async function fetchDeliveryMethod(rentalPubkey: string, token: string): Promise<DeliveryMethod | null> {
  const res = await fetch(`/api/delivery/${rentalPubkey}`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Could not load delivery method.')
  const { method } = (await res.json()) as { method: DeliveryMethod }
  return method
}

export async function saveDeliveryMethod(
  rentalPubkey: string,
  method: DeliveryMethod,
  ownerPubkey: string,
  renterPubkey: string,
  token: string,
): Promise<void> {
  const res = await fetch('/api/delivery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rentalPubkey, method, ownerPubkey, renterPubkey }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Could not save delivery method.')
  }
}
