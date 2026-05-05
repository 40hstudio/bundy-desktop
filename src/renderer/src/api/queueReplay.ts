/**
 * Drains the offline write queue when the main process reports the
 * server is back online. Replays each queued request via raw fetch
 * (not the cached apiFetch wrapper) so a network error during replay
 * leaves the item in the queue rather than re-enqueuing it.
 *
 * Mounted once from App.tsx via `attachQueueReplay()`.
 */

import { drainQueue, hydrateQueue, type QueuedItem } from './writeQueue'
import { getApiClientConfig } from './client'

let _draining = false
let _detach: (() => void) | null = null

async function replay(item: QueuedItem): Promise<unknown> {
  const config = getApiClientConfig()
  if (!config) throw new TypeError('No API config — treat as transient')
  const url = `${config.apiBase}${item.path}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.token}`,
    'Idempotency-Key': item.idempotencyKey,
    ...item.headers,
  }
  const init: RequestInit = {
    method: item.method,
    headers,
    body: item.body ?? undefined,
  }
  const res = await fetch(url, init)
  if (!res.ok) {
    // Let the queue treat 4xx as a hard failure (no retry).
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    const e = new Error(json.error ?? `HTTP ${res.status}`)
    ;(e as { status?: number }).status = res.status
    throw e
  }
  const text = await res.text()
  return text ? JSON.parse(text) : undefined
}

async function tryDrain(): Promise<void> {
  if (_draining) return
  _draining = true
  try {
    await drainQueue(replay)
  } finally {
    _draining = false
  }
}

export function attachQueueReplay(): () => void {
  if (_detach) return _detach
  // Hydrate the in-memory store + UI counters from disk on mount.
  void hydrateQueue()
  // Auto-drain whenever the main process flags us back online.
  const unsub = window.electronAPI.onOnlineState((state) => {
    if (state.isOnline) void tryDrain()
  })
  _detach = () => {
    unsub()
    _detach = null
  }
  return _detach
}

/** Manual drain trigger — exposed for "Retry now" buttons. */
export async function drainNow(): Promise<void> {
  return tryDrain()
}
