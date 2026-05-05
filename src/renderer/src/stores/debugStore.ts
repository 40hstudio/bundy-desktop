/**
 * Debug overlay store (v1.5.2204).
 *
 * Toggle: set `localStorage.bundyDebug = '1'` and reload. Set to '0' or
 * delete to hide. Records last-seen timestamps for the three points in
 * the realtime chain so we can see which step is lagging:
 *
 *   SSE event arrives  →  loadProjectTasks runs  →  list re-renders
 *
 * If SSE timestamp is fresh but loadProjectTasks isn't running, the
 * listener wiring is broken. If loadProjectTasks ran but the render
 * timestamp is stale, React isn't picking up the state change. If SSE
 * is stale, the stream isn't delivering events.
 */
import { create } from 'zustand'

type DebugState = {
  enabled: boolean
  lastSSEEvent: { event: string; at: number } | null
  lastLoadProjectTasks: { at: number; durationMs: number; resultCount: number } | null
  lastListRender: { at: number; count: number } | null
  // Counter so we can see total events / loads / renders since session start.
  sseEventCount: number
  loadCount: number
  renderCount: number
  recordSSE: (event: string) => void
  recordLoadProjectTasks: (durationMs: number, resultCount: number) => void
  recordListRender: (count: number) => void
}

function isEnabled(): boolean {
  try { return localStorage.getItem('bundyDebug') === '1' } catch { return false }
}

export const useDebugStore = create<DebugState>((set) => ({
  enabled: isEnabled(),
  lastSSEEvent: null,
  lastLoadProjectTasks: null,
  lastListRender: null,
  sseEventCount: 0,
  loadCount: 0,
  renderCount: 0,
  recordSSE: (event) => set((s) => ({
    lastSSEEvent: { event, at: Date.now() },
    sseEventCount: s.sseEventCount + 1,
  })),
  recordLoadProjectTasks: (durationMs, resultCount) => set((s) => ({
    lastLoadProjectTasks: { at: Date.now(), durationMs, resultCount },
    loadCount: s.loadCount + 1,
  })),
  recordListRender: (count) => set((s) => ({
    lastListRender: { at: Date.now(), count },
    renderCount: s.renderCount + 1,
  })),
}))

/** Convenience helper for non-React call sites. */
export const debugRecord = {
  sse: (event: string) => useDebugStore.getState().recordSSE(event),
  load: (durationMs: number, resultCount: number) => useDebugStore.getState().recordLoadProjectTasks(durationMs, resultCount),
  render: (count: number) => useDebugStore.getState().recordListRender(count),
}
