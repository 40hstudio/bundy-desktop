/**
 * TaskDiscussionChannel — renders a task's discussion inside the DMs
 * main pane so users can read/reply without leaving the Messages tab.
 *
 * Backed by the existing TaskComment endpoints, so writes mirror the
 * drawer's discussion view (and vice versa) automatically through the
 * `bundy-task-comment-added` SSE event the bot already emits.
 *
 * Visual UX matches the rest of the Messages tab: header with back
 * arrow + task title, Messages / Pins / Files / Search sub-tabs, the
 * same comment rendering, and a MessageInput composer at the bottom.
 *
 * Pinning + read receipts are stubbed (same as the drawer view) — they
 * need a small TaskComment schema migration to ship for real.
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  ArrowLeft, MessageSquare, Search, Pin, Loader, FileText,
  Smile, CornerDownRight, Edit2, Trash2, ChevronRight, MessageCircle,
  Link as LinkIcon, Check, ChevronDown, GitBranch,
} from 'lucide-react'
import { C } from '../../theme'
import { Avatar } from '../shared/Avatar'
import { renderMessageContent } from '../../utils/markdown'
import { MessageInput } from './MessageInput'
import {
  CommentAttachmentThumb, DiscussionFilesView, countDiscussionAssets,
} from '../tasks/discussionAssets'
import { useLightboxClaim } from '../../utils/lightboxClaim'
import { LightboxOverlay } from './LightboxOverlay'
import type { ApiConfig, Auth, TaskComment } from '../../types'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🚀']

interface GroupedReaction {
  emoji: string
  count: number
  users: string[]
  reacted: boolean
}

export function TaskDiscussionChannel({
  taskId, config, auth, onClose, onOpenInDrawer,
}: {
  taskId: string
  config: ApiConfig
  auth: Auth
  onClose: () => void
  /** "Open full task" — escape hatch back to the drawer for editing
   *  status, attachments, subtasks, etc. */
  onOpenInDrawer: () => void
}) {
  const [taskTitle, setTaskTitle] = useState<string>('Discussion')
  const [comments, setComments] = useState<TaskComment[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [emojiPickerId, setEmojiPickerId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [subTab, setSubTab] = useState<'messages' | 'pins' | 'files'>('messages')
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxName, setLightboxName] = useState<string>('')
  const [copiedCommentId, setCopiedCommentId] = useState<string | null>(null)
  // Thread takeover: when set, the panel renders the parent comment +
  // its replies + a reply-only composer instead of the full discussion.
  // The composer's send() POSTs with parentCommentId so replies stay
  // attached to the parent. Back-arrow returns to the discussion list.
  const [threadParentId, setThreadParentId] = useState<string | null>(null)
  const [threadInput, setThreadInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const [isNearBottom, setIsNearBottom] = useState(true)
  // Typing indicator — same shape as the channel typingMap. Each entry
  // expires 5s after the last typing event so a network drop can't
  // leave a stale "user is typing…" forever.
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; expiresAt: number }>>({})
  const lastTypingSentRef = useRef(0)

  const apiFetch = useCallback(async <T = unknown>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(`${config.apiBase}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${config.token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
    if (!res.ok) throw new Error(`${res.status} ${path}`)
    return res.json() as Promise<T>
  }, [config])

  // The drawer keeps a single discussion per project task: subtasks roll
  // up to their parent. Mirror that here so a subtask's discussion in
  // the Projects sidebar shows the right thread.
  const [discussionTaskId, setDiscussionTaskId] = useState<string>(taskId)

  const loadComments = useCallback(async (id: string) => {
    try {
      // Comments live on /api/tasks/[id] (returns task.comments[]) — there
      // is no GET on /comments, only POST. Use the same path the drawer uses.
      const data = await apiFetch<{ task: { comments?: TaskComment[] } }>(`/api/tasks/${id}`)
      setComments(data.task?.comments ?? [])
    } catch (err) {
      console.error('[task-discussion] load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  useEffect(() => {
    setLoading(true)
    setComments([])
    apiFetch<{ task: { id: string; title: string; parentTaskId: string | null; comments?: TaskComment[] } }>(`/api/tasks/${taskId}`)
      .then(d => {
        setTaskTitle(d.task?.title ?? 'Discussion')
        const rootId = d.task?.parentTaskId ?? taskId
        setDiscussionTaskId(rootId)
        if (rootId === taskId) {
          // Same task — comments are already in the response.
          setComments(d.task?.comments ?? [])
          setLoading(false)
        } else {
          // Subtask — fetch the parent's discussion thread.
          void loadComments(rootId)
        }
      })
      .catch(() => { setLoading(false) })
  }, [taskId, apiFetch, loadComments])

  // Inline image clicks dispatch `bundy-open-lightbox` — claim them
  // here so they don't fall through to the DMs panel's listener and
  // open a lightbox over the (currently hidden) conversation underneath.
  useLightboxClaim((detail) => {
    setLightboxUrl(detail.url)
    setLightboxName(detail.filename)
  })

  // Live updates — push, not pull. The server now ships the full
  // comment object inside the `task-comment` SSE payload (parity with
  // broadcastChannelMessage), so we splice it into state directly
  // instead of re-fetching the entire task. Edits + deletes have
  // their own SSE events; both update in place.
  useEffect(() => {
    function matches(detail: { taskId?: string; mainTaskId?: string } | undefined) {
      if (!detail) return false
      return detail.mainTaskId === discussionTaskId || detail.taskId === discussionTaskId
    }
    function onTaskComment(e: Event) {
      const detail = (e as CustomEvent).detail as {
        taskId?: string; mainTaskId?: string
        comment?: TaskComment
      } | undefined
      if (!matches(detail)) return
      const c = detail?.comment
      if (!c) {
        // Older payload without the full comment — fall back to refetch.
        void loadComments(discussionTaskId)
        return
      }
      setComments(prev => {
        // De-dupe: if the actor's optimistic insert (or a previous SSE)
        // already added it, skip.
        if (c.parentCommentId) {
          // Reply — splice into the parent's `replies` array.
          const exists = prev.some(p =>
            p.id === c.parentCommentId && (p.replies ?? []).some(r => r.id === c.id))
          if (exists) return prev
          return prev.map(p =>
            p.id === c.parentCommentId
              ? { ...p, replies: [...(p.replies ?? []), c as TaskComment] }
              : p)
        } else {
          if (prev.some(p => p.id === c.id)) return prev
          return [...prev, c as TaskComment]
        }
      })
    }
    function onCommentEdit(e: Event) {
      const detail = (e as CustomEvent).detail as {
        taskId?: string; mainTaskId?: string
        commentId: string; body: string; editedAt: string
      } | undefined
      if (!matches(detail)) return
      setComments(prev => prev.map(p => {
        if (p.id === detail!.commentId) return { ...p, body: detail!.body, editedAt: detail!.editedAt }
        if (p.replies?.some(r => r.id === detail!.commentId)) {
          return {
            ...p,
            replies: p.replies!.map(r =>
              r.id === detail!.commentId ? { ...r, body: detail!.body, editedAt: detail!.editedAt } : r),
          }
        }
        return p
      }))
    }
    function onCommentDelete(e: Event) {
      const detail = (e as CustomEvent).detail as {
        taskId?: string; mainTaskId?: string; commentId: string
      } | undefined
      if (!matches(detail)) return
      setComments(prev => prev
        .filter(p => p.id !== detail!.commentId)
        .map(p => p.replies?.some(r => r.id === detail!.commentId)
          ? { ...p, replies: p.replies!.filter(r => r.id !== detail!.commentId) }
          : p))
    }
    function onAnyTaskEvent(e: Event) {
      // Notifications + updates may signal a comment we missed (no
      // `comment` field on these). Refetch so we self-heal.
      const detail = (e as CustomEvent).detail as { taskId?: string; mainTaskId?: string } | undefined
      if (matches(detail)) void loadComments(discussionTaskId)
    }
    window.addEventListener('bundy-task-comment-added', onTaskComment)
    window.addEventListener('bundy-task-comment-edited', onCommentEdit)
    window.addEventListener('bundy-task-comment-deleted', onCommentDelete)
    window.addEventListener('bundy-task-notification', onAnyTaskEvent)
    window.addEventListener('bundy-task-updated', onAnyTaskEvent)
    return () => {
      window.removeEventListener('bundy-task-comment-added', onTaskComment)
      window.removeEventListener('bundy-task-comment-edited', onCommentEdit)
      window.removeEventListener('bundy-task-comment-deleted', onCommentDelete)
      window.removeEventListener('bundy-task-notification', onAnyTaskEvent)
      window.removeEventListener('bundy-task-updated', onAnyTaskEvent)
    }
  }, [discussionTaskId, loadComments])

  // Typing indicator — listen for SSE events and maintain the
  // typingUsers map. Each new "typing" event refreshes the expiry;
  // a "stop" event clears immediately. A 1s tick prunes expired
  // entries so the indicator vanishes even if the stop event was
  // dropped on the network.
  useEffect(() => {
    function onTyping(e: Event) {
      const detail = (e as CustomEvent).detail as { taskId?: string; mainTaskId?: string; userId?: string; userName?: string } | undefined
      if (!detail || !detail.userId || detail.userId === auth.userId) return
      const matches = detail.mainTaskId === discussionTaskId || detail.taskId === discussionTaskId
      if (!matches) return
      setTypingUsers(prev => ({
        ...prev,
        [detail.userId!]: { name: detail.userName ?? 'Someone', expiresAt: Date.now() + 5000 },
      }))
    }
    function onTypingStop(e: Event) {
      const detail = (e as CustomEvent).detail as { taskId?: string; mainTaskId?: string; userId?: string } | undefined
      if (!detail || !detail.userId) return
      const matches = detail.mainTaskId === discussionTaskId || detail.taskId === discussionTaskId
      if (!matches) return
      setTypingUsers(prev => {
        if (!prev[detail.userId!]) return prev
        const next = { ...prev }
        delete next[detail.userId!]
        return next
      })
    }
    window.addEventListener('bundy-task-typing', onTyping)
    window.addEventListener('bundy-task-typing-stop', onTypingStop)
    return () => {
      window.removeEventListener('bundy-task-typing', onTyping)
      window.removeEventListener('bundy-task-typing-stop', onTypingStop)
    }
  }, [discussionTaskId, auth.userId])
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()
      setTypingUsers(prev => {
        const filtered = Object.fromEntries(Object.entries(prev).filter(([, v]) => v.expiresAt > now))
        return Object.keys(filtered).length === Object.keys(prev).length ? prev : filtered
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  // Throttle the typing POST so we don't spam the server on every
  // keystroke — once every 3 seconds is enough to keep the indicator
  // alive on the recipient side (which expires after 5s).
  function sendTyping() {
    const now = Date.now()
    if (now - lastTypingSentRef.current < 3_000) return
    lastTypingSentRef.current = now
    fetch(`${config.apiBase}/api/tasks/${discussionTaskId}/typing`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}` },
    }).catch(() => {})
  }
  function sendTypingStop() {
    lastTypingSentRef.current = 0
    fetch(`${config.apiBase}/api/tasks/${discussionTaskId}/typing`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${config.token}` },
    }).catch(() => {})
  }
  // Auto-stop typing when the input becomes empty (after a send, or
  // a manual clear), so the recipient's indicator vanishes promptly.
  useEffect(() => {
    if (input.length === 0 && lastTypingSentRef.current > 0) sendTypingStop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input])

  // Resync on window focus / tab visibility — covers the case where
  // SSE was dropped while the user was away. SSE handles every other
  // delivery instantly; no periodic polling needed.
  useEffect(() => {
    function onFocus() { void loadComments(discussionTaskId) }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [discussionTaskId, loadComments])

  // Auto-scroll: jump to the latest comment when the channel first
  // mounts (matching DM behaviour), and keep up with new comments as
  // long as the user is already near the bottom. Scrolling up past
  // ~120px reveals the floating "jump to latest" button below.
  const lastCountRef = useRef(0)
  const initialScrolledRef = useRef(false)
  useEffect(() => {
    if (loading) return
    if (!initialScrolledRef.current && comments.length > 0) {
      // First load — jump to bottom instantly so the user starts on the
      // most recent message instead of scrolling through old ones.
      requestAnimationFrame(() => {
        const el = messagesScrollRef.current
        if (el) el.scrollTop = el.scrollHeight
        initialScrolledRef.current = true
      })
    } else if (comments.length > lastCountRef.current && isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
    lastCountRef.current = comments.length
  }, [comments.length, loading, isNearBottom])

  function groupReactions(reactions: NonNullable<TaskComment['reactions']>): GroupedReaction[] {
    const map = new Map<string, GroupedReaction>()
    for (const r of reactions) {
      const existing = map.get(r.emoji)
      const reacted = r.userId === auth.userId
      if (existing) {
        existing.count++
        existing.users.push(r.user.alias ?? r.user.username)
        if (reacted) existing.reacted = true
      } else {
        map.set(r.emoji, { emoji: r.emoji, count: 1, users: [r.user.alias ?? r.user.username], reacted })
      }
    }
    return Array.from(map.values())
  }

  async function send() {
    const body = input.trim()
    if (!body || sending) return
    setSending(true)
    try {
      await apiFetch(`/api/tasks/${discussionTaskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      })
      setInput('')
      await loadComments(discussionTaskId)
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    } catch (err) {
      console.error('[task-discussion] send failed:', err)
    } finally {
      setSending(false)
    }
  }

  async function sendThreadReply() {
    const body = threadInput.trim()
    if (!body || !threadParentId || sending) return
    setSending(true)
    try {
      await apiFetch(`/api/tasks/${discussionTaskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body, parentCommentId: threadParentId }),
      })
      setThreadInput('')
      await loadComments(discussionTaskId)
    } catch (err) {
      console.error('[task-discussion] thread reply failed:', err)
    } finally {
      setSending(false)
    }
  }

  async function toggleReaction(commentId: string, emoji: string) {
    try {
      await apiFetch(`/api/tasks/${discussionTaskId}/comments/${commentId}/reactions`, {
        method: 'POST', body: JSON.stringify({ emoji }),
      })
      await loadComments(discussionTaskId)
    } catch (err) { console.error('[task-discussion] react failed:', err) }
  }

  async function editComment(id: string) {
    const body = editingBody.trim()
    if (!body) return
    try {
      await apiFetch(`/api/tasks/${discussionTaskId}/comments/${id}`, {
        method: 'PATCH', body: JSON.stringify({ body }),
      })
      setEditingId(null); setEditingBody('')
      await loadComments(discussionTaskId)
    } catch (err) { console.error('[task-discussion] edit failed:', err) }
  }

  async function deleteComment(id: string) {
    try {
      await apiFetch(`/api/tasks/${discussionTaskId}/comments/${id}`, { method: 'DELETE' })
      await loadComments(discussionTaskId)
    } catch (err) { console.error('[task-discussion] delete failed:', err) }
  }

  // Filter comments for the in-discussion search box.
  const filteredComments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return comments
    return comments.filter(c =>
      (c.body ?? '').toLowerCase().includes(q) ||
      (c.user.alias ?? c.user.username).toLowerCase().includes(q) ||
      (c.replies ?? []).some(r => (r.body ?? '').toLowerCase().includes(q))
    )
  }, [comments, searchQuery])

  const totalCount = useMemo(
    () => comments.length + comments.reduce((n, c) => n + (c.replies?.length ?? 0), 0),
    [comments],
  )
  // Walks every comment + reply on each call — memoize on `comments` so the
  // sub-tab counter doesn't re-walk the tree on every render of an unrelated
  // state change (search input, hover, etc).
  const filesCount = useMemo(() => countDiscussionAssets(comments), [comments])

  // #1 — Thread takeover. When the user clicks "View thread" on a
  // comment we replace the discussion view with a parent-and-replies
  // layout, mirroring the regular DM channel's ThreadView UX. Click
  // back to return to the full discussion.
  const threadParent = threadParentId ? comments.find(c => c.id === threadParentId) ?? null : null
  if (threadParent) {
    const replies = threadParent.replies ?? []
    const parentName = threadParent.user.alias ?? threadParent.user.username
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: C.lgBg }}>
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${C.separator}`,
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <button onClick={() => { setThreadParentId(null); setThreadInput('') }} title="Back to discussion"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, display: 'flex' }}>
            <ArrowLeft size={18} />
          </button>
          <MessageCircle size={16} style={{ color: C.accent }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Thread</span>
          <span style={{ fontSize: 12, color: C.textMuted }}>
            {replies.length === 0 ? 'No replies' : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
          </span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', maxWidth: 820, margin: '0 auto', width: '100%' }}>
          {/* Parent comment — full body, attachment, reactions, like a
              pinned context for the thread. */}
          <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${C.separator}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Avatar url={threadParent.user.avatarUrl} name={parentName} size={28} />
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{parentName}</span>
              <span style={{ fontSize: 11, color: C.textMuted }}>
                {new Date(threadParent.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </span>
            </div>
            <div style={{ fontSize: 14, color: C.text, lineHeight: 1.5, paddingLeft: 38 }}>
              {threadParent.body && renderMessageContent(threadParent.body)}
            </div>
            {threadParent.attachmentName && threadParent.attachmentUrl && (
              <div style={{ paddingLeft: 38 }}>
                <CommentAttachmentThumb
                  url={`${config.apiBase}${threadParent.attachmentUrl}`}
                  filename={threadParent.attachmentName}
                  isImage={!!threadParent.attachmentName && /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(threadParent.attachmentName)}
                  onOpen={() => { setLightboxUrl(`${config.apiBase}${threadParent.attachmentUrl}`); setLightboxName(threadParent.attachmentName!) }}
                />
              </div>
            )}
          </div>
          {/* Replies */}
          {replies.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, padding: 32, opacity: 0.7 }}>
              No replies yet — be the first to respond.
            </div>
          ) : (
            replies.map((reply) => {
              const rName = reply.user.alias ?? reply.user.username
              const rIsImage = !!(reply.attachmentName && /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(reply.attachmentName))
              const rGrouped = groupReactions(reply.reactions ?? [])
              return (
                <div key={reply.id} id={`thread-msg-${reply.id}`}
                  style={{ marginBottom: 14, padding: '6px 8px', borderRadius: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Avatar url={reply.user.avatarUrl} name={rName} size={24} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{rName}</span>
                    <span style={{ fontSize: 11, color: C.textMuted }}>
                      {new Date(reply.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </span>
                    {reply.editedAt && <span style={{ fontSize: 10, color: C.textMuted, fontStyle: 'italic' }}>(edited)</span>}
                  </div>
                  <div style={{ paddingLeft: 32, fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                    {reply.body && renderMessageContent(reply.body)}
                  </div>
                  {reply.attachmentName && reply.attachmentUrl && (
                    <div style={{ paddingLeft: 32 }}>
                      <CommentAttachmentThumb
                        url={`${config.apiBase}${reply.attachmentUrl}`}
                        filename={reply.attachmentName}
                        isImage={rIsImage}
                        onOpen={() => { setLightboxUrl(`${config.apiBase}${reply.attachmentUrl}`); setLightboxName(reply.attachmentName!) }}
                      />
                    </div>
                  )}
                  {rGrouped.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, paddingLeft: 32 }}>
                      {rGrouped.map((r) => (
                        <button key={r.emoji} onClick={() => toggleReaction(reply.id, r.emoji)}
                          title={r.users.join(', ')}
                          style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 10, border: `1px solid ${r.reacted ? C.accent : C.separator}`, background: r.reacted ? C.accentLight : C.bgInput, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                          <span>{r.emoji}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: r.reacted ? C.accent : C.textMuted }}>{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
        <div style={{ borderTop: `1px solid ${C.separator}`, flexShrink: 0 }}>
          <MessageInput
            placeholder="Reply in thread…"
            config={config}
            channelId={discussionTaskId}
            onTyping={() => {}}
            input={threadInput}
            setInput={setThreadInput}
            sendFn={sendThreadReply}
            sending={sending}
            hideSchedule
            hideGifs
          />
        </div>
        {lightboxUrl && (
          <LightboxOverlay
            lightbox={{ url: lightboxUrl, filename: lightboxName }}
            config={config}
            onClose={() => setLightboxUrl(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: C.lgBg }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: `1px solid ${C.separator}`,
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <button onClick={onClose} title="Back to messages"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, display: 'flex' }}>
          <ArrowLeft size={18} />
        </button>
        <MessageSquare size={16} style={{ color: C.accent }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {taskTitle} <span style={{ color: C.textMuted, fontWeight: 400 }}>discussion</span>
        </span>
        <button onClick={onOpenInDrawer} title="Open full task"
          style={{ marginLeft: 'auto', background: 'none', border: `1px solid ${C.separator}`, color: C.textMuted, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
          Open task
        </button>
      </div>

      {/* Sub-tabs (Messages / Pins / Files) + Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        borderBottom: `1px solid ${C.separator}`,
        padding: '0 16px', flexShrink: 0,
      }}>
        {(['messages', 'pins', 'files'] as const).map((t) => {
          const active = subTab === t
          const counts = {
            messages: totalCount,
            pins: 0,
            files: filesCount,
          }
          return (
            <button key={t} onClick={() => setSubTab(t)}
              style={{
                padding: '8px 12px', border: 'none',
                background: 'transparent', cursor: 'pointer',
                color: active ? C.accent : C.textMuted,
                fontWeight: active ? 700 : 500, fontSize: 12,
                borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
                marginBottom: -1, fontFamily: 'inherit',
              }}>
              {t.charAt(0).toUpperCase() + t.slice(1)} <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 3 }}>{counts[t]}</span>
            </button>
          )
        })}
        <button onClick={() => { setShowSearch(s => !s); if (showSearch) setSearchQuery('') }}
          title="Search in discussion"
          style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 6, background: showSearch ? `${C.accent}22` : 'none', border: 'none', cursor: 'pointer', color: showSearch ? C.accent : C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
          <Search size={14} />
        </button>
      </div>
      {showSearch && (
        <div style={{ padding: '8px 16px', flexShrink: 0 }}>
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search this discussion…"
            style={{
              width: '100%', padding: '6px 10px', fontSize: 12,
              background: C.bgInput, color: C.text,
              border: `1px solid ${C.separator}`, borderRadius: 6,
              outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* Body — switches between sub-tabs */}
      {subTab === 'pins' ? (
        <div style={{ flex: 1, padding: 24, color: C.textMuted, fontSize: 13, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
          <Pin size={28} style={{ opacity: 0.3 }} />
          <div>No pinned messages yet.</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Pinning needs a small backend migration — coming soon.</div>
        </div>
      ) : subTab === 'files' ? (
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px' }}>
          <DiscussionFilesView
            comments={comments}
            config={config}
            onOpenAttachment={(url, name) => { setLightboxUrl(url); setLightboxName(name) }}
          />
        </div>
      ) : (
        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <div
          ref={messagesScrollRef}
          onScroll={(e) => {
            const el = e.currentTarget
            setIsNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120)
          }}
          style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32, color: C.textMuted }}>
              <Loader size={18} />
            </div>
          ) : filteredComments.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.textMuted, opacity: 0.5, padding: 32, fontSize: 13 }}>
              {searchQuery ? `No matches for "${searchQuery}"` : 'No messages yet — start the discussion.'}
            </div>
          ) : (
            filteredComments.map((c, ci) => {
              const prev = filteredComments[ci - 1]
              const msgDate = new Date(c.createdAt)
              const prevDate = prev ? new Date(prev.createdAt) : null
              const showDateSep = !prevDate || msgDate.toDateString() !== prevDate.toDateString()
              const today = new Date()
              const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
              let dateLabel = msgDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
              if (msgDate.toDateString() === today.toDateString()) dateLabel = 'Today'
              else if (msgDate.toDateString() === yesterday.toDateString()) dateLabel = 'Yesterday'
              const timeDiff = prev ? msgDate.getTime() - new Date(prev.createdAt).getTime() : Infinity
              const showHeader = !prev || prev.user.id !== c.user.id || timeDiff > 5 * 60 * 1000 || showDateSep
              const isMe = c.user.id === auth.userId
              const isHovered = hoveredId === c.id
              const isEditing = editingId === c.id
              const grouped = groupReactions(c.reactions ?? [])
              const isImage = !!(c.attachmentName && /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(c.attachmentName))

              return (
                <div key={c.id}>
                  {showDateSep && (
                    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0 6px', gap: 10 }}>
                      <div style={{ flex: 1, height: 1, background: C.separator }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.textSecondary, whiteSpace: 'nowrap', padding: '2px 10px', border: `1px solid ${C.separator}`, borderRadius: 12, background: C.lgBg }}>{dateLabel}</span>
                      <div style={{ flex: 1, height: 1, background: C.separator }} />
                    </div>
                  )}
                  <div
                    onMouseEnter={() => setHoveredId(c.id)}
                    onMouseLeave={() => { setHoveredId(null); if (emojiPickerId === c.id) setEmojiPickerId(null) }}
                    style={{ display: 'flex', padding: showHeader ? '8px 4px 4px' : '1px 4px', position: 'relative', gap: 8, background: isHovered ? `${C.text}06` : 'transparent', borderRadius: 6 }}
                  >
                    {showHeader ? (
                      <div style={{ width: 32, flexShrink: 0 }}>
                        <Avatar url={c.user.avatarUrl} name={c.user.alias ?? c.user.username} size={32} />
                      </div>
                    ) : (
                      <div style={{ width: 32, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                        {isHovered && (
                          <span style={{ fontSize: 10, color: C.textMuted, lineHeight: '20px' }}>
                            {msgDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                          </span>
                        )}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {showHeader && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{c.user.alias ?? c.user.username}</span>
                          <span style={{ fontSize: 11, color: C.textMuted }}>
                            {msgDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                          </span>
                          {c.editedAt && <span style={{ fontSize: 10, color: C.textMuted }}>(edited)</span>}
                        </div>
                      )}
                      {isEditing ? (
                        <div style={{ marginTop: 2 }}>
                          <textarea
                            value={editingBody}
                            onChange={e => setEditingBody(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); editComment(c.id) }
                              if (e.key === 'Escape') { setEditingId(null); setEditingBody('') }
                            }}
                            autoFocus rows={3}
                            style={{ width: '100%', resize: 'vertical', padding: '6px 8px', fontSize: 13, color: C.text, background: C.bgInput, border: `1px solid ${C.accent}`, borderRadius: 6, outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
                          />
                          <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: 10, color: C.textMuted }}>
                            <span>Enter to save · Esc to cancel</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* #3 — subtask reference link card. Same
                              styling + behaviour as the drawer's
                              discussion: detect `[Subtask: …](/tasks/ID)`
                              in the body, render a clickable box that
                              opens the linked task. */}
                          {(() => {
                            const m = c.body?.match(/\[(?:Sub)?[Tt]ask: (.+?)\]\(\/tasks\/(\w+)\)/)
                            if (!m) return null
                            return (
                              <div
                                onClick={() => window.dispatchEvent(new CustomEvent('bundy-open-task', { detail: { taskId: m[2] } }))}
                                style={{
                                  borderLeft: `3px solid ${C.accent}`, padding: '4px 8px',
                                  marginTop: 4, marginBottom: 4,
                                  background: `${C.accent}08`, borderRadius: '0 4px 4px 0',
                                  cursor: 'pointer',
                                  fontSize: 11, color: C.accent, fontWeight: 500,
                                  display: 'flex', alignItems: 'center', gap: 4,
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${C.accent}18` }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${C.accent}08` }}>
                                <GitBranch size={10} /> {m[1]}
                              </div>
                            )
                          })()}
                          {/* Strip the raw subtask markdown link from
                              the rendered body so the user only sees
                              the styled box above. */}
                          {c.body && (() => {
                            const cleaned = c.body
                              .replace(/\[(?:Sub)?[Tt]ask: .+?\]\(\/tasks\/\w+\)\s*\n?/g, '')
                              .trim()
                            return cleaned ? (
                              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                                {renderMessageContent(cleaned)}
                              </div>
                            ) : null
                          })()}
                          {!showHeader && c.editedAt && <span style={{ fontSize: 10, color: C.textMuted }}>(edited)</span>}
                        </>
                      )}
                      {c.attachmentName && c.attachmentUrl && (
                        <CommentAttachmentThumb
                          url={`${config.apiBase}${c.attachmentUrl}`}
                          filename={c.attachmentName}
                          isImage={isImage}
                          onOpen={() => { setLightboxUrl(`${config.apiBase}${c.attachmentUrl}`); setLightboxName(c.attachmentName!) }}
                        />
                      )}
                      {grouped.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                          {grouped.map(r => (
                            <button key={r.emoji} onClick={() => toggleReaction(c.id, r.emoji)} title={r.users.join(', ')}
                              style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 12, border: `1px solid ${r.reacted ? C.accent : C.separator}`, background: r.reacted ? C.accentLight : C.bgInput, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                              <span>{r.emoji}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: r.reacted ? C.accent : C.textMuted }}>{r.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {(c.replies?.length ?? 0) > 0 && (
                        <button onClick={() => setThreadParentId(c.id)}
                          title="View thread"
                          style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, background: 'transparent', border: `1px solid transparent`, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, transition: 'background 0.15s, border-color 0.15s', fontFamily: 'inherit' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.bgInput; (e.currentTarget as HTMLElement).style.borderColor = C.separator }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent' }}>
                          {/* #2 — show actual reply senders' avatars
                              instead of a generic icon. Mirrors the
                              regular DM conversation behaviour. */}
                          <div style={{ display: 'flex', flexShrink: 0 }}>
                            {[...new Map((c.replies ?? []).map(r => [r.user.id, r.user])).values()].slice(0, 3).map((u, ri) => (
                              <div key={u.id} style={{
                                width: 20, height: 20, borderRadius: '50%',
                                border: `2px solid ${C.lgBg}`,
                                marginLeft: ri === 0 ? 0 : -6, zIndex: 3 - ri,
                                position: 'relative', overflow: 'hidden', background: C.bgInput,
                              }}>
                                <Avatar url={u.avatarUrl} name={u.alias ?? u.username} size={16} />
                              </div>
                            ))}
                          </div>
                          <span style={{ color: C.accent, fontSize: 12, fontWeight: 700 }}>{c.replies!.length} {c.replies!.length === 1 ? 'reply' : 'replies'}</span>
                          <span style={{ color: C.textMuted, fontSize: 11 }}>View thread</span>
                          <ChevronRight size={12} color={C.textMuted} />
                        </button>
                      )}
                    </div>
                    {/* Hover toolbar — minimal set; full toolbar lives
                        in the drawer (Quote / Forward / link copy etc). */}
                    {isHovered && !isEditing && (
                      <div style={{ position: 'absolute', top: -14, right: 8, display: 'flex', gap: 0, background: C.bgInput, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.25)', border: `1px solid ${C.separator}`, padding: '1px 2px', zIndex: 10 }}>
                        <button onClick={() => setEmojiPickerId(emojiPickerId === c.id ? null : c.id)} title="React"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', color: C.textSecondary, borderRadius: 6, display: 'flex', fontFamily: 'inherit' }}>
                          <Smile size={14} />
                        </button>
                        <button onClick={() => setThreadParentId(c.id)} title="Reply in thread"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', color: C.textSecondary, borderRadius: 6, display: 'flex', fontFamily: 'inherit' }}>
                          <CornerDownRight size={14} />
                        </button>
                        {/* Copy comment link — same UX as the drawer
                            so users can re-share a comment from either
                            entry point. */}
                        <button
                          title={copiedCommentId === c.id ? 'Copied!' : 'Copy link'}
                          onClick={() => {
                            const url = `${config.apiBase}/tasks/${discussionTaskId}?comment=${c.id}`
                            const native = (window.electronAPI as { writeClipboard?: (s: string) => void } | undefined)?.writeClipboard
                            const done = () => { setCopiedCommentId(c.id); window.setTimeout(() => setCopiedCommentId(null), 1500) }
                            if (native) { try { native(url); done(); return } catch { /* fall through */ } }
                            navigator.clipboard.writeText(url).then(done).catch(() => {/* swallow */})
                          }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', color: copiedCommentId === c.id ? C.success : C.textSecondary, borderRadius: 6, display: 'flex', fontFamily: 'inherit' }}>
                          {copiedCommentId === c.id ? <Check size={14} /> : <LinkIcon size={14} />}
                        </button>
                        {isMe && (Date.now() - new Date(c.createdAt).getTime()) < 12 * 60 * 60 * 1000 && (
                          <button onClick={() => { setEditingId(c.id); setEditingBody(c.body) }} title="Edit"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', color: C.textSecondary, borderRadius: 6, display: 'flex', fontFamily: 'inherit' }}>
                            <Edit2 size={14} />
                          </button>
                        )}
                        {isMe && (
                          <button onClick={() => deleteComment(c.id)} title="Delete"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', color: C.danger, borderRadius: 6, display: 'flex', fontFamily: 'inherit' }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                    {emojiPickerId === c.id && (
                      <div style={{ position: 'absolute', top: -40, right: 8, display: 'flex', gap: 2, background: C.bgInput, borderRadius: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', border: `1px solid ${C.separator}`, padding: '4px 6px', zIndex: 20 }}>
                        {QUICK_EMOJIS.map(e => (
                          <button key={e} onClick={() => { void toggleReaction(c.id, e); setEmojiPickerId(null) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '2px 4px', borderRadius: 6, fontFamily: 'inherit' }}>
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>
        {!isNearBottom && !loading && comments.length > 0 && (
          <button
            onClick={() => {
              const el = messagesScrollRef.current
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
            }}
            title="Jump to latest"
            style={{
              position: 'absolute', bottom: 16, right: 20,
              width: 40, height: 40, borderRadius: 20,
              background: C.accent, color: '#fff', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4)', zIndex: 5,
              fontFamily: 'inherit',
            }}>
            <ChevronDown size={20} strokeWidth={2.5} />
          </button>
        )}
        </div>
      )}

      {/* Composer */}
      {subTab === 'messages' && (
        <div style={{ borderTop: `1px solid ${C.separator}`, flexShrink: 0 }}>
          {/* Typing indicator — same shape as DM channels. */}
          {(() => {
            const names = Object.values(typingUsers).map(t => t.name)
            if (names.length === 0) return null
            const label = names.length === 1
              ? `${names[0]} is typing…`
              : names.length === 2
                ? `${names[0]} and ${names[1]} are typing…`
                : `${names[0]}, ${names[1]} and ${names.length - 2} more are typing…`
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px 0', fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>
                <span style={{ display: 'inline-flex', gap: 2 }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.textMuted, animation: 'bundy-typing-dot 1.2s infinite', animationDelay: '0s' }} />
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.textMuted, animation: 'bundy-typing-dot 1.2s infinite', animationDelay: '0.2s' }} />
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.textMuted, animation: 'bundy-typing-dot 1.2s infinite', animationDelay: '0.4s' }} />
                </span>
                <span>{label}</span>
                <style>{`@keyframes bundy-typing-dot { 0%, 60%, 100% { opacity: 0.3 } 30% { opacity: 1 } }`}</style>
              </div>
            )
          })()}
          <MessageInput
            placeholder={`Message ${taskTitle}…`}
            config={config}
            channelId={taskId} // unused for tasks but required by prop type
            onTyping={sendTyping}
            input={input}
            setInput={setInput}
            sendFn={send}
            sending={sending}
            hideSchedule
            hideGifs
          />
        </div>
      )}

      {/* Lightbox — uses the shared LightboxOverlay so close + download
          + gallery + size hints all work uniformly. */}
      {lightboxUrl && (
        <LightboxOverlay
          lightbox={{ url: lightboxUrl, filename: lightboxName }}
          config={config}
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </div>
  )
}
