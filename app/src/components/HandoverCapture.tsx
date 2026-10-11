import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchPhaseCode } from '../lib/phaseCodeApi'
import { type CaptureSource, gatewayUrl, type ManifestShot, pinFile, pinHandoverManifest } from '../lib/ipfs'
import { type ShotSpec, shotsForPhase } from '../lib/handoverShots'
import { C, FONT_HEAD } from '../lib/theme'
import { Btn } from './atoms'
import { CameraCapture } from './CameraCapture'

interface ShotState {
  previewUrl: string
  capture: CaptureSource
  status: 'uploading' | 'done' | 'error'
  cid?: string
}

// Chosen shots are kept in this browser so a reload does not lose them. Only
// pinned IDs and flags are stored, never image bytes. The key includes the
// shot list, so a different list for the same phase (for example the
// "item never arrived" photo) keeps its own saved set.
interface SavedShots {
  code: string
  shots: Record<string, { cid: string; capture: CaptureSource }>
  skipped: string[]
}

const SAVED_PREFIX = 'gs-shots:v1:'

function savedKey(rentalPubkey: string, phase: number, specs: ShotSpec[]) {
  return `${SAVED_PREFIX}${rentalPubkey}:${phase}:${specs.map((s) => s.id).join(',')}`
}

function loadSaved(key: string, specs: ShotSpec[]): SavedShots | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<SavedShots>
    if (typeof v.code !== 'string' || !v.shots || typeof v.shots !== 'object') return null
    const ids = new Set(specs.map((s) => s.id))
    const shots: SavedShots['shots'] = {}
    for (const [id, shot] of Object.entries(v.shots)) {
      if (ids.has(id) && shot && typeof shot.cid === 'string' && shot.cid) {
        shots[id] = { cid: shot.cid, capture: shot.capture === 'uploaded' ? 'uploaded' : 'captured' }
      }
    }
    const skipped = Array.isArray(v.skipped) ? v.skipped.filter((id): id is string => typeof id === 'string' && ids.has(id)) : []
    return { code: v.code, shots, skipped }
  } catch {
    return null
  }
}

function writeSaved(key: string, value: SavedShots | null) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value))
    else localStorage.removeItem(key)
  } catch {
    // Storage blocked or full: the page works the same, just without saving.
  }
}

// Called once a phase has been submitted, so old photos never come back.
export function clearSavedShots(rentalPubkey: string, phase: number) {
  try {
    const prefix = `${SAVED_PREFIX}${rentalPubkey}:${phase}:`
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(prefix)) localStorage.removeItem(key)
    }
  } catch {
    // Nothing to clear without storage.
  }
}

