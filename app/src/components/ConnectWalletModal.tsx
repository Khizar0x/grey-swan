import type { WalletName } from '@solana/wallet-adapter-base'
import { WalletReadyState } from '@solana/wallet-adapter-base'
import { useWallet } from '@solana/wallet-adapter-react'
import { C, FONT_HEAD } from '../lib/theme'

// Visual language ported from the Figma mockup's WalletModal, but the wallet
// list itself is real: it comes from useWallet().wallets, which the adapter
// populates from our two explicit adapters (Phantom, Solflare) plus whatever
// else registers itself via the Wallet Standard in this browser (Backpack,
// Glow). select(name) alone is enough to trigger a real connect() — see
// WalletContextProvider.tsx.
export function ConnectWalletModal({ onClose }: { onClose: () => void }) {
  const { wallets, select } = useWallet()

  const installed = wallets.filter((w) => w.readyState === WalletReadyState.Installed)
  const notInstalled = wallets.filter((w) => w.readyState !== WalletReadyState.Installed)

  const handleSelect = (name: WalletName) => {
    select(name)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative mx-4 w-full max-w-sm overflow-hidden rounded-2xl"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pb-4 pt-6" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
              Connect a wallet
            </h3>
            <p className="mt-0.5 text-sm" style={{ color: C.muted }}>
              Choose your preferred wallet to continue
            </p>
          </div>
          <button onClick={onClose} className="p-1 transition-opacity hover:opacity-60" style={{ color: C.faint }}>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-2 p-4">
          {installed.length === 0 && notInstalled.length === 0 && (
            <p className="px-2 py-4 text-center text-sm" style={{ color: C.muted }}>
              No Solana wallet detected in this browser.
            </p>
          )}

          {installed.map((wallet) => (
            <button
              key={wallet.adapter.name}
              onClick={() => handleSelect(wallet.adapter.name)}
              className="flex items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-all"
              style={{ border: `1px solid ${C.border}`, background: 'transparent' }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = C.gold
                ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,162,75,0.08)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = C.border
                ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              }}
            >
              <img src={wallet.adapter.icon} alt="" className="h-7 w-7 rounded-md" />
              <div>
                <div className="font-medium" style={{ color: C.cream }}>
                  {wallet.adapter.name}
                </div>
                <div className="text-xs" style={{ color: C.faint }}>
                  Detected
                </div>
              </div>
              <svg className="ml-auto h-4 w-4" style={{ color: C.faint }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}

          {notInstalled.map((wallet) => (
            <a
              key={wallet.adapter.name}
              href={wallet.adapter.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-4 rounded-xl px-4 py-3.5 text-left opacity-60 transition-all"
              style={{ border: `1px solid ${C.border}`, background: 'transparent' }}
            >
              <img src={wallet.adapter.icon} alt="" className="h-7 w-7 rounded-md" />
              <div>
                <div className="font-medium" style={{ color: C.cream }}>
                  {wallet.adapter.name}
                </div>
                <div className="text-xs" style={{ color: C.faint }}>
                  Not installed — get it
                </div>
              </div>
            </a>
          ))}
        </div>

        <div className="px-6 pb-5 text-center">
          <p className="text-xs" style={{ color: C.faint }}>
            By connecting, you agree to Grey Swan's terms of service
          </p>
        </div>
      </div>
    </div>
  )
}
