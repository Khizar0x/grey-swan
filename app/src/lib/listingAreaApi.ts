// Public read (no auth) — a listing's general area is meant to be visible
// to anyone browsing, unlike the exact addresses in addressApi.ts.
export async function fetchListingArea(listingPubkey: string): Promise<string | null> {
  const res = await fetch(`/api/listing-area/${listingPubkey}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Could not load the listing area.')
  const { area } = (await res.json()) as { area: string }
  return area
}

// Bulk read for the browse page's "available in your area" pill — one
// request instead of one per listing card.
export async function fetchAllListingAreas(): Promise<Record<string, string>> {
  const res = await fetch('/api/listing-areas')
  if (!res.ok) throw new Error('Could not load listing areas.')
  const { areas } = (await res.json()) as { areas: Record<string, string> }
  return areas
}

export async function saveListingArea(listingPubkey: string, ownerPubkey: string, area: string, token: string): Promise<void> {
  const res = await fetch('/api/listing-area', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ listingPubkey, ownerPubkey, area }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Could not save the listing area.')
  }
}
