/**
 * Optimistic cache-patcher.
 *
 * Phase 4 follow-up — fixes the bug where queued writes (clock-in,
 * messages, comments, tasks) appeared optimistically in component
 * state, then VANISHED when the user switched panels because the
 * panel re-mounted, refetched from cache, and the cache didn't yet
 * reflect the queued write.
 *
 * Now: when apiFetch enqueues a write because of network failure, it
 * also patches the IndexedDB-cached GET responses that the write
 * would affect. The optimistic record carries a tempId from the
 * caller (or a synthesized one) so the consumer can recognize and
 * later swap it for the server-assigned id when the queue drains.
 *
 * When the queue replays successfully, the panel's natural refetch
 * of the affected GET path overwrites the cache with the real server
 * data (including the now-real id), and the temp record disappears.
 */

import { get as idbGet, set as idbSet, keys as idbKeys } from 'idb-keyval'
import { cacheKeyOf } from './cacheRules'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cached = any

interface CachePatch {
  /** Pathname (no query) whose cached GET response we mutate. */
  affectedPath: string
  /** Mutator. Returns null if no change applies (cached body of unexpected shape). */
  mutator: (cached: Cached) => Cached | null
  /** Optional gate on the full cache key — used to scope a patch to specific
   *  querystring variants (e.g., a thread reply must only patch
   *  `?parentMessageId=X` caches, never the main `?limit=50` cache). */
  keyFilter?: (fullCacheKey: string) => boolean
}

interface OptimisticContext {
  method: 'POST' | 'PATCH' | 'DELETE' | 'PUT'
  path: string
  body: unknown
  tempId: string
  userId: string
}

// ─── Patch-builders for each known write surface ────────────────────────────

