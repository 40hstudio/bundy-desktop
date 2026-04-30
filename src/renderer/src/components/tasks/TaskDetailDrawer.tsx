import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X, Trash2, Check, Link, Edit2, AlignLeft, MessageSquare,
  Activity, ChevronRight, Loader, AlertCircle, Paperclip, FileText,
  Calendar, Clock, GitBranch, Users,
  Plus, CornerDownRight, Flag, Globe, ExternalLink, BarChart2,
  Smile, Quote, MessageCircle
} from 'lucide-react'
import {
  ApiConfig, Auth, Task, TaskProject, TaskComment,
  TaskActivityItem, TaskAttachment, UserInfo
} from '../../types'
import AttachmentSlider from '../shared/AttachmentSlider'
import TaskDescriptionEditor from './TaskDescriptionEditor'
import { C, neu } from '../../theme'
import { timeAgo } from '../../utils/format'
import { renderMessageContent, linkifyText, isImageUrl, extractUrls, TASK_LINK_RE, REPORT_LINK_RE, FEEDBACK_LINK_RE } from '../../utils/markdown'
import { Avatar } from '../shared/Avatar'
import { OgPreview } from '../messages/OgPreview'
import { MessageInput } from '../messages/MessageInput'
import { TaskLinkCard } from '../messages/TaskLinkCard'
import { ReportLinkCard } from '../messages/ReportLinkCard'
import { FeedbackLinkCard } from '../messages/FeedbackLinkCard'
import { EmojiPicker } from '../messages/EmojiPicker'
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from './constants'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🚀']

