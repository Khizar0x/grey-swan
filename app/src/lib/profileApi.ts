export interface Profile {
  pubkey: string
  name: string
  email: string | null
}

export async function fetchProfile(pubkey: string, token: string): Promise<Profile | null> {
  const res = await fetch(`/api/profile/${pubkey}`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Could not load profile.')
  const { profile } = (await res.json()) as { profile: Profile }
  return profile
}

export async function saveProfile(pubkey: string, name: string, email: string, token: string): Promise<Profile> {
  const res = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pubkey, name, email: email || undefined }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Could not save profile.')
  }
  const { profile } = (await res.json()) as { profile: Profile }
  return profile
}
