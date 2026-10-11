import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaptureSource } from '../lib/ipfs'
import { C } from '../lib/theme'
import { Btn } from './atoms'
import { IconCamera } from './icons'

type CameraState = 'starting' | 'live' | 'denied' | 'none' | 'unsupported' | 'error'

// Longest edge of a captured frame. Phone cameras can deliver 4K video; a
// handover photo only has to be readable, and this keeps uploads quick.
const MAX_EDGE = 1600

function classify(err: unknown): CameraState {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'none'
  return 'error'
}

const UNAVAILABLE_MESSAGE: Record<Exclude<CameraState, 'starting' | 'live'>, string> = {
  denied: "Camera access is blocked. Allow the camera for this site in your browser settings, then try again.",
  none: "We couldn't find a camera on this device.",
  unsupported: "This browser can't open a camera here. Try a current browser on a phone or laptop.",
  error: "We couldn't start the camera. Check that no other app is using it, then try again.",
}

// Live camera with a capture button. Handover photos come from here, never
// from the gallery. The file picker below is rendered only after the camera
// has failed to start, and anything it produces is reported as "uploaded".
export function CameraCapture({ onCapture, disabled }: { onCapture: (blob: Blob, source: CaptureSource) => void; disabled?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CameraState>('starting')
  const [ready, setReady] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState('starting')
    setReady(false)

    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unsupported')
      return
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setState('live')
      })
      .catch((err) => {
        if (!cancelled) setState(classify(err))
      })

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [attempt])

  const capture = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => blob && onCapture(blob, 'captured'), 'image/jpeg', 0.85)
  }, [onCapture])

  if (state !== 'starting' && state !== 'live') {
    return (
      <div className="flex flex-col gap-3 rounded-xl p-4" style={{ background: C.subtleBg, border: `1px solid ${C.border}` }}>
        <p className="text-sm" role="alert" style={{ color: C.rust }}>
          {UNAVAILABLE_MESSAGE[state]}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {state !== 'unsupported' && (
            <Btn variant="secondary" onClick={() => setAttempt((a) => a + 1)}>
              Try the camera again
            </Btn>
          )}
          <label className="cursor-pointer text-sm underline" style={{ color: C.muted }}>
            Upload a photo instead (marked as uploaded, not captured)
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={disabled}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) onCapture(file, 'uploaded')
              }}
            />
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onLoadedMetadata={() => setReady(true)}
          className="h-full w-full object-cover"
          aria-label="Live camera preview"
        />
        {state === 'starting' && (
          <p className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: C.muted }}>
            Starting the camera…
          </p>
        )}
      </div>
      <Btn full onClick={capture} disabled={disabled || state !== 'live' || !ready}>
        <span className="inline-flex items-center justify-center gap-2">
          <IconCamera />
          Take photo
        </span>
      </Btn>
    </div>
  )
}
