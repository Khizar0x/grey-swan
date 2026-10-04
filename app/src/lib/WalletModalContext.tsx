import { createContext, useContext, useState, type ReactNode } from 'react'
import { ConnectWalletModal } from '../components/ConnectWalletModal'

interface WalletModalState {
  open: () => void
}

const WalletModalContext = createContext<WalletModalState | null>(null)

// One modal instance, opened from anywhere — the header's corner button and
// a commit action deep in a page (Rent Now, Create a listing) both need to
// trigger the same connect flow without each page owning its own copy of
// the modal's open/closed state.
export function WalletModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <WalletModalContext.Provider value={{ open: () => setIsOpen(true) }}>
      {children}
      {isOpen && <ConnectWalletModal onClose={() => setIsOpen(false)} />}
    </WalletModalContext.Provider>
  )
}

export function useWalletModal(): WalletModalState {
  const ctx = useContext(WalletModalContext)
  if (!ctx) throw new Error('useWalletModal must be used within WalletModalProvider')
  return ctx
}