// Guided, camera-only photo step for one handover phase. It reports a single
// manifest CID through onChange (or '' while anything is missing or still
// uploading), so the page's submit button and the program call stay exactly
// as they were with the old free-form field.
export function HandoverCapture({
  rentalPubkey,
  phase,
  hasParcel,
  specs: specsOverride,
  token,
  onChange,
}: {
  rentalPubkey: string
  // 1 to 4 are the handovers; 5 is the owner's close-ups for a damage dispute.
  phase: 1 | 2 | 3 | 4 | 5
  hasParcel: boolean
  // Replaces the standard shot list (for example the delivery-spot photo when
  // an item never arrived, or one close-up per damaged area).
  specs?: ShotSpec[]
  token: string
  onChange: (manifestCid: string) => void
}) {
  const specs = useMemo(() => specsOverride ?? shotsForPhase(phase as 1 | 2 | 3 | 4, hasParcel), [phase, hasParcel, specsOverride])
  const [code, setCode] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [codeAttempt, setCodeAttempt] = useState(0)
  const storageKey = savedKey(rentalPubkey, phase, specs)
  const [saved] = useState(() => loadSaved(storageKey, specs))
  const [shots, setShots] = useState<Record<string, ShotState>>(() =>
    Object.fromEntries(
      Object.entries(saved?.shots ?? {}).map(([id, v]) => [id, { previewUrl: gatewayUrl(v.cid), capture: v.capture, status: 'done' as const, cid: v.cid }]),
    ),
  )
  // Optional shots the person chose to skip, recorded in the manifest.
  const [skipped, setSkipped] = useState<string[]>(saved?.skipped ?? [])
  const skippedRef = useRef(skipped)
  const [active, setActive] = useState<string | null>(
    () => specs.find((s) => !saved?.shots[s.id] && !saved?.skipped.includes(s.id))?.id ?? specs[0]?.id ?? null,
  )
  const [manifestState, setManifestState] = useState<'idle' | 'pinning' | 'error'>('idle')
  const [manifestAttempt, setManifestAttempt] = useState(0)

  const onChangeRef = useRef(onChange)
  const shotsRef = useRef(shots)
  useEffect(() => {
    onChangeRef.current = onChange
    shotsRef.current = shots
    skippedRef.current = skipped
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
        if (cancelled) return
        // Saved photos belong to the code they were taken under.
        if (saved && saved.code !== c) {
          shotsRef.current = {}
          skippedRef.current = []
          setShots({})
          setSkipped([])
          setActive(specs[0]?.id ?? null)
        }
        setCode(c)
      })
      .catch((err) => {
        if (!cancelled) setCodeError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
    // saved and specs are fixed for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rentalPubkey, phase, token, codeAttempt])

  // Keep the saved copy in step with what is on screen. Waits for the code so
  // a stale set is never written under a code it was not taken with.
  useEffect(() => {
    if (!code) return
    const done = Object.entries(shots).filter(([, v]) => v.status === 'done' && v.cid)
    if (done.length === 0 && skipped.length === 0) {
      writeSaved(storageKey, null)
      return
    }
    writeSaved(storageKey, {
      code,
      shots: Object.fromEntries(done.map(([id, v]) => [id, { cid: v.cid as string, capture: v.capture }])),
      skipped,
    })
  }, [code, shots, skipped, storageKey])

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
  const cidKey = specs.map((s) => `${s.id}:${shots[s.id]?.status === 'done' ? shots[s.id].cid : ''}`).join('|') + `#${skipped.join(',')}`

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
      specs.filter((s) => !s.required && skippedRef.current.includes(s.id) && shotsRef.current[s.id]?.status !== 'done').map((s) => s.id),
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
    (from: Record<string, ShotState>, skip?: string) =>
      specs.find((s) => s.id !== skip && !from[s.id] && !skippedRef.current.includes(s.id))?.id ?? null,
    [specs],
  )

  const handleCapture = (shotId: string) => (blob: Blob, source: CaptureSource) => {
    const previewUrl = URL.createObjectURL(blob)
    const previous = shotsRef.current[shotId]
    if (previous) URL.revokeObjectURL(previous.previewUrl)
    const next: Record<string, ShotState> = { ...shotsRef.current, [shotId]: { previewUrl, capture: source, status: 'uploading' } }
    shotsRef.current = next
    // Taking a photo of a shot undoes an earlier skip.
    skippedRef.current = skippedRef.current.filter((id) => id !== shotId)
    setSkipped(skippedRef.current)
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
                <button
                  type="button"
                  className="self-start text-xs underline"
                  style={{ color: C.faint }}
                  onClick={() => {
                    skippedRef.current = [...skippedRef.current.filter((id) => id !== activeSpec.id), activeSpec.id]
                    setSkipped(skippedRef.current)
                    setActive(nextMissing(shots, activeSpec.id))
                  }}
                >
                  {activeSpec.skipLabel ?? 'Skip this one'}
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
                      {st ? <img src={st.previewUrl} alt={s.label} className="h-full w-full object-cover" /> : skipped.includes(s.id) ? 'Skipped' : s.required ? 'Needed' : 'Optional'}
                    </span>
                    <span className="text-xs font-medium" style={{ color: C.muted }}>
                      {s.label}
                    </span>
                    <span className="text-xs" style={{ color: st?.status === 'error' ? C.rust : C.faint }}>
                      {!st ? (skipped.includes(s.id) ? 'Tap to add a photo' : ' ') : st.status === 'uploading' ? 'Saving…' : st.status === 'error' ? 'Failed, retake' : st.capture === 'uploaded' ? 'Uploaded, not captured' : 'Retake'}
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
