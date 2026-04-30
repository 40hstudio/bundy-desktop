import { useEffect, useRef } from 'react'

/**
 * Calls `fn` every `delayMs`. Pass `null` to pause. The latest `fn` is always
 * invoked, so callers don't need to memoise it.
 */
export function useInterval(fn: () => void, delayMs: number | null): void {
  const fnRef = useRef(fn)
  useEffect(() => { fnRef.current = fn }, [fn])
  useEffect(() => {
    if (delayMs === null) return
    const id = setInterval(() => fnRef.current(), delayMs)
    return () => clearInterval(id)
  }, [delayMs])
}
