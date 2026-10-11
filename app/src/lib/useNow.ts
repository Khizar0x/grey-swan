import { useEffect, useState } from 'react'

// Current time in unix seconds, refreshed on an interval so countdowns tick
// and a deadline-gated button appears the moment its deadline passes.
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
