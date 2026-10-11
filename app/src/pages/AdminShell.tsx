import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { Btn } from '../components/atoms'
import type { ConfigAccount, Role } from '../lib/adminDisputes'
import { useAuthContext } from '../lib/AuthContext'
import { useProgram } from '../lib/program'
import { C, FONT_HEAD } from '../lib/theme'

type AdminCheck = 'checking' | 'allowed' | 'denied'

export interface AdminContext {
  config: ConfigAccount | null
  role: Role | null
}

// The admin area's front door: one access check for every admin page, then
// a small tab bar and whichever page was asked for.
export function AdminShell() {
  const program = useProgram()
  const { publicKey, wallet, connecting } = useWallet()
  const { signedIn, signingIn, error: authError, signIn } = useAuthContext()

  const [adminCheck, setAdminCheck] = useState<AdminCheck>('checking')
  const [config, setConfig] = useState<ConfigAccount | null>(null)
  const [role, setRole] = useState<Role | null>(null)

  // The entire access control for this page: read the Config PDA's `admin`
  // field on-chain and compare it to the connected wallet. No separate
  // login, nothing client-side to trust beyond what's actually on-chain.
  //
  // publicKey starts out null on every fresh page load/refresh even when a
  // wallet is about to auto-reconnect — wallet-adapter's autoConnect is
  // async (it only flips `connected`/`publicKey` after an effect chain runs
  // post-mount), so a direct visit to /admin briefly looks identical to
  // "no wallet." Treating that as an immediate denial fires the redirect
  // below before autoConnect ever gets a chance to resolve the real wallet
  // — bouncing a legitimately-connected admin home. So a missing publicKey
  // only ever means "still checking," never "denied" — the fallback timer
  // further down is what actually settles a genuinely-disconnected visit.
  useEffect(() => {
    if (!publicKey) return
    let cancelled = false

    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], program.programId)

    // A single dropped RPC request here is exactly the same class of bug
    // the wallet-resolve race was: a transient, recoverable condition
    // treated as a permanent verdict. publicKey resolving correctly but
    // this one-shot fetch hiccuping once would previously deny a genuine
    // admin outright, with no way back short of reloading and hoping the
    // next attempt happens to land. Retries before ever committing to
    // "denied" — same shape as ipfs.ts's fetchWithRetry and useRentals'
    // settle-delay retries elsewhere in this codebase.
    const attempts = [0, 800, 2000]
    ;(async () => {
      let lastErr: unknown
      for (const delay of attempts) {
        if (cancelled) return
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
        if (cancelled) return
        try {
          const cfg = await program.account.config.fetch(configPda)
          if (cancelled) return
          // The admin or any reviewer on Config may use this page; only the
          // admin sees the admin-only controls (setting a verdict aside).
          const isAdmin = cfg.admin.equals(publicKey)
          const isReviewer = cfg.reviewers.slice(0, cfg.reviewerCount).some((r) => r.equals(publicKey))
          setConfig(cfg)
          setRole(isAdmin ? 'admin' : isReviewer ? 'reviewer' : null)
          setAdminCheck(isAdmin || isReviewer ? 'allowed' : 'denied')
          return
        } catch (err) {
          lastErr = err
        }
      }
      console.error('Admin config fetch failed after retries:', lastErr)
      if (!cancelled) setAdminCheck('denied')
    })()

    return () => {
      cancelled = true
    }
  }, [program, publicKey])

  // Bounded fallback: distinguishes "actively reconnecting" from "nothing
  // left to wait for" rather than a single fixed timeout from page load.
  // A wallet account's *first-ever* silent reconnect to this origin can
  // take longer than a few seconds (especially right after importing it),
  // and a flat timer that starts counting from mount doesn't know the
  // difference between "still working" and "already gave up" — it would
  // cut a slow-but-genuine reconnect off just the same as a truly absent
  // one. No wallet selected at all -> nothing will ever reconnect, deny
  // now. Actively connecting -> keep waiting, no countdown yet. Otherwise
  // (selected but idle, not connecting, no publicKey) -> give it a bounded
  // window from *that* point before giving up.
  useEffect(() => {
    if (publicKey) return
    if (!wallet) {
      setAdminCheck('denied')
      return
    }
    if (connecting) return
    const timer = setTimeout(() => {
      setAdminCheck((prev) => (prev === 'checking' ? 'denied' : prev))
    }, 5000)
    return () => clearTimeout(timer)
  }, [publicKey, wallet, connecting])

  // Render nothing while the check is in flight or once it's failed — no
  // flash of admin content, no "you're not allowed" message, just a redirect.
  if (adminCheck === 'checking') return null
  if (adminCheck === 'denied') return <Navigate to="/" replace />

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
        <h1 className="mb-2 text-2xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          Sign in to continue
        </h1>
        <p className="mb-8 text-sm leading-relaxed" style={{ color: C.muted }}>
          We need your wallet to sign a message proving you hold it before showing dispute details.
        </p>
        {authError && (
          <p className="mb-4 text-sm" style={{ color: C.rust }}>
            {authError}
          </p>
        )}
        <Btn onClick={() => void signIn()} disabled={signingIn}>
          {signingIn ? 'Waiting for signature…' : 'Sign in with wallet'}
        </Btn>
      </div>
    )
  }

  const tab = ({ isActive }: { isActive: boolean }) => ({
    color: isActive ? C.cream : C.muted,
    borderBottom: `2px solid ${isActive ? C.primary : 'transparent'}`,
  })

  return (
    <div>
      <nav className="mx-auto flex max-w-4xl gap-6 px-4 pt-6 text-sm font-semibold sm:px-6" aria-label="Admin">
        <NavLink to="/admin" end className="pb-2" style={tab}>
          Overview
        </NavLink>
        <NavLink to="/admin/disputes" className="pb-2" style={tab}>
          Disputes
        </NavLink>
      </nav>
      <Outlet context={{ config, role } satisfies AdminContext} />
    </div>
  )
}
