/**
 * IndexedDB-backed queue of mutating API requests that failed because
 * the server was unreachable. Drains FIFO when the main process tells
 * us the network is back.
 *
 * Each item carries an `idempotencyKey` (also sent as a header) so
 * that a retry of an already-committed request is at least detectable
 * by future server-side dedup if we add it; for now it's used purely
 * client-side to avoid double-submitting on manual retry.
 */

import { get as idbGet, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'
import { playSound } from '../utils/sounds'

const QUEUE_KEY = 'writeQueue:v1'
const FAILED_KEY = 'writeQueue:v1:failed'
const MAX_ATTEMPTS = 5

export type QueuedKind = 'message' | 'comment' | 'task-status' | 'reaction' | 'read' | 'other'

export interface QueuedItem {
  id: string
  createdAt: number
  attempts: number
  method: 'POST' | 'PATCH' | 'DELETE' | 'PUT'
  path: string
  /** Stringified JSON body. Stored as string so the queue is a flat blob. */
  body: string | null
  headers: Record<string, string>
  /** Endpoint family — used by callers to filter which `bundy-write-replayed`
   *  events they care about (e.g. MessagesPanel only listens for 'message'). */
  kind: QueuedKind
  /** Stable id the optimistic UI minted; replay event echoes it back so
   *  the temp row can be swapped for the server's real id. */
  tempId?: string
  idempotencyKey: string
}

interface QueueState {
  items: QueuedItem[]
  failed: QueuedItem[]
  setItems: (items: QueuedItem[]) => void
  setFailed: (items: QueuedItem[]) => void
}

/** Reactive view of the queue for UI surfaces (badge counts, etc). */
export const useWriteQueue = create<QueueState>((set) => ({
  items: [],
  failed: [],
  setItems: (items) => set({ items }),
  setFailed: (failed) => set({ failed }),
}))

async function readQueue(): Promise<QueuedItem[]> {
  return ((await idbGet(QUEUE_KEY)) as QueuedItem[] | undefined) ?? []
}
async function writeQueue(items: QueuedItem[]): Promise<void> {
  await idbSet(QUEUE_KEY, items)
  useWriteQueue.getState().setItems(items)
}
async function readFailed(): Promise<QueuedItem[]> {
  return ((await idbGet(FAILED_KEY)) as QueuedItem[] | undefined) ?? []
}
async function writeFailed(items: QueuedItem[]): Promise<void> {
  await idbSet(FAILED_KEY, items)
  useWriteQueue.getState().setFailed(items)
}

export async function hydrateQueue(): Promise<void> {
  const [items, failed] = await Promise.all([readQueue(), readFailed()])
  useWriteQueue.getState().setItems(items)
  useWriteQueue.getState().setFailed(failed)
}

export async function enqueue(input: {
  method: QueuedItem['method']
  path: string
  body: string | null
  headers: Record<string, string>
  kind: QueuedKind
  tempId?: string
}): Promise<QueuedItem> {
  const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const item: QueuedItem = {
    ...input,
    id,
    createdAt: Date.now(),
    attempts: 0,
    idempotencyKey: id,
  }
  const items = await readQueue()
  items.push(item)
  await writeQueue(items)
  return item
}

/** Error apiFetch throws when it has accepted a write into the queue. */
export class QueuedWriteError extends Error {
  constructor(public item: QueuedItem) {
    super(`Queued offline: ${item.method} ${item.path}`)
    this.name = 'QueuedWriteError'
  }
}

/**
 * Drain the queue using the supplied `replayer`. On per-item success the
 * item is removed; on transient failure attempts is incremented and it
 * stays. Items past MAX_ATTEMPTS move to the failed list (surfaced in
 * UI; user can review/discard).
 */
export async function drainQueue(replayer: (item: QueuedItem) => Promise<unknown>): Promise<{ ok: number; failed: number; transient: number }> {
  let items = await readQueue()
  let ok = 0
  let failed = 0
  let transient = 0

  while (items.length > 0) {
    const item = items[0]
    try {
      const response = await replayer(item)
      // success — drop from queue, fire window event so UI can swap temp ids
      items = items.slice(1)
      await writeQueue(items)
      window.dispatchEvent(new CustomEvent('bundy-write-replayed', {
        detail: { kind: item.kind, tempId: item.tempId, path: item.path, response },
      }))
      // Subtle sound — let the user hear that an offline write finally landed.
      playSound('message.queue-replayed')
      ok++
    } catch (err) {
      const isNetwork = err instanceof TypeError
      const updated = { ...item, attempts: item.attempts + 1 }
      if (!isNetwork || updated.attempts >= MAX_ATTEMPTS) {
        // Move to failed list — non-network errors (4xx) or too many tries.
        items = items.slice(1)
        await writeQueue(items)
        const failedList = await readFailed()
        failedList.push(updated)
        await writeFailed(failedList)
        window.dispatchEvent(new CustomEvent('bundy-write-failed', {
          detail: { kind: item.kind, tempId: item.tempId, path: item.path, error: String(err) },
        }))
        playSound('system.queue-failed')
        failed++
      } else {
        // Transient — leave at head with bumped attempt count and stop draining.
        items[0] = updated
        await writeQueue(items)
        transient++
        break
      }
    }
  }
  return { ok, failed, transient }
}

export async function discardFailed(itemId: string): Promise<void> {
  const failed = await readFailed()
  await writeFailed(failed.filter(i => i.id !== itemId))
}

export async function retryFailed(itemId: string): Promise<void> {
  const failed = await readFailed()
  const idx = failed.findIndex(i => i.id === itemId)
  if (idx === -1) return
  const item = { ...failed[idx], attempts: 0 }
  const next = failed.slice(); next.splice(idx, 1)
  await writeFailed(next)
  const items = await readQueue()
  items.push(item)
  await writeQueue(items)
}
