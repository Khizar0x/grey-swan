import { useWallet } from '@solana/wallet-adapter-react'
import { useMemo } from 'react'
import { useAuthContext } from './AuthContext'
import { useConversationSummaries } from './useConversationSummaries'
import { useRentals } from './useRentals'

// One-shot (no polling) total unread count across every conversation the
// connected wallet is a party to — powers the header nav badge. Matches
// useUnreadCounts.ts's own one-shot-per-load pattern; the /messages inbox
// page itself polls on a slower interval only while it's actually open
// (see useConversationSummaries).
export function useUnreadMessagesTotal(): number {
  const { publicKey } = useWallet()
  const { token } = useAuthContext()
  const { rentals } = useRentals(!!publicKey)

  const rentalPubkeys = useMemo(
    () =>
      publicKey
        ? rentals.filter((r) => r.account.owner.equals(publicKey) || r.account.renter.equals(publicKey)).map((r) => r.publicKey.toBase58())
        : [],
    [rentals, publicKey],
  )
  const { summaries } = useConversationSummaries(rentalPubkeys, token)

  let total = 0
  for (const s of summaries.values()) total += s.unreadCount
  return total
}
