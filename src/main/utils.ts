export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1_000)
  const h = Math.floor(s / 3_600)
  const m = Math.floor((s % 3_600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/**
 * Returns a wrapper that rejects calls arriving within `ms` of the last accepted call.
 * The first call always goes through. Subsequent calls within the cooldown throw.
 */
export function ipcThrottle<T extends (...args: never[]) => Promise<unknown>>(
  fn: T,
  ms: number
): T {
  let lastCall = 0
  return ((...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastCall < ms) {
      return Promise.reject(new Error('Too many requests — please wait'))
    }
    lastCall = now
    return fn(...args)
  }) as T
}
