import { useWallet } from '@solana/wallet-adapter-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { requestNonceMessage, verifySignature } from './auth'

interface AuthState {
  token: string | null
  signedIn: boolean
  signingIn: boolean
  error: string | null
  signIn: () => Promise<void>
  // Recovery path for a token that *looked* valid client-side (not locally
  // expired) but still got a 401 from the server — e.g. a session secret
  // rotation invalidating every outstanding token. Without this, that 401
  // was a dead end identical to the stale-token bug above: `signedIn` stays
  // wrongly true off the now-known-bad token, and nothing calls signIn()
  // again. Callers that hit a 401 using this token should call this instead
  // of just displaying the error.
  clearSession: () => void
}

const AuthContext = createContext<AuthState | null>(null)

const tokenKey = (pubkey: string) => `greyswan_token_${pubkey}`

// A token's mere presence in localStorage was being trusted as "signed in"
// with no check that it's still valid — the server issues 24h tokens
// (auth.ts TOKEN_TTL), so any session older than that was silently treated
// as live until the first real API call 401'd. Worse, that dead end was
// unrecoverable client-side: `signedIn` stayed wrongly true off the stale
// token, so the "Sign in with wallet" button (the only thing that calls
// signIn() again) never rendered — no refresh, reconnect, or retry could
// reach it. Decoding the JWT's own `exp` claim catches this before it's
// ever trusted, no server round trip needed. Treats a malformed token the
// same as an expired one — never trust something that fails to decode.
function isTokenExpired(token: string): boolean {
  try {
    // JWTs are base64url-encoded (RFC 7515), not standard base64 — atob()
    // only understands the latter and throws on the '-'/'_' characters
    // base64url uses in place of '+'/'/'. A payload that happens to
    // contain either would otherwise be wrongly treated as undecodable
    // (and so, per the catch below, wrongly treated as expired).
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64)) as { exp?: number }
    if (typeof payload.exp !== 'number') return true
    return payload.exp * 1000 < Date.now() + 30_000
  } catch {
    return true
  }
}

// One provider, one source of truth. Without this, Layout auto-signing-in
// on connect and a page like ListItem independently checking "am I signed
// in" would be two separate hook instances that never see each other's
// updates within the same page lifetime — only a shared context does.
export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage } = useWallet()
  const [token, setToken] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Whichever pubkey is "live" right now. A wallet account switch fires the
  // same 'connect' event as a fresh connect, so a signIn() already in flight
  // for the account the user just switched away from can still resolve (or
  // reject) after the switch — without this check, that stale result would
  // land on the new account's state, including surfacing the old call's raw
  // wallet-extension error (e.g. Phantom's own generic "Unexpected error")
  // as if it were a fresh failure for the newly-selected account.
  const activePubkeyRef = useRef<string | null>(null)

  const signIn = useCallback(async () => {
    if (!publicKey) return
    const forPubkey = publicKey.toBase58()
    if (!signMessage) {
      setError('This wallet doesn’t support message signing — try Phantom or Solflare.')
      return
    }
    setSigningIn(true)
    setError(null)
    try {
      const message = await requestNonceMessage(forPubkey)
      const signature = await signMessage(new TextEncoder().encode(message))
      const newToken = await verifySignature(forPubkey, signature)
      if (activePubkeyRef.current !== forPubkey) return
      try {
        localStorage.setItem(tokenKey(forPubkey), newToken)
      } catch {
        // localStorage unavailable (private browsing etc.) — session still
        // works for the rest of this page load, just won't persist.
      }
      setToken(newToken)
    } catch (err) {
      if (activePubkeyRef.current === forPubkey) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (activePubkeyRef.current === forPubkey) setSigningIn(false)
    }
  }, [publicKey, signMessage])

  // Runs on every connect *and* every account switch mid-session (the wallet
  // adapter emits the same 'connect' event for both). Resets to whatever the
  // now-current account's own cached token is (or none) and re-prompts right
  // here, in the same effect run, so the check uses this account's fresh
  // token value instead of the previous account's — splitting this into two
  // effects keyed on [publicKey] meant the re-prompt check could run with
  // last render's stale `token`, and on a switch to an account with no
  // cached token, it would silently never fire.
  useEffect(() => {
    const pubkeyStr = publicKey ? publicKey.toBase58() : null
    activePubkeyRef.current = pubkeyStr
    setSigningIn(false)
    setError(null)

    if (!pubkeyStr) {
      setToken(null)
      return
    }

    let cached: string | null = null
    try {
      cached = localStorage.getItem(tokenKey(pubkeyStr))
    } catch {
      cached = null
    }

    if (cached && isTokenExpired(cached)) {
      try {
        localStorage.removeItem(tokenKey(pubkeyStr))
      } catch {
        // localStorage unavailable — nothing to clean up.
      }
      cached = null
    }

    setToken(cached)
    if (!cached) void signIn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey])

  const clearSession = useCallback(() => {
    if (publicKey) {
      try {
        localStorage.removeItem(tokenKey(publicKey.toBase58()))
      } catch {
        // localStorage unavailable — nothing to clean up.
      }
    }
    setToken(null)
  }, [publicKey])

  return (
    <AuthContext.Provider value={{ token, signedIn: Boolean(token), signingIn, error, signIn, clearSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