export default function TaskDetailDrawer({ taskId, config, auth, projects, onClose, onUpdated, onDeleted, onRefresh }: {
  taskId: string; config: ApiConfig; auth: Auth
  projects: TaskProject[]
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
  const [commentText, setCommentText] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  const [replyTo, setReplyTo] = useState<TaskComment | null>(null)
  const [savingField, setSavingField] = useState<string | null>(null)
  const [users, setUsers] = useState<UserInfo[]>([])
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)
  const [editDesc, setEditDesc] = useState('')
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
  const [copiedLink, setCopiedLink] = useState(false)
  const [viewTaskId, setViewTaskId] = useState(taskId)
  const [parentStack, setParentStack] = useState<string[]>([])
  const [subtaskContext, setSubtaskContext] = useState<{ id: string; title: string } | null>(null)
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null)
  const [emojiPickerCommentId, setEmojiPickerCommentId] = useState<string | null>(null)
  const [fullEmojiPickerCommentId, setFullEmojiPickerCommentId] = useState<string | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentBody, setEditingCommentBody] = useState('')
  const [editingEnvLink, setEditingEnvLink] = useState<'staging' | 'production' | null>(null)
  const [envLinkValue, setEnvLinkValue] = useState('')
  const [threadParentId, setThreadParentId] = useState<string | null>(null)
  const [copiedCommentId, setCopiedCommentId] = useState<string | null>(null)

  const apiFetch = useCallback(async (path: string, opts?: RequestInit) => {
    const res = await fetch(`${config.apiBase}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }, [config])

  useEffect(() => {
    setLoadingDetail(true)
    setLoadError(null)
    setActiveTab('detail')
    Promise.all([
      apiFetch(`/api/tasks/${viewTaskId}`),
      apiFetch('/api/users'),
    ]).then(async ([taskData, userData]: [{ task: Task }, { users: UserInfo[] }]) => {
      setDetail(taskData.task)
      setActivities(taskData.task.activities ?? [])
      setAttachments(taskData.task.attachments ?? [])
      setEditTitle(taskData.task.title)
      setEditDesc(taskData.task.description ?? '')
      setUsers(userData.users)
      // Load discussion from root task (one discussion per project task)
      const rootId = taskData.task.parentTaskId ?? viewTaskId
      if (taskData.task.parentTaskId) {
        setSubtaskContext({ id: viewTaskId, title: taskData.task.title })
        try {
          const rootData = await apiFetch(`/api/tasks/${rootId}`) as { task: Task }
          setComments(rootData.task.comments ?? [])
        } catch { setComments([]) }
      } else {
        setSubtaskContext(null)
        setComments(taskData.task.comments ?? [])
      }
    }).catch((err) => { setLoadError(err?.message ?? 'Failed to load task') }).finally(() => setLoadingDetail(false))
  }, [viewTaskId, apiFetch])

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

  async function saveDesc() {
    const d = editDesc.trim()
    if (!detail || d === (detail.description ?? '')) { setEditingDesc(false); return }
    await patchTask({ description: d || null }, 'description')
    setEditingDesc(false)
  }

  // Root task ID for discussion (one discussion per project task)
  const discussionTaskId = detail?.parentTaskId ?? viewTaskId
  const threadComment = threadParentId ? comments.find(c => c.id === threadParentId) ?? null : null

  async function addComment() {
    if (!commentText.trim()) return
    setAddingComment(true)
    const parentId = replyTo?.id ?? null
    let body = commentText.trim()
    if (subtaskContext && !parentId) {
      body = `> [Subtask: ${subtaskContext.title}](/tasks/${subtaskContext.id})\n\n${body}`
      setSubtaskContext(null)
    }
    try {
      const d = await apiFetch(`/api/tasks/${discussionTaskId}/comments`, {
        method: 'POST', body: JSON.stringify({ body, parentCommentId: parentId }),
      }) as { comment: TaskComment }
      if (parentId) setComments(prev => prev.map(c => c.id === parentId ? { ...c, replies: [...(c.replies ?? []), d.comment] } : c))
      else setComments(prev => [...prev, d.comment])
      setCommentText(''); setReplyTo(null)
      onRefresh?.()
    } catch (err) { console.error('[TaskDetail] addComment failed:', err) } finally { setAddingComment(false) }
  }

  async function handleTaskUpload(file: File): Promise<{ url: string; filename: string }> {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${config.apiBase}/api/tasks/${discussionTaskId}/attachments`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.token}` }, body: fd,
    })
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    const d = await res.json() as { attachment: { url: string; name: string } }
    return { url: d.attachment.url, filename: d.attachment.name }
  }

  async function deleteTask() {
    setDeleting(true)
    try {
      await apiFetch(`/api/tasks/${viewTaskId}`, { method: 'DELETE' })
      onDeleted(viewTaskId)
    } catch (err) { console.error('[TaskDetail] delete failed:', err) } finally { setDeleting(false) }
  }

  // ─── Discussion helpers ────────────────────────────────────────────────────

  function groupReactions(reactions: NonNullable<TaskComment['reactions']>) {
    const map = new Map<string, { emoji: string; count: number; users: string[]; reacted: boolean }>()
    for (const r of reactions) {
      const existing = map.get(r.emoji)
      if (existing) {
        existing.count++
        existing.users.push(r.user.alias ?? r.user.username)
        if (r.userId === auth.userId) existing.reacted = true
      } else {
        map.set(r.emoji, { emoji: r.emoji, count: 1, users: [r.user.alias ?? r.user.username], reacted: r.userId === auth.userId })
      }
    }
    return Array.from(map.values())
  }

  async function toggleReaction(commentId: string, emoji: string) {
    try {
      const res = await apiFetch(`/api/tasks/${discussionTaskId}/comments/${commentId}/reactions`, {
        method: 'POST', body: JSON.stringify({ emoji }),
      })
      const action = res.action as 'added' | 'removed'
      const updateComment = (c: TaskComment): TaskComment => {
        if (c.id !== commentId) {
          if (c.replies) return { ...c, replies: c.replies.map(updateComment) }
          return c
        }
        const reactions = [...(c.reactions ?? [])]
        if (action === 'added') {
          reactions.push({ id: '', emoji, userId: auth.userId, user: { id: auth.userId, username: auth.username, alias: null } })
        } else {
          const idx = reactions.findIndex(r => r.emoji === emoji && r.userId === auth.userId)
          if (idx >= 0) reactions.splice(idx, 1)
        }
        return { ...c, reactions }
      }
      setComments(prev => prev.map(updateComment))
    } catch { /* offline */ }
    setEmojiPickerCommentId(null)
    setFullEmojiPickerCommentId(null)
  }

  async function editComment(commentId: string) {
    const body = editingCommentBody.trim()
    if (!body) return
    try {
      await apiFetch(`/api/tasks/${discussionTaskId}/comments/${commentId}`, {
        method: 'PATCH', body: JSON.stringify({ body }),
      })
      const updateComment = (c: TaskComment): TaskComment => {
        if (c.id === commentId) return { ...c, body, editedAt: new Date().toISOString() }
        if (c.replies) return { ...c, replies: c.replies.map(updateComment) }
        return c
      }
      setComments(prev => prev.map(updateComment))
    } catch (err) { console.error('[TaskDetail] editComment failed:', err) }
    setEditingCommentId(null)
    setEditingCommentBody('')
  }

  async function deleteComment(commentId: string) {
    try {
      await apiFetch(`/api/tasks/${discussionTaskId}/comments/${commentId}`, { method: 'DELETE' })
      setComments(prev => {
        // Try removing as top-level comment
        const filtered = prev.filter(c => c.id !== commentId)
        if (filtered.length < prev.length) return filtered
        // Try removing from replies
        return prev.map(c => c.replies ? { ...c, replies: c.replies.filter(r => r.id !== commentId) } : c)
      })
    } catch (err) { console.error('[TaskDetail] deleteComment failed:', err) }
  }

  async function createSubtask() {
    if (!newSubtaskTitle.trim() || !detail) return
    setAddingSubtask(true)
    try {
      const d = await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: newSubtaskTitle.trim(), parentTaskId: viewTaskId, projectId: detail.projectId }),
      }) as { task: Task }
      setDetail(prev => prev ? { ...prev, subtasks: [...(prev.subtasks ?? []), d.task], _count: { ...prev._count, subtasks: prev._count.subtasks + 1 } } : prev)
      onUpdated({ ...detail, _count: { ...detail._count, subtasks: detail._count.subtasks + 1 } })
      setNewSubtaskTitle('')
    } catch (err) { console.error('[TaskDetail] createSubtask failed:', err) } finally { setAddingSubtask(false) }
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
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${config.apiBase}/api/tasks/${viewTaskId}/attachments`, {
        method: 'POST', headers: { Authorization: `Bearer ${config.token}` }, body: fd,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json() as { attachment: TaskAttachment }
      setAttachments(prev => [...prev, d.attachment])
    } catch (err) { console.error('[TaskDetail] uploadAttachment failed:', err) } finally { setUploadingAttach(false) }
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
              <TaskDescriptionEditor
                value={detail.description}
                onSave={(html) => patchTask({ description: html || null }, 'description')}
                apiBase={config.apiBase}
                token={config.token}
                taskId={viewTaskId}
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
                <input type="date" value={detail.dueDate ? new Date(detail.dueDate).toISOString().split('T')[0] : ''}
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
                      <span style={{ fontSize: 9, fontWeight: 600, color: TASK_STATUS_COLORS[sub.status] ?? C.textMuted, background: (TASK_STATUS_COLORS[sub.status] ?? C.textMuted) + '18', borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>
                        {TASK_STATUS_LABELS[sub.status] ?? sub.status}
                      </span>
                      {sub._count?.comments > 0 && (
                        <span style={{ fontSize: 10, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 2 }}>
                          <MessageSquare size={9} /> {sub._count.comments}
                        </span>
                      )}
                      {sub.assignee && <Avatar url={sub.assignee.avatarUrl} name={sub.assignee.alias ?? sub.assignee.username} size={18} />}
                      <button onClick={(e) => { e.stopPropagation(); setSubtaskContext({ id: sub.id, title: sub.title }); setActiveTab('discussion') }}
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

        {activeTab === 'discussion' && threadComment && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Thread sub-view header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexShrink: 0 }}>
              <button onClick={() => { setThreadParentId(null); setReplyTo(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} /> Back
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Thread</span>
            </div>
            {/* Parent comment */}
            <div style={{ padding: '8px 10px', background: C.bgInput, borderRadius: 8, marginBottom: 10, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Avatar url={threadComment.user.avatarUrl} name={threadComment.user.alias ?? threadComment.user.username} size={22} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{threadComment.user.alias ?? threadComment.user.username}</span>
                <span style={{ fontSize: 10, color: C.textMuted }}>{new Date(threadComment.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
              </div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, paddingLeft: 28 }}>{renderMessageContent(threadComment.body)}</div>
              {groupReactions(threadComment.reactions ?? []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, paddingLeft: 28 }}>
                  {groupReactions(threadComment.reactions ?? []).map(r => (
                    <button key={r.emoji} onClick={() => toggleReaction(threadComment.id, r.emoji)} title={r.users.join(', ')}
                      style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 12, border: `1px solid ${r.reacted ? C.accent : C.separator}`, background: r.reacted ? C.accentLight : C.bgInput, cursor: 'pointer', fontSize: 12 }}>
                      <span>{r.emoji}</span><span style={{ fontSize: 10, fontWeight: 600, color: r.reacted ? C.accent : C.textMuted }}>{r.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', minHeight: 0 }}>
              {(threadComment.replies ?? []).length === 0 && <div style={{ textAlign: 'center', color: C.textMuted, opacity: 0.4, padding: 16, fontSize: 12 }}>No replies yet</div>}
              {(threadComment.replies ?? []).map((r, ri) => {
                const prevReply = (threadComment.replies ?? [])[ri - 1]
                const rDate = new Date(r.createdAt)
                const rTimeDiff = prevReply ? rDate.getTime() - new Date(prevReply.createdAt).getTime() : Infinity
                const rShowHeader = !prevReply || prevReply.user.id !== r.user.id || rTimeDiff > 5 * 60 * 1000
                const rIsHovered = hoveredCommentId === r.id
                const rIsMe = r.user.id === auth.userId
                const rIsEditing = editingCommentId === r.id
                const rGrouped = groupReactions(r.reactions ?? [])
                const rIsImage = r.attachmentName && r.attachmentUrl && /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)$/i.test(r.attachmentName)
                return (
                  <div key={r.id}
                    onMouseEnter={() => setHoveredCommentId(r.id)}
                    onMouseLeave={() => { setHoveredCommentId(null); if (emojiPickerCommentId === r.id && fullEmojiPickerCommentId !== r.id) setEmojiPickerCommentId(null) }}
                    style={{ display: 'flex', padding: rShowHeader ? '6px 4px 3px' : '1px 4px', position: 'relative', gap: 8, borderRadius: 6, background: rIsHovered ? `${C.text}06` : 'transparent' }}
                  >
                    {rShowHeader ? (
                      <div style={{ width: 28, flexShrink: 0 }}><Avatar url={r.user.avatarUrl} name={r.user.alias ?? r.user.username} size={28} /></div>
                    ) : (
                      <div style={{ width: 28, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                        {rIsHovered && <span style={{ fontSize: 9, color: C.textMuted, lineHeight: '18px', whiteSpace: 'nowrap' }}>{rDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {rShowHeader && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 1 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{r.user.alias ?? r.user.username}</span>
                          <span style={{ fontSize: 10, color: C.textMuted }}>{rDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                          {r.editedAt && <span style={{ fontSize: 10, color: C.textMuted }}>(edited)</span>}
                        </div>
                      )}
                      {rIsEditing ? (
                        <div style={{ marginTop: 2 }}>
                          <textarea value={editingCommentBody} onChange={e => setEditingCommentBody(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); editComment(r.id) } if (e.key === 'Escape') { setEditingCommentId(null); setEditingCommentBody('') } }}
                            autoFocus rows={2}
                            style={{ width: '100%', resize: 'vertical', ...neu(true), padding: '6px 8px', fontSize: 12, color: C.text, border: `1px solid ${C.accent}`, borderRadius: 6, outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }} />
                          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>Enter to save · Escape to cancel</div>
                        </div>
                      ) : (
                        <>
                          {r.body && <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{renderMessageContent(r.body)}</div>}
                          {!rShowHeader && r.editedAt && <span style={{ fontSize: 10, color: C.textMuted }}>(edited)</span>}
                        </>
                      )}
                      {r.attachmentName && r.attachmentUrl && (
                        rIsImage ? (
                          <img src={`${config.apiBase}${r.attachmentUrl}`} alt={r.attachmentName}
                            onClick={() => { setLightboxUrl(`${config.apiBase}${r.attachmentUrl}`); setLightboxName(r.attachmentName!) }}
                            style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8, marginTop: 6, cursor: 'pointer', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <button onClick={() => window.electronAPI.openExternal(`${config.apiBase}${r.attachmentUrl}`)}
                            style={{ fontSize: 11, color: C.accent, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                            <FileText size={11} /> {r.attachmentName}
                          </button>
                        )
                      )}
                      {rGrouped.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {rGrouped.map(rx => (
                            <button key={rx.emoji} onClick={() => toggleReaction(r.id, rx.emoji)} title={rx.users.join(', ')}
                              style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 12, border: `1px solid ${rx.reacted ? C.accent : C.separator}`, background: rx.reacted ? C.accentLight : C.bgInput, cursor: 'pointer', fontSize: 12 }}>
                              <span>{rx.emoji}</span><span style={{ fontSize: 10, fontWeight: 600, color: rx.reacted ? C.accent : C.textMuted }}>{rx.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {rIsHovered && !rIsEditing && (
                      <div style={{ position: 'absolute', top: -14, right: 8, display: 'flex', gap: 0, background: C.bgInput, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.25)', border: `1px solid ${C.separator}`, padding: '1px 2px', zIndex: 10 }}>
                        {[{
                          icon: <Smile size={14} />, title: 'React',
                          onClick: () => setEmojiPickerCommentId(emojiPickerCommentId === r.id ? null : r.id), color: C.textSecondary,
                        }, ...(rIsMe ? [{
                          icon: <Edit2 size={14} />, title: 'Edit',
                          onClick: () => { setEditingCommentId(r.id); setEditingCommentBody(r.body) },
                          color: C.textSecondary, show: (Date.now() - new Date(r.createdAt).getTime()) < 12 * 60 * 60 * 1000,
                        }, {
                          icon: <Trash2 size={14} />, title: 'Delete',
                          onClick: () => deleteComment(r.id), color: C.danger, show: true,
                        }] : [])].filter((b: any) => b.show !== false).map((btn: any, bi) => (
                          <button key={bi} onClick={btn.onClick} title={btn.title}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${C.text}12` }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', color: btn.color, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {btn.icon}
                          </button>
                        ))}
                      </div>
                    )}
                    {emojiPickerCommentId === r.id && fullEmojiPickerCommentId !== r.id && (
                      <div style={{ position: 'absolute', top: -40, right: 8, display: 'flex', gap: 2, background: C.bgInput, borderRadius: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', border: `1px solid ${C.separator}`, padding: '4px 6px', zIndex: 20 }}>
                        {QUICK_EMOJIS.map(e => (
                          <button key={e} onClick={() => toggleReaction(r.id, e)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '2px 4px', borderRadius: 6 }}
                            onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
                            onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = 'none' }}>{e}</button>
                        ))}
                        <button onClick={() => setFullEmojiPickerCommentId(r.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 6px', borderRadius: 6, color: C.textMuted, display: 'flex', alignItems: 'center' }}>
                          <Plus size={14} />
                        </button>
                      </div>
                    )}
                    {fullEmojiPickerCommentId === r.id && (
                      <div style={{ position: 'absolute', top: -44, right: 8, zIndex: 30 }}>
                        <EmojiPicker
                          onSelect={(emoji) => { toggleReaction(r.id, emoji); setFullEmojiPickerCommentId(null); setEmojiPickerCommentId(null) }}
                          onClose={() => { setFullEmojiPickerCommentId(null); setEmojiPickerCommentId(null) }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {activeTab === 'discussion' && !threadComment && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Viewing parent task discussion banner (when on subtask) */}
            {detail?.parentTaskId && !subtaskContext && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', ...neu(), borderRadius: 8, marginBottom: 8, fontSize: 11, color: C.textMuted, borderLeft: `3px solid ${C.separator}` }}>
                <MessageSquare size={10} />
                <span>Showing project discussion (shared across all subtasks)</span>
              </div>
            )}
            {/* Subtask context banner */}
            {subtaskContext && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', ...neu(), borderRadius: 8, marginBottom: 8, fontSize: 11, color: C.accent, borderLeft: `3px solid ${C.accent}` }}>
                <GitBranch size={10} />
                <span style={{ flex: 1 }}>Discussing subtask: <strong>{subtaskContext.title}</strong></span>
                <button onClick={() => setSubtaskContext(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 0 }}><X size={10} /></button>
              </div>
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: 12 }}>
              {comments.length === 0 && <div style={{ textAlign: 'center', color: C.textMuted, opacity: 0.4, padding: 20, fontSize: 12 }}>No messages yet — start the discussion!</div>}
              {/* Flatten comments for grouping: top-level + inline replies */}
              {comments.map((c, ci) => {
                const prevComment = comments[ci - 1]
                const msgDate = new Date(c.createdAt)
                const prevDate = prevComment ? new Date(prevComment.createdAt) : null
                const showDateSep = !prevDate || msgDate.toDateString() !== prevDate.toDateString()
                const todayDate = new Date()
                const yesterdayDate = new Date(todayDate); yesterdayDate.setDate(yesterdayDate.getDate() - 1)
                let dateLabel = msgDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                if (msgDate.toDateString() === todayDate.toDateString()) dateLabel = 'Today'
                else if (msgDate.toDateString() === yesterdayDate.toDateString()) dateLabel = 'Yesterday'

                const timeDiff = prevComment ? msgDate.getTime() - new Date(prevComment.createdAt).getTime() : Infinity
                const showHeader = !prevComment || prevComment.user.id !== c.user.id || timeDiff > 5 * 60 * 1000 || showDateSep

                const isHovered = hoveredCommentId === c.id
                const isMe = c.user.id === auth.userId
                const isEditing = editingCommentId === c.id
                const grouped = groupReactions(c.reactions ?? [])
                const isImage = c.attachmentName && c.attachmentUrl && /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)$/i.test(c.attachmentName)
                const taskLinkMatch = c.body?.match(/\[(?:Sub)?[Tt]ask: (.+?)\]\(\/tasks\/(\w+)\)/)

                return (
                  <div key={c.id}>
                    {/* Date separator */}
                    {showDateSep && (
                      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0 6px', gap: 10 }}>
                        <div style={{ flex: 1, height: 1, background: C.separator }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.textSecondary, whiteSpace: 'nowrap', padding: '2px 10px', border: `1px solid ${C.separator}`, borderRadius: 12, background: C.lgBg }}>{dateLabel}</span>
                        <div style={{ flex: 1, height: 1, background: C.separator }} />
                      </div>
                    )}
                    {/* Message row */}
                    <div
                      onMouseEnter={() => setHoveredCommentId(c.id)}
                      onMouseLeave={() => { setHoveredCommentId(null); if (emojiPickerCommentId === c.id && fullEmojiPickerCommentId !== c.id) setEmojiPickerCommentId(null) }}
                      style={{ display: 'flex', padding: showHeader ? '6px 4px 3px' : '1px 4px', position: 'relative', gap: 8, borderRadius: 6, background: isHovered ? `${C.text}06` : 'transparent' }}
                    >
                      {/* Avatar or hover timestamp */}
                      {showHeader ? (
                        <div style={{ width: 28, flexShrink: 0 }}>
                          <Avatar url={c.user.avatarUrl} name={c.user.alias ?? c.user.username} size={28} />
                        </div>
                      ) : (
                        <div style={{ width: 28, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                          {isHovered && (
                            <span style={{ fontSize: 9, color: C.textMuted, lineHeight: '18px', whiteSpace: 'nowrap' }}>
                              {msgDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </span>
                          )}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Name + time header */}
                        {showHeader && (
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 1 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{c.user.alias ?? c.user.username}</span>
                            <span style={{ fontSize: 10, color: C.textMuted }}>
                              {msgDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </span>
                            {c.editedAt && <span style={{ fontSize: 10, color: C.textMuted }}>(edited)</span>}
                          </div>
                        )}
                        {/* Subtask link marker */}
                        {taskLinkMatch && (
                          <div
                            onClick={() => {
                              const tid = taskLinkMatch[2]
                              if (tid) { setParentStack(prev => [...prev, viewTaskId]); setViewTaskId(tid) }
                            }}
                            style={{
                              borderLeft: `3px solid ${C.accent}`, padding: '4px 8px', marginTop: 4, marginBottom: 4,
                              background: C.accent + '08', borderRadius: '0 4px 4px 0', cursor: 'pointer',
                              fontSize: 11, color: C.accent, fontWeight: 500,
                              display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                            <GitBranch size={10} /> {taskLinkMatch[1]}
                          </div>
                        )}
                        {/* Message body or edit box */}
                        {isEditing ? (
                          <div style={{ marginTop: 2 }}>
                            <textarea
                              value={editingCommentBody}
                              onChange={e => setEditingCommentBody(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); editComment(c.id) } if (e.key === 'Escape') { setEditingCommentId(null); setEditingCommentBody('') } }}
                              autoFocus rows={3}
                              style={{ width: '100%', resize: 'vertical', ...neu(true), padding: '6px 8px', fontSize: 12, color: C.text, border: `1px solid ${C.accent}`, borderRadius: 6, outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
                            />
                            <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: 10, color: C.textMuted }}>
                              <span>Enter to save · Escape to cancel</span>
                            </div>
                          </div>
                        ) : (
                          <>
                            {c.body && (() => {
                              const cleanBody = c.body.replace(/^>.*\n\n/gm, '')
                              const allUrls = extractUrls(cleanBody)
                              const TASK_URL_RE = /\/tasks\/[a-z0-9]+$/i
                              const REPORT_URL_RE = /\/report\/[a-z0-9]+\/[a-z0-9]+/i
                              const FEEDBACK_URL_RE = /\/report\/feedback\/[a-z0-9]+/i
                              const plainUrls = allUrls.filter(u => !isImageUrl(u) && !FEEDBACK_URL_RE.test(u) && !REPORT_URL_RE.test(u) && !TASK_URL_RE.test(u))
                              const feedbackLinks = allUrls.map(u => FEEDBACK_LINK_RE.exec(u)).filter(Boolean) as RegExpExecArray[]
                              const reportLinks = allUrls.filter(u => !FEEDBACK_URL_RE.test(u)).map(u => REPORT_LINK_RE.exec(u)).filter(Boolean) as RegExpExecArray[]
                              const taskLinkCards = allUrls.map(u => TASK_LINK_RE.exec(u)).filter(Boolean) as RegExpExecArray[]
                              return (
                                <>
                                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginTop: showHeader ? 0 : 0 }}>
                                    {renderMessageContent(cleanBody)}
                                  </div>
                                  {plainUrls.slice(0, 2).map(u => <OgPreview key={u} url={u} config={config} />)}
                                  {feedbackLinks.map((m, fi) => {
                                    const matchedUrl = allUrls.find(u => FEEDBACK_LINK_RE.test(u)) || ''
                                    return <FeedbackLinkCard key={`f${fi}`} linkId={m[1]} pinId={m[2] || null} fullUrl={matchedUrl} config={config} />
                                  })}
                                  {reportLinks.map((m, ri) => <ReportLinkCard key={`r${ri}`} clientId={m[1]} projectId={m[2]} itemType={m[3] || null} itemId={m[4] || null} config={config} />)}
                                  {taskLinkCards.map((m, ti) => <TaskLinkCard key={`t${ti}`} taskId={m[1]} config={config} />)}
                                </>
                              )
                            })()}
                            {!showHeader && c.editedAt && <span style={{ fontSize: 10, color: C.textMuted }}>(edited)</span>}
                          </>
                        )}
                        {/* Attachment */}
                        {c.attachmentName && c.attachmentUrl && (
                          isImage ? (
                            <img src={`${config.apiBase}${c.attachmentUrl}`} alt={c.attachmentName}
                              onClick={() => { setLightboxUrl(`${config.apiBase}${c.attachmentUrl}`); setLightboxName(c.attachmentName!) }}
                              style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8, marginTop: 6, cursor: 'pointer', objectFit: 'cover', display: 'block' }}
                            />
                          ) : (
                            <button onClick={() => window.electronAPI.openExternal(`${config.apiBase}${c.attachmentUrl}`)}
                              style={{ fontSize: 11, color: C.accent, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                              <FileText size={11} /> {c.attachmentName}
                            </button>
                          )
                        )}
                        {/* Emoji reactions */}
                        {grouped.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {grouped.map(r => (
                              <button key={r.emoji} onClick={() => toggleReaction(c.id, r.emoji)} title={r.users.join(', ')}
                                style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 12, border: `1px solid ${r.reacted ? C.accent : C.separator}`, background: r.reacted ? C.accentLight : C.bgInput, cursor: 'pointer', fontSize: 12 }}>
                                <span>{r.emoji}</span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: r.reacted ? C.accent : C.textMuted }}>{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {/* Thread preview */}
                        {(c.replies?.length ?? 0) > 0 && (
                          <button onClick={() => { setThreadParentId(c.id); setReplyTo(c) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, background: 'transparent', border: `1px solid transparent`, cursor: 'pointer', padding: '4px 6px', borderRadius: 6, width: '100%', transition: 'background 0.15s, border-color 0.15s', fontFamily: 'inherit' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.bgInput; (e.currentTarget as HTMLElement).style.borderColor = C.separator }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent' }}>
                            <div style={{ display: 'flex', flexShrink: 0 }}>
                              {[...new Map((c.replies ?? []).map(r => [r.user.id, r.user])).values()].slice(0, 3).map((u, ri) => (
                                <div key={u.id} style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${C.lgBg}`, marginLeft: ri === 0 ? 0 : -6, zIndex: 3 - ri, position: 'relative', overflow: 'hidden', background: C.bgInput }}>
                                  <Avatar url={u.avatarUrl} name={u.alias ?? u.username} size={16} />
                                </div>
                              ))}
                            </div>
                            <span style={{ color: C.accent, fontSize: 12, fontWeight: 700 }}>{c.replies!.length} {c.replies!.length === 1 ? 'reply' : 'replies'}</span>
                            <span style={{ color: C.textMuted, fontSize: 11 }}>View thread</span>
                            <ChevronRight size={12} color={C.textMuted} style={{ marginLeft: 'auto' }} />
                          </button>
                        )}
                      </div>
                      {/* Hover toolbar */}
                      {isHovered && !isEditing && (
                        <div style={{ position: 'absolute', top: -14, right: 8, display: 'flex', gap: 0, background: C.bgInput, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.25)', border: `1px solid ${C.separator}`, padding: '1px 2px', zIndex: 10 }}>
                          {[{
                            icon: <Smile size={14} />, title: 'React',
                            onClick: () => setEmojiPickerCommentId(emojiPickerCommentId === c.id ? null : c.id), color: C.textSecondary,
                          }, {
                            icon: <CornerDownRight size={14} />, title: 'View thread',
                            onClick: () => { setThreadParentId(c.id); setReplyTo(c) }, color: C.textSecondary,
                          }, {
                            icon: copiedCommentId === c.id ? <Check size={14} /> : <Link size={14} />, title: copiedCommentId === c.id ? 'Copied!' : 'Copy link',
                            onClick: () => {
                              const url = `${config.apiBase}/tasks/${discussionTaskId}?comment=${c.id}`
                              navigator.clipboard.writeText(url).catch(() => window.electronAPI?.writeClipboard?.(url))
                              setCopiedCommentId(c.id); setTimeout(() => setCopiedCommentId(null), 1500)
                            }, color: copiedCommentId === c.id ? C.success : C.textSecondary,
                          }, {
                            icon: <Quote size={14} />, title: 'Quote',
                            onClick: () => {
                              const senderName = c.user.alias ?? c.user.username
                              const quoted = c.body.split('\n').map(l => `> ${l}`).join('\n')
                              const quoteBlock = `> **${senderName}**\n${quoted}\n\n`
                              setCommentText(prev => quoteBlock + prev)
                            }, color: C.textSecondary,
                          }, ...(isMe ? [{
                            icon: <Edit2 size={14} />, title: 'Edit',
                            onClick: () => { setEditingCommentId(c.id); setEditingCommentBody(c.body) },
                            color: C.textSecondary,
                            show: (Date.now() - new Date(c.createdAt).getTime()) < 12 * 60 * 60 * 1000,
                          }, {
                            icon: <Trash2 size={14} />, title: 'Delete',
                            onClick: () => deleteComment(c.id), color: C.danger, show: true,
                          }] : [])].filter((b: any) => b.show !== false).map((btn: any, bi) => (
                            <button key={bi} onClick={btn.onClick} title={btn.title}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${C.text}12` }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', color: btn.color, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.1s' }}>
                              {btn.icon}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Quick emoji picker */}
                      {emojiPickerCommentId === c.id && fullEmojiPickerCommentId !== c.id && (
                        <div style={{ position: 'absolute', top: -40, right: 8, display: 'flex', gap: 2, background: C.bgInput, borderRadius: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', border: `1px solid ${C.separator}`, padding: '4px 6px', zIndex: 20 }}>
                          {QUICK_EMOJIS.map(e => (
                            <button key={e} onClick={() => toggleReaction(c.id, e)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '2px 4px', borderRadius: 6 }}
                              onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
                              onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = 'none' }}>
                              {e}
                            </button>
                          ))}
                          <button onClick={() => setFullEmojiPickerCommentId(c.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 6px', borderRadius: 6, color: C.textMuted, display: 'flex', alignItems: 'center' }}
                            onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
                            onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = 'none' }}
                            title="More emojis">
                            <Plus size={14} />
                          </button>
                        </div>
                      )}
                      {/* Full emoji picker */}
                      {fullEmojiPickerCommentId === c.id && (
                        <div style={{ position: 'absolute', top: -44, right: 8, zIndex: 30 }}>
                          <EmojiPicker
                            onSelect={(emoji) => { toggleReaction(c.id, emoji); setFullEmojiPickerCommentId(null); setEmojiPickerCommentId(null) }}
                            onClose={() => { setFullEmojiPickerCommentId(null); setEmojiPickerCommentId(null) }}
                          />
                        </div>
                      )}
                    </div>
                    {/* Threaded replies are now shown in the thread sub-view */}
                    {false && (c.replies ?? []).length > 0 && (
                      <div style={{ marginLeft: 36, marginTop: 4, borderLeft: `2px solid ${C.separator}`, paddingLeft: 8, display: 'flex', flexDirection: 'column' }}>
                        {c.replies!.map((r, ri) => {
                          const rIsImage = r.attachmentName && r.attachmentUrl && /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)$/i.test(r.attachmentName)
                          const prevReply = c.replies![ri - 1]
                          const rDate = new Date(r.createdAt)
                          const rTimeDiff = prevReply ? rDate.getTime() - new Date(prevReply.createdAt).getTime() : Infinity
                          const rShowHeader = !prevReply || prevReply.user.id !== r.user.id || rTimeDiff > 5 * 60 * 1000
                          const rIsHovered = hoveredCommentId === r.id
                          const rIsMe = r.user.id === auth.userId
                          const rIsEditing = editingCommentId === r.id
                          const rGrouped = groupReactions(r.reactions ?? [])
                          return (
                            <div key={r.id}
                              onMouseEnter={() => setHoveredCommentId(r.id)}
                              onMouseLeave={() => { setHoveredCommentId(null); if (emojiPickerCommentId === r.id && fullEmojiPickerCommentId !== r.id) setEmojiPickerCommentId(null) }}
                              style={{ display: 'flex', padding: rShowHeader ? '4px 4px 2px' : '1px 4px', position: 'relative', gap: 6, borderRadius: 6, background: rIsHovered ? `${C.text}06` : 'transparent' }}
                            >
                              {rShowHeader ? (
                                <div style={{ width: 22, flexShrink: 0 }}>
                                  <Avatar url={r.user.avatarUrl} name={r.user.alias ?? r.user.username} size={22} />
                                </div>
                              ) : (
                                <div style={{ width: 22, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                                  {rIsHovered && (
                                    <span style={{ fontSize: 8, color: C.textMuted, lineHeight: '16px', whiteSpace: 'nowrap' }}>
                                      {rDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {rShowHeader && (
                                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 1 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{r.user.alias ?? r.user.username}</span>
                                    <span style={{ fontSize: 9, color: C.textMuted }}>
                                      {rDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                    </span>
                                    {r.editedAt && <span style={{ fontSize: 9, color: C.textMuted }}>(edited)</span>}
                                  </div>
                                )}
                                {rIsEditing ? (
                                  <div style={{ marginTop: 2 }}>
                                    <textarea
                                      value={editingCommentBody}
                                      onChange={e => setEditingCommentBody(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); editComment(r.id) } if (e.key === 'Escape') { setEditingCommentId(null); setEditingCommentBody('') } }}
                                      autoFocus rows={2}
                                      style={{ width: '100%', resize: 'vertical', ...neu(true), padding: '4px 6px', fontSize: 11, color: C.text, border: `1px solid ${C.accent}`, borderRadius: 6, outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
                                    />
                                    <div style={{ fontSize: 9, color: C.textMuted, marginTop: 2 }}>Enter to save · Escape to cancel</div>
                                  </div>
                                ) : (
                                  <>
                                    {r.body && (
                                      <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>
                                        {renderMessageContent(r.body)}
                                      </div>
                                    )}
                                    {!rShowHeader && r.editedAt && <span style={{ fontSize: 9, color: C.textMuted }}>(edited)</span>}
                                  </>
                                )}
                                {r.attachmentName && r.attachmentUrl && (
                                  rIsImage ? (
                                    <img src={`${config.apiBase}${r.attachmentUrl}`} alt={r.attachmentName}
                                      onClick={() => { setLightboxUrl(`${config.apiBase}${r.attachmentUrl}`); setLightboxName(r.attachmentName!) }}
                                      style={{ maxWidth: 160, maxHeight: 120, borderRadius: 6, marginTop: 4, cursor: 'pointer', objectFit: 'cover', display: 'block' }}
                                    />
                                  ) : (
                                    <button onClick={() => window.electronAPI.openExternal(`${config.apiBase}${r.attachmentUrl}`)}
                                      style={{ fontSize: 10, color: C.accent, display: 'flex', alignItems: 'center', gap: 3, marginTop: 3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                                      <FileText size={10} /> {r.attachmentName}
                                    </button>
                                  )
                                )}
                                {/* Reply reactions */}
                                {rGrouped.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                                    {rGrouped.map(rx => (
                                      <button key={rx.emoji} onClick={() => toggleReaction(r.id, rx.emoji)} title={rx.users.join(', ')}
                                        style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '1px 5px', borderRadius: 10, border: `1px solid ${rx.reacted ? C.accent : C.separator}`, background: rx.reacted ? C.accentLight : C.bgInput, cursor: 'pointer', fontSize: 11 }}>
                                        <span>{rx.emoji}</span>
                                        <span style={{ fontSize: 9, fontWeight: 600, color: rx.reacted ? C.accent : C.textMuted }}>{rx.count}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {/* Reply hover toolbar */}
                              {rIsHovered && !rIsEditing && (
                                <div style={{ position: 'absolute', top: -12, right: 4, display: 'flex', gap: 0, background: C.bgInput, borderRadius: 6, boxShadow: '0 1px 3px rgba(0,0,0,0.25)', border: `1px solid ${C.separator}`, padding: '1px 2px', zIndex: 10 }}>
                                  {[{
                                    icon: <Smile size={12} />, title: 'React',
                                    onClick: () => setEmojiPickerCommentId(emojiPickerCommentId === r.id ? null : r.id), color: C.textSecondary,
                                  }, ...(rIsMe ? [{
                                    icon: <Edit2 size={12} />, title: 'Edit',
                                    onClick: () => { setEditingCommentId(r.id); setEditingCommentBody(r.body) },
                                    color: C.textSecondary,
                                    show: (Date.now() - new Date(r.createdAt).getTime()) < 12 * 60 * 60 * 1000,
                                  }, {
                                    icon: <Trash2 size={12} />, title: 'Delete',
                                    onClick: () => deleteComment(r.id), color: C.danger, show: true,
                                  }] : [])].filter((b: any) => b.show !== false).map((btn: any, bi) => (
                                    <button key={bi} onClick={btn.onClick} title={btn.title}
                                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${C.text}12` }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px 5px', color: btn.color, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.1s' }}>
                                      {btn.icon}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {/* Reply quick emoji picker */}
                              {emojiPickerCommentId === r.id && fullEmojiPickerCommentId !== r.id && (
                                <div style={{ position: 'absolute', top: -38, right: 4, display: 'flex', gap: 2, background: C.bgInput, borderRadius: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', border: `1px solid ${C.separator}`, padding: '4px 6px', zIndex: 20 }}>
                                  {QUICK_EMOJIS.map(e => (
                                    <button key={e} onClick={() => toggleReaction(r.id, e)}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 3px', borderRadius: 6 }}
                                      onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
                                      onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = 'none' }}>
                                      {e}
                                    </button>
                                  ))}
                                  <button onClick={() => setFullEmojiPickerCommentId(r.id)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '2px 4px', borderRadius: 6, color: C.textMuted, display: 'flex', alignItems: 'center' }}
                                    title="More emojis">
                                    <Plus size={12} />
                                  </button>
                                </div>
                              )}
                              {fullEmojiPickerCommentId === r.id && (
                                <div style={{ position: 'absolute', top: -44, right: 4, zIndex: 30 }}>
                                  <EmojiPicker
                                    onSelect={(emoji) => { toggleReaction(r.id, emoji); setFullEmojiPickerCommentId(null); setEmojiPickerCommentId(null) }}
                                    onClose={() => { setFullEmojiPickerCommentId(null); setEmojiPickerCommentId(null) }}
                                  />
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activities.length === 0 && <div style={{ textAlign: 'center', color: C.textMuted, opacity: 0.4, padding: 20, fontSize: 12 }}>No activity yet</div>}
            {activities.map(a => {
              const actorName = a.user?.alias ?? a.user?.username ?? 'Someone'
              const label = (() => {
                if (a.type === 'created') return 'created this task'
                if (a.type === 'status') return `changed status to ${TASK_STATUS_LABELS[a.newVal ?? ''] ?? a.newVal}`
                if (a.type === 'priority') return `set priority to ${PRIORITY_LABELS[a.newVal ?? ''] ?? a.newVal}`
                if (a.type === 'assigned') return a.newVal ? `assigned to ${a.newVal}` : 'unassigned'
                if (a.type === 'due') return a.newVal ? `set due date to ${new Date(a.newVal).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'removed due date'
                if (a.type === 'title') return `renamed to "${a.newVal}"`
                if (a.type === 'section') return a.newVal ? `moved to section "${a.newVal}"` : 'removed from section'
                if (a.type === 'comment') return `posted in discussion${a.newVal ? `: "${a.newVal.slice(0, 50)}${(a.newVal?.length ?? 0) > 50 ? '…' : ''}"` : ''}`
                return `updated ${a.type}`
              })()
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Avatar url={a.user?.avatarUrl ?? null} name={actorName} size={22} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 12, color: C.text }}><span style={{ fontWeight: 700 }}>{actorName}</span>{' '}{label}</span>
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{timeAgo(a.createdAt)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Discussion input — fixed at bottom, outside scroll area */}
      {activeTab === 'discussion' && (
        <div style={{ flexShrink: 0, borderTop: `1px solid ${C.separator}` }}>
          {replyTo && !threadComment && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: C.bgInput, fontSize: 11, color: C.textMuted }}>
              <CornerDownRight size={10} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Replying to <strong style={{ color: C.text }}>{replyTo.user.alias ?? replyTo.user.username}</strong>
              </span>
              <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 0 }}><X size={10} /></button>
            </div>
          )}
          <MessageInput
            placeholder={threadComment ? 'Reply in thread… (Shift+Enter for newline)' : 'Type a message… (Shift+Enter for newline)'}
            config={config}
            channelId=""
            onTyping={() => {}}
            input={commentText}
            setInput={setCommentText}
            sendFn={addComment}
            sending={addingComment}
            onUpload={handleTaskUpload}
            hideGifs
            hideSchedule
          />
        </div>
      )}

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
