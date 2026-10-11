import { useState } from 'react'
import { type RenterAnswers, STATEMENT_MAX, type YesNoUnsure } from '../lib/disputeAnswersApi'
import { C, INPUT_STYLE } from '../lib/theme'
import { Btn } from './atoms'

function Choice<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string
  legend: string
  value: T | ''
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium" style={{ color: C.muted }}>
        {legend}
      </legend>
      <div className="flex flex-wrap gap-4 text-sm" style={{ color: C.cream }}>
        {options.map(([v, text]) => (
          <label key={v} className="flex items-center gap-2">
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
            {text}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

const YNU: [YesNoUnsure, string][] = [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['unsure', 'Not sure'],
]

// The renter's reply to the owner's report. Saved once.
export function RenterDisputeResponse({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (a: RenterAnswers) => void }) {
  const [agrees, setAgrees] = useState<'yes' | 'no' | ''>('')
  const [duringUse, setDuringUse] = useState<YesNoUnsure | ''>('')
  const [duringPacking, setDuringPacking] = useState<YesNoUnsure | ''>('')
  const [statement, setStatement] = useState('')

  const ready = agrees !== '' && duringUse !== '' && duringPacking !== '' && statement.trim().length > 0

  return (
    <div className="flex flex-col gap-5 rounded-xl p-4" style={{ border: `1px solid ${C.border}`, background: C.subtleBg }}>
      <div>
        <h3 className="mb-1 text-base font-semibold" style={{ color: C.cream }}>
          Your side of things
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
          The owner has reported damage. Your answers are read alongside the photos from every stage of the rental.
        </p>
      </div>
      <Choice name="agrees" legend="Do you agree the damage is there?" value={agrees} options={[['yes', 'Yes'], ['no', 'No']]} onChange={setAgrees} />
      <Choice name="during-use" legend="Did it happen while you were using the item?" value={duringUse} options={YNU} onChange={setDuringUse} />
      <Choice name="during-packing" legend="Could it have happened while packing or posting it back?" value={duringPacking} options={YNU} onChange={setDuringPacking} />
      <div>
        <label className="mb-1.5 block text-sm font-medium" style={{ color: C.muted }} htmlFor="renter-statement">
          Tell us what happened
        </label>
        <textarea id="renter-statement" rows={5} value={statement} onChange={(e) => setStatement(e.target.value)} maxLength={STATEMENT_MAX} style={{ ...INPUT_STYLE, resize: 'none' }} />
        <p className="mt-1 text-right text-xs" style={{ color: C.faint }}>
          {statement.length} / {STATEMENT_MAX}
        </p>
      </div>
      {error && (
        <p className="text-sm" style={{ color: C.rust }}>
          {error}
        </p>
      )}
      <div>
        <Btn disabled={busy || !ready} onClick={() => onSubmit({ agrees: agrees as 'yes' | 'no', duringUse: duringUse as YesNoUnsure, duringPacking: duringPacking as YesNoUnsure, statement: statement.trim() })}>
          {busy ? 'Sending…' : 'Send my response'}
        </Btn>
      </div>
    </div>
  )
}
