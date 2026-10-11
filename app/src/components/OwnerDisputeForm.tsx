import { useMemo, useState } from 'react'
import { AREA_CHOICES, closeupShots, shotLabel } from '../lib/handoverShots'
import { composeReason, DAMAGE_TYPE_OPTIONS, type OwnerAnswers, type Severity, STATEMENT_MAX } from '../lib/disputeAnswersApi'
import { C, INPUT_STYLE } from '../lib/theme'
import { Btn } from './atoms'
import { HandoverCapture } from './HandoverCapture'

// The owner's side of "Something's not right" after a return: a few agreed
// questions, fresh close-up photos from the in-app camera (with their own
// photo code) and a short statement. The page decides what to do with it.
export function OwnerDisputeForm({
  rentalPubkey,
  token,
  busy,
  submitLabel = 'Send for review',
  onSubmit,
  onCancel,
}: {
  rentalPubkey: string
  token: string
  busy: boolean
  submitLabel?: string
  onSubmit: (reason: string, answers: OwnerAnswers) => void
  onCancel: () => void
}) {
  const [areas, setAreas] = useState<string[]>([])
  const [damageType, setDamageType] = useState('')
  const [severity, setSeverity] = useState<Severity | ''>('')
  const [missingAccessories, setMissingAccessories] = useState('')
  const [photosCid, setPhotosCid] = useState('')
  const [statement, setStatement] = useState('')

  const specs = useMemo(() => closeupShots(AREA_CHOICES.filter((a) => areas.includes(a.id)).map((a) => a.id)), [areas])

  const ready = areas.length > 0 && damageType !== '' && severity !== '' && photosCid !== '' && statement.trim().length > 0

  const toggleArea = (id: string) => setAreas((cur) => (cur.includes(id) ? cur.filter((a) => a !== id) : [...cur, id]))

  const submit = () => {
    if (!ready) return
    const answers: OwnerAnswers = {
      areas: AREA_CHOICES.filter((a) => areas.includes(a.id)).map((a) => a.id),
      damageType,
      severity,
      missingAccessories: missingAccessories.trim(),
      photosCid,
      statement: statement.trim(),
    }
    onSubmit(composeReason(answers, shotLabel), answers)
  }

  const label = 'mb-1.5 block text-sm font-medium'

  return (
    <div className="flex flex-col gap-5 rounded-xl p-4" style={{ border: `1px solid ${C.border}`, background: C.subtleBg }}>
      <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
        We're sorry something isn't right. A few answers and fresh photos help us look into it fairly. The renter will be able to respond.
      </p>

      <fieldset>
        <legend className={label} style={{ color: C.muted }}>
          Which parts are damaged?
        </legend>
        <div className="flex flex-wrap gap-2">
          {AREA_CHOICES.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={areas.includes(a.id)}
              onClick={() => toggleArea(a.id)}
              className="rounded-full px-3 py-1.5 text-xs font-medium"
              style={
                areas.includes(a.id)
                  ? { background: C.primary, color: C.onAccent, border: `1px solid ${C.primary}` }
                  : { background: 'transparent', color: C.cream, border: `1px solid ${C.border}` }
              }
            >
              {a.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label className={label} style={{ color: C.muted }} htmlFor="damage-type">
          What kind of damage is it?
        </label>
        <select id="damage-type" value={damageType} onChange={(e) => setDamageType(e.target.value)} style={INPUT_STYLE}>
          <option value="">Choose one</option>
          {DAMAGE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className={label} style={{ color: C.muted }}>
          Is it cosmetic or does it affect how the item works?
        </legend>
        <div className="flex flex-wrap gap-4 text-sm" style={{ color: C.cream }}>
          <label className="flex items-center gap-2">
            <input type="radio" name="severity" checked={severity === 'cosmetic'} onChange={() => setSeverity('cosmetic')} />
            Cosmetic, it looks different
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="severity" checked={severity === 'functional'} onChange={() => setSeverity('functional')} />
            Functional, it works differently
          </label>
        </div>
      </fieldset>

      <div>
        <label className={label} style={{ color: C.muted }} htmlFor="missing-accessories">
          Is anything missing from what was sent? (optional)
        </label>
        <input
          id="missing-accessories"
          type="text"
          value={missingAccessories}
          onChange={(e) => setMissingAccessories(e.target.value)}
          maxLength={200}
          placeholder="For example, the charger or the case"
          style={INPUT_STYLE}
        />
      </div>

      <div>
        <p className={label} style={{ color: C.muted }}>
          Fresh close-up photos
        </p>
        {areas.length === 0 ? (
          <p className="text-xs" style={{ color: C.faint }}>
            Choose the damaged parts above, then you will take one close-up of each.
          </p>
        ) : (
          <HandoverCapture rentalPubkey={rentalPubkey} phase={5} hasParcel={false} specs={specs} token={token} onChange={setPhotosCid} />
        )}
      </div>

      <div>
        <label className={label} style={{ color: C.muted }} htmlFor="owner-statement">
          Tell us what happened
        </label>
        <textarea
          id="owner-statement"
          rows={5}
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          maxLength={STATEMENT_MAX}
          style={{ ...INPUT_STYLE, resize: 'none' }}
        />
        <p className="mt-1 text-right text-xs" style={{ color: C.faint }}>
          {statement.length} / {STATEMENT_MAX}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Btn variant="danger" disabled={busy || !ready} onClick={submit}>
          {busy ? 'Submitting…' : submitLabel}
        </Btn>
        <button type="button" onClick={onCancel} className="text-xs underline" style={{ color: C.faint }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
