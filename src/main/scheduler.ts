/**
 * Boundary-aligned scheduler.
 *
 * Replaces the duplicated `msUntilNextBoundary()` + `setTimeout` recursion
 * pattern that lived in both screenshot.ts and activity.ts. The screenshot
 * timer wants a 5s offset after each :00 / :10 / :20 boundary so it doesn't
 * race the activity heartbeat that fires at the same boundary.
 */

import { isServerReachable } from './api'

/** Returns ms until the next clock-aligned boundary plus an optional offset. */
export function msUntilNextBoundary(intervalMs: number, offsetMs = 0): number {
  const now = Date.now()
  const msIntoWindow = now % intervalMs
  return intervalMs - msIntoWindow + offsetMs
}

/**
 * Schedule `fn` to fire at every clock-aligned boundary of length `intervalMs`,
 * plus the optional `offsetMs`. The returned function stops further firings.
 *
 * Example: `scheduleAtBoundary({ intervalMs: 600_000, offsetMs: 5_000, fn })`
 * fires at :00:05, :10:05, :20:05, …
 */
export function scheduleAtBoundary({
  intervalMs, offsetMs = 0, fn,
}: {
  intervalMs: number
  offsetMs?: number
  fn: () => void
}): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  function schedule(): void {
    if (stopped) return
    timer = setTimeout(() => {
      timer = null
      fn()
      schedule()
    }, msUntilNextBoundary(intervalMs, offsetMs))
  }

  schedule()

  return () => {
    stopped = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
}

/**
 * Generic "send if online, queue otherwise" helper. Replaces the same 6-line
 * pattern in screenshot.ts and activity.ts.
 *
 * - If the server is reachable, calls `send(payload)`. If that throws, queues.
 * - If offline, queues directly.
 */
export async function trySendOrQueue<T>(
  payload: T,
  send: (p: T) => Promise<unknown>,
  queue: (p: T) => void,
): Promise<void> {
  if (!isServerReachable()) {
    queue(payload)
    return
  }
  try {
    await send(payload)
  } catch {
    queue(payload)
  }
}
