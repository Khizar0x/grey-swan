import { useWallet } from '@solana/wallet-adapter-react'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { requestNonceMessage, verifySignature } from './auth'

interface AuthState {
  token: string | null
  signedIn: boolean
  signingIn: boolean
  error: string | null
  signIn: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const tokenKey = (pubkey: string) => `greyswan_token_${pubkey}`

// One provider, one source of truth. Without this, Layout auto-signing-in
// on connect and a page like ListItem independently checking "am I signed
// in" would be two separate hook instances that never see each other's
// updates within the same page lifetime — only a shared context does.
export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage } = useWallet()
  const [token, setToken] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!publicKey) {
      setToken(null)
      setError(null)
      return
    }
    try {
      setToken(localStorage.getItem(tokenKey(publicKey.toBase58())))
    } catch {
      setToken(null)
    }
  }, [publicKey])

  const signIn = useCallback(async () => {
    if (!publicKey) return
    if (!signMessage) {
      setError('This wallet doesn’t support message signing — try Phantom or Solflare.')
      return
    }
    setSigningIn(true)
    setError(null)
    try {
      const message = await requestNonceMessage(publicKey.toBase58())
      const signature = await signMessage(new TextEncoder().encode(message))
      const newToken = await verifySignature(publicKey.toBase58(), signature)
      try {
        localStorage.setItem(tokenKey(publicKey.toBase58()), newToken)
      } catch {
        // localStorage unavailable (private browsing etc.) — session still
        // works for the rest of this page load, just won't persist.
      }
      setToken(newToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSigningIn(false)
    }
  }, [publicKey, signMessage])

  // Auto-prompt once per fresh connect if there's no cached session —
  // intentionally keyed only on publicKey, not token/signingIn, so a
  // rejected signature doesn't get re-prompted on every render (the user
  // can retry explicitly via the sign-in button shown wherever it's gated).
  useEffect(() => {
    if (publicKey && !token && !signingIn) {
      void signIn()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey])

  return <AuthContext.Provider value={{ token, signedIn: Boolean(token), signingIn, error, signIn }}>{children}</AuthContext.Provider>
}

export function useAuthContext(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
