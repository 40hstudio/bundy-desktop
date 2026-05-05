/**
 * v1.5.2208 — global upload progress store.
 *
 * Goal: every code path that uploads a file (chat attachment, task
 * attachment, report file, document image, avatar, soundboard, etc.)
 * pushes its in-flight state here, and a single `<UploadProgressOverlay>`
 * mounted at the app root renders a stacked progress toast for each.
 *
 * Surfaces with their own bespoke per-message progress UI (e.g.
 * MessageInput's pending-attachment chips) still tick this store too,
 * so users can see their uploads in one consistent place no matter
 * which surface they started from.
 */

import { create } from 'zustand'

export type UploadStatus = 'uploading' | 'success' | 'error'

export interface UploadProgressEntry {
  id: string
  name: string
  surface: string         // e.g. 'chat', 'report', 'task', 'doc-image'
  total: number           // bytes
  loaded: number          // bytes
  percent: number         // 0..100 (rounded — what we render)
  status: UploadStatus
  error?: string
  startedAt: number
}

interface UploadProgressState {
  uploads: Record<string, UploadProgressEntry>
  start: (init: Pick<UploadProgressEntry, 'id' | 'name' | 'surface' | 'total'>) => void
  update: (id: string, loaded: number) => void
  succeed: (id: string) => void
  fail: (id: string, error?: string) => void
  remove: (id: string) => void
  clearCompleted: () => void
}

export const useUploadProgressStore = create<UploadProgressState>((set) => ({
  uploads: {},
  start: ({ id, name, surface, total }) =>
    set((s) => ({
      uploads: {
        ...s.uploads,
        [id]: {
          id, name, surface, total,
          loaded: 0, percent: 0, status: 'uploading',
          startedAt: Date.now(),
        },
      },
    })),
  update: (id, loaded) =>
    set((s) => {
      const cur = s.uploads[id]
      if (!cur || cur.status !== 'uploading') return {}
      const total = cur.total > 0 ? cur.total : 1
      const percent = Math.min(100, Math.max(0, Math.round((loaded / total) * 100)))
      if (loaded === cur.loaded && percent === cur.percent) return {}
      return { uploads: { ...s.uploads, [id]: { ...cur, loaded, percent } } }
    }),
  succeed: (id) =>
    set((s) => {
      const cur = s.uploads[id]
      if (!cur) return {}
      // Auto-prune after a short delay so the overlay doesn't pile up.
      window.setTimeout(() => useUploadProgressStore.getState().remove(id), 2500)
      return { uploads: { ...s.uploads, [id]: { ...cur, status: 'success', percent: 100, loaded: cur.total } } }
    }),
  fail: (id, error) =>
    set((s) => {
      const cur = s.uploads[id]
      if (!cur) return {}
      return { uploads: { ...s.uploads, [id]: { ...cur, status: 'error', error } } }
    }),
  remove: (id) =>
    set((s) => {
      if (!s.uploads[id]) return {}
      const next = { ...s.uploads }
      delete next[id]
      return { uploads: next }
    }),
  clearCompleted: () =>
    set((s) => {
      const next: Record<string, UploadProgressEntry> = {}
      for (const [id, u] of Object.entries(s.uploads)) {
        if (u.status === 'uploading') next[id] = u
      }
      return { uploads: next }
    }),
}))

/**
 * Convenience helper for sites that want to wrap an upload promise:
 *
 *   const tracker = trackUpload({ name: file.name, surface: 'report', total: file.size })
 *   try { await doUpload({ onProgress: tracker.onProgress }); tracker.success() }
 *   catch (err) { tracker.fail(String(err)) }
 *
 * onProgress accepts either a percent (0..100) OR a byte count — anything
 * <= 100 is treated as a percent, anything larger as bytes.
 */
export function trackUpload(opts: { name: string; surface: string; total: number }): {
  id: string
  onProgress: (loadedOrPct: number) => void
  success: () => void
  fail: (error?: string) => void
  cancel: () => void
} {
  const id = `up-${Math.random().toString(36).slice(2)}-${Date.now()}`
  const store = useUploadProgressStore.getState()
  store.start({ id, name: opts.name, surface: opts.surface, total: opts.total })
  return {
    id,
    onProgress: (n: number) => {
      const total = opts.total > 0 ? opts.total : 1
      const loaded = n <= 100 ? Math.round((n / 100) * total) : Math.round(n)
      useUploadProgressStore.getState().update(id, loaded)
    },
    success: () => useUploadProgressStore.getState().succeed(id),
    fail: (error?: string) => useUploadProgressStore.getState().fail(id, error),
    cancel: () => useUploadProgressStore.getState().remove(id),
  }
}
