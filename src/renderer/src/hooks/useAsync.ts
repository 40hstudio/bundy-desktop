import { useCallback, useEffect, useRef, useState } from 'react'

export type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: Error | null
  /** Re-run the async function. Returns the latest data, or null on error. */
  refetch: () => Promise<T | null>
  /** Manually set data (e.g. for optimistic updates). */
  setData: (next: T | null) => void
}

/**
 * Runs `fn` on mount and whenever any value in `deps` changes.
 * Cancels stale resolutions if dependencies change before the promise settles.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: ReadonlyArray<unknown> = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const fnRef = useRef(fn)
  useEffect(() => { fnRef.current = fn }, [fn])

  const run = useCallback(async (): Promise<T | null> => {
    setLoading(true); setError(null)
    try {
      const result = await fnRef.current()
      setData(result); setLoading(false)
      return result
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setLoading(false)
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    fnRef.current()
      .then((result) => { if (!cancelled) { setData(result); setLoading(false) } })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setLoading(false)
        }
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, refetch: run, setData }
}
