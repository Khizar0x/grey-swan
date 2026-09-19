import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'
import { useMemo, type ReactNode } from 'react'

// Devnet for now — the program only lives there. Backpack and Glow aren't
// listed here: they register themselves via the Wallet Standard, which the
// adapter auto-detects. Phantom and Solflare are listed explicitly as a
// fallback in case standard detection doesn't pick them up.
//
// The public api.devnet.solana.com endpoint rate-limits hard under normal
// app usage (429s), which surfaces as flickering/failed listing loads — a
// dedicated free-tier RPC (Helius, QuickNode, etc.) fixes this at the
// source. Falls back to the public endpoint if VITE_RPC_URL isn't set, so
// the app still runs without it, just with the same rate-limit risk.
const ENDPOINT = import.meta.env.VITE_RPC_URL || clusterApiUrl('devnet')

export function WalletContextProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  )

  return (
    <ConnectionProvider endpoint={ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  )
}
