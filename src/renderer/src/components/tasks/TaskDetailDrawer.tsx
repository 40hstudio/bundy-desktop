import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X, Trash2, Check, Link, Edit2, AlignLeft, MessageSquare,
  Activity, ChevronRight, Loader, AlertCircle, Paperclip,
  Calendar, GitBranch, Users,
  Plus, Flag, Globe, ExternalLink, BarChart2,
} from 'lucide-react'
import {
  ApiConfig, Auth, Task, TaskProject, TaskComment,
  TaskActivityItem, TaskAttachment, UserInfo
} from '../../types'
import { useLightboxClaim } from '../../utils/lightboxClaim'
import AttachmentSlider from '../shared/AttachmentSlider'
import DocumentEditor from '../report/DocumentEditor'
import { C, neu } from '../../theme'
import { Avatar } from '../shared/Avatar'
import { DiscussionPanel } from '../messages/DiscussionPanel'
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from './constants'
import { apiFetch as sharedApiFetch } from '../../api/client'
import { QueuedWriteError } from '../../api/writeQueue'
import { tryDirectR2Upload } from '../../api/r2Upload'
import { xhrUploadJson } from '../../api/xhrUpload'
import { trackUpload } from '../../stores/uploadProgressStore'
import { TaskActivity } from './TaskActivity'

