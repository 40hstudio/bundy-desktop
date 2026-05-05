/**
 * Phase 1 / P0-7 — regression test for the offline write queue.
 *
 * Locks in two behaviors users would notice if they regressed:
 *   1. drainQueue removes items on success.
 *   2. drainQueue retains transient (network) failures with attempts++,
 *      and stops draining after the first transient so subsequent items
 *      don't keep firing requests against an offline server.
 *   3. Hard 4xx failures (non-network) move to the failed list, not back
 *      onto the queue — so a permanent error doesn't keep retrying.
 *
 * The shared sounds module is stubbed so tests don't touch the DOM
 * audio APIs (jsdom + Audio() doesn't actually play, but the import
 * graph still tries to set up an AudioContext).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'

// Stub the side-effect of playing a sound on success/failure replays.
vi.mock('../utils/sounds', () => ({
  playSound: vi.fn(),
}))

import {
  enqueue,
  drainQueue,
  hydrateQueue,
  useWriteQueue,
} from './writeQueue'

beforeEach(async () => {
  // Reset zustand store + IndexedDB between tests.
  useWriteQueue.setState({ items: [], failed: [] })
  // fake-indexeddb gives a per-test fresh DB if we tear it down.
  // Easiest: reset the module-level idb-keyval store via clearing keys we know.
  const { del } = await import('idb-keyval')
  await del('writeQueue:v1').catch(() => {})
  await del('writeQueue:v1:failed').catch(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('writeQueue.enqueue + drainQueue', () => {
  it('drains successful items off the queue', async () => {
    await enqueue({
      method: 'POST',
      path: '/api/channels/abc/messages',
      body: JSON.stringify({ content: 'hi' }),
      headers: { 'Content-Type': 'application/json' },
      kind: 'message',
      tempId: 'temp-1',
    })

    const replayer = vi.fn(async () => ({ ok: true }))
    const result = await drainQueue(replayer)
    expect(result.ok).toBe(1)
    expect(result.failed).toBe(0)
    expect(useWriteQueue.getState().items).toHaveLength(0)
  })

  it('retains transient (TypeError) failures with attempts incremented', async () => {
    await enqueue({
      method: 'POST',
      path: '/api/channels/abc/messages',
      body: JSON.stringify({ content: 'hi' }),
      headers: {},
      kind: 'message',
    })
    const replayer = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const result = await drainQueue(replayer)
    expect(result.ok).toBe(0)
    expect(result.transient).toBe(1)
    const items = useWriteQueue.getState().items
    expect(items).toHaveLength(1)
    expect(items[0].attempts).toBe(1)
  })

  it('stops draining after the first transient failure (avoids spamming an offline server)', async () => {
    await enqueue({ method: 'POST', path: '/api/a', body: null, headers: {}, kind: 'message' })
    await enqueue({ method: 'POST', path: '/api/b', body: null, headers: {}, kind: 'message' })
    await enqueue({ method: 'POST', path: '/api/c', body: null, headers: {}, kind: 'message' })

    let calls = 0
    const replayer = vi.fn(async () => {
      calls++
      throw new TypeError('Failed to fetch')
    })
    await drainQueue(replayer)
    // Only the first item is attempted; the next two remain untouched.
    expect(calls).toBe(1)
    expect(useWriteQueue.getState().items).toHaveLength(3)
  })

  it('moves hard 4xx failures to the failed list (no infinite retry)', async () => {
    await enqueue({ method: 'POST', path: '/api/a', body: null, headers: {}, kind: 'message' })
    const replayer = vi.fn(async () => {
      const e = new Error('HTTP 422')
      ;(e as { status?: number }).status = 422
      throw e
    })
    const result = await drainQueue(replayer)
    expect(result.failed).toBe(1)
    expect(useWriteQueue.getState().items).toHaveLength(0)
    expect(useWriteQueue.getState().failed).toHaveLength(1)
  })

  it('moves an item to the failed list after MAX_ATTEMPTS transient failures', async () => {
    await enqueue({ method: 'POST', path: '/api/a', body: null, headers: {}, kind: 'message' })
    const replayer = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    // Drain 5 times — each transient failure stops the loop, keeps the item.
    for (let i = 0; i < 5; i++) {
      await drainQueue(replayer)
    }
    // After 5 attempts the item should be in failed.
    expect(useWriteQueue.getState().items).toHaveLength(0)
    expect(useWriteQueue.getState().failed).toHaveLength(1)
  })
})

describe('writeQueue.hydrateQueue', () => {
  it('reads the queue back from IndexedDB into the Zustand store', async () => {
    await enqueue({
      method: 'POST',
      path: '/api/x',
      body: null,
      headers: {},
      kind: 'message',
    })
    // Wipe the in-memory store and re-hydrate.
    useWriteQueue.setState({ items: [], failed: [] })
    await hydrateQueue()
    expect(useWriteQueue.getState().items).toHaveLength(1)
    expect(useWriteQueue.getState().items[0].path).toBe('/api/x')
  })
})
