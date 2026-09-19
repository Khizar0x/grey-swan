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
    // Carries the status alongside the message so a 401 here can be told
    // apart from an ordinary validation error — callers use it to recover
    // the session (see AuthContext.clearSession) rather than just display
    // the text and leave the person stuck retrying a dead token forever.
    const err = new Error(body?.error ?? 'Could not save profile.') as Error & { status?: number }
    err.status = res.status
    throw err
  }
  const { profile } = (await res.json()) as { profile: Profile }
  return profile
}
