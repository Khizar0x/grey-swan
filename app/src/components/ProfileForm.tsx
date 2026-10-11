import { forwardRef, useEffect, useImperativeHandle, useState, type FormEvent } from 'react'
import { C, INPUT_STYLE } from '../lib/theme'
import { Btn } from './atoms'

export interface ProfileFormHandle {
  // Validates the current fields and, if they pass, calls the onSubmit prop
  // (same contract either way) and reports whether it succeeded. Exists for
  // the renderFormTag={false} case: a page embedding this inline inside its
  // own <form> drives submission itself (via this ref) rather than this
  // component owning a second, nested <form>/submit button of its own.
  submit: () => Promise<boolean>
}

interface ProfileFormProps {
  showNameField?: boolean
  emailRequired?: boolean
  submitLabel?: string
  // true (default): renders its own <form> and submit button — the
  // standalone case, e.g. ProfileModal. false: renders just the bare
  // fields, no <form> and no button — meant to sit inside a page's own
  // outer <form>, which calls submit() via the ref above instead.
  renderFormTag?: boolean
  // Pre-fills an existing profile's values (Account Settings editing an
  // already-saved profile) rather than starting blank (the first-connect
  // prompt/email-gate cases, where there's nothing to pre-fill yet). Synced
  // via the effect below since the real values often arrive async, after
  // this component has already mounted with nothing to show.
  initialName?: string
  initialEmail?: string
  onSubmit: (name: string, email: string) => Promise<void>
}

export const ProfileForm = forwardRef<ProfileFormHandle, ProfileFormProps>(function ProfileForm(
  { showNameField = true, emailRequired = false, submitLabel = 'Save', renderFormTag = true, initialName = '', initialEmail = '', onSubmit },
  ref,
) {
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState(initialEmail)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(initialName)
  }, [initialName])

  useEffect(() => {
    setEmail(initialEmail)
  }, [initialEmail])

  const runSubmit = async (): Promise<boolean> => {
    setError(null)
    if (showNameField && !name.trim()) {
      setError('Enter your name.')
      return false
    }
    if (emailRequired && !email.trim()) {
      setError('Enter an email address.')
      return false
    }
    setSubmitting(true)
    try {
      await onSubmit(name.trim(), email.trim())
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setSubmitting(false)
    }
  }

  useImperativeHandle(ref, () => ({ submit: runSubmit }))

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault()
    void runSubmit()
  }

  const fields = (
    <>
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
          Used only for rental notifications: confirmation deadlines, handover reminders, and deposit release updates.
        </p>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} placeholder="you@example.com" style={INPUT_STYLE} />
      </div>

      {error && (
        <p className="text-sm" style={{ color: C.rust }}>
          {error}
        </p>
      )}
    </>
  )

  if (!renderFormTag) {
    return <div className="flex flex-col gap-4">{fields}</div>
  }

  return (
    <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
      {fields}
      <Btn type="submit" full disabled={submitting}>
        {submitting ? 'Saving…' : submitLabel}
      </Btn>
    </form>
  )
})
