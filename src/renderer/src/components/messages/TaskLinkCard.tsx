import React, { useState, useEffect } from 'react'
import { CheckSquare, ExternalLink, GitBranch, MessageSquare } from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig } from '../../types'
import { apiFetch } from '../../api/client'
import { Avatar } from '../shared/Avatar'

interface UserStub {
  id: string
  username: string
  alias: string | null
  avatarUrl: string | null
}

interface CommentStub {
  id: string
  body: string
  createdAt: string
  user: UserStub
}

interface TaskMeta {
  id: string
  title: string
  projectName: string | null
  projectColor: string | null
  status: string
  parentTaskId: string | null
  parentTitle: string | null
  comments: CommentStub[]
}

interface CacheEntry {
  meta: TaskMeta | null
  fetchedAt: number
}

const CACHE_TTL_MS = 60_000
const taskMetaCache = new Map<string, CacheEntry>()

/** Clear a specific task's cached metadata. */
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function stripMarkup(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/!?\[[^\]]*\]\([^)]+\)/g, '').replace(/\s+/g, ' ').trim()
}

export function TaskLinkCard({ taskId, commentId, config: _config }: { taskId: string; commentId?: string | null; config: ApiConfig }) {
  const cached = readCache(taskId)
  const [meta, setMeta] = useState<TaskMeta | null | undefined>(cached)

  useEffect(() => {
    if (readCache(taskId) !== undefined) return
    let cancelled = false
    apiFetch<{
      task?: {
        id: string
        title: string
        status: string
        parentTaskId: string | null
        project?: { name: string; color: string } | null
        comments?: Array<{ id: string; body: string; createdAt: string; user: UserStub }>
      }
    }>(`/api/tasks/${taskId}`, { timeoutMs: 6000 })
      .then(async d => {
        if (cancelled) return
        if (!d.task) {
          taskMetaCache.set(taskId, { meta: null, fetchedAt: Date.now() })
          setMeta(null)
          return
        }
        let parentTitle: string | null = null
        if (d.task.parentTaskId) {
          // One extra fetch to surface the parent's title for the breadcrumb
          // ("Subtask: X — under Y"). Same 60s cache key.
          try {
            const parent = await apiFetch<{ task?: { title: string } }>(
              `/api/tasks/${d.task.parentTaskId}`, { timeoutMs: 4000 },
            )
            parentTitle = parent.task?.title ?? null
          } catch { /* parent fetch is best-effort */ }
        }
        const m: TaskMeta = {
          id: d.task.id,
          title: d.task.title,
          projectName: d.task.project?.name ?? null,
          projectColor: d.task.project?.color ?? null,
          status: d.task.status,
          parentTaskId: d.task.parentTaskId,
          parentTitle,
          comments: d.task.comments ?? [],
        }
        if (cancelled) return
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

  // Re-render when invalidated.
  useEffect(() => {
    function onTaskUpdated(e: Event): void {
      const detail = (e as CustomEvent).detail as { taskId?: string } | undefined
      if (detail?.taskId === taskId) {
        taskMetaCache.delete(taskId)
        setMeta(undefined)
      }
    }
    window.addEventListener('bundy-task-updated', onTaskUpdated)
    return () => window.removeEventListener('bundy-task-updated', onTaskUpdated)
  }, [taskId])

  const accentColor = meta?.projectColor ?? C.accent
  const isLoading = meta === undefined
  const isMissing = meta === null
  const isSubtask = !!meta?.parentTaskId
  const targetComment = commentId && meta
    ? meta.comments.find(c => c.id === commentId) ?? null
    : null

  const baseStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px',
    borderRadius: 8, border: `1px solid ${C.separator}`,
    background: `${accentColor}08`, cursor: 'pointer', maxWidth: 420,
    marginTop: 4, marginBottom: 2, transition: 'background 0.15s',
  }

  const onClick = () => window.dispatchEvent(new CustomEvent('bundy-open-task', { detail: { taskId, commentId } }))
  const onEnter = (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = `${accentColor}15` }
  const onLeave = (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = `${accentColor}08` }

  // Variant A — discussion message link card (commentId resolved to a comment).
  if (targetComment) {
    const author = targetComment.user.alias ?? targetComment.user.username
    const preview = stripMarkup(targetComment.body)
    return (
      <div onClick={onClick} onMouseEnter={onEnter} onMouseLeave={onLeave} style={baseStyle}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: `${accentColor}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <MessageSquare size={18} color={accentColor} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textMuted, marginBottom: 4 }}>
            <Avatar url={targetComment.user.avatarUrl} name={author} size={16} />
            <span style={{ fontWeight: 600, color: C.text }}>{author}</span>
            <span>·</span>
            <span>{timeAgo(targetComment.createdAt)}</span>
            <span>·</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isSubtask ? 'Subtask discussion' : 'Discussion'} · {meta!.title}
            </span>
          </div>
          <div style={{
            fontSize: 13, color: C.text, lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {preview || '(empty message)'}
          </div>
        </div>
        <ExternalLink size={14} color={C.textMuted} style={{ flexShrink: 0, marginTop: 2 }} />
      </div>
    )
  }

  // Variant B — subtask card (with parent breadcrumb).
  if (isSubtask && meta) {
    return (
      <div onClick={onClick} onMouseEnter={onEnter} onMouseLeave={onLeave} style={baseStyle}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: `${accentColor}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <GitBranch size={18} color={accentColor} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>
            Subtask{meta.parentTitle ? ` · under ${meta.parentTitle}` : ''}
          </div>
          <div style={{
            fontSize: 13, fontWeight: 600, color: C.accent, lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{meta.title}</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meta.projectName ?? 'Task'}
            {meta.status ? ` · ${meta.status.replace(/-/g, ' ')}` : ''}
          </div>
        </div>
        <ExternalLink size={14} color={C.textMuted} style={{ flexShrink: 0, marginTop: 2 }} />
      </div>
    )
  }

  // Variant C — main task card (default).
  const title = meta?.title ?? (isLoading ? 'Loading task…' : isMissing ? 'Task not found' : 'Open Task')
  const subtitle = meta?.projectName ?? 'Task'
  return (
    <div onClick={onClick} onMouseEnter={onEnter} onMouseLeave={onLeave} style={baseStyle}>
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
        }}>{title}</div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subtitle}{meta?.status ? ` · ${meta.status.replace(/-/g, ' ')}` : ''}
        </div>
      </div>
      <ExternalLink size={14} color={C.textMuted} style={{ flexShrink: 0, marginTop: 2 }} />
    </div>
  )
}
