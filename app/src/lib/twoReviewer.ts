import type { Program } from '@coral-xyz/anchor'
import { Transaction } from '@solana/web3.js'
import type { Greyswan } from '../idl/greyswan.ts'

// Some decisions need two different reviewers to sign the same transaction
// (a large deposit, a Major share to the owner, or more than the deposit back
// to the renter). One wallet can't do both, so the flow is:
//   1. reviewer one signs a prepared transaction and copies the text out,
//   2. reviewer two pastes it, signs too and sends it.
// A Solana transaction is only valid for roughly a minute after it is
// prepared, so both steps have to happen quickly. If it has expired, reviewer
// one simply prepares it again.

function connectedWallet(program: Program<Greyswan>) {
  const wallet = program.provider.wallet
  if (!wallet) throw new Error('Connect a wallet first.')
  return wallet
}

export async function signAsFirstReviewer(program: Program<Greyswan>, tx: Transaction): Promise<string> {
  const provider = program.provider
  const wallet = connectedWallet(program)
  tx.feePayer = wallet.publicKey
  tx.recentBlockhash = (await provider.connection.getLatestBlockhash('confirmed')).blockhash
  const signed = await wallet.signTransaction(tx)
  return signed.serialize({ requireAllSignatures: false }).toString('base64')
}

export async function signAsSecondReviewerAndSend(program: Program<Greyswan>, encoded: string): Promise<string> {
  const provider = program.provider
  let tx: Transaction
  try {
    tx = Transaction.from(Buffer.from(encoded.trim(), 'base64'))
  } catch {
    throw new Error("That doesn't look like a prepared decision. Copy the whole text again.")
  }
  const signed = await connectedWallet(program).signTransaction(tx)
  const signature = await provider.connection.sendRawTransaction(signed.serialize())
  await provider.connection.confirmTransaction(signature, 'confirmed')
  return signature
}
