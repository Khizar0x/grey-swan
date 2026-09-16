import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useEffect, useState } from 'react'

// Subscribes to the connected wallet's lamport balance over the RPC
// websocket rather than polling — updates live as funds move (e.g. right
// after a rent_item or confirm_return transaction lands).
export function useSolBalance(): number | null {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    if (!publicKey) {
      setBalance(null)
      return
    }

    let cancelled = false
    connection
      .getBalance(publicKey)
      .then((lamports) => {
        if (!cancelled) setBalance(lamports / 1e9)
      })
      .catch(() => {})

    const id = connection.onAccountChange(publicKey, (info) => {
      setBalance(info.lamports / 1e9)
    })

    return () => {
      cancelled = true
      connection.removeAccountChangeListener(id)
    }
  }, [connection, publicKey])

  return balance
}
