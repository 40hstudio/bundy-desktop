import { useState, useEffect } from 'react'

export function useStatusTicker(
  baseMs: number,
  isTracking: boolean,
  snapshotAt: number
): number {
  const [displayMs, setDisplayMs] = useState(baseMs)
  useEffect(() => {
    setDisplayMs(isTracking ? baseMs + (Date.now() - snapshotAt) : baseMs)
    if (!isTracking) return
    const t = setInterval(() => setDisplayMs(baseMs + (Date.now() - snapshotAt)), 1_000)
    return () => clearInterval(t)
  }, [baseMs, isTracking, snapshotAt])
  return displayMs
}
