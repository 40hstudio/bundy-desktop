import React, { useState, useEffect } from 'react'
import { CheckSquare, ExternalLink } from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig } from '../../types'
import { apiFetch } from '../../api/client'

interface TaskMeta {
  title: string
  projectName: string | null
  projectColor: string | null
  status: string
}

interface CacheEntry {
  meta: TaskMeta | null
  fetchedAt: number
}

// 60 s TTL — same task referenced multiple times in chat hits cache; stale-after-update
// is bounded to 1 minute. Explicit invalidation via `invalidateTaskMetaCache(taskId)`
// when the renderer learns of an update through the SSE task channel or local PATCH.
const CACHE_TTL_MS = 60_000
const taskMetaCache = new Map<string, CacheEntry>()

/** Clear a specific task's cached metadata. Call after any mutation (PATCH, SSE delta). */
export function invalidateTaskMetaCache(taskId?: string): void {
  if (taskId) taskMetaCache.delete(taskId)
  else taskMetaCache.clear()
}

function readCache(taskId: string): TaskMeta | null | undefined {
  const entry = taskMetaCache.get(taskId)
  if (!entry) return undefined
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    taskMetaCache.delete(taskId)
    return undefined
  }
  return entry.meta
}

export function TaskLinkCard({ taskId, commentId, config: _config }: { taskId: string; commentId?: string | null; config: ApiConfig }) {
  const cached = readCache(taskId)
  const [meta, setMeta] = useState<TaskMeta | null | undefined>(cached)

  useEffect(() => {
    if (readCache(taskId) !== undefined) return
    let cancelled = false
    apiFetch<{ task?: { title: string; status: string; project?: { name: string; color: string } | null } }>(
      `/api/tasks/${taskId}`,
      { timeoutMs: 6000 },
    )
      .then(d => {
        if (cancelled) return
        if (!d.task) {
          taskMetaCache.set(taskId, { meta: null, fetchedAt: Date.now() })
          setMeta(null)
          return
        }
        const m: TaskMeta = {
          title: d.task.title,
          projectName: d.task.project?.name ?? null,
          projectColor: d.task.project?.color ?? null,
          status: d.task.status,
        }
        taskMetaCache.set(taskId, { meta: m, fetchedAt: Date.now() })
        setMeta(m)
      })
      .catch(() => {
        if (cancelled) return
        taskMetaCache.set(taskId, { meta: null, fetchedAt: Date.now() })
        setMeta(null)
      })
    return () => { cancelled = true }
  }, [taskId])

  // Re-render this card if anyone calls invalidateTaskMetaCache for this taskId.
  useEffect(() => {
    function onTaskUpdated(e: Event): void {
      const detail = (e as CustomEvent).detail as { taskId?: string } | undefined
      if (detail?.taskId === taskId) {
        // Wipe cache and re-trigger the fetch effect by zeroing local state.
        taskMetaCache.delete(taskId)
        setMeta(undefined)
      }
    }
    window.addEventListener('bundy-task-updated', onTaskUpdated)
    return () => window.removeEventListener('bundy-task-updated', onTaskUpdated)
  }, [taskId])

  const title = meta?.title ?? 'Open Task'
  const subtitle = meta?.projectName ?? 'Task'
  const accentColor = meta?.projectColor ?? C.success

  return (
    <div
      onClick={() => window.dispatchEvent(new CustomEvent('bundy-open-task', { detail: { taskId, commentId } }))}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
        borderRadius: 8, border: `1px solid ${C.separator}`,
        background: `${accentColor}08`, cursor: 'pointer', maxWidth: 360,
        marginTop: 4, marginBottom: 2, transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${accentColor}15` }}
      onMouseLeave={e => { e.currentTarget.style.background = `${accentColor}08` }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: `${accentColor}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <CheckSquare size={18} color={accentColor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: C.accent, lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subtitle}{meta?.status ? ` · ${meta.status.charAt(0) + meta.status.slice(1).toLowerCase().replace(/_/g, ' ')}` : ''}
        </div>
      </div>
      <ExternalLink size={14} color={C.textMuted} style={{ flexShrink: 0 }} />
    </div>
  )
}
