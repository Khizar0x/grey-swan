import { C, FONT_HEAD } from '../lib/theme'
import { ProfileForm } from './ProfileForm'

// Shown once per connect, per CLAUDE.md's "on first connect, pop up asking
// for name and email" — dismissible, since a browsing renter shouldn't be
// blocked from the app just for not filling this in yet. Email is optional
// here; it only becomes required later, at the point someone tries to list
// an item (see the inline gate in ListItem.tsx).
export function ProfileModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (name: string, email: string) => Promise<void> }) {
  const handleSubmit = async (name: string, email: string) => {
    await onSubmit(name, email)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}>
      <div className="relative mx-4 w-full max-w-sm overflow-hidden rounded-2xl" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div className="px-6 pb-4 pt-6" style={{ borderBottom: `1px solid ${C.border}` }}>
          <h3 className="text-lg font-semibold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
            Welcome to Grey Swan
          </h3>
          <p className="mt-0.5 text-sm" style={{ color: C.muted }}>
            Tell us who you are, so the other side of a rental knows who they're dealing with.
          </p>
        </div>
        <div className="p-6">
          <ProfileForm showNameField emailRequired={false} submitLabel="Save" onSubmit={handleSubmit} />
          <button onClick={onClose} className="mt-3 w-full text-center text-xs underline" style={{ color: C.faint }}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
