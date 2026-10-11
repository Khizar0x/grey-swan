import type { Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { useEffect, useState } from 'react'
import type { Greyswan } from '../idl/greyswan.ts'

type DisputeAccount = Awaited<ReturnType<Program<Greyswan>['account']['dispute']['fetch']>>
type ConfigAccount = Awaited<ReturnType<Program<Greyswan>['account']['config']['fetch']>>

export interface DisputeState {
  dispute: DisputeAccount | null
  config: ConfigAccount | null
  loaded: boolean
}

// Reads the rental's Dispute account (null for a rental disputed before
// Dispute accounts existed) and the Config it is judged by. `refreshKey`
// changes whenever the page has just re-read the rental, so the verdict never
// lags behind a mutation. It also refreshes every 20 seconds.
export function useDispute(program: Program<Greyswan>, rentalPubkey: string, refreshKey: unknown): DisputeState {
  const [state, setState] = useState<DisputeState>({ dispute: null, config: null, loaded: false })
  // A verdict is posted by a separate service, not by anything on this page,
  // so the page re-reads the account now and then instead of waiting for a
  // reload.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 20_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    const rental = new PublicKey(rentalPubkey)
    const [disputePda] = PublicKey.findProgramAddressSync([Buffer.from('dispute'), rental.toBuffer()], program.programId)
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], program.programId)
    Promise.all([program.account.dispute.fetchNullable(disputePda), program.account.config.fetch(configPda).catch(() => null)])
      .then(([dispute, config]) => {
        if (!cancelled) setState({ dispute, config, loaded: true })
      })
      .catch(() => {
        if (!cancelled) setState({ dispute: null, config: null, loaded: true })
      })
    return () => {
      cancelled = true
    }
  }, [program, rentalPubkey, refreshKey, tick])

  return state
}
