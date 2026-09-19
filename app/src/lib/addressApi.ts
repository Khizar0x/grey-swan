export type AddressRole = 'renter_delivery' | 'owner_return'

export async function fetchAddress(rentalPubkey: string, role: AddressRole, token: string): Promise<string | null> {
  const res = await fetch(`/api/address/${rentalPubkey}/${role}`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Could not load address.')
  const { address } = (await res.json()) as { address: string }
  return address
}

export async function saveAddress(
  rentalPubkey: string,
  role: AddressRole,
  ownerPubkey: string,
  renterPubkey: string,
  address: string,
  token: string,
): Promise<void> {
  const res = await fetch('/api/address', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rentalPubkey, role, ownerPubkey, renterPubkey, address }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Could not save address.')
  }
}
