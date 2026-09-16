import { useState, type FormEvent } from 'react'
import { C, INPUT_STYLE } from '../lib/theme'
import { Btn } from './atoms'

export function ProfileForm({
  showNameField = true,
  emailRequired = false,
  submitLabel = 'Save',
  onSubmit,
}: {
  showNameField?: boolean
  emailRequired?: boolean
  submitLabel?: string
  onSubmit: (name: string, email: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (showNameField && !name.trim()) {
      setError('Enter your name.')
      return
    }
    if (emailRequired && !email.trim()) {
      setError('Enter an email address.')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(name.trim(), email.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {showNameField && (
        <div>
          <label className="mb-1.5 block text-sm font-medium" style={{ color: C.muted }}>
            Name
          </label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="How should we address you?" style={INPUT_STYLE} />
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium" style={{ color: C.muted }}>
          Email {emailRequired ? '' : '(optional)'}
        </label>
        <p className="mb-2 text-xs leading-relaxed" style={{ color: C.faint }}>
          Used only for rental notifications — confirmation deadlines, handover reminders, and deposit release updates.
        </p>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} placeholder="you@example.com" style={INPUT_STYLE} />
      </div>

      {error && (
        <p className="text-sm" style={{ color: C.rust }}>
          {error}
        </p>
      )}

      <Btn type="submit" full disabled={submitting}>
        {submitting ? 'Saving…' : submitLabel}
      </Btn>
    </form>
  )
}
