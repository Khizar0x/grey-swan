// The server issues one short code per rental and handover phase (see
// server/src/phaseCodes.ts). Asking again always returns the same code.
export async function fetchPhaseCode(rentalPubkey: string, phase: number, token: string): Promise<string> {
  const res = await fetch(`/api/phase-code/${rentalPubkey}/${phase}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? "Couldn't get your photo code. Try again.")
  }
  const { code } = (await res.json()) as { code: string }
  return code
}
