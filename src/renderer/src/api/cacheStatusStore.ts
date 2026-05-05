/**
 * Tiny per-path staleness store. `apiFetch` writes to it whenever it
 * serves a response from cache (because the network was unreachable
 * or returned an error). Components can subscribe to surface a
 * "Showing data from N min ago" pill in their panel.
 */

import { create } from 'zustand'

export interface CacheStatusEntry {
  /** When the cached response was originally fetched. */
  fetchedAt: number
  /** True if the most recent attempt fell back to cache (network failed). */
  servedFromCache: boolean
}

interface CacheStatusState {
  byPath: Record<string, CacheStatusEntry>
  markCached: (path: string, fetchedAt: number, servedFromCache: boolean) => void
  clear: (path: string) => void
}

export const useCacheStatus = create<CacheStatusState>((set) => ({
  byPath: {},
  markCached: (path, fetchedAt, servedFromCache) => set((state) => ({
    byPath: { ...state.byPath, [path]: { fetchedAt, servedFromCache } },
  })),
  clear: (path) => set((state) => {
    if (!state.byPath[path]) return state
    const next = { ...state.byPath }
    delete next[path]
    return { byPath: next }
  }),
}))

/** Read the current entry without subscribing. */
export function readCacheStatus(path: string): CacheStatusEntry | undefined {
  return useCacheStatus.getState().byPath[path]
}
