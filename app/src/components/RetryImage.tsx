import { useEffect, useState, type CSSProperties, type MouseEventHandler } from 'react'

// A freshly-pinned photo can resolve through the gateway at a different
// moment than its manifest does (they're separate files, uploaded and
// propagated independently) — the manifest already retries on fetch
// (lib/ipfs.ts), but each individual <img> has no such protection on its
// own, so a photo that isn't ready yet just shows the browser's broken-image
// icon forever. This retries the image itself the same way.
export function RetryImage({
  src,
  alt,
  className,
  style,
  onClick,
  maxAttempts = 5,
  retryDelayMs = 1500,
}: {
  src: string
  alt: string
  className?: string
  style?: CSSProperties
  onClick?: MouseEventHandler<HTMLImageElement>
  maxAttempts?: number
  retryDelayMs?: number
}) {
  const [attempt, setAttempt] = useState(0)
  const [errorCount, setErrorCount] = useState(0)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setAttempt(0)
    setErrorCount(0)
    setFailed(false)
    // Re-selecting a photo the browser already has cached (e.g. clicking
    // back to a thumbnail you've already viewed) loads instantly — starting
    // `loaded` at false regardless would flash the skeleton on and straight
    // back off as onLoad fires a moment later, even though the image never
    // needed to reload. A synchronous cache probe lets an already-cached
    // photo skip the flash while a genuinely new one still shows it while
    // it loads.
    const probe = new Image()
    probe.src = src
    setLoaded(probe.complete)
  }, [src])

  // Scheduling the retry here (rather than directly in the onError handler)
  // means an unmount before the delay elapses cleans the timer up properly
  // instead of firing a state update on a component that's gone.
  useEffect(() => {
    if (errorCount === 0) return
    if (errorCount >= maxAttempts) {
      setFailed(true)
      return
    }
    const timer = setTimeout(() => setAttempt((a) => a + 1), retryDelayMs)
    return () => clearTimeout(timer)
  }, [errorCount, maxAttempts, retryDelayMs])

  if (failed) {
    return (
      <div className={className} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(38,34,32,0.06)' }}>
        <span style={{ fontSize: '0.65rem', color: '#9A9088' }}>Couldn't load</span>
      </div>
    )
  }

  return (
    <img
      // Changing key forces a fresh <img> mount on each retry — reassigning
      // .src to the same value doesn't reliably force the browser to
      // re-request it after a failed load.
      key={attempt}
      src={src}
      alt={alt}
      className={`${className ?? ''} ${!loaded ? 'animate-pulse' : ''}`}
      style={style}
      onLoad={() => setLoaded(true)}
      onError={() => setErrorCount((c) => c + 1)}
      onClick={onClick}
    />
  )
}
