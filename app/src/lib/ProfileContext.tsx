import { useWallet } from '@solana/wallet-adapter-react'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuthContext } from './AuthContext'
import { fetchProfile, type Profile } from './profileApi'

interface ProfileState {
  profile: Profile | null
  checked: boolean
  refetch: () => void
}

const ProfileContext = createContext<ProfileState | null>(null)

// Same reasoning as AuthContext, applied to the bug it didn't catch: without
// one shared instance, saving a profile on one page (e.g. the List an item
// email gate) is invisible to another already-mounted consumer of this
// state (Layout's onboarding modal, which persists across every route since
// it wraps <Outlet />) — that consumer keeps showing its own stale
// "no profile" snapshot from whenever it last fetched, and re-prompts with
// an empty form on the next navigation.
export function ProfileProvider({ children }: { children: ReactNode }) {
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

  return <ProfileContext.Provider value={{ profile, checked, refetch }}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
