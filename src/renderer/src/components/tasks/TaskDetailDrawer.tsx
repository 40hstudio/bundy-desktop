import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X, Trash2, Check, Link, Edit2, AlignLeft, MessageSquare,
  Activity, ChevronRight, Loader, AlertCircle, Paperclip, FileText,
  Image, Send, Calendar, Clock, GitBranch, Users, Layers,
  Plus, CornerDownRight, List, Flag, Bold, Italic
} from 'lucide-react'
import {
  ApiConfig, Auth, Task, TaskProject, TaskSection, TaskComment,
  TaskActivityItem, TaskAttachment, UserInfo
} from '../../types'
import { C, neu } from '../../theme'
import { timeAgo } from '../../utils/format'
import { linkifyText, isImageUrl, extractUrls } from '../../utils/markdown'
import { Avatar } from '../shared/Avatar'
import { OgPreview } from '../messages/OgPreview'
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from './constants'

export default function TaskDetailDrawer({ taskId, config, auth, projects, onClose, onUpdated, onDeleted }: {
  taskId: string; config: ApiConfig; auth: Auth
  projects: TaskProject[]
  onClose: () => void
  onUpdated: (t: Task) => void
  onDeleted: (id: string) => void
}) {
  const [detail, setDetail] = useState<Task | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [comments, setComments] = useState<TaskComment[]>([])
  const [activities, setActivities] = useState<TaskActivityItem[]>([])
  const [commentText, setCommentText] = useState('')
  const [commentAttach, setCommentAttach] = useState<File | null>(null)
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
  const [activeTab, setActiveTab] = useState<'detail' | 'comments' | 'activity'>('detail')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [detailSections, setDetailSections] = useState<TaskSection[]>([])
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const attachInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAttach, setUploadingAttach] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxName, setLightboxName] = useState<string>('')
  const [copiedLink, setCopiedLink] = useState(false)
  const [viewTaskId, setViewTaskId] = useState(taskId)
  const [parentStack, setParentStack] = useState<string[]>([])

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
    ]).then(([taskData, userData]: [{ task: Task }, { users: UserInfo[] }]) => {
      setDetail(taskData.task)
      setComments(taskData.task.comments ?? [])
      setActivities(taskData.task.activities ?? [])
      setAttachments(taskData.task.attachments ?? [])
      setEditTitle(taskData.task.title)
      setEditDesc(taskData.task.description ?? '')
      setUsers(userData.users)
    }).catch((err) => { setLoadError(err?.message ?? 'Failed to load task') }).finally(() => setLoadingDetail(false))
  }, [viewTaskId, apiFetch])

  useEffect(() => {
    if (!detail?.projectId) { setDetailSections([]); return }
    apiFetch(`/api/tasks/sections?projectId=${detail.projectId}`)
      .then((d: { sections: TaskSection[] }) => setDetailSections(d.sections))
      .catch(() => setDetailSections([]))
  }, [detail?.projectId, apiFetch])

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

  async function addComment() {
    if (!commentText.trim() && !commentAttach) return
    setAddingComment(true)
    const parentId = replyTo?.id ?? null
    try {
      if (commentAttach) {
        const formData = new FormData()
        if (commentText.trim()) formData.append('body', commentText.trim())
        formData.append('file', commentAttach)
        if (parentId) formData.append('parentCommentId', parentId)
        const res = await fetch(`${config.apiBase}/api/tasks/${viewTaskId}/comments`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}` },
          body: formData,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const d = await res.json() as { comment: TaskComment }
        if (parentId) setComments(prev => prev.map(c => c.id === parentId ? { ...c, replies: [...(c.replies ?? []), d.comment] } : c))
        else setComments(prev => [...prev, d.comment])
      } else {
        const d = await apiFetch(`/api/tasks/${viewTaskId}/comments`, {
          method: 'POST', body: JSON.stringify({ body: commentText.trim(), parentCommentId: parentId }),
        }) as { comment: TaskComment }
        if (parentId) setComments(prev => prev.map(c => c.id === parentId ? { ...c, replies: [...(c.replies ?? []), d.comment] } : c))
        else setComments(prev => [...prev, d.comment])
      }
      setCommentText(''); setCommentAttach(null); setReplyTo(null)
    } catch (err) { console.error('[TaskDetail] addComment failed:', err) } finally { setAddingComment(false) }
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
    setAddingSubtask(true)
    try {
      const d = await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: newSubtaskTitle.trim(), parentTaskId: viewTaskId, projectId: detail.projectId, assigneeId: detail.assigneeId }),
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
    } catch {
      setDetail(prev => prev ? { ...prev, subtasks: (prev.subtasks ?? []).map(s => s.id === subId ? { ...s, status: currentStatus } : s) } : prev)
    }
  }

  function insertMarkdown(wrap: [string, string]) {
    const ta = commentTextareaRef.current
    if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const sel = commentText.slice(s, e) || 'text'
    const before = commentText.slice(0, s), after = commentText.slice(e)
    setCommentText(before + wrap[0] + sel + wrap[1] + after)
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + wrap[0].length, s + wrap[0].length + sel.length) }, 0)
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

  const canDelete = detail ? (detail.createdBy === auth.userId || auth.role === 'admin') : false

  const drawerStyle: React.CSSProperties = {
    position: 'absolute', top: 0, right: 0, bottom: 0, width: '50%', minWidth: 400,
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
          </div>
        </div>
        {canDelete && (
          <button onClick={() => setConfirmDelete(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 4, flexShrink: 0 }} title="Delete">
            <Trash2 size={14} />
          </button>
        )}
        <button onClick={() => {
          const link = `${config.apiBase}/tasks/${viewTaskId}`
          navigator.clipboard.writeText(link).then(() => { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000) })
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
          { key: 'comments' as const, label: `Comments (${comments.length + comments.reduce((n, c) => n + (c.replies?.length ?? 0), 0)})`, icon: <MessageSquare size={12} /> },
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
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Status</div>
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
              {editingDesc ? (
                <div>
                  <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={5} autoFocus
                    style={{ width: '100%', resize: 'vertical', ...neu(true), padding: '8px 10px', fontSize: 12, color: C.text, border: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.6 }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button onClick={saveDesc} disabled={savingField === 'description'} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                    <button onClick={() => { setEditDesc(detail.description ?? ''); setEditingDesc(false) }} style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${C.separator}`, background: C.lgBg, color: C.textMuted, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              ) : detail.description ? (
                <div onClick={(e) => {
                  const target = e.target as HTMLElement
                  if (target.tagName === 'A') { e.preventDefault(); const href = target.getAttribute('href'); if (href) window.electronAPI.openExternal(href) }
                  else setEditingDesc(true)
                }}
                  style={{ fontSize: 13, color: C.text, lineHeight: 1.6, cursor: 'pointer', minHeight: 40, padding: '8px 10px', ...neu(true), borderRadius: 4 }}
                  dangerouslySetInnerHTML={{ __html: linkifyText(detail.description) }}
                />
              ) : (
                <div onClick={() => setEditingDesc(true)}
                  style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, whiteSpace: 'pre-wrap', cursor: 'pointer', minHeight: 40, padding: '8px 10px', ...neu(true), borderRadius: 4 }}>
                  Click to add description…
                </div>
              )}
            </div>
            {/* Attachments */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Paperclip size={10} /> Attachments ({attachments.length})
              </div>
              {attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {attachments.map(att => {
                    const isImg = att.mimeType?.startsWith('image/')
                    return (
                      <div key={att.id} style={{ position: 'relative', ...neu(), borderRadius: 8, overflow: 'hidden', width: isImg ? 100 : undefined, maxWidth: 200 }}>
                        {isImg ? (
                          <img src={`${config.apiBase}${att.url}`} alt={att.name}
                            onClick={() => { setLightboxUrl(`${config.apiBase}${att.url}`); setLightboxName(att.name) }}
                            style={{ width: 100, height: 80, objectFit: 'cover', display: 'block', cursor: 'pointer' }}
                            onError={e => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; const fb = el.parentElement?.querySelector('.att-fallback') as HTMLElement; if (fb) fb.style.display = 'flex' }}
                          />
                        ) : null}
                        {isImg && (
                          <button className="att-fallback"
                            onClick={() => window.electronAPI.openExternal(`${config.apiBase}${att.url}`)}
                            style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: 100, height: 80, color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}>
                            <Image size={24} />
                          </button>
                        )}
                        {!isImg && (
                          <button onClick={() => window.electronAPI.openExternal(`${config.apiBase}${att.url}`)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', color: C.accent, fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
                            <FileText size={14} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                          </button>
                        )}
                        {isImg && <div style={{ padding: '4px 6px', fontSize: 9, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</div>}
                        <button onClick={() => deleteAttachment(att.id)}
                          style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, padding: 0 }}>
                          <X size={10} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
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
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Clock size={10} /> Est. Hours
                </div>
                <input type="number" min={0} step={0.5} value={detail.estimatedHours ?? ''}
                  onChange={e => patchTask({ estimatedHours: e.target.value ? parseFloat(e.target.value) : null }, 'estimatedHours')}
                  placeholder="e.g. 4"
                  style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Assignee</div>
                <select value={detail.assigneeId ?? ''} onChange={e => patchTask({ assigneeId: e.target.value || null }, 'assignee')} disabled={savingField === 'assignee'}
                  style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.alias ?? u.username}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Project</div>
                <select value={detail.projectId ?? ''} onChange={e => patchTask({ projectId: e.target.value || null, sectionId: null }, 'project')} disabled={savingField === 'project'}
                  style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <option value="">No Project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {detail.projectId && detailSections.length > 0 && (
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Layers size={10} /> Section
                  </div>
                  <select value={detail.sectionId ?? ''} onChange={e => patchTask({ sectionId: e.target.value || null }, 'section')} disabled={savingField === 'section'}
                    style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <option value="">No Section</option>
                    {detailSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            {/* Multi-assignees */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Users size={10} /> Additional Assignees
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {(detail.multiAssignees ?? []).map(({ user: u }) => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 5, ...neu(), padding: '4px 8px', borderRadius: 8 }}>
                    <Avatar url={u.avatarUrl} name={u.alias ?? u.username} size={18} />
                    <span style={{ fontSize: 11, color: C.text }}>{u.alias ?? u.username}</span>
                    <button onClick={() => patchTask({ removeAssigneeIds: [u.id] })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 0, display: 'flex' }}>
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {(detail.multiAssignees ?? []).length === 0 && (
                  <span style={{ fontSize: 11, color: C.textMuted, opacity: 0.5 }}>No additional assignees</span>
                )}
              </div>
              <select value="" onChange={e => { if (e.target.value) patchTask({ addAssigneeIds: [e.target.value] }) }}
                style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}>
                <option value="">+ Add assignee…</option>
                {users.filter(u => !(detail.multiAssignees ?? []).some(a => a.user.id === u.id) && u.id !== detail.assigneeId)
                  .map(u => <option key={u.id} value={u.id}>{u.alias ?? u.username}</option>)}
              </select>
            </div>
            {/* Subtasks */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <GitBranch size={10} /> Subtasks ({detail.subtasks?.length ?? 0})
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
                      <ChevronRight size={12} color={C.textMuted} style={{ opacity: 0.4 }} />
                    </div>
                  )
                })}
                {(detail.subtasks ?? []).length === 0 && <div style={{ fontSize: 11, color: C.textMuted, opacity: 0.4, padding: '4px 0' }}>No subtasks yet</div>}
              </div>
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
            </div>
          </div>
        )}

        {activeTab === 'comments' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              {comments.length === 0 && <div style={{ textAlign: 'center', color: C.textMuted, opacity: 0.4, padding: 20, fontSize: 12 }}>No comments yet</div>}
              {comments.map(c => {
                const isImage = c.attachmentName && c.attachmentUrl && /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)$/i.test(c.attachmentName)
                return (
                  <div key={c.id}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <Avatar url={c.user.avatarUrl} name={c.user.alias ?? c.user.username} size={28} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{c.user.alias ?? c.user.username}</span>
                          <span style={{ fontSize: 10, color: C.textMuted }}>{timeAgo(c.createdAt)}</span>
                        </div>
                        {c.body && (
                          <div onClick={(e) => { const t = e.target as HTMLElement; if (t.tagName === 'A') { e.preventDefault(); const href = t.getAttribute('href'); if (href) window.electronAPI.openExternal(href) } }}
                            style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginTop: 2 }}
                            dangerouslySetInnerHTML={{ __html: linkifyText(c.body) }}
                          />
                        )}
                        {c.body && extractUrls(c.body).filter(u => !isImageUrl(u)).slice(0, 1).map(u => <OgPreview key={u} url={u} config={config} />)}
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
                        <button onClick={() => { setReplyTo(c); commentTextareaRef.current?.focus() }}
                          style={{ fontSize: 10, color: C.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: 2, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <CornerDownRight size={9} /> Reply{(c.replies?.length ?? 0) > 0 ? ` (${c.replies!.length})` : ''}
                        </button>
                      </div>
                    </div>
                    {(c.replies ?? []).length > 0 && (
                      <div style={{ marginLeft: 38, marginTop: 6, borderLeft: `2px solid ${C.separator}`, paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {c.replies!.map(r => {
                          const rIsImage = r.attachmentName && r.attachmentUrl && /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)$/i.test(r.attachmentName)
                          return (
                            <div key={r.id} style={{ display: 'flex', gap: 8 }}>
                              <Avatar url={r.user.avatarUrl} name={r.user.alias ?? r.user.username} size={22} />
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{r.user.alias ?? r.user.username}</span>
                                  <span style={{ fontSize: 9, color: C.textMuted }}>{timeAgo(r.createdAt)}</span>
                                </div>
                                {r.body && <div onClick={(e) => { const t = e.target as HTMLElement; if (t.tagName === 'A') { e.preventDefault(); const href = t.getAttribute('href'); if (href) window.electronAPI.openExternal(href) } }}
                                  style={{ fontSize: 12, color: C.text, lineHeight: 1.5, marginTop: 1 }}
                                  dangerouslySetInnerHTML={{ __html: linkifyText(r.body) }} />}
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
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {replyTo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', ...neu(), borderRadius: 8, marginBottom: 4, fontSize: 11, color: C.textMuted }}>
                <CornerDownRight size={10} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Replying to <strong style={{ color: C.text }}>{replyTo.user.alias ?? replyTo.user.username}</strong>
                </span>
                <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 0 }}><X size={10} /></button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
              {[
                { label: <Bold size={10} />, title: 'Bold', wrap: ['**', '**'] as [string, string] },
                { label: <Italic size={10} />, title: 'Italic', wrap: ['*', '*'] as [string, string] },
                { label: '~~', title: 'Strikethrough', wrap: ['~~', '~~'] as [string, string] },
                { label: '<>', title: 'Code', wrap: ['`', '`'] as [string, string] },
                { label: <List size={10} />, title: 'Bullet list', wrap: ['\n- ', ''] as [string, string] },
              ].map((item, i) => (
                <button key={i} title={item.title}
                  onMouseDown={e => { e.preventDefault(); if (item.wrap[1] === '') setCommentText(prev => prev + (prev.endsWith('\n') || !prev ? '' : '\n') + '- '); else insertMarkdown(item.wrap) }}
                  style={{ ...neu(), padding: '3px 7px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: C.textMuted }}>
                  {item.label}
                </button>
              ))}
            </div>
            {commentAttach && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', ...neu(), borderRadius: 8, marginBottom: 6 }}>
                <FileText size={12} color={C.accent} />
                <span style={{ flex: 1, fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{commentAttach.name}</span>
                <button onClick={() => setCommentAttach(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}><X size={12} /></button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <textarea ref={commentTextareaRef} value={commentText} onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment() } }}
                placeholder="Add a comment… (Shift+Enter for newline)" rows={3}
                style={{ flex: 1, resize: 'none', ...neu(true), padding: '8px 10px', fontSize: 12, color: C.text, border: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept="*/*"
                  onChange={e => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 15 * 1024 * 1024) { alert('File must be under 15MB'); return } setCommentAttach(f); e.target.value = '' }}
                />
                <button onClick={() => fileInputRef.current?.click()} title="Attach file (max 15MB)"
                  style={{ ...neu(), padding: 6, border: 'none', cursor: 'pointer', color: C.textMuted }}>
                  <Paperclip size={13} />
                </button>
                <button onClick={addComment} disabled={(!commentText.trim() && !commentAttach) || addingComment}
                  style={{ ...neu(), padding: 6, border: 'none', cursor: 'pointer', color: C.accent, opacity: (!commentText.trim() && !commentAttach) ? 0.4 : 1 }}>
                  {addingComment ? <Loader size={13} /> : <Send size={13} />}
                </button>
              </div>
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
