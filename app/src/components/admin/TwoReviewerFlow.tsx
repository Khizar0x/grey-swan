import type { Program } from '@coral-xyz/anchor'
import type { PublicKey, Transaction } from '@solana/web3.js'
import { useState } from 'react'
import type { Greyswan } from '../../idl/greyswan.ts'
import { signAsFirstReviewer, signAsSecondReviewerAndSend } from '../../lib/twoReviewer'
import { C, INPUT_STYLE } from '../../lib/theme'
import { Btn } from '../atoms'

// Two different reviewers have to sign this decision. Reviewer one prepares
// and signs it here, then passes the text to reviewer two, who connects their
// own wallet, pastes it and sends it.
export function TwoReviewerFlow({
  program,
  candidates,
  buildTx,
  onDone,
  why,
}: {
  program: Program<Greyswan>
  // The other reviewers on Config (everyone but the connected wallet): the
  // second signer is named inside the transaction, so reviewer one picks them.
  candidates: PublicKey[]
  buildTx: (second: PublicKey) => Promise<Transaction>
  onDone: (signature: string) => void
  why: string
}) {
  const [second, setSecond] = useState('')
  const [encoded, setEncoded] = useState('')
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const prepare = async () => {
    setBusy(true)
    setError(null)
    try {
      const chosen = candidates.find((c) => c.toBase58() === second)
      if (!chosen) throw new Error('Choose the second reviewer first.')
      setEncoded(await signAsFirstReviewer(program, await buildTx(chosen)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      onDone(await signAsSecondReviewerAndSend(program, pasted))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl p-4" style={{ background: C.subtleBg, border: `1px solid ${C.border}` }}>
      <p className="text-sm font-semibold" style={{ color: C.cream }}>
        Two reviewers must sign
      </p>
      <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
        {why} The first reviewer signs here and copies the text. The second reviewer connects their own wallet, pastes it below and sends. The prepared text expires after about a minute, so do both steps promptly. If it expires, start again.
      </p>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
          Step 1, first reviewer
        </p>
        <select value={second} onChange={(e) => setSecond(e.target.value)} aria-label="Second reviewer" style={INPUT_STYLE}>
          <option value="">Choose the second reviewer</option>
          {candidates.map((c) => (
            <option key={c.toBase58()} value={c.toBase58()}>
              {c.toBase58().slice(0, 4)}...{c.toBase58().slice(-4)}
            </option>
          ))}
        </select>
        {candidates.length === 0 && (
          <p className="text-xs" style={{ color: C.rust }}>
            There is no second reviewer on the list yet. The admin needs to add one before this decision can be made.
          </p>
        )}
        <div>
          <Btn variant="secondary" disabled={busy || !second} onClick={() => void prepare()}>
            {busy && !encoded ? 'Preparing…' : encoded ? 'Prepare again' : 'Sign as first reviewer'}
          </Btn>
        </div>
        {encoded && (
          <textarea
            readOnly
            rows={3}
            value={encoded}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Prepared decision to pass to the second reviewer"
            style={{ ...INPUT_STYLE, resize: 'none', fontSize: '0.7rem' }}
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
          Step 2, second reviewer
        </p>
        <textarea
          rows={3}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="Paste the prepared text here"
          aria-label="Paste the prepared decision"
          style={{ ...INPUT_STYLE, resize: 'none', fontSize: '0.7rem' }}
        />
        <div>
          <Btn disabled={busy || pasted.trim().length === 0} onClick={() => void send()}>
            {busy && pasted ? 'Sending…' : 'Sign and send'}
          </Btn>
        </div>
      </div>

      {error && (
        <p className="text-sm" style={{ color: C.rust }}>
          {error}
        </p>
      )}
    </div>
  )
}