function computePatches(ctx: OptimisticContext): CachePatch[] {
  const { method, path, body, tempId } = ctx
  const now = new Date().toISOString()

  // POST /api/channels/[id]/messages → append optimistic message.
  // Top-level vs thread reply must be scoped: a top-level message must
  // only land in the main `?limit=50` cache, and a thread reply must
  // only land in the `?parentMessageId=<id>...` cache. Without keyFilter
  // both queries would receive the optimistic record.
  let m = path.match(/^\/api\/channels\/([^/]+)\/messages$/)
  if (m && method === 'POST') {
    const channelId = m[1]
    const b = (body ?? {}) as Record<string, unknown>
    const parentMessageId = (b.parentMessageId as string | null) ?? null
    const optimistic = {
      id: tempId,
      content: (b.content as string) ?? '',
      createdAt: now,
      editedAt: null,
      sender: { id: 'me', username: 'You', alias: null, avatarUrl: null },
      reactions: [],
      reads: [],
      replyCount: 0,
      parentMessageId,
      __pending: true,
    }
    const keyFilter = parentMessageId
      ? (k: string) => k.includes(`parentMessageId=${parentMessageId}`)
      : (k: string) => !k.includes('parentMessageId=')
    return [{
      affectedPath: `/api/channels/${channelId}/messages`,
      keyFilter,
      mutator: (cached) => {
        if (!cached) return null
        if (Array.isArray(cached.messages)) {
          return { ...cached, messages: [...cached.messages, optimistic] }
        }
        if (Array.isArray(cached)) return [...cached, optimistic]
        return null
      },
    }]
  }

  // DELETE /api/channels/[id]/messages/[msgId] → remove from cache
  m = path.match(/^\/api\/channels\/([^/]+)\/messages\/([^/]+)$/)
  if (m && method === 'DELETE') {
    const channelId = m[1]
    const msgId = m[2]
    return [{
      affectedPath: `/api/channels/${channelId}/messages`,
      mutator: (cached) => {
        if (!cached) return null
        if (Array.isArray(cached.messages)) {
          return { ...cached, messages: cached.messages.filter((msg: { id: string }) => msg.id !== msgId) }
        }
        if (Array.isArray(cached)) {
          return cached.filter((msg: { id: string }) => msg.id !== msgId)
        }
        return null
      },
    }]
  }

  // PATCH /api/channels/[id]/messages/[msgId] → update content
  if (m && method === 'PATCH') {
    const channelId = m[1]
    const msgId = m[2]
    const b = (body ?? {}) as Record<string, unknown>
    return [{
      affectedPath: `/api/channels/${channelId}/messages`,
      mutator: (cached) => {
        if (!cached) return null
        const apply = (msg: Record<string, unknown>) =>
          msg.id === msgId ? { ...msg, ...b, editedAt: now, __pending: true } : msg
        if (Array.isArray(cached.messages)) {
          return { ...cached, messages: cached.messages.map(apply) }
        }
        if (Array.isArray(cached)) return cached.map(apply)
        return null
      },
    }]
  }

  // POST /api/tasks → append optimistic task to list cache.
  // Subtask case (`parentTaskId` in body) is handled separately below
  // because subtasks are not surfaced in the top-level /api/tasks list —
  // they live under the parent task's `subtasks[]` array on the single-task
  // GET cache.
  if (path === '/api/tasks' && method === 'POST') {
    const b = (body ?? {}) as Record<string, unknown>
    const parentTaskId = (b.parentTaskId as string | null) ?? null
    const optimistic = {
      id: tempId,
      title: (b.title as string) ?? '',
      description: (b.description as string) ?? null,
      status: (b.status as string) ?? 'TODO',
      priority: (b.priority as string) ?? 'MEDIUM',
      dueDate: (b.dueDate as string | null) ?? null,
      assigneeId: (b.assigneeId as string | null) ?? null,
      projectId: (b.projectId as string | null) ?? null,
      sectionId: (b.sectionId as string | null) ?? null,
      parentTaskId,
      createdAt: now,
      updatedAt: now,
      _count: { comments: 0, attachments: 0, subtasks: 0 },
      __pending: true,
    }

    if (parentTaskId) {
      // Subtask creation — don't pollute the top-level task list. Instead
      // append to the parent task's subtasks[] in the single-task GET cache
      // so the drawer shows it immediately and survives a re-mount.
      return [{
        affectedPath: `/api/tasks/${parentTaskId}`,
        mutator: (cached) => {
          if (!cached) return null
          const task = cached.task ?? cached
          if (!task) return null
          const subtasks = Array.isArray(task.subtasks) ? task.subtasks : []
          const updatedTask = {
            ...task,
            subtasks: [...subtasks, optimistic],
            _count: {
              ...(task._count ?? {}),
              subtasks: (task._count?.subtasks ?? subtasks.length) + 1,
            },
          }
          return cached.task ? { ...cached, task: updatedTask } : updatedTask
        },
      }]
    }

    return [{
      affectedPath: '/api/tasks',
      mutator: (cached) => {
        if (!cached) return null
        if (Array.isArray(cached.tasks)) return { ...cached, tasks: [...cached.tasks, optimistic] }
        if (Array.isArray(cached)) return [...cached, optimistic]
        return null
      },
    }]
  }

  // PATCH /api/tasks/[id] → update single task in BOTH list cache + single cache
  m = path.match(/^\/api\/tasks\/([^/]+)$/)
  if (m && method === 'PATCH') {
    const taskId = m[1]
    const b = (body ?? {}) as Record<string, unknown>
    return [
      {
        affectedPath: '/api/tasks',
        mutator: (cached) => {
          if (!cached) return null
          const apply = (t: Record<string, unknown>) =>
            t.id === taskId ? { ...t, ...b, updatedAt: now, __pending: true } : t
          if (Array.isArray(cached.tasks)) return { ...cached, tasks: cached.tasks.map(apply) }
          if (Array.isArray(cached)) return cached.map(apply)
          return null
        },
      },
      {
        affectedPath: `/api/tasks/${taskId}`,
        mutator: (cached) => {
          if (!cached) return null
          if (cached.task) return { ...cached, task: { ...cached.task, ...b, updatedAt: now, __pending: true } }
          if (cached.id === taskId) return { ...cached, ...b, updatedAt: now, __pending: true }
          return null
        },
      },
    ]
  }

  // DELETE /api/tasks/[id] → remove from list cache
  if (m && method === 'DELETE') {
    const taskId = m[1]
    return [{
      affectedPath: '/api/tasks',
      mutator: (cached) => {
        if (!cached) return null
        if (Array.isArray(cached.tasks)) {
          return { ...cached, tasks: cached.tasks.filter((t: { id: string }) => t.id !== taskId) }
        }
        if (Array.isArray(cached)) {
          return cached.filter((t: { id: string }) => t.id !== taskId)
        }
        return null
      },
    }]
  }

  // POST /api/tasks/[id]/comments → append comment to single task cache
  m = path.match(/^\/api\/tasks\/([^/]+)\/comments$/)
  if (m && method === 'POST') {
    const taskId = m[1]
    const b = (body ?? {}) as Record<string, unknown>
    const optimistic = {
      id: tempId,
      body: (b.body as string) ?? '',
      createdAt: now,
      editedAt: null,
      user: { id: 'me', username: 'You', alias: null, avatarUrl: null },
      reactions: [],
      replies: [],
      attachmentUrl: null,
      attachmentName: null,
      parentCommentId: (b.parentCommentId as string | null) ?? null,
      __pending: true,
    }
    return [{
      affectedPath: `/api/tasks/${taskId}`,
      mutator: (cached) => {
        if (!cached) return null
        const task = cached.task ?? cached
        const comments = Array.isArray(task.comments) ? task.comments : []
        const updatedTask = { ...task, comments: [...comments, optimistic] }
        return cached.task ? { ...cached, task: updatedTask } : updatedTask
      },
    }]
  }

  return []
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Apply the optimistic patches for a queued write to the relevant
 * IndexedDB-cached GET responses. Best-effort — failures are
 * swallowed (UI will still show the optimistic state via the panel's
 * own component state until next refetch).
 *
 * v1.5.1651 — match cache keys by prefix instead of exact equality.
 * Most GETs include a querystring (`?limit=50`, `?before=…`, `?parentMessageId=…`)
 * so a single affectedPath like `/api/channels/X/messages` corresponds to
 * many cache entries (`cache:v1:userId:/api/channels/X/messages?limit=50`,
 * `…?before=Y&limit=50`, etc.). Patching only the bare-path key — as v1.5.1650
 * did — left the querystring variants stale, which is why messages
 * "vanished" when the user switched panels and the panel re-fetched the
 * `?limit=50` cache.
 */
export async function applyOptimisticPatches(ctx: OptimisticContext): Promise<void> {
  const patches = computePatches(ctx)
  if (patches.length === 0) return
  const allKeys = await idbKeys().catch(() => [] as IDBValidKey[])
  for (const patch of patches) {
    const exactKey = cacheKeyOf(ctx.userId, patch.affectedPath)
    const prefix = `${exactKey}?`
    // Exact match (no querystring) plus every `…?...` variant.
    const matchingKeys = allKeys.filter(
      (k): k is string =>
        typeof k === 'string'
        && (k === exactKey || k.startsWith(prefix))
        && (patch.keyFilter ? patch.keyFilter(k) : true),
    )
    if (matchingKeys.length === 0) continue
    for (const key of matchingKeys) {
      try {
        const cached = await idbGet(key)
        if (cached === undefined) continue
        const next = patch.mutator(cached)
        if (next === null) continue
        await idbSet(key, next)
      } catch {
        // best-effort; panel state still has the optimistic record
      }
    }
  }
}
