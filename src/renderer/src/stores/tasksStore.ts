import { create } from 'zustand'
import type { Task } from '../types'
import { invalidateTaskMetaCache } from '../components/messages/TaskLinkCard'

/**
 * Cached task list + per-task delta application.
 *
 * Lives next to the SSE bridge in App.tsx so remote edits, creates, and
 * deletes apply to the in-memory list without a full /api/tasks re-fetch.
 *
 * The store keeps the list keyed by the current filter — when filters or
 * project selection change, callers should call `setTasks` with the new
 * server response and `setListKey` to identify the cache.
 */

type ListKey = string

type TasksState = {
  /** Current cached list (matches whatever filter+project the user has selected). */
  tasks: Task[]
  /** Identifier of which filter the cache represents. Empty string means "no cache". */
  listKey: ListKey
  /** When non-null, a remote create/delete arrived and the consumer should refetch. */
  pendingRefetchReason: 'created' | 'deleted' | null

  setTasks: (tasks: Task[], listKey: ListKey) => void
  /** Apply a delta (partial fields) to a single task in the list. No-op if missing. */
  patchTask: (taskId: string, changes: Partial<Task>) => void
  /** Remove a task from the list. */
  removeTask: (taskId: string) => void
  /** Mark the cache as needing a refetch (consumed by TasksPanel.load). */
  markStale: (reason: 'created' | 'deleted') => void
  clearPending: () => void
}

export const useTasksStore = create<TasksState>((set) => ({
  tasks: [],
  listKey: '',
  pendingRefetchReason: null,

  setTasks: (tasks, listKey) => set({ tasks, listKey, pendingRefetchReason: null }),

  patchTask: (taskId, changes) => set((s) => ({
    tasks: s.tasks.map(t => t.id === taskId ? { ...t, ...changes } : t),
  })),

  removeTask: (taskId) => set((s) => ({
    tasks: s.tasks.filter(t => t.id !== taskId),
  })),

  markStale: (reason) => set({ pendingRefetchReason: reason }),
  clearPending: () => set({ pendingRefetchReason: null }),
}))

/**
 * Wire the SSE bridge events into the store. Call once at app startup
 * (App.tsx) — idempotent because the EventTarget pattern dedupes listeners
 * by handler identity, and we use a singleton handler captured here.
 */
let listenersAttached = false
export function attachTasksSseListeners(): void {
  if (listenersAttached) return
  listenersAttached = true

  window.addEventListener('bundy-task-updated', (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      taskId?: string
      mainTaskId?: string
      kind?: 'created' | 'updated' | 'deleted'
      changes?: Partial<Task>
    } | undefined
    if (!detail?.taskId) return
    invalidateTaskMetaCache(detail.taskId)
    if (detail.kind === 'deleted') {
      useTasksStore.getState().removeTask(detail.taskId)
      useTasksStore.getState().markStale('deleted')
    } else if (detail.kind === 'created') {
      useTasksStore.getState().markStale('created')
    } else if (detail.kind === 'updated' && detail.changes) {
      useTasksStore.getState().patchTask(detail.taskId, detail.changes as Partial<Task>)
    }
  })

  // Comment events invalidate the task's link-card metadata (status/title may not have
  // changed, but the comment count surfaces in the list row UI).
  window.addEventListener('bundy-task-comment-added', (e: Event) => {
    const detail = (e as CustomEvent).detail as { taskId?: string; mainTaskId?: string } | undefined
    if (detail?.mainTaskId) invalidateTaskMetaCache(detail.mainTaskId)
  })
}
