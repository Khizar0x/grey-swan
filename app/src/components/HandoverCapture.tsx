import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchPhaseCode } from '../lib/phaseCodeApi'
import { type CaptureSource, type ManifestShot, pinFile, pinHandoverManifest } from '../lib/ipfs'
import { MISSING_ITEM_SHOTS, shotsForPhase } from '../lib/handoverShots'
import { C, FONT_HEAD } from '../lib/theme'
import { Btn } from './atoms'
import { CameraCapture } from './CameraCapture'

interface ShotState {
  previewUrl: string
  capture: CaptureSource
  status: 'uploading' | 'done' | 'error'
  cid?: string
}

// Guided, camera-only photo step for one handover phase. It reports a single
// manifest CID through onChange (or '' while anything is missing or still
// uploading), so the page's submit button and the program call stay exactly
// as they were with the old free-form field.
export function HandoverCapture({
  rentalPubkey,
  phase,
  hasParcel,
  variant,
  token,
  onChange,
}: {
  rentalPubkey: string
  phase: 1 | 2 | 3 | 4
  hasParcel: boolean
  // 'missing': the item never arrived, so the one photo is the delivery spot.
  variant?: 'missing'
  token: string
  onChange: (manifestCid: string) => void
}) {
  const specs = useMemo(() => (variant === 'missing' ? MISSING_ITEM_SHOTS : shotsForPhase(phase, hasParcel)), [phase, hasParcel, variant])
  const [code, setCode] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [codeAttempt, setCodeAttempt] = useState(0)
  const [shots, setShots] = useState<Record<string, ShotState>>({})
  const [active, setActive] = useState<string | null>(specs[0]?.id ?? null)
  const [manifestState, setManifestState] = useState<'idle' | 'pinning' | 'error'>('idle')
  const [manifestAttempt, setManifestAttempt] = useState(0)

  const onChangeRef = useRef(onChange)
  const shotsRef = useRef(shots)
  useEffect(() => {
    onChangeRef.current = onChange
    shotsRef.current = shots
  })

  // A stale CID from a previous mount (for example switching between the
  // confirm and report forms) must not leave submit enabled.
  useEffect(() => {
    onChangeRef.current('')
  }, [])

  useEffect(() => {
    let cancelled = false
    setCodeError(null)
    fetchPhaseCode(rentalPubkey, phase, token)
      .then((c) => {
        if (!cancelled) setCode(c)
      })
      .catch((err) => {
        if (!cancelled) setCodeError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [rentalPubkey, phase, token, codeAttempt])

  useEffect(
    () => () => {
      Object.values(shotsRef.current).forEach((s) => URL.revokeObjectURL(s.previewUrl))
    },
    [],
  )

  const requiredDone = specs.filter((s) => s.required && shots[s.id]?.status === 'done').length
  const requiredTotal = specs.filter((s) => s.required).length
  const anyUploading = specs.some((s) => shots[s.id]?.status === 'uploading')
  const complete = requiredDone === requiredTotal && !anyUploading
  // Changes whenever a photo is added, replaced or removed.
  const cidKey = specs.map((s) => `${s.id}:${shots[s.id]?.status === 'done' ? shots[s.id].cid : ''}`).join('|')

  useEffect(() => {
    onChangeRef.current('')
    if (!complete || !code) {
      setManifestState('idle')
      return
    }
    let cancelled = false
    setManifestState('pinning')
    const present = specs.filter((s) => shotsRef.current[s.id]?.status === 'done')
    const meta: ManifestShot[] = present.map((s) => ({ shot: s.id, capture: shotsRef.current[s.id].capture }))
    pinHandoverManifest(
      present.map((s) => shotsRef.current[s.id].cid as string),
      meta,
      code,
    )
      .then((cid) => {
        if (cancelled) return
        setManifestState('idle')
        onChangeRef.current(cid)
      })
      .catch(() => {
        if (!cancelled) setManifestState('error')
      })
    return () => {
      cancelled = true
    }
    // cidKey covers every input that changes the manifest contents.
  }, [complete, code, cidKey, manifestAttempt, specs])

  const nextMissing = useCallback(
    (from: Record<string, ShotState>, skip?: string) => specs.find((s) => s.id !== skip && !from[s.id])?.id ?? null,
    [specs],
  )

  const handleCapture = (shotId: string) => (blob: Blob, source: CaptureSource) => {
    const previewUrl = URL.createObjectURL(blob)
    const previous = shotsRef.current[shotId]
    if (previous) URL.revokeObjectURL(previous.previewUrl)
    const next: Record<string, ShotState> = { ...shotsRef.current, [shotId]: { previewUrl, capture: source, status: 'uploading' } }
    shotsRef.current = next
    setShots(next)
    setActive(nextMissing(next))
    pinFile(blob, `${shotId}.jpg`)
      .then((cid) => {
        setShots((cur) => (cur[shotId]?.previewUrl === previewUrl ? { ...cur, [shotId]: { ...cur[shotId], status: 'done', cid } } : cur))
      })
      .catch(() => {
        setShots((cur) => (cur[shotId]?.previewUrl === previewUrl ? { ...cur, [shotId]: { ...cur[shotId], status: 'error' } } : cur))
      })
  }

  const activeSpec = specs.find((s) => s.id === active)
  const doneCount = Math.min(requiredDone, requiredTotal)

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl p-4" style={{ background: C.accentSoft, border: `1px solid ${C.border}` }}>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide" style={{ color: C.gold }}>
          Your photo code
        </p>
        {code ? (
          <p className="mb-2 text-2xl font-bold tracking-widest" style={{ fontFamily: FONT_HEAD, color: C.cream }} data-testid="phase-code">
            {code}
          </p>
        ) : codeError ? (
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <p className="text-sm" style={{ color: C.rust }}>
              {codeError}
            </p>
            <button type="button" className="text-sm underline" style={{ color: C.gold }} onClick={() => setCodeAttempt((a) => a + 1)}>
              Try again
            </button>
          </div>
        ) : (
          <p className="mb-2 text-sm" style={{ color: C.muted }}>
            Getting your code…
          </p>
        )}
        <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
          Write this code on a piece of paper and keep it in view for the front photo. It is yours for this step only and will not change.
        </p>
      </div>

      {code && (
        <>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium" style={{ color: C.muted }}>
              <span>
                {doneCount} of {requiredTotal} photos
              </span>
              {anyUploading && <span>Saving…</span>}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: C.border }}>
              <div className="h-full rounded-full transition-[width]" style={{ width: `${(doneCount / requiredTotal) * 100}%`, background: C.primary }} />
            </div>
          </div>

          {activeSpec && (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: C.cream }}>
                  {activeSpec.label}
                  {!activeSpec.required && <span style={{ color: C.faint }}> (optional)</span>}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
                  {activeSpec.hint}
                </p>
              </div>
              <CameraCapture onCapture={handleCapture(activeSpec.id)} />
              {!activeSpec.required && (
                <button type="button" className="self-start text-xs underline" style={{ color: C.faint }} onClick={() => setActive(nextMissing(shots, activeSpec.id))}>
                  Skip this one
                </button>
              )}
            </div>
          )}

          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Photo checklist">
            {specs.map((s) => {
              const st = shots[s.id]
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActive(s.id)}
                    className="flex w-full flex-col gap-1 text-left"
                    aria-label={st ? `Retake ${s.label}` : `Take ${s.label}`}
                    aria-current={active === s.id}
                  >
                    <span
                      className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg text-xs"
                      style={{ background: C.surface2, border: `1px solid ${active === s.id ? C.primary : st?.status === 'error' ? C.rust : C.border}`, color: C.faint }}
                    >
                      {st ? <img src={st.previewUrl} alt={s.label} className="h-full w-full object-cover" /> : s.required ? 'Needed' : 'Optional'}
                    </span>
                    <span className="text-xs font-medium" style={{ color: C.muted }}>
                      {s.label}
                    </span>
                    <span className="text-xs" style={{ color: st?.status === 'error' ? C.rust : C.faint }}>
                      {!st ? ' ' : st.status === 'uploading' ? 'Saving…' : st.status === 'error' ? 'Failed, retake' : st.capture === 'uploaded' ? 'Uploaded, not captured' : 'Retake'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {manifestState === 'error' && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm" style={{ color: C.rust }}>
                We couldn't save your photos together. Check your connection.
              </p>
              <Btn variant="secondary" onClick={() => setManifestAttempt((a) => a + 1)}>
                Try again
              </Btn>
            </div>
          )}
          {complete && manifestState === 'pinning' && (
            <p className="text-xs" style={{ color: C.muted }}>
              Finishing up…
            </p>
          )}
        </>
      )}
    </div>
  )
}
