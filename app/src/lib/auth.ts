export async function requestNonceMessage(pubkey: string): Promise<string> {
  const res = await fetch(`/api/auth/message/${pubkey}`)
  if (!res.ok) throw new Error('Could not start sign-in.')
  const { message } = (await res.json()) as { message: string }
  return message
}

export async function verifySignature(pubkey: string, signature: Uint8Array): Promise<string> {
  const res = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pubkey, signature: Buffer.from(signature).toString('base64') }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Sign-in failed.')
  }
  const { token } = (await res.json()) as { token: string }
  return token
}
