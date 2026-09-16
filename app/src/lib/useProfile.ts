import { useWallet } from '@solana/wallet-adapter-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuthContext } from './AuthContext'
import { fetchProfile, type Profile } from './profileApi'

// `checked` distinguishes "still loading (or not signed in yet)" from
// "confirmed no profile exists" — callers (the onboarding modal, the email
// gate on List an item) need that distinction so they don't flash a prompt
// before the lookup returns. Reading a profile is itself gated behind a
// signed-in session (see server/src/index.ts), so this hook can't fetch
// until AuthContext has a token.
export function useProfile() {
  const { publicKey } = useWallet()
  const { token } = useAuthContext()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [checked, setChecked] = useState(false)

  const refetch = useCallback(() => {
    if (!publicKey || !token) {
      setProfile(null)
      setChecked(false)
      return
    }
    setChecked(false)
    fetchProfile(publicKey.toBase58(), token)
      .then((p) => setProfile(p))
      .catch(() => setProfile(null))
      .finally(() => setChecked(true))
  }, [publicKey, token])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { profile, checked, refetch }
}
