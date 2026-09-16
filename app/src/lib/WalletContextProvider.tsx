import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'
import { useMemo, type ReactNode } from 'react'

// Devnet for now — the program only lives there. Backpack and Glow aren't
// listed here: they register themselves via the Wallet Standard, which the
// adapter auto-detects. Phantom and Solflare are listed explicitly as a
// fallback in case standard detection doesn't pick them up.
const ENDPOINT = clusterApiUrl('devnet')

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
