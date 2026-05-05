/**
 * DiscussionPanel — single-channel view that renders identical to the
 * DMs main pane, scoped to one channelId. Mounted inside the task
 * drawer's discussion tab so the drawer's discussion uses the same
 * UI + realtime pipeline as DMs.
 *
 * Reads from /api/channels/[id]/messages (post-migration source of
 * truth). Subscribes to the global `bundy-channel-*` window events
 * MessagesPanel re-emits from its SSE handler, so any new comment
 * arrives via push without a refetch.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Smile, CornerDownRight, Edit2, Trash2, Loader, Search,
  Link as LinkIcon, Check, Pin, MessageCircle, ChevronDown, FolderOpen, MessageSquare,
  X, Download,
} from 'lucide-react'
import { C } from '../../theme'
import { Avatar } from '../shared/Avatar'
import { renderMessageContent } from '../../utils/markdown'
import { MessageInput } from './MessageInput'
import { useLightboxClaim } from '../../utils/lightboxClaim'
import { formatTime } from '../../utils/format'
import { PinnedView } from './PinnedView'
import { SharedMediaView } from './SharedMediaView'
import { ThreadView } from './ThreadView'
import type { ApiConfig, Auth, ChatMessage } from '../../types'
import { apiFetch as sharedApiFetch } from '../../api/client'
import { QueuedWriteError } from '../../api/writeQueue'

interface SharedMedia {
  links: Array<{ url: string; sender: string; createdAt: string }>
  media: Array<{ url: string; sender: string; createdAt: string; filename?: string }>
  files: Array<{ url: string; filename: string; sender: string; createdAt: string }>
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🚀']

interface GroupedReaction {
  emoji: string
  count: number
  users: string[]
  reacted: boolean
}

export function DiscussionPanel({
  channelId, config, auth, subtaskContext,
}: {
  channelId: string
  config: ApiConfig
  auth: Auth
  // v1.5.2207 — when the drawer is showing a subtask, the parent passes
  // {id,title} so we can prepend `[Subtask: …](/tasks/…)` to outgoing
  // messages (mirrors what the comments POST route does for the DM tab).
  // Without this, messages posted from a subtask drawer's discussion
  // tab show no chip — DiscussionPanel posts to /api/channels/[id]/messages,
  // not /api/tasks/[id]/comments, so the server-side prepend never fires.
  subtaskContext?: { id: string; title: string } | null
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  // Per-channel draft persistence — survives drawer close + tab switches.
  // Mirrors what MessagesPanel does for its own composer.
  const [input, setInputState] = useState<string>(() => {
    try { return window.localStorage.getItem(`bundy.msg.draft.${channelId}`) ?? '' }
    catch { return '' }
  })
  const inputRef = useRef<string>(input)
  const setInput = useCallback((v: string | ((prev: string) => string)) => {
    setInputState((prev) => {
      const next = typeof v === 'function' ? (v as (p: string) => string)(prev) : v
      inputRef.current = next
      try {
        if (next && next.trim()) window.localStorage.setItem(`bundy.msg.draft.${channelId}`, next)
        else window.localStorage.removeItem(`bundy.msg.draft.${channelId}`)
      } catch { /* ignore */ }
      return next
    })
  }, [channelId])
  // When the channel id changes (different task in drawer), pull that
  // channel's stashed draft instead of carrying the previous one over.
  useEffect(() => {
    try { setInputState(window.localStorage.getItem(`bundy.msg.draft.${channelId}`) ?? '') }
    catch { setInputState('') }
  }, [channelId])
  const [sending, setSending] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [emojiPickerId, setEmojiPickerId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; filename: string } | null>(null)
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; expiresAt: number }>>({})
  const [isNearBottom, setIsNearBottom] = useState(true)
  // Sub-tab + thread takeover — same shape MessagesPanel uses, so the
  // drawer's discussion has full feature parity (Pins, Files, threads).
  const [subTab, setSubTab] = useState<'messages' | 'pins' | 'files'>('messages')
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([])
  const [sharedMedia, setSharedMedia] = useState<SharedMedia>({ links: [], media: [], files: [] })
  const [sharedMediaTab, setSharedMediaTab] = useState<'media' | 'files' | 'links'>('media')
  const [loadingSharedMedia, setLoadingSharedMedia] = useState(false)
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null)
  const [threadReplies, setThreadReplies] = useState<ChatMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadInput, setThreadInput] = useState('')
  const [sendingThreadReply, setSendingThreadReply] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const lastTypingSentRef = useRef(0)

  const apiFetch = useCallback(async <T = unknown>(path: string, init?: RequestInit): Promise<T> => {
    const method = (init?.method ?? 'GET') as 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'
    const headers = (init?.headers ?? {}) as Record<string, string>
    const hasBody = init?.body !== undefined && init?.body !== null
    return sharedApiFetch<T>(path, {
      method,
      rawBody: hasBody ? (init!.body as BodyInit) : undefined,
      headers: hasBody ? { 'Content-Type': 'application/json', ...headers } : headers,
    })
  }, [])

  // Initial load — fetch the latest 50 messages.
  useEffect(() => {
    setLoading(true)
    setMessages([])
    apiFetch<{ messages: ChatMessage[] }>(`/api/channels/${channelId}/messages?limit=50`)
      .then(d => {
        // API returns newest-first when paginating; chronological for display.
        const msgs = (d.messages ?? []).slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        setMessages(msgs)
      })
      .catch(err => { console.error('[discussion] load failed:', err) })
      .finally(() => setLoading(false))
    // Mark as read + tell MessagesPanel to drop unread locally so the
    // DMs tab badge decrements immediately (don't wait for SSE).
    fetch(`${config.apiBase}/api/channels/${channelId}/read`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.token}` },
    }).catch(() => {})
    window.dispatchEvent(new CustomEvent('bundy-channel-read-local', { detail: { channelId } }))
  }, [channelId, apiFetch, config.apiBase, config.token])

  // Auto-scroll to bottom on new messages (when already near bottom).
  const lastCountRef = useRef(0)
  const initialScrolledRef = useRef(false)
  useEffect(() => {
    if (loading) return
    if (!initialScrolledRef.current && messages.length > 0) {
      requestAnimationFrame(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
        initialScrolledRef.current = true
      })
    } else if (messages.length > lastCountRef.current && isNearBottom) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
    lastCountRef.current = messages.length
  }, [messages.length, loading, isNearBottom])

  // Realtime — listen for the bundy-channel-* events MessagesPanel
  // re-emits from its own SSE handler. No separate subscription needed.
  useEffect(() => {
    function onMessage(e: Event) {
      const p = (e as CustomEvent).detail as {
        channelId: string; id: string; senderId: string; senderName: string; senderAvatar: string | null
        content: string; createdAt: string; editedAt: string | null
        parentMessageId: string | null; replyCount?: number
      } | undefined
      if (!p || p.channelId !== channelId) return
      const msg: ChatMessage = {
        id: p.id, content: p.content, createdAt: p.createdAt, editedAt: p.editedAt,
        sender: { id: p.senderId, username: p.senderName, alias: null, avatarUrl: p.senderAvatar },
        reactions: [], reads: [], replyCount: p.replyCount ?? 0,
        parentMessageId: p.parentMessageId,
      }
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
      // Stop showing the sender as "typing" — their message has landed.
      setTypingUsers(prev => {
        if (!prev[p.senderId]) return prev
        const { [p.senderId]: _, ...rest } = prev
        return rest
      })
      // Mark read if I'm reading.
      fetch(`${config.apiBase}/api/channels/${channelId}/read`, {
        method: 'POST', headers: { Authorization: `Bearer ${config.token}` },
      }).catch(() => {})
      // Tell MessagesPanel to clear its local unread for this channel
      // so the DMs tab badge decrements without waiting for the SSE.
      window.dispatchEvent(new CustomEvent('bundy-channel-read-local', { detail: { channelId } }))
    }
    function onEdit(e: Event) {
      const p = (e as CustomEvent).detail as { channelId: string; messageId: string; content: string; editedAt: string } | undefined
      if (!p || p.channelId !== channelId) return
      setMessages(prev => prev.map(m => m.id === p.messageId ? { ...m, content: p.content, editedAt: p.editedAt } : m))
      setThreadReplies(prev => prev.map(m => m.id === p.messageId ? { ...m, content: p.content, editedAt: p.editedAt } : m))
    }
    function onDelete(e: Event) {
      const p = (e as CustomEvent).detail as { channelId: string; messageId: string } | undefined
      if (!p || p.channelId !== channelId) return
      setMessages(prev => prev.filter(m => m.id !== p.messageId))
      setThreadReplies(prev => prev.filter(m => m.id !== p.messageId))
    }
    function onTyping(e: Event) {
      const p = (e as CustomEvent).detail as { channelId: string; userId: string; userName: string } | undefined
      if (!p || p.channelId !== channelId || p.userId === auth.userId) return
      setTypingUsers(prev => ({ ...prev, [p.userId]: { name: p.userName, expiresAt: Date.now() + 5000 } }))
    }
    function onReplayed(e: Event) {
      const detail = (e as CustomEvent).detail as { kind: string; tempId?: string; response?: { message?: ChatMessage } } | undefined
      if (!detail || detail.kind !== 'message' || !detail.tempId) return
      const real = detail.response?.message
      if (!real) return
      // Swap temp message → real server message. SSE may also splice
      // independently; the de-dup in onMessage handles either order.
      setMessages(prev => prev.map(m => m.id === detail.tempId ? real : m))
    }
    window.addEventListener('bundy-channel-message', onMessage)
    window.addEventListener('bundy-channel-message-edit', onEdit)
    window.addEventListener('bundy-channel-message-delete', onDelete)
    window.addEventListener('bundy-channel-typing', onTyping)
    window.addEventListener('bundy-write-replayed', onReplayed)
    return () => {
      window.removeEventListener('bundy-channel-message', onMessage)
      window.removeEventListener('bundy-channel-message-edit', onEdit)
      window.removeEventListener('bundy-channel-message-delete', onDelete)
      window.removeEventListener('bundy-channel-typing', onTyping)
      window.removeEventListener('bundy-write-replayed', onReplayed)
    }
  }, [channelId, auth.userId, config.apiBase, config.token])

  // Tick to expire stale typing entries.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()
      setTypingUsers(prev => {
        const next = Object.fromEntries(Object.entries(prev).filter(([, v]) => v.expiresAt > now))
        return Object.keys(next).length === Object.keys(prev).length ? prev : next
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  // Lightbox claim — same stack other surfaces use.
  useLightboxClaim((detail) => setLightbox(detail))

  function groupReactions(reactions: NonNullable<ChatMessage['reactions']>): GroupedReaction[] {
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

  // v1.5.2207 — same chip format the comments POST route uses on the
  // DM tab side. Lifted to a helper so send() and sendThreadReply() use
  // the same wrapping logic.
  function withSubtaskChip(content: string): string {
    if (!subtaskContext) return content
    const safeTitle = subtaskContext.title.replace(/[\[\]()]/g, '')
    return `[Subtask: ${safeTitle}](/tasks/${subtaskContext.id})\n${content}`
  }

  async function send() {
    const content = input.trim()
    if (!content || sending) return
    setSending(true)
    const tempId = `temp-${(crypto as Crypto).randomUUID?.() ?? Math.random().toString(36).slice(2)}`
    const wrapped = withSubtaskChip(content)
    try {
      const res = await sharedApiFetch<{ message: ChatMessage }>(`/api/channels/${channelId}/messages`, {
        method: 'POST', body: { content: wrapped }, tempId,
      })
      if (res.message) {
        setMessages(prev => prev.some(m => m.id === res.message.id) ? prev : [...prev, res.message])
      }
      setInput('')
    } catch (err) {
      if (err instanceof QueuedWriteError) {
        // Optimistically render the queued message so the user sees it
        // land in the thread immediately. Real id arrives via the
        // `bundy-write-replayed` listener below.
        const optimistic: ChatMessage = {
          id: tempId,
          content: wrapped,
          createdAt: new Date().toISOString(),
          editedAt: null,
          sender: { id: auth.userId, username: auth.username, alias: null, avatarUrl: auth.avatarUrl },
          reactions: [], reads: [], replyCount: 0,
          parentMessageId: null,
        }
        setMessages(prev => [...prev, optimistic])
        setInput('')
      } else {
        console.error('[discussion] send failed:', err)
      }
    }
    finally { setSending(false) }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    try {
      await apiFetch(`/api/channels/${channelId}/messages/${messageId}/reactions`, {
        method: 'POST', body: JSON.stringify({ emoji }),
      })
      // Reload to pick up the new reaction set (server doesn't broadcast
      // reaction-add as a window event the way it does for messages).
      const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/channels/${channelId}/messages?limit=50`)
      const msgs = (data.messages ?? []).slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      setMessages(msgs)
    } catch (err) { console.error('[discussion] react failed:', err) }
    setEmojiPickerId(null)
  }

  async function saveEdit(messageId: string) {
    const content = editingContent.trim()
    if (!content) return
    try {
      await apiFetch(`/api/channels/${channelId}/messages/${messageId}`, {
        method: 'PATCH', body: JSON.stringify({ content }),
      })
      setEditingId(null); setEditingContent('')
    } catch (err) { console.error('[discussion] edit failed:', err) }
  }

  async function deleteMsg(messageId: string) {
    try {
      await apiFetch(`/api/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' })
    } catch (err) { console.error('[discussion] delete failed:', err) }
  }

  function copyLink(messageId: string) {
    const url = `${config.apiBase}/messages/${channelId}/${messageId}`
    const native = (window.electronAPI as { writeClipboard?: (s: string) => void } | undefined)?.writeClipboard
    const done = () => { setCopiedMsgId(messageId); window.setTimeout(() => setCopiedMsgId(null), 1500) }
    if (native) { try { native(url); done(); return } catch { /* fallthrough */ } }
    navigator.clipboard.writeText(url).then(done).catch(() => {/* swallow */})
  }

  function sendTyping() {
    const now = Date.now()
    if (now - lastTypingSentRef.current < 3_000) return
    lastTypingSentRef.current = now
    fetch(`${config.apiBase}/api/channels/${channelId}/typing`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.token}` },
    }).catch(() => {})
  }

  // ─── Pins ──────────────────────────────────────────────────────────────
  async function togglePin(messageId: string) {
    try {
      await apiFetch(`/api/channels/${channelId}/messages/${messageId}/pin`, { method: 'POST' })
      // Reload messages so isPinned updates inline.
      const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/channels/${channelId}/messages?limit=50`)
      const msgs = (data.messages ?? []).slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      setMessages(msgs)
    } catch (err) { console.error('[discussion] pin failed:', err) }
  }
  const loadPinned = useCallback(async () => {
    try {
      // Same dedicated endpoint MessagesPanel uses — the messages route
      // ignores ?pinned=1 and returns the full thread, which is why
      // the drawer's Pins tab was showing every message instead of just
      // the actually-pinned ones.
      const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/channels/${channelId}/pins`)
      setPinnedMessages(data.messages ?? [])
    } catch (err) { console.error('[discussion] load pinned failed:', err) }
  }, [apiFetch, channelId])
  useEffect(() => {
    if (subTab === 'pins') void loadPinned()
  }, [subTab, loadPinned])

  // ─── Files / Media / Links ────────────────────────────────────────────
  const loadSharedMedia = useCallback(async () => {
    setLoadingSharedMedia(true)
    try {
      const data = await apiFetch<SharedMedia>(`/api/channels/${channelId}/shared-media`)
      setSharedMedia(data ?? { links: [], media: [], files: [] })
    } catch (err) { console.error('[discussion] shared-media load failed:', err) }
    finally { setLoadingSharedMedia(false) }
  }, [apiFetch, channelId])
  useEffect(() => {
    if (subTab === 'files') void loadSharedMedia()
  }, [subTab, loadSharedMedia])

  // ─── Threads ──────────────────────────────────────────────────────────
  const openThread = useCallback(async (parent: ChatMessage) => {
    setThreadParent(parent)
    setThreadLoading(true)
    setThreadReplies([])
    try {
      const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/channels/${channelId}/messages?parentMessageId=${parent.id}&limit=200`)
      const replies = (data.messages ?? []).slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      setThreadReplies(replies)
    } catch (err) { console.error('[discussion] thread load failed:', err) }
    finally { setThreadLoading(false) }
  }, [apiFetch, channelId])
  function closeThread() {
    setThreadParent(null); setThreadReplies([]); setThreadInput('')
  }
  async function sendThreadReply() {
    if (!threadParent || sendingThreadReply) return
    const content = threadInput.trim()
    if (!content) return
    setSendingThreadReply(true)
    try {
      await apiFetch(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: withSubtaskChip(content), parentMessageId: threadParent.id }),
      })
      setThreadInput('')
      // Reply will arrive via channel-message SSE → splice handler picks it up.
    } catch (err) { console.error('[discussion] thread reply failed:', err) }
    finally { setSendingThreadReply(false) }
  }
  // When channel-message SSE arrives for the active thread parent, splice
  // into thread replies too (the main listener above already handles
  // top-level messages).
  useEffect(() => {
    if (!threadParent) return
    function onMessage(e: Event) {
      const p = (e as CustomEvent).detail as {
        channelId: string; id: string; parentMessageId: string | null
        senderId: string; senderName: string; senderAvatar: string | null
        content: string; createdAt: string; editedAt: string | null
      } | undefined
      if (!p || p.channelId !== channelId || p.parentMessageId !== threadParent!.id) return
      const reply: ChatMessage = {
        id: p.id, content: p.content, createdAt: p.createdAt, editedAt: p.editedAt,
        sender: { id: p.senderId, username: p.senderName, alias: null, avatarUrl: p.senderAvatar },
        reactions: [], reads: [], replyCount: 0,
        parentMessageId: p.parentMessageId,
      }
      setThreadReplies(prev => prev.some(m => m.id === reply.id) ? prev : [...prev, reply])
    }
    window.addEventListener('bundy-channel-message', onMessage)
    return () => window.removeEventListener('bundy-channel-message', onMessage)
  }, [threadParent, channelId])

  // Filter for in-discussion search (client-side).
  const visibleMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return messages
    return messages.filter(m =>
      (m.content ?? '').toLowerCase().includes(q)
      || (m.sender.alias ?? m.sender.username ?? '').toLowerCase().includes(q))
  }, [messages, searchQuery])

  // Thread takeover renders the full-pane thread view; everything else
  // renders inside the regular pane below.
  if (threadParent) {
    return (
      <ThreadView
        config={config}
        auth={auth}
        channelId={channelId}
        parent={threadParent}
        replies={threadReplies}
        replyCount={threadReplies.length}
        loading={threadLoading}
        threadInput={threadInput}
        setThreadInput={setThreadInput}
        sendReply={sendThreadReply}
        sendingReply={sendingThreadReply}
        groupReactions={(r) => groupReactions(r ?? [])}
        toggleReaction={(mid, emoji) => void toggleReaction(mid, emoji)}
        usersMap={{}}
        onClose={closeThread}
      />
    )
  }

  // Pinned tab takes over the pane.
  if (subTab === 'pins') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}>
        {/* Sub-tab bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: `1px solid ${C.separator}`, flexShrink: 0 }}>
          {(['messages', 'pins', 'files'] as const).map((t) => {
            const active = subTab === t
            const Icon = t === 'messages' ? MessageSquare : t === 'pins' ? Pin : FolderOpen
            return (
              <button key={t} onClick={() => setSubTab(t)}
                style={{
                  padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
                  color: active ? C.accent : C.textMuted, fontWeight: active ? 700 : 500, fontSize: 12,
                  borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
                  marginBottom: -1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                <Icon size={13} />
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            )
          })}
        </div>
        <PinnedView
          pinnedMessages={pinnedMessages}
          onClose={() => setSubTab('messages')}
          usersMap={{}}
          onJump={() => setSubTab('messages')}
        />
      </div>
    )
  }

  // Files tab takes over the pane.
  if (subTab === 'files') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: `1px solid ${C.separator}`, flexShrink: 0 }}>
          {(['messages', 'pins', 'files'] as const).map((t) => {
            const active = subTab === t
            const Icon = t === 'messages' ? MessageSquare : t === 'pins' ? Pin : FolderOpen
            return (
              <button key={t} onClick={() => setSubTab(t)}
                style={{
                  padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
                  color: active ? C.accent : C.textMuted, fontWeight: active ? 700 : 500, fontSize: 12,
                  borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
                  marginBottom: -1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                <Icon size={13} />
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            )
          })}
        </div>
        <SharedMediaView
          config={config}
          sharedMedia={sharedMedia}
          sharedMediaTab={sharedMediaTab}
          setSharedMediaTab={setSharedMediaTab}
          loadingSharedMedia={loadingSharedMedia}
          onClose={() => setSubTab('messages')}
          onOpenFile={(url, filename) => setLightbox({ url, filename })}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}>
      {/* Sub-tab bar — same Messages / Pins / Files structure DMs has. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: `1px solid ${C.separator}`, flexShrink: 0 }}>
        {(['messages', 'pins', 'files'] as const).map((t) => {
          const active = subTab === t
          const Icon = t === 'messages' ? MessageSquare : t === 'pins' ? Pin : FolderOpen
          return (
            <button key={t} onClick={() => setSubTab(t)}
              style={{
                padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
                color: active ? C.accent : C.textMuted, fontWeight: active ? 700 : 500, fontSize: 12,
                borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
                marginBottom: -1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <Icon size={13} />
              {t.charAt(0).toUpperCase() + t.slice(1)}
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
        <div style={{ marginBottom: 8, flexShrink: 0 }}>
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

      {/* Messages — same chronological layout DMs uses. */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget
            setIsNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120)
          }}
          style={{ position: 'absolute', inset: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32, color: C.textMuted }}>
              <Loader size={18} />
            </div>
          ) : visibleMessages.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.textMuted, opacity: 0.5, padding: 32, fontSize: 13 }}>
              {searchQuery ? `No matches for "${searchQuery}"` : 'No messages yet — start the discussion.'}
            </div>
          ) : (
            visibleMessages.map((m, mi) => {
              const prev = visibleMessages[mi - 1]
              const msgDate = new Date(m.createdAt)
              const prevDate = prev ? new Date(prev.createdAt) : null
              const showDateSep = !prevDate || msgDate.toDateString() !== prevDate.toDateString()
              const today = new Date()
              const yest = new Date(today); yest.setDate(yest.getDate() - 1)
              let dateLabel = msgDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
              if (msgDate.toDateString() === today.toDateString()) dateLabel = 'Today'
              else if (msgDate.toDateString() === yest.toDateString()) dateLabel = 'Yesterday'
              const timeDiff = prev ? msgDate.getTime() - new Date(prev.createdAt).getTime() : Infinity
              const showHeader = !prev || prev.sender.id !== m.sender.id || timeDiff > 5 * 60 * 1000 || showDateSep
              const isMe = m.sender.id === auth.userId
              const isHovered = hoveredId === m.id
              const isEditing = editingId === m.id
              const grouped = groupReactions(m.reactions ?? [])
              const senderName = m.sender.alias ?? m.sender.username

              return (
                <div key={m.id}>
                  {showDateSep && (
                    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0 6px', gap: 10 }}>
                      <div style={{ flex: 1, height: 1, background: C.separator }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.textSecondary, whiteSpace: 'nowrap', padding: '2px 10px', border: `1px solid ${C.separator}`, borderRadius: 12, background: C.lgBg }}>{dateLabel}</span>
                      <div style={{ flex: 1, height: 1, background: C.separator }} />
                    </div>
                  )}
                  <div
                    onMouseEnter={() => setHoveredId(m.id)}
                    onMouseLeave={() => { setHoveredId(null); if (emojiPickerId === m.id) setEmojiPickerId(null) }}
                    style={{ display: 'flex', padding: showHeader ? '8px 4px 4px' : '1px 4px', position: 'relative', gap: 8, background: isHovered ? `${C.text}06` : 'transparent', borderRadius: 6 }}
                  >
                    {showHeader ? (
                      <div style={{ width: 32, flexShrink: 0 }}>
                        <Avatar url={m.sender.avatarUrl} name={senderName} size={32} />
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
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{senderName}</span>
                          <span style={{ fontSize: 11, color: C.textMuted }}>{formatTime(m.createdAt)}</span>
                          {m.editedAt && <span style={{ fontSize: 10, color: C.textMuted, fontStyle: 'italic' }}>(edited)</span>}
                        </div>
                      )}
                      {isEditing ? (
                        <div style={{ marginTop: 2 }}>
                          <textarea
                            value={editingContent}
                            onChange={e => setEditingContent(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveEdit(m.id) }
                              if (e.key === 'Escape') { setEditingId(null); setEditingContent('') }
                            }}
                            autoFocus rows={3}
                            style={{ width: '100%', resize: 'vertical', padding: '6px 8px', fontSize: 13, color: C.text, background: C.bgInput, border: `1px solid ${C.accent}`, borderRadius: 6, outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
                          />
                          <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: 10, color: C.textMuted }}>
                            <span>Enter to save · Esc to cancel</span>
                          </div>
                        </div>
                      ) : m.content ? (
                        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                          {renderMessageContent(m.content)}
                        </div>
                      ) : null}
                      {grouped.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                          {grouped.map(r => (
                            <button key={r.emoji} onClick={() => toggleReaction(m.id, r.emoji)} title={r.users.join(', ')}
                              style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 12, border: `1px solid ${r.reacted ? C.accent : C.separator}`, background: r.reacted ? C.accentLight : C.bgInput, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                              <span>{r.emoji}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: r.reacted ? C.accent : C.textMuted }}>{r.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {(m.replyCount ?? 0) > 0 && (
                        <button onClick={() => void openThread(m)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, padding: '2px 8px', borderRadius: 12, border: `1px solid ${C.separator}`, background: C.bgInput, cursor: 'pointer', color: C.accent, fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                          <MessageCircle size={11} />
                          {m.replyCount} {m.replyCount === 1 ? 'reply' : 'replies'}
                        </button>
                      )}
                    </div>
                    {/* Hover toolbar */}
                    {isHovered && !isEditing && (
                      <div style={{ position: 'absolute', top: -14, right: 8, display: 'flex', gap: 0, background: C.bgInput, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.25)', border: `1px solid ${C.separator}`, padding: '1px 2px', zIndex: 10 }}>
                        <button onClick={() => setEmojiPickerId(emojiPickerId === m.id ? null : m.id)} title="React"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', color: C.textSecondary, borderRadius: 6, display: 'flex', fontFamily: 'inherit' }}>
                          <Smile size={14} />
                        </button>
                        <button onClick={() => void openThread(m)} title="Reply in thread"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', color: C.textSecondary, borderRadius: 6, display: 'flex', fontFamily: 'inherit' }}>
                          <CornerDownRight size={14} />
                        </button>
                        <button onClick={() => void togglePin(m.id)} title={m.isPinned ? 'Unpin' : 'Pin'}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', color: m.isPinned ? C.accent : C.textSecondary, borderRadius: 6, display: 'flex', fontFamily: 'inherit' }}>
                          <Pin size={14} fill={m.isPinned ? 'currentColor' : 'none'} />
                        </button>
                        <button onClick={() => copyLink(m.id)} title={copiedMsgId === m.id ? 'Copied!' : 'Copy link'}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', color: copiedMsgId === m.id ? C.success : C.textSecondary, borderRadius: 6, display: 'flex', fontFamily: 'inherit' }}>
                          {copiedMsgId === m.id ? <Check size={14} /> : <LinkIcon size={14} />}
                        </button>
                        {isMe && (Date.now() - new Date(m.createdAt).getTime()) < 12 * 60 * 60 * 1000 && (
                          <button onClick={() => { setEditingId(m.id); setEditingContent(m.content) }} title="Edit"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', color: C.textSecondary, borderRadius: 6, display: 'flex', fontFamily: 'inherit' }}>
                            <Edit2 size={14} />
                          </button>
                        )}
                        {isMe && (
                          <button onClick={() => deleteMsg(m.id)} title="Delete"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', color: C.danger, borderRadius: 6, display: 'flex', fontFamily: 'inherit' }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                    {emojiPickerId === m.id && (
                      <div style={{ position: 'absolute', top: -40, right: 8, display: 'flex', gap: 2, background: C.bgInput, borderRadius: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', border: `1px solid ${C.separator}`, padding: '4px 6px', zIndex: 20 }}>
                        {QUICK_EMOJIS.map(e => (
                          <button key={e} onClick={() => void toggleReaction(m.id, e)}
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
          <div ref={endRef} />
        </div>
        {!isNearBottom && !loading && messages.length > 0 && (
          <button
            onClick={() => {
              const el = scrollRef.current
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
            }}
            title="Jump to latest"
            style={{
              position: 'absolute', bottom: 16, right: 20,
              width: 36, height: 36, borderRadius: 18,
              background: C.accent, color: '#fff', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4)', zIndex: 5,
              fontFamily: 'inherit',
            }}>
            <ChevronDown size={18} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Composer */}
      <div style={{ borderTop: `1px solid ${C.separator}`, flexShrink: 0 }}>
        {/* Typing indicator. */}
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
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.textMuted, animation: 'bundy-typing-dot 1.2s infinite' }} />
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.textMuted, animation: 'bundy-typing-dot 1.2s infinite', animationDelay: '0.2s' }} />
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.textMuted, animation: 'bundy-typing-dot 1.2s infinite', animationDelay: '0.4s' }} />
              </span>
              <span>{label}</span>
              <style>{`@keyframes bundy-typing-dot { 0%, 60%, 100% { opacity: 0.3 } 30% { opacity: 1 } }`}</style>
            </div>
          )
        })()}
        <MessageInput
          placeholder="Message…"
          config={config}
          channelId={channelId}
          onTyping={sendTyping}
          input={input}
          setInput={setInput}
          sendFn={send}
          sending={sending}
          hideSchedule
        />
      </div>

      {/* Lightbox — v1.5.2207 added close + download buttons and inline
          support for video/audio so the drawer's discussion lightbox
          matches the DM lightbox UX. */}
      {lightbox && (() => {
        const url = lightbox.url
        const isVid = /\.(mp4|webm|ogg|mov|m4v|avi)(\?.*)?$/i.test(url.split('?')[0])
        const isAud = /\.(mp3|wav|m4a|aac|opus|flac)(\?.*)?$/i.test(url.split('?')[0])
                      || /^voice-note-/i.test(lightbox.filename)
        async function download() {
          try {
            const r = await fetch(url, { headers: { Authorization: `Bearer ${config.token}` } })
            const blob = await r.blob()
            const blobUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl; a.download = lightbox.filename
            document.body.appendChild(a); a.click(); a.remove()
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
          } catch (err) { console.error('[discussion] download failed:', err) }
        }
        return (
          <div onClick={() => setLightbox(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
            <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 1 }}>
              <button onClick={(e) => { e.stopPropagation(); void download() }}
                title="Download"
                style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}>
                <Download size={18} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); setLightbox(null) }}
                title="Close"
                style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}>
                <X size={20} />
              </button>
            </div>
            <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', cursor: 'default' }}>
              {isVid ? (
                <video controls autoPlay src={url}
                  style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 6, background: '#000' }} />
              ) : isAud ? (
                <audio controls autoPlay src={url} style={{ width: '60vw', maxWidth: 480 }} />
              ) : (
                <img src={url} alt={lightbox.filename}
                  style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 6, objectFit: 'contain' }} />
              )}
              <div style={{ textAlign: 'center', marginTop: 8, color: '#fff', fontSize: 13, opacity: 0.8 }}>
                {lightbox.filename}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