export default function TaskDetailDrawer({ taskId, config, auth, projects, focusCommentId, onClose, onUpdated, onDeleted, onRefresh }: {
  taskId: string; config: ApiConfig; auth: Auth
  projects: TaskProject[]
  focusCommentId?: string | null
  onClose: () => void
  onUpdated: (t: Task) => void
  onDeleted: (id: string) => void
  onRefresh?: () => void
}) {
  const [detail, setDetail] = useState<Task | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [comments, setComments] = useState<TaskComment[]>([])
  const [activities, setActivities] = useState<TaskActivityItem[]>([])
  const [savingField, setSavingField] = useState<string | null>(null)
  const [users, setUsers] = useState<UserInfo[]>([])
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  // Description save debouncer — DocumentEditor fires onUpdate on every
  // keystroke; this collapses bursts to one PATCH per 1.5s window. Flushed
  // on task switch / drawer close so a pending edit doesn't bleed across.
  const descSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (descSaveTimerRef.current) {
        clearTimeout(descSaveTimerRef.current)
        descSaveTimerRef.current = null
      }
    }
  }, [taskId])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [activeTab, setActiveTab] = useState<'detail' | 'discussion' | 'activity'>('detail')
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const attachInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAttach, setUploadingAttach] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxName, setLightboxName] = useState<string>('')

  // Inline images dispatch `bundy-open-lightbox`. The drawer overlays
  // the DMs / Tasks pane below, so its lightbox should win. Push a
  // claim onto the shared stack — last-mounted overlay handles the
  // event regardless of registration order, and the stack restores
  // automatically on unmount.
  useLightboxClaim((detail) => {
    setLightboxUrl(detail.url)
    setLightboxName(detail.filename)
  })
  const [copiedLink, setCopiedLink] = useState(false)
  const [viewTaskId, setViewTaskId] = useState(taskId)
  const [parentStack, setParentStack] = useState<string[]>([])
  const [editingEnvLink, setEditingEnvLink] = useState<'staging' | 'production' | null>(null)
  const [envLinkValue, setEnvLinkValue] = useState('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiFetch = useCallback(async (path: string, opts?: RequestInit): Promise<any> => {
    const method = (opts?.method ?? 'GET') as 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'
    const headers = (opts?.headers ?? {}) as Record<string, string>
    const hasBody = opts?.body !== undefined && opts?.body !== null
    return sharedApiFetch(path, {
      method,
      rawBody: hasBody ? (opts!.body as BodyInit) : undefined,
      headers: hasBody ? { 'Content-Type': 'application/json', ...headers } : headers,
    })
  }, [])

  useEffect(() => {
    setLoadingDetail(true)
    setLoadError(null)
    // focusCommentId === '' means "open discussion tab without scrolling"
    // focusCommentId === '<id>' means "open discussion + scroll to comment"
    // focusCommentId == null means "open at detail tab"
    setActiveTab(focusCommentId !== null && focusCommentId !== undefined ? 'discussion' : 'detail')
    Promise.all([
      apiFetch(`/api/tasks/${viewTaskId}`),
      apiFetch('/api/users'),
    ]).then(async ([taskData, userData]: [{ task: Task }, { users: UserInfo[] }]) => {
      setDetail(taskData.task)
      setActivities(taskData.task.activities ?? [])
      setAttachments(taskData.task.attachments ?? [])
      setEditTitle(taskData.task.title)
      setUsers(userData.users)
      // Load discussion from root task (one discussion per project task)
      const rootId = taskData.task.parentTaskId ?? viewTaskId
      if (taskData.task.parentTaskId) {
        try {
          const rootData = await apiFetch(`/api/tasks/${rootId}`) as { task: Task }
          setComments(rootData.task.comments ?? [])
        } catch { setComments([]) }
      } else {
        setComments(taskData.task.comments ?? [])
      }
    }).catch((err) => { setLoadError(err?.message ?? 'Failed to load task') }).finally(() => setLoadingDetail(false))
  }, [viewTaskId, apiFetch, focusCommentId])

  // Push focus to the activity engine so the next heartbeat tags this task (P2.10).
  // Cleared on unmount or task switch — main process treats null as "no task in focus".
  useEffect(() => {
    window.electronAPI?.setCurrentTask?.(viewTaskId)
    return () => { window.electronAPI?.setCurrentTask?.(null) }
  }, [viewTaskId])

  // Live updates from SSE. After the discussion-channel migration, new
  // comments arrive via `bundy-channel-message` (full payload — splice
  // into state, no refetch) on the task's discussion channel. Edits
  // and deletes work the same way. `bundy-task-updated` still triggers
  // a silent refetch for non-comment task changes (status / priority /
  // attachments etc).
  // Use the server-resolved channel id — already accounts for the
  // subtask-rolls-up-to-parent rule. Falling back to the local
  // relation in case the response shape is older.
  const discussionChannelId = detail?.discussionChannelId ?? detail?.discussionChannel?.id ?? null
  useEffect(() => {
    const rootId = detail?.parentTaskId ?? viewTaskId
    function silentRefresh(reason: string): void {
      void (async () => {
        try {
          const fresh = await apiFetch(`/api/tasks/${viewTaskId}`) as { task: Task }
          setDetail(fresh.task)
          setActivities(fresh.task.activities ?? [])
          setAttachments(fresh.task.attachments ?? [])
          if (reason === 'comment' || !fresh.task.parentTaskId) {
            const cRoot = fresh.task.parentTaskId
              ? await apiFetch(`/api/tasks/${fresh.task.parentTaskId}`) as { task: Task }
              : { task: fresh.task }
            setComments(cRoot.task.comments ?? [])
          }
        } catch { /* offline / dropped — drawer keeps existing state */ }
      })()
    }
    function onTaskUpdated(e: Event): void {
      const detail = (e as CustomEvent).detail as { taskId?: string; mainTaskId?: string } | undefined
      if (detail?.taskId === viewTaskId || detail?.mainTaskId === rootId || detail?.taskId === rootId) {
        silentRefresh('update')
      }
    }

    // Channel-message → splice into comments state directly. Adapter
    // mirrors the server's taskCommentAdapter — pulls the attachment
    // chip out of content if present, swaps sender→user.
    const ATTACH_LINE_RE = /^!?\[(?:📎\s)?([^\]]+?)\]\((https?:\/\/\S+?)\)\s*$/
    type ChannelMsgPayload = {
      channelId: string; id: string; senderId: string
      senderName: string; senderAvatar: string | null
      content: string; createdAt: string; editedAt: string | null
      parentMessageId: string | null
    }
    function payloadToComment(p: ChannelMsgPayload): TaskComment {
      const lines = p.content.split('\n')
      let attachmentUrl: string | null = null
      let attachmentName: string | null = null
      const bodyLines: string[] = []
      for (const line of lines) {
        const m = ATTACH_LINE_RE.exec(line)
        if (m && !attachmentUrl) { attachmentName = m[1]; attachmentUrl = m[2] }
        else bodyLines.push(line)
      }
      return {
        id: p.id,
        body: bodyLines.join('\n').trim(),
        createdAt: p.createdAt,
        editedAt: p.editedAt,
        attachmentUrl,
        attachmentName,
        parentCommentId: p.parentMessageId,
        user: {
          id: p.senderId,
          username: p.senderName,
          alias: null,
          avatarUrl: p.senderAvatar,
        },
        reactions: [],
        replies: [],
      }
    }
    function onChannelMessage(e: Event): void {
      const payload = (e as CustomEvent).detail as ChannelMsgPayload | undefined
      if (!payload || !discussionChannelId || payload.channelId !== discussionChannelId) return
      // De-dupe — the actor's own send already optimistically inserted.
      setComments(prev => {
        const c = payloadToComment(payload)
        if (c.parentCommentId) {
          const exists = prev.some(p => p.id === c.parentCommentId && (p.replies ?? []).some(r => r.id === c.id))
          if (exists) return prev
          return prev.map(p => p.id === c.parentCommentId
            ? { ...p, replies: [...(p.replies ?? []), c] }
            : p)
        }
        if (prev.some(p => p.id === c.id)) return prev
        return [...prev, c]
      })
    }
    function onChannelMessageEdit(e: Event): void {
      const payload = (e as CustomEvent).detail as { channelId: string; messageId: string; content: string; editedAt: string } | undefined
      if (!payload || !discussionChannelId || payload.channelId !== discussionChannelId) return
      // Re-extract body+attachment from the new content.
      const lines = payload.content.split('\n')
      let attachmentUrl: string | null = null
      let attachmentName: string | null = null
      const bodyLines: string[] = []
      for (const line of lines) {
        const m = ATTACH_LINE_RE.exec(line)
        if (m && !attachmentUrl) { attachmentName = m[1]; attachmentUrl = m[2] }
        else bodyLines.push(line)
      }
      const body = bodyLines.join('\n').trim()
      setComments(prev => prev.map(p => {
        if (p.id === payload.messageId) return { ...p, body, attachmentUrl, attachmentName, editedAt: payload.editedAt }
        if (p.replies?.some(r => r.id === payload.messageId)) {
          return { ...p, replies: p.replies!.map(r => r.id === payload.messageId ? { ...r, body, attachmentUrl, attachmentName, editedAt: payload.editedAt } : r) }
        }
        return p
      }))
    }
    function onChannelMessageDelete(e: Event): void {
      const payload = (e as CustomEvent).detail as { channelId: string; messageId: string } | undefined
      if (!payload || !discussionChannelId || payload.channelId !== discussionChannelId) return
      setComments(prev => prev
        .filter(p => p.id !== payload.messageId)
        .map(p => p.replies?.some(r => r.id === payload.messageId)
          ? { ...p, replies: p.replies!.filter(r => r.id !== payload.messageId) }
          : p))
    }

    window.addEventListener('bundy-task-updated', onTaskUpdated)
    window.addEventListener('bundy-channel-message', onChannelMessage)
    window.addEventListener('bundy-channel-message-edit', onChannelMessageEdit)
    window.addEventListener('bundy-channel-message-delete', onChannelMessageDelete)
    return () => {
      window.removeEventListener('bundy-task-updated', onTaskUpdated)
      window.removeEventListener('bundy-channel-message', onChannelMessage)
      window.removeEventListener('bundy-channel-message-edit', onChannelMessageEdit)
      window.removeEventListener('bundy-channel-message-delete', onChannelMessageDelete)
    }
  }, [viewTaskId, detail?.parentTaskId, discussionChannelId, apiFetch])

  async function patchTask(data: Record<string, unknown>, fieldName?: string) {
    if (!detail) return
    setSavingField(fieldName ?? null)
    try {
      const d = await apiFetch(`/api/tasks/${viewTaskId}`, { method: 'PATCH', body: JSON.stringify(data) }) as { task: Task }
      setDetail(prev => prev ? {
        ...prev, ...d.task,
        comments: prev.comments, subtasks: prev.subtasks, activities: prev.activities, attachments: prev.attachments,
      } : d.task)
      setComments(d.task.comments ?? comments)
      setActivities(d.task.activities ?? activities)
      onUpdated(d.task)
      onRefresh?.()
    } catch (err) { console.error('[TaskDetail] patch failed:', err) } finally { setSavingField(null) }
  }

  async function saveTitle() {
    const t = editTitle.trim()
    if (!t || !detail || t === detail.title) { setEditingTitle(false); return }
    await patchTask({ title: t }, 'title')
    setEditingTitle(false)
  }

  async function deleteTask() {
    setDeleting(true)
    try {
      await apiFetch(`/api/tasks/${viewTaskId}`, { method: 'DELETE' })
      onDeleted(viewTaskId)
    } catch (err) { console.error('[TaskDetail] delete failed:', err) } finally { setDeleting(false) }
  }

  async function createSubtask() {
    if (!newSubtaskTitle.trim() || !detail) return
    const titleTrimmed = newSubtaskTitle.trim()
    setAddingSubtask(true)
    try {
      const d = await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: titleTrimmed, parentTaskId: viewTaskId, projectId: detail.projectId }),
      }) as { task: Task }
      setDetail(prev => prev ? { ...prev, subtasks: [...(prev.subtasks ?? []), d.task], _count: { ...prev._count, subtasks: prev._count.subtasks + 1 } } : prev)
      onUpdated({ ...detail, _count: { ...detail._count, subtasks: detail._count.subtasks + 1 } })
      setNewSubtaskTitle('')
    } catch (err) {
      if (err instanceof QueuedWriteError) {
        // Offline — apiFetch already enqueued the POST and patched the
        // single-task IndexedDB cache via optimisticCache.ts. Surface the
        // optimistic record in the drawer so the user sees their subtask
        // immediately; the queued write will replay when the network returns.
        const tempId = err.item.tempId ?? err.item.id
        const optimistic = {
          id: tempId,
          title: titleTrimmed,
          description: null,
          status: 'todo',
          priority: 'medium',
          dueDate: null,
          estimatedHours: null,
          createdBy: auth.userId,
          projectId: detail.projectId ?? null,
          assigneeId: null,
          parentTaskId: viewTaskId,
          project: null,
          section: null,
          assignee: null,
          _count: { comments: 0, subtasks: 0 },
        } satisfies Task
        setDetail(prev => prev ? {
          ...prev,
          subtasks: [...(prev.subtasks ?? []), optimistic],
          _count: { ...prev._count, subtasks: prev._count.subtasks + 1 },
        } : prev)
        onUpdated({ ...detail, _count: { ...detail._count, subtasks: detail._count.subtasks + 1 } })
        setNewSubtaskTitle('')
      } else {
        console.error('[TaskDetail] createSubtask failed:', err)
      }
    } finally { setAddingSubtask(false) }
  }

  async function toggleSubtask(subId: string, currentStatus: string) {
    const newStatus = currentStatus === 'done' ? 'todo' : 'done'
    setDetail(prev => prev ? { ...prev, subtasks: (prev.subtasks ?? []).map(s => s.id === subId ? { ...s, status: newStatus } : s) } : prev)
    try {
      await apiFetch(`/api/tasks/${subId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) })
      const refreshed = await apiFetch(`/api/tasks/${viewTaskId}`) as { task: Task }
      setDetail(prev => prev ? { ...prev, status: refreshed.task.status, subtasks: refreshed.task.subtasks } : prev)
      onUpdated({ ...detail!, status: refreshed.task.status })
    } catch {
      setDetail(prev => prev ? { ...prev, subtasks: (prev.subtasks ?? []).map(s => s.id === subId ? { ...s, status: currentStatus } : s) } : prev)
    }
  }

  async function uploadAttachment(file: File) {
    if (file.size > 15 * 1024 * 1024) { alert('File must be under 15MB'); return }
    setUploadingAttach(true)
    const tracker = trackUpload({ name: file.name, surface: 'task', total: file.size })
    try {
      // Phase 3 — try direct-to-R2 first; fall back to multipart on 501 / error.
      const r2 = await tryDirectR2Upload({
        signEndpoint: `/api/tasks/${viewTaskId}/attachments/sign`,
        signBody: {},
        file,
        onProgress: (pct) => tracker.onProgress(pct),
      })
      if (r2.ok) {
        const attachment = (r2.data as { attachment: TaskAttachment }).attachment
        setAttachments(prev => [...prev, attachment])
        tracker.success()
        return
      }
      const fd = new FormData()
      fd.append('file', file)
      const d = await xhrUploadJson<{ attachment: TaskAttachment }>(
        `${config.apiBase}/api/tasks/${viewTaskId}/attachments`,
        config.token, fd,
        (loaded, total) => tracker.onProgress(total > 0 ? (loaded / total) * 100 : 0),
      )
      setAttachments(prev => [...prev, d.attachment])
      tracker.success()
    } catch (err) {
      console.error('[TaskDetail] uploadAttachment failed:', err)
      tracker.fail(err instanceof Error ? err.message : String(err))
    } finally { setUploadingAttach(false) }
  }

  async function deleteAttachment(attId: string) {
    setAttachments(prev => prev.filter(a => a.id !== attId))
    try {
      await apiFetch(`/api/tasks/${viewTaskId}/attachments`, { method: 'DELETE', body: JSON.stringify({ attachmentId: attId }) })
    } catch {
      apiFetch(`/api/tasks/${viewTaskId}`).then((d: { task: Task }) => setAttachments(d.task.attachments ?? []))
    }
  }

  function openSubtask(subId: string) { setParentStack(prev => [...prev, viewTaskId]); setViewTaskId(subId) }
  function goBackToParent() {
    const parentId = parentStack[parentStack.length - 1]
    if (parentId) { setParentStack(prev => prev.slice(0, -1)); setViewTaskId(parentId) }
  }

  const canDelete = detail ? (
    !detail.parentTaskId
      ? auth.role === 'admin'
      : (detail.createdBy === auth.userId || auth.role === 'admin')
  ) : false

  const isMainTask = detail ? !detail.parentTaskId : true
  const hasSubtasks = (detail?.subtasks?.length ?? 0) > 0
  const subtaskProgress = (() => {
    if (!detail?.subtasks?.length) return null
    const total = detail.subtasks.length
    const done = detail.subtasks.filter(s => s.status === 'done').length
    return Math.round((done / total) * 100)
  })()

  const drawerStyle: React.CSSProperties = {
    position: 'absolute', top: 0, right: 0, bottom: 0, width: '75%', minWidth: 400,
    background: C.lgBg, borderLeft: `1px solid ${C.separator}`,
    boxShadow: '-8px 0 30px rgba(0,0,0,0.08)',
    display: 'flex', flexDirection: 'column', zIndex: 50,
  }

  if (loadingDetail) {
    return (
      <div style={{ ...drawerStyle, alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={24} color={C.accent} />
      </div>
    )
  }

  if (!detail) return (
    <div style={{ ...drawerStyle, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <AlertCircle size={32} color={C.danger} strokeWidth={1.5} />
      <span style={{ fontSize: 13, color: C.danger, fontWeight: 600 }}>{loadError || 'Task not found'}</span>
      <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Close</button>
    </div>
  )

  return (
    <div style={drawerStyle}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.separator}`, display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0 }}>
        {parentStack.length > 0 ? (
          <button onClick={goBackToParent} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, padding: 4, flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', gap: 2, fontSize: 11 }}>
            <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
          </button>
        ) : (
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, flexShrink: 0, marginTop: 1 }}>
            <X size={16} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditTitle(detail.title); setEditingTitle(false) } }}
              autoFocus
              style={{ width: '100%', fontSize: 15, fontWeight: 700, color: C.text, background: 'transparent', border: `1px solid ${C.accent}`, borderRadius: 6, padding: '4px 8px', outline: 'none', fontFamily: 'inherit' }}
            />
          ) : (
            <div onClick={() => { setEditTitle(detail.title); setEditingTitle(true) }}
              style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.3, cursor: 'pointer' }}>
              {detail.title}
              <Edit2 size={10} style={{ marginLeft: 6, opacity: 0.3, verticalAlign: 'middle' }} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {parentStack.length > 0 && (
              <span style={{ fontSize: 10, fontWeight: 600, color: C.accent, background: C.accent + '18', borderRadius: 4, padding: '1px 6px' }}>Subtask</span>
            )}
            {detail.project && (
              <span style={{ fontSize: 10, fontWeight: 600, color: detail.project.color, background: detail.project.color + '18', borderRadius: 4, padding: '1px 6px' }}>
                {detail.project.name}
              </span>
            )}
            <span style={{ fontSize: 10, color: C.textMuted }}>by {detail.creator?.alias ?? detail.creator?.username ?? '—'}</span>
            {isMainTask && subtaskProgress !== null && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: subtaskProgress === 100 ? C.success : C.accent,
                background: (subtaskProgress === 100 ? C.success : C.accent) + '18',
                borderRadius: 4, padding: '1px 6px',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                <BarChart2 size={9} /> {subtaskProgress}%
              </span>
            )}
          </div>
        </div>
        {canDelete && (
          <button onClick={() => setConfirmDelete(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 4, flexShrink: 0 }} title="Delete">
            <Trash2 size={14} />
          </button>
        )}
        <button onClick={() => {
          const link = `${config.apiBase}/tasks/${viewTaskId}`
          if (window.electronAPI?.writeClipboard) {
            window.electronAPI.writeClipboard(link)
          } else {
            navigator.clipboard.writeText(link)
          }
          setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000)
        }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedLink ? C.success : C.textMuted, padding: 4, flexShrink: 0 }}
          title={copiedLink ? 'Copied!' : 'Copy task link'}
        >{copiedLink ? <Check size={14} /> : <Link size={14} />}</button>
        {parentStack.length > 0 && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, flexShrink: 0 }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Progress bar for main tasks */}
      {isMainTask && subtaskProgress !== null && (
        <div style={{ height: 3, background: C.separator, flexShrink: 0 }}>
          <div style={{
            height: '100%', width: `${subtaskProgress}%`,
            background: subtaskProgress === 100 ? C.success : C.accent,
            transition: 'width 0.3s ease',
          }} />
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ padding: '10px 16px', background: C.bgInput, borderBottom: `1px solid ${C.danger}33`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: C.danger, flex: 1 }}>Delete this task permanently?</span>
          <button onClick={deleteTask} disabled={deleting} style={{
            padding: '4px 12px', borderRadius: 6, border: 'none', background: C.danger, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: deleting ? 0.5 : 1
          }}>{deleting ? 'Deleting…' : 'Delete'}</button>
          <button onClick={() => setConfirmDelete(false)} style={{
            padding: '4px 12px', borderRadius: 6, border: `1px solid ${C.separator}`, background: C.lgBg, color: C.textMuted, fontSize: 12, cursor: 'pointer'
          }}>Cancel</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.separator}`, flexShrink: 0 }}>
        {([
          { key: 'detail' as const, label: 'Details', icon: <AlignLeft size={12} /> },
          { key: 'discussion' as const, label: `Discussion (${comments.length + comments.reduce((n, c) => n + (c.replies?.length ?? 0), 0)})`, icon: <MessageSquare size={12} /> },
          { key: 'activity' as const, label: 'Activity', icon: <Activity size={12} /> },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            flex: 1, padding: '8px 12px', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            fontSize: 11, fontWeight: activeTab === tab.key ? 600 : 400,
            color: activeTab === tab.key ? C.accent : C.textMuted,
            background: 'transparent',
            borderBottom: activeTab === tab.key ? `2px solid ${C.accent}` : '2px solid transparent',
          }}>{tab.icon} {tab.label}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: 16 }}>
        {activeTab === 'detail' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Status */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                Status {isMainTask && hasSubtasks && <span style={{ fontSize: 9, fontWeight: 400, color: C.textMuted, textTransform: 'none' }}>(auto from subtasks)</span>}
              </div>
              {isMainTask && hasSubtasks ? (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {Object.entries(TASK_STATUS_LABELS).map(([s, l]) => (
                    <span key={s} style={{
                      padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: detail.status === s ? TASK_STATUS_COLORS[s] : C.lgBg,
                      color: detail.status === s ? '#fff' : C.textMuted,
                      boxShadow: detail.status === s ? `0 2px 6px ${TASK_STATUS_COLORS[s]}44` : C.lgShadow,
                      opacity: detail.status === s ? 1 : 0.4,
                    }}>{l}</span>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {Object.entries(TASK_STATUS_LABELS).map(([s, l]) => (
                    <button key={s} onClick={() => patchTask({ status: s }, 'status')} disabled={savingField === 'status'}
                      style={{
                        padding: '4px 10px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                        background: detail.status === s ? TASK_STATUS_COLORS[s] : C.lgBg,
                        color: detail.status === s ? '#fff' : C.textMuted,
                        boxShadow: detail.status === s ? `0 2px 6px ${TASK_STATUS_COLORS[s]}44` : C.lgShadow,
                        transition: 'all 0.15s',
                      }}>{l}</button>
                  ))}
                </div>
              )}
            </div>
            {/* Priority */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Priority</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {Object.entries(PRIORITY_LABELS).map(([p, l]) => (
                  <button key={p} onClick={() => patchTask({ priority: p }, 'priority')} disabled={savingField === 'priority'}
                    style={{
                      padding: '4px 10px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                      background: detail.priority === p ? PRIORITY_COLORS[p] : C.lgBg,
                      color: detail.priority === p ? '#fff' : C.textMuted,
                      boxShadow: detail.priority === p ? `0 2px 6px ${PRIORITY_COLORS[p]}44` : C.lgShadow,
                      transition: 'all 0.15s',
                    }}><Flag size={9} /> {l}</button>
                ))}
              </div>
            </div>
            {/* Description */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlignLeft size={10} /> Description
              </div>
              {/* Same DocumentEditor used by the Report tab — keyed by `task-{id}`
                  so the Y.js sync namespace is distinct from Report-document docs. */}
              <DocumentEditor
                key={viewTaskId}
                content={detail.description ?? ''}
                onUpdate={(html) => {
                  if (descSaveTimerRef.current) clearTimeout(descSaveTimerRef.current)
                  descSaveTimerRef.current = setTimeout(() => {
                    patchTask({ description: html || null }, 'description')
                  }, 1500)
                }}
                apiBase={config.apiBase}
                token={config.token}
                collabKey={`task-${viewTaskId}`}
                user={{ id: auth.userId, name: auth.username, avatar: auth.avatarUrl }}
              />
            </div>
            {/* Attachments */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Paperclip size={10} /> Attachments
              </div>
              {/* Main task attachments */}
              {attachments.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <AttachmentSlider
                    attachments={attachments}
                    apiBase={config.apiBase}
                    onDelete={deleteAttachment}
                  />
                </div>
              )}
              {/* Per-subtask attachments */}
              {isMainTask && (detail.subtasks ?? []).filter(s => (s.attachments?.length ?? 0) > 0).map(sub => (
                <div key={sub.id} style={{ marginBottom: 12 }}>
                  <AttachmentSlider
                    attachments={sub.attachments!}
                    contextLabel={`Subtask: ${sub.title}`}
                    onContextClick={() => openSubtask(sub.id)}
                    apiBase={config.apiBase}
                  />
                </div>
              ))}
              <input ref={attachInputRef} type="file" style={{ display: 'none' }} accept="*/*"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(f); e.target.value = '' }} />
              <button onClick={() => attachInputRef.current?.click()} disabled={uploadingAttach}
                style={{ ...neu(), padding: '5px 10px', border: 'none', cursor: 'pointer', fontSize: 11, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 4, opacity: uploadingAttach ? 0.5 : 1 }}>
                {uploadingAttach ? <Loader size={11} /> : <Plus size={11} />}
                {uploadingAttach ? 'Uploading…' : 'Add attachment'}
              </button>
            </div>
            {/* Meta grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Calendar size={10} /> Start Date
                </div>
                <input type="date" value={detail.startDate ? new Date(detail.startDate).toISOString().split('T')[0] : ''}
                  onChange={e => patchTask({ startDate: e.target.value || null }, 'startDate')}
                  disabled={savingField === 'startDate'}
                  style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Calendar size={10} /> Due Date
                </div>
                <input
                  type="date"
                  value={detail.dueDate ? new Date(detail.dueDate).toISOString().split('T')[0] : ''}
                  onChange={e => patchTask({ dueDate: e.target.value || null }, 'dueDate')}
                  disabled={savingField === 'dueDate'}
                  style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}
                />
              </div>
              {/* Assignee — only for subtasks */}
              {!isMainTask && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Assignee</div>
                  <select value={detail.assigneeId ?? ''} onChange={e => patchTask({ assigneeId: e.target.value || null }, 'assignee')} disabled={savingField === 'assignee'}
                    style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <option value="">Unassigned</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.alias ?? u.username}</option>)}
                  </select>
                </div>
              )}
              <div style={{ gridColumn: isMainTask ? 'span 2' : undefined }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Project</div>
                <select value={detail.projectId ?? ''} onChange={e => patchTask({ projectId: e.target.value || null }, 'project')} disabled={savingField === 'project'}
                  style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <option value="">No Project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            {/* Staging & Production Links — main tasks only */}
            {isMainTask && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Globe size={10} /> Environment Links
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Staging */}
                  {editingEnvLink === 'staging' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Globe size={14} style={{ color: '#f59e0b' }} />
                      </div>
                      <input
                        autoFocus
                        value={envLinkValue}
                        onChange={e => setEnvLinkValue(e.target.value)}
                        onBlur={() => { const v = envLinkValue.trim() || null; setDetail(prev => prev ? { ...prev, stagingUrl: v } : prev); patchTask({ stagingUrl: v }, 'stagingUrl'); setEditingEnvLink(null) }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = envLinkValue.trim() || null; setDetail(prev => prev ? { ...prev, stagingUrl: v } : prev); patchTask({ stagingUrl: v }, 'stagingUrl'); setEditingEnvLink(null) } if (e.key === 'Escape') setEditingEnvLink(null) }}
                        placeholder="https://staging.example.com"
                        style={{ flex: 1, ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: `1px solid ${C.accent}`, borderRadius: 6, outline: 'none', fontFamily: 'inherit' }}
                      />
                    </div>
                  ) : detail.stagingUrl ? (
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, ...neu(), padding: '8px 10px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.bgHover ?? `${C.text}08` }}
                      onMouseLeave={e => { e.currentTarget.style.background = '' }}
                      onClick={() => {
                        if (detail.stagingLinkId) {
                          const publicBase = 'https://bundy.40h.studio'
                          const bridgeUrl = `${publicBase}/api/auth/desktop-bridge?token=${encodeURIComponent(config.token)}&redirect=${encodeURIComponent(`/report/feedback/${detail.stagingLinkId}`)}`
                          window.electronAPI.openExternal(bridgeUrl)
                        } else {
                          let url = detail.stagingUrl!
                          if (!/^https?:\/\//i.test(url)) url = `https://${url}`
                          window.electronAPI.openExternal(url)
                        }
                      }}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Globe size={14} style={{ color: '#f59e0b' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#f59e0b', marginBottom: 1 }}>Staging</div>
                        <div style={{ fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(() => { try { return new URL(detail.stagingUrl!.startsWith('http') ? detail.stagingUrl! : `https://${detail.stagingUrl}`).hostname } catch { return detail.stagingUrl } })()}
                        </div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setEnvLinkValue(detail.stagingUrl ?? ''); setEditingEnvLink('staging') }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2, opacity: 0.5 }}>
                        <Edit2 size={11} />
                      </button>
                      <ExternalLink size={11} style={{ color: C.textMuted, opacity: 0.4, flexShrink: 0 }} />
                    </div>
                  ) : (
                    <button onClick={() => { setEnvLinkValue(''); setEditingEnvLink('staging') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, ...neu(), padding: '8px 10px', borderRadius: 8, cursor: 'pointer', border: 'none', background: 'transparent', fontFamily: 'inherit', width: '100%', textAlign: 'left' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(245,158,11,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Plus size={12} style={{ color: '#f59e0b', opacity: 0.5 }} />
                      </div>
                      <span style={{ fontSize: 11, color: C.textMuted, opacity: 0.5 }}>Add staging URL…</span>
                    </button>
                  )}
                  {/* Production */}
                  {editingEnvLink === 'production' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${C.success}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Globe size={14} style={{ color: C.success }} />
                      </div>
                      <input
                        autoFocus
                        value={envLinkValue}
                        onChange={e => setEnvLinkValue(e.target.value)}
                        onBlur={() => { const v = envLinkValue.trim() || null; setDetail(prev => prev ? { ...prev, productionUrl: v } : prev); patchTask({ productionUrl: v }, 'productionUrl'); setEditingEnvLink(null) }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = envLinkValue.trim() || null; setDetail(prev => prev ? { ...prev, productionUrl: v } : prev); patchTask({ productionUrl: v }, 'productionUrl'); setEditingEnvLink(null) } if (e.key === 'Escape') setEditingEnvLink(null) }}
                        placeholder="https://example.com"
                        style={{ flex: 1, ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: `1px solid ${C.accent}`, borderRadius: 6, outline: 'none', fontFamily: 'inherit' }}
                      />
                    </div>
                  ) : detail.productionUrl ? (
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, ...neu(), padding: '8px 10px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.bgHover ?? `${C.text}08` }}
                      onMouseLeave={e => { e.currentTarget.style.background = '' }}
                      onClick={() => {
                        if (detail.productionLinkId) {
                          const publicBase = 'https://bundy.40h.studio'
                          const bridgeUrl = `${publicBase}/api/auth/desktop-bridge?token=${encodeURIComponent(config.token)}&redirect=${encodeURIComponent(`/report/feedback/${detail.productionLinkId}`)}`
                          window.electronAPI.openExternal(bridgeUrl)
                        } else {
                          let url = detail.productionUrl!
                          if (!/^https?:\/\//i.test(url)) url = `https://${url}`
                          window.electronAPI.openExternal(url)
                        }
                      }}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${C.success}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Globe size={14} style={{ color: C.success }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: C.success, marginBottom: 1 }}>Production</div>
                        <div style={{ fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(() => { try { return new URL(detail.productionUrl!.startsWith('http') ? detail.productionUrl! : `https://${detail.productionUrl}`).hostname } catch { return detail.productionUrl } })()}
                        </div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setEnvLinkValue(detail.productionUrl ?? ''); setEditingEnvLink('production') }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2, opacity: 0.5 }}>
                        <Edit2 size={11} />
                      </button>
                      <ExternalLink size={11} style={{ color: C.textMuted, opacity: 0.4, flexShrink: 0 }} />
                    </div>
                  ) : (
                    <button onClick={() => { setEnvLinkValue(''); setEditingEnvLink('production') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, ...neu(), padding: '8px 10px', borderRadius: 8, cursor: 'pointer', border: 'none', background: 'transparent', fontFamily: 'inherit', width: '100%', textAlign: 'left' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${C.success}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Plus size={12} style={{ color: C.success, opacity: 0.5 }} />
                      </div>
                      <span style={{ fontSize: 11, color: C.textMuted, opacity: 0.5 }}>Add production URL…</span>
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* Collaborators — main tasks only */}
            {isMainTask && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={10} /> Collaborators
                  <span style={{ fontSize: 9, fontWeight: 400, color: C.textMuted, textTransform: 'none' }}>(auto from subtask assignees)</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(detail.multiAssignees ?? []).length === 0 && (
                    <span style={{ fontSize: 11, color: C.textMuted, opacity: 0.5 }}>No collaborators yet — assign subtasks to populate</span>
                  )}
                  {(detail.multiAssignees ?? []).map(({ user: u }) => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 5, ...neu(), padding: '4px 8px', borderRadius: 8 }}>
                      <Avatar url={u.avatarUrl} name={u.alias ?? u.username} size={18} />
                      <span style={{ fontSize: 11, color: C.text }}>{u.alias ?? u.username}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Subtasks */}
            {isMainTask && <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <GitBranch size={10} /> Subtasks ({detail.subtasks?.length ?? 0})
                {subtaskProgress !== null && (
                  <span style={{ fontSize: 9, fontWeight: 400, color: C.textMuted, textTransform: 'none' }}>
                    — {subtaskProgress}% complete
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {(detail.subtasks ?? []).map(sub => {
                  const subDone = sub.status === 'done'
                  return (
                    <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, ...neu(), padding: '7px 10px', borderRadius: 8, cursor: 'pointer' }}
                      onClick={() => openSubtask(sub.id)}>
                      <button onClick={(e) => { e.stopPropagation(); toggleSubtask(sub.id, sub.status) }}
                        style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', border: `2px solid ${subDone ? C.success : C.separator}`, background: subDone ? C.success : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {subDone && <Check size={10} color="#fff" />}
                      </button>
                      <span style={{ flex: 1, fontSize: 12, color: C.text, textDecoration: subDone ? 'line-through' : 'none', opacity: subDone ? 0.5 : 1 }}>{sub.title}</span>
                      {sub.dueDate && (
                        <span
                          title={`Due ${new Date(sub.dueDate).toLocaleDateString()}`}
                          style={{
                            fontSize: 10, color: new Date(sub.dueDate) < new Date() && !subDone ? C.danger : C.textMuted,
                            display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                          }}
                        >
                          <Calendar size={10} />
                          {new Date(sub.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      <span style={{ fontSize: 9, fontWeight: 600, color: TASK_STATUS_COLORS[sub.status] ?? C.textMuted, background: (TASK_STATUS_COLORS[sub.status] ?? C.textMuted) + '18', borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>
                        {TASK_STATUS_LABELS[sub.status] ?? sub.status}
                      </span>
                      {sub._count?.comments > 0 && (
                        <span style={{ fontSize: 10, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 2 }}>
                          <MessageSquare size={9} /> {sub._count.comments}
                        </span>
                      )}
                      {sub.assignee && <Avatar url={sub.assignee.avatarUrl} name={sub.assignee.alias ?? sub.assignee.username} size={18} />}
                      <button onClick={(e) => { e.stopPropagation(); openSubtask(sub.id); setActiveTab('discussion') }}
                        title="Discuss this subtask"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2, opacity: 0.5 }}>
                        <MessageSquare size={11} />
                      </button>
                      <ChevronRight size={12} color={C.textMuted} style={{ opacity: 0.4 }} />
                    </div>
                  )
                })}
                {(detail.subtasks ?? []).length === 0 && <div style={{ fontSize: 11, color: C.textMuted, opacity: 0.4, padding: '4px 0' }}>No subtasks yet</div>}
              </div>
              {/* Only allow adding subtasks on main tasks */}
              {isMainTask && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newSubtaskTitle} onChange={e => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newSubtaskTitle.trim()) createSubtask() }}
                    placeholder="Add subtask…"
                    style={{ flex: 1, ...neu(true), padding: '6px 10px', fontSize: 11, color: C.text, border: 'none', outline: 'none', fontFamily: 'inherit' }}
                  />
                  <button onClick={createSubtask} disabled={addingSubtask || !newSubtaskTitle.trim()}
                    style={{ ...neu(), padding: '6px 10px', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 11, fontWeight: 600, opacity: !newSubtaskTitle.trim() ? 0.4 : 1 }}>
                    {addingSubtask ? '…' : <Plus size={12} />}
                  </button>
                </div>
              )}
            </div>}
          </div>
        )}

        {/* Architectural mirror: drawer's discussion now mounts the
            same single-channel pane the DMs main pane uses. Same UI,
            same realtime push, same state model — no more drift. */}
        {activeTab === 'discussion' && discussionChannelId && (
          <DiscussionPanel
            channelId={discussionChannelId}
            config={config}
            auth={auth}
            subtaskContext={detail?.parentTaskId && detail
              ? { id: detail.id, title: detail.title }
              : null}
          />
        )}
        {activeTab === 'discussion' && !discussionChannelId && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: C.textMuted, fontSize: 13 }}>
            <Loader size={18} />
          </div>
        )}


        {activeTab === 'activity' && <TaskActivity activities={activities} />}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 100, cursor: 'zoom-out' }}>
          <img src={lightboxUrl} alt={lightboxName} onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8, cursor: 'default' }} />
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#fff', fontSize: 13 }}>{lightboxName}</span>
            <button onClick={e => { e.stopPropagation(); window.electronAPI.openExternal(lightboxUrl!) }}
              style={{ color: C.accent, fontSize: 12, fontWeight: 600, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Download</button>
          </div>
          <button onClick={() => setLightboxUrl(null)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>
      )}
    </div>
  )
}
