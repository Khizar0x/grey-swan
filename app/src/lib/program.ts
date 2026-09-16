import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useMemo } from 'react'
import idl from '../idl/greyswan.json'
import type { Greyswan } from '../idl/greyswan.ts'

// Browsing listings shouldn't require connecting a wallet first. When
// disconnected, the provider gets this inert stand-in instead of a real
// signer — reads (program.account.*.fetch/.all) work fine against it, and
// any accidental write attempt fails loudly rather than silently.
const READ_ONLY_WALLET = {
  publicKey: PublicKey.default,
  signTransaction: async () => {
    throw new Error('Connect a wallet to sign transactions.')
  },
  signAllTransactions: async () => {
    throw new Error('Connect a wallet to sign transactions.')
  },
}

// useWallet() (used for the UI in Layout.tsx) tracks connection state — is a
// wallet picked, is it connecting, etc. Anchor doesn't want any of that: it
// wants something that can actually sign. useAnchorWallet() adapts the
// connected wallet down to that minimal { publicKey, signTransaction,
// signAllTransactions } shape, and returns undefined until one is connected.
//
// The IDL json (snake_case, matching the Rust struct/field names) is the
// runtime value Anchor decodes accounts and builds instructions with. The
// .ts file next to it is camelCase and exists only so TypeScript can type
// `program.methods.rentItem(...)` / `program.account.listing.fetch(...)` —
// it has no effect at runtime, which is why the JSON is cast `as Greyswan`.
export function useProgram(): Program<Greyswan> {
  const { connection } = useConnection()
  const wallet = useAnchorWallet()

  return useMemo(() => {
    const provider = new AnchorProvider(connection, wallet ?? READ_ONLY_WALLET, {
      commitment: 'confirmed',
    })

    return new Program<Greyswan>(idl as Greyswan, provider)
  }, [connection, wallet])
}
