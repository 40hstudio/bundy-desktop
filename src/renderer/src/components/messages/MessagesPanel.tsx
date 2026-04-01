import React, { useState, useEffect, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import {
  MessageSquare, Edit2, Search, Hash, Users, Plus, ChevronDown,
  Loader, Phone, Video, Pin, Settings2, MessageCircle, ChevronRight,
  Smile, CornerDownRight, Trash2, ChevronUp, Send, X,
  FolderOpen, Paperclip, ExternalLink, Download,
} from 'lucide-react'
import { C, neu } from '../../theme'
import type { ApiConfig, Auth, Conversation, ChatMessage, ThreadActivity, ChannelMember, UserInfo } from '../../types'
import { Avatar } from '../shared/Avatar'
import { NewConvModal } from './NewConvModal'
import { ChannelSettingsModal } from './ChannelSettingsModal'
import { ConvRow } from './ConvRow'
import { MessageInput } from './MessageInput'
import { OgPreview } from './OgPreview'
import { InlineAttachment, AuthImage } from './Attachments'
import { renderMessageContent, extractUrls, isImageUrl } from '../../utils/markdown'
import { formatTime, timeAgo } from '../../utils/format'
import CallWidget from '../calls/CallWidget'
import ConferenceWidget from '../calls/ConferenceWidget'
import type { IncomingCallPayload } from './IncomingCallOverlay'

const DEMO_MODE = false
const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🚀']

// ─── Demo data helpers (kept here so DEMO_MODE works) ─────────────────────────

const ogClientCache = new Map<string, { title: string | null; description: string | null; image: string | null; siteName: string | null } | null>()

function buildDemoChannels(): Conversation[] {
  return [
    { id: 'ch1', type: 'channel', name: '#general', members: [], unread: 3, lastTime: new Date(Date.now() - 300_000).toISOString() },
    { id: 'ch2', type: 'channel', name: '#engineering', members: [], unread: 0, lastTime: new Date(Date.now() - 900_000).toISOString() },
    { id: 'ch3', type: 'channel', name: '#design', members: [], unread: 1, lastTime: new Date(Date.now() - 1800_000).toISOString() },
    { id: 'ch6', type: 'channel', name: '#random', members: [], unread: 0, lastTime: new Date(Date.now() - 120_000).toISOString() },
    { id: 'ch4', type: 'dm', name: 'Sarah Chen', avatar: null, partnerId: 'u3', members: [{ userId: 'u3', user: { id: 'u3', username: 'sarah.chen', alias: 'Sarah Chen', avatarUrl: null, userStatus: 'online' } }], unread: 0, lastTime: new Date(Date.now() - 600_000).toISOString() },
    { id: 'ch7', type: 'dm', name: 'Mike Torres', avatar: null, partnerId: 'u4', members: [{ userId: 'u4', user: { id: 'u4', username: 'mike.t', alias: 'Mike Torres', avatarUrl: null, userStatus: 'online' } }], unread: 0, lastTime: new Date(Date.now() - 1200_000).toISOString() },
    { id: 'ch5', type: 'group', name: 'Marc, Robert Siemens', members: [{ userId: 'u4', user: { id: 'u4', username: 'mike.t', alias: 'Marc', avatarUrl: null } }, { userId: 'u5', user: { id: 'u5', username: 'alex.k', alias: 'Robert Siemens', avatarUrl: null } }], unread: 2, lastTime: new Date(Date.now() - 3600_000).toISOString() },
  ]
}

function buildDemoMessages(): ChatMessage[] {
  const _yesterday = Date.now() - 86400_000
  const _today = Date.now()
  return [
    { id: 'm1', content: 'Hey team 👋 Quick update on the Q4 roadmap.', createdAt: new Date(_yesterday + 3600_000 * 9).toISOString(), editedAt: null, sender: { id: 'u3', username: 'sarah.chen', alias: 'Sarah Chen', avatarUrl: null }, reactions: [{ emoji: '👍', userId: 'u4', user: { id: 'u4', username: 'mike.t', alias: 'Mike Torres' } }], replyCount: 3 },
    { id: 'm6', content: 'Good morning! Sprint review starts at 10 AM.', createdAt: new Date(_today - 3600_000 * 3).toISOString(), editedAt: null, sender: { id: 'u6', username: 'lisa.m', alias: 'Lisa Martinez', avatarUrl: null }, reactions: [] },
    { id: 'm9', content: 'Deployed v2.3.1 to production. All health checks passing ✅', createdAt: new Date(_today - 3600_000).toISOString(), editedAt: null, sender: { id: 'u5', username: 'alex.k', alias: 'Alex Kim', avatarUrl: null }, reactions: [{ emoji: '🚀', userId: 'u2', user: { id: 'u2', username: 'john.doe', alias: 'John' } }] },
  ]
}

// ─── MessagesPanel ────────────────────────────────────────────────────────────

export function MessagesPanel({
  config, auth, acceptedCall, iceBufferRef, answerSdpRef, isVisible,
}: {
  config: ApiConfig
  auth: Auth
  acceptedCall?: IncomingCallPayload | null
  iceBufferRef: React.MutableRefObject<RTCIceCandidateInit[]>
  answerSdpRef: React.MutableRefObject<string | null>
  isVisible: boolean
}) {
  const [channels, setChannels] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [mentionedChannels, setMentionedChannels] = useState<Set<string>>(new Set())
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [showNewConv, setShowNewConv] = useState<false | 'dm' | 'group' | 'channel'>(false)
  const [showSettings, setShowSettings] = useState(false)

  // Per-channel typing: Map<channelId, string[]>
  const [typingMap, setTypingMap] = useState<Record<string, string[]>>({})

  // Edit / delete state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{
    id: string; channelId: string; content: string; createdAt: string
    sender: { id: string; username: string; alias: string | null; avatarUrl: string | null }
    channel: { id: string; name: string | null; type: string }
  }>>([])
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const searchTimer = useRef<NodeJS.Timeout | null>(null)

  // Pagination
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Thread panel
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null)
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([])
  const [threadInput, setThreadInput] = useState('')
  const [sendingThread, setSendingThread] = useState(false)

  // Emoji picker
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState<string | null>(null)

  // Pinned messages panel
  const [showPinned, setShowPinned] = useState(false)
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([])

  // Collapsed sidebar sections
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [hoveredSection, setHoveredSection] = useState<string | null>(null)
  const toggleSection = (key: string) => setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }))

  // Threads view
  const [showThreadsView, setShowThreadsView] = useState(false)
  const [threadActivities, setThreadActivities] = useState<ThreadActivity[]>([])
  const pendingThreadRef = useRef<ChatMessage | null>(null)

  // Shared media directory
  const [showSharedMedia, setShowSharedMedia] = useState(false)
  const [sharedMediaTab, setSharedMediaTab] = useState<'links' | 'media' | 'files'>('media')
  const [sharedMedia, setSharedMedia] = useState<{ links: any[]; media: any[]; files: any[] }>({ links: [], media: [], files: [] })
  const [loadingSharedMedia, setLoadingSharedMedia] = useState(false)

  // Activity-based presence
  const lastSeenRef = useRef<Record<string, number>>({})
  const [lastSeenTick, setLastSeenTick] = useState(0)

  // Lightbox
  const [lightbox, setLightbox] = useState<{ url: string; filename: string } | null>(null)
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  // Active 1:1 call
  const [activeCall, setActiveCall] = useState<{
    targetUser: { id: string; name: string; avatar: string | null }
    callType: 'audio' | 'video'
    offerSdp?: string
  } | null>(null)

  // Conference state
  const [activeConferences, setActiveConferences] = useState<Record<string, Array<{ id: string; name: string; avatar: string | null }>>>({})
  const [myConference, setMyConference] = useState<{
    channelId: string; channelName: string
    participants: Array<{ id: string; name: string; avatar: string | null }>
  } | null>(null)

  // Users currently in 1:1 calls
  const [usersInCall, setUsersInCall] = useState<Set<string>>(new Set())

  const selectConv = (c: Conversation | null) => { if (c) setShowThreadsView(false); setSelected(c) }

  // When parent accepts an incoming call, open CallWidget in answer mode
  const acceptedCallRef = useRef<IncomingCallPayload | null | undefined>(null)
  useEffect(() => {
    if (acceptedCall && acceptedCall !== acceptedCallRef.current) {
      acceptedCallRef.current = acceptedCall
      setActiveCall({
        targetUser: { id: acceptedCall.from, name: acceptedCall.fromName, avatar: acceptedCall.fromAvatar },
        callType: acceptedCall.callType,
        offerSdp: acceptedCall.sdp,
      })
    }
  }, [acceptedCall])

  // Conference room events
  useEffect(() => {
    const onActiveConfs = (e: Event) => {
      const payload = (e as CustomEvent<Record<string, Array<{ id: string; name: string; avatar: string | null }>>>).detail
      setActiveConferences(payload)
    }
    const onConfJoined = (e: Event) => {
      const payload = (e as CustomEvent<{ channelId: string; userId: string; userName: string; avatar: string | null }>).detail
      setActiveConferences(prev => {
        const cur = prev[payload.channelId] ?? []
        if (cur.some(p => p.id === payload.userId)) return prev
        return { ...prev, [payload.channelId]: [...cur, { id: payload.userId, name: payload.userName, avatar: payload.avatar }] }
      })
    }
    const onConfLeft = (e: Event) => {
      const payload = (e as CustomEvent<{ channelId: string; userId: string }>).detail
      setActiveConferences(prev => {
        const cur = (prev[payload.channelId] ?? []).filter(p => p.id !== payload.userId)
        if (cur.length === 0) { const { [payload.channelId]: _, ...rest } = prev; return rest }
        return { ...prev, [payload.channelId]: cur }
      })
    }
    const onConfEnded = (e: Event) => {
      const payload = (e as CustomEvent<{ channelId: string }>).detail
      setActiveConferences(prev => { const { [payload.channelId]: _, ...rest } = prev; return rest })
      setMyConference(prev => prev?.channelId === payload.channelId ? null : prev)
    }
    const onConfInvite = (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; fromName: string; channelId: string; channelName: string }>).detail
      if (Notification.permission === 'granted') {
        new Notification(`📞 Call invite from ${payload.fromName}`, { body: `Join #${payload.channelName}` })
      }
    }
    const onCallActivity = (e: Event) => {
      const { userId, inCall } = (e as CustomEvent<{ userId: string; inCall: boolean }>).detail
      setUsersInCall(prev => {
        const next = new Set(prev)
        if (inCall) next.add(userId); else next.delete(userId)
        return next
      })
    }
    window.addEventListener('bundy-active-conferences', onActiveConfs)
    window.addEventListener('bundy-conference-joined', onConfJoined)
    window.addEventListener('bundy-conference-left', onConfLeft)
    window.addEventListener('bundy-conference-ended', onConfEnded)
    window.addEventListener('bundy-conference-invite', onConfInvite)
    window.addEventListener('bundy-call-activity', onCallActivity)
    return () => {
      window.removeEventListener('bundy-active-conferences', onActiveConfs)
      window.removeEventListener('bundy-conference-joined', onConfJoined)
      window.removeEventListener('bundy-conference-left', onConfLeft)
      window.removeEventListener('bundy-conference-ended', onConfEnded)
      window.removeEventListener('bundy-conference-invite', onConfInvite)
      window.removeEventListener('bundy-call-activity', onCallActivity)
    }
  }, [])

  // Presence tick
  useEffect(() => {
    const id = setInterval(() => setLastSeenTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const getPresence = useCallback((userId: string): 'active' | 'recent' | 'away' => {
    void lastSeenTick
    const ts = lastSeenRef.current[userId]
    if (!ts) return 'away'
    const ago = Date.now() - ts
    if (ago <= 5 * 60_000) return 'active'
    if (ago <= 30 * 60_000) return 'recent'
    return 'away'
  }, [lastSeenTick])

  const trackerStatusRef = useRef<Record<string, string>>({})
  const getTrackerStatus = useCallback((userId: string): string | null => {
    void lastSeenTick
    return trackerStatusRef.current[userId] ?? null
  }, [lastSeenTick])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const typingTimers = useRef<Record<string, NodeJS.Timeout>>({})

  const apiFetch = useCallback(async (path: string, opts?: RequestInit) => {
    const res = await fetch(`${config.apiBase}${path}`, {
      ...opts,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        ...(opts?.headers ?? {}),
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }, [config])

  const loadChannels = useCallback(async () => {
    try {
      const data = await apiFetch('/api/channels') as {
        channels: Array<{
          id: string; type: string; name: string | null; createdBy?: string
          members: Array<{ userId: string; user: UserInfo }>
          messages: Array<{ content: string; createdAt: string; sender: { username: string; alias: string | null } }>
          unread?: number
        }>
      }
      const convs: Conversation[] = data.channels.map(ch => {
        let name = ch.name ?? ''
        let avatar: string | null = null
        let partnerId: string | undefined
        const members = ch.members
        if (ch.type === 'dm') {
          const other = members.find(m => m.userId !== auth.userId)
          name = other?.user.alias ?? other?.user.username ?? 'DM'
          avatar = other?.user.avatarUrl ?? null
          partnerId = other?.userId
        } else if (ch.type === 'group') {
          name = ch.name ?? 'Group'
        } else {
          name = `#${ch.name ?? 'channel'}`
        }
        const last = ch.messages[0]
        return {
          id: ch.id, type: ch.type as Conversation['type'], name, avatar, partnerId,
          members, createdBy: ch.createdBy,
          lastMessage: last ? `${last.sender.alias ?? last.sender.username}: ${last.content}` : undefined,
          lastTime: last?.createdAt,
          unread: ch.unread ?? 0,
        }
      })
      setChannels(convs)
    } catch { /* offline */ }
  }, [apiFetch, auth.userId])

  // Broadcast unread count to FullDashboard for sidebar badge
  useEffect(() => {
    const total = channels.reduce((sum, c) => sum + (c.unread ?? 0), 0)
    const hasMention = channels.some(c => mentionedChannels.has(c.id) && (c.unread ?? 0) > 0)
    window.dispatchEvent(new CustomEvent('bundy-unread-update', { detail: { count: total, mention: hasMention } }))
    window.electronAPI?.setBadgeCount?.(total)
  }, [channels, mentionedChannels])

  const loadMessages = useCallback(async (conv: Conversation) => {
    setLoadingMsgs(true)
    try {
      const data = await apiFetch(`/api/channels/${conv.id}/messages?limit=50`) as {
        messages: Array<{
          id: string; content: string; createdAt: string; editedAt: string | null
          sender: { id: string; username: string; alias: string | null; avatarUrl: string | null }
          reads: { userId: string }[]
          reactions?: ChatMessage['reactions']
          parentMessageId?: string | null; replyCount?: number
          isPinned?: boolean; pinnedAt?: string | null; pinnedBy?: string | null
        }>
        hasMore?: boolean
      }
      setMessages(data.messages.map(m => ({
        id: m.id, content: m.content, createdAt: m.createdAt, editedAt: m.editedAt,
        sender: m.sender, reads: m.reads, reactions: m.reactions ?? [],
        parentMessageId: m.parentMessageId, replyCount: m.replyCount ?? 0,
        isPinned: m.isPinned ?? false, pinnedAt: m.pinnedAt, pinnedBy: m.pinnedBy,
      })))
      setHasMore(data.hasMore ?? false)
      setChannels(prev => prev.map(c => c.id === conv.id ? { ...c, unread: 0 } : c))
      setMentionedChannels(prev => { const next = new Set(prev); next.delete(conv.id); return next })
      fetch(`${config.apiBase}/api/channels/${conv.id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}` },
      }).catch(() => {})
    } catch { setMessages([]); setHasMore(false) } finally {
      setLoadingMsgs(false)
    }
  }, [apiFetch, config])

  // SSE for real-time messages + typing + read (with auto-reconnect)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const isVisibleRef = useRef(isVisible)
  isVisibleRef.current = isVisible

  useEffect(() => {
    if (DEMO_MODE) return
    let dead = false
    let ctrl = new AbortController()
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      if (dead) return
      ctrl = new AbortController()
      let buf = ''
      fetch(`${config.apiBase}/api/bundy/stream`, {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: ctrl.signal,
      }).then(async res => {
        if (!res.body) { scheduleReconnect(); return }
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop() ?? ''
          for (const part of parts) {
            const eventMatch = part.match(/^event: (.+)/m)
            const dataMatch = part.match(/^data: (.+)/m)
            if (!eventMatch || !dataMatch) continue
            const ev = eventMatch[1].trim()
            try {
              const payload = JSON.parse(dataMatch[1])
              if (payload.senderId && payload.senderId !== auth.userId) {
                lastSeenRef.current[payload.senderId] = Date.now()
              }
              if (ev === 'channel-message') {
                const channelId = payload.channelId as string
                const parentMsgId = payload.parentMessageId as string | null | undefined
                const isCurrentChannel = selectedRef.current?.id === channelId
                if (isCurrentChannel) {
                  if (parentMsgId) {
                    if (payload.senderId !== auth.userId) {
                      setMessages(prev => prev.map(m =>
                        m.id === parentMsgId ? { ...m, replyCount: (m.replyCount ?? 0) + 1 } : m
                      ))
                    }
                    setThreadMessages(prev => {
                      if (prev.some(m => m.id === payload.id)) return prev
                      return [...prev, {
                        id: payload.id, content: payload.content,
                        createdAt: payload.createdAt, editedAt: payload.editedAt ?? null,
                        parentMessageId: parentMsgId, replyCount: 0, reactions: [],
                        sender: { id: payload.senderId, username: payload.senderName, alias: payload.senderAlias ?? payload.senderName, avatarUrl: payload.senderAvatar ?? null },
                        reads: [],
                      }]
                    })
                    setThreadActivities(prev => prev.map(t =>
                      t.id === parentMsgId ? {
                        ...t, replyCount: t.replyCount + 1,
                        lastReply: { content: payload.content, sender: { alias: payload.senderAlias ?? null, username: payload.senderName, avatarUrl: payload.senderAvatar ?? null }, createdAt: payload.createdAt },
                        unread: false,
                      } : t
                    ))
                  } else {
                    setMessages(prev => {
                      if (prev.some(m => m.id === payload.id)) return prev
                      return [...prev, {
                        id: payload.id, content: payload.content,
                        createdAt: payload.createdAt, editedAt: payload.editedAt ?? null,
                        parentMessageId: null, replyCount: 0, reactions: [],
                        isPinned: false, pinnedAt: null, pinnedBy: null,
                        sender: { id: payload.senderId, username: payload.senderName, alias: payload.senderAlias ?? payload.senderName, avatarUrl: payload.senderAvatar ?? null },
                        reads: [],
                      }]
                    })
                  }
                  if (isVisibleRef.current) {
                    fetch(`${config.apiBase}/api/channels/${channelId}/read`, {
                      method: 'POST', headers: { Authorization: `Bearer ${config.token}` },
                    }).catch(() => {})
                  } else {
                    setChannels(prev => prev.map(c =>
                      c.id === channelId ? { ...c, unread: (c.unread ?? 0) + 1 } : c
                    ))
                  }
                  if (payload.senderId !== auth.userId) {
                    new Audio('sounds/new-message.mp3').play().catch(() => {})
                  }
                } else if (payload.senderId !== auth.userId) {
                  const isMention = !!payload.content && (
                    payload.content.toLowerCase().includes(`@${auth.username.toLowerCase()}`)
                  )
                  setChannels(prev => prev.map(c =>
                    c.id === channelId ? { ...c, unread: (c.unread ?? 0) + 1 } : c
                  ))
                  if (isMention) setMentionedChannels(prev => new Set([...prev, channelId]))
                  new Audio('sounds/mentioned-message.mp3').play().catch(() => {})
                  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    void new Notification(isMention ? '📣 You were mentioned' : 'New message', {
                      body: `${payload.senderAlias ?? payload.senderName}: ${payload.content}`,
                      silent: false,
                    })
                  } else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
                    Notification.requestPermission()
                  }
                }
                setChannels(prev => prev.map(c =>
                  c.id === channelId
                    ? { ...c, lastMessage: `${payload.senderAlias ?? payload.senderName}: ${payload.content}`, lastTime: payload.createdAt }
                    : c
                ))
                if (parentMsgId && payload.senderId !== auth.userId && !isCurrentChannel) {
                  setThreadActivities(prev => prev.map(t =>
                    t.id === parentMsgId ? {
                      ...t, replyCount: t.replyCount + 1,
                      lastReply: { content: payload.content, sender: { alias: payload.senderAlias ?? null, username: payload.senderName, avatarUrl: payload.senderAvatar ?? null }, createdAt: payload.createdAt },
                      unread: true,
                    } : t
                  ))
                }
              } else if (ev === 'channel-message-edit') {
                const updater = (prev: ChatMessage[]) => prev.map(m =>
                  m.id === payload.messageId ? { ...m, content: payload.content, editedAt: payload.editedAt } : m
                )
                setMessages(updater)
                setThreadMessages(updater)
              } else if (ev === 'channel-message-delete') {
                setMessages(prev => prev.filter(m => m.id !== payload.messageId))
                setThreadMessages(prev => prev.filter(m => m.id !== payload.messageId))
              } else if (ev === 'channel-typing') {
                const channelId = payload.channelId as string
                if (payload.userId !== auth.userId) {
                  lastSeenRef.current[payload.userId] = Date.now()
                  const userName = payload.userName as string
                  setTypingMap(prev => {
                    const cur = prev[channelId] ?? []
                    if (cur.includes(userName)) return prev
                    return { ...prev, [channelId]: [...cur, userName] }
                  })
                  const timerKey = `${channelId}:${userName}`
                  if (typingTimers.current[timerKey]) clearTimeout(typingTimers.current[timerKey])
                  typingTimers.current[timerKey] = setTimeout(() => {
                    setTypingMap(prev => {
                      const cur = (prev[channelId] ?? []).filter(n => n !== userName)
                      if (cur.length === 0) { const { [channelId]: _, ...rest } = prev; return rest }
                      return { ...prev, [channelId]: cur }
                    })
                  }, 3000)
                }
              } else if (ev === 'channel-read') {
                if (payload.userId !== auth.userId) lastSeenRef.current[payload.userId] = Date.now()
                setMessages(prev => prev.map(m =>
                  payload.messageIds?.includes(m.id)
                    ? { ...m, reads: [...(m.reads ?? []), { userId: payload.userId }] }
                    : m
                ))
                if (payload.userId === auth.userId) {
                  setChannels(prev => prev.map(c =>
                    c.id === payload.channelId ? { ...c, unread: 0 } : c
                  ))
                }
              } else if (ev === 'channel-created') {
                loadChannels()
              } else if (ev === 'channel-deleted') {
                const { channelId } = payload as { channelId: string }
                setChannels(prev => prev.filter(c => c.id !== channelId))
                setSelected(prev => prev?.id === channelId ? null : prev)
              } else if (ev === 'channel-reaction') {
                const { messageId, userId, emoji, action } = payload as { messageId: string; userId: string; emoji: string; action: 'add' | 'remove'; userName: string }
                if (userId === auth.userId) continue
                lastSeenRef.current[userId] = Date.now()
                const updateReaction = (prev: ChatMessage[]) => prev.map(m => {
                  if (m.id !== messageId) return m
                  const reactions = [...(m.reactions ?? [])]
                  if (action === 'add') {
                    if (!reactions.some(r => r.emoji === emoji && r.userId === userId)) {
                      reactions.push({ emoji, userId, user: { id: userId, username: payload.userName, alias: null } })
                    }
                  } else {
                    const idx = reactions.findIndex(r => r.emoji === emoji && r.userId === userId)
                    if (idx >= 0) reactions.splice(idx, 1)
                  }
                  return { ...m, reactions }
                })
                setMessages(updateReaction)
                setThreadMessages(updateReaction)
              } else if (ev === 'channel-pin') {
                const { messageId, isPinned, pinnedBy } = payload as { messageId: string; isPinned: boolean; pinnedBy: string }
                setMessages(prev => prev.map(m =>
                  m.id === messageId ? { ...m, isPinned, pinnedBy: isPinned ? pinnedBy : null, pinnedAt: isPinned ? new Date().toISOString() : null } : m
                ))
              } else if (ev === 'user-status') {
                const { userId, userStatus } = payload as { userId: string; userStatus: string | null }
                if (userStatus) trackerStatusRef.current[userId] = userStatus
                else delete trackerStatusRef.current[userId]
                setLastSeenTick(t => t + 1)
                setChannels(prev => prev.map(c => ({
                  ...c,
                  members: c.members.map(m =>
                    m.userId === userId ? { ...m, user: { ...m.user, userStatus } } : m
                  ),
                })))
              } else if (ev === 'call-invite') {
                window.dispatchEvent(new CustomEvent('bundy-incoming-call', { detail: payload }))
              } else if (ev === 'call-answer') {
                window.dispatchEvent(new CustomEvent('bundy-call-answer', { detail: payload }))
              } else if (ev === 'call-ice') {
                window.dispatchEvent(new CustomEvent('bundy-call-ice', { detail: payload }))
              } else if (ev === 'call-end') {
                window.dispatchEvent(new CustomEvent('bundy-call-end', { detail: payload }))
              } else if (ev === 'call-reoffer') {
                window.dispatchEvent(new CustomEvent('bundy-call-reoffer', { detail: payload }))
              } else if (ev === 'call-reanswer') {
                window.dispatchEvent(new CustomEvent('bundy-call-reanswer', { detail: payload }))
              } else if (ev === 'conference-joined') {
                window.dispatchEvent(new CustomEvent('bundy-conference-joined', { detail: payload }))
              } else if (ev === 'conference-left') {
                window.dispatchEvent(new CustomEvent('bundy-conference-left', { detail: payload }))
              } else if (ev === 'conference-ended') {
                window.dispatchEvent(new CustomEvent('bundy-conference-ended', { detail: payload }))
              } else if (ev === 'conference-offer') {
                window.dispatchEvent(new CustomEvent('bundy-conference-offer', { detail: payload }))
              } else if (ev === 'conference-answer') {
                window.dispatchEvent(new CustomEvent('bundy-conference-answer', { detail: payload }))
              } else if (ev === 'conference-ice') {
                window.dispatchEvent(new CustomEvent('bundy-conference-ice', { detail: payload }))
              } else if (ev === 'conference-mute') {
                window.dispatchEvent(new CustomEvent('bundy-conference-mute', { detail: payload }))
              } else if (ev === 'conference-invite') {
                window.dispatchEvent(new CustomEvent('bundy-conference-invite', { detail: payload }))
              } else if (ev === 'call-reaction') {
                window.dispatchEvent(new CustomEvent('bundy-call-reaction', { detail: payload }))
              } else if (ev === 'conference-reaction') {
                window.dispatchEvent(new CustomEvent('bundy-conference-reaction', { detail: payload }))
              } else if (ev === 'active-conferences') {
                window.dispatchEvent(new CustomEvent('bundy-active-conferences', { detail: payload }))
              } else if (ev === 'call-activity') {
                window.dispatchEvent(new CustomEvent('bundy-call-activity', { detail: payload }))
              }
            } catch { /* ignore parse errors */ }
          }
        }
        scheduleReconnect()
      }).catch(() => { scheduleReconnect() })
    }

    function scheduleReconnect() {
      if (dead) return
      reconnectTimer = setTimeout(connect, 3000)
    }

    connect()
    return () => {
      dead = true
      ctrl.abort()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [config, auth.userId, loadChannels]) // eslint-disable-line react-hooks/exhaustive-deps

  // Request notification permission once
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Missed call → system message in DM
  useEffect(() => {
    function onMissedCall(e: Event) {
      const { userId, userName, callType, reason } = (e as CustomEvent<{ userId: string; userName: string; callType: string; reason: string }>).detail
      const dmConv = channels.find(c => c.type === 'dm' && c.partnerId === userId)
      if (!dmConv) return
      const label = reason === 'declined' ? 'Declined Call' : 'Missed Call'
      const icon = callType === 'video' ? '📹' : '📞'
      const systemMsg: ChatMessage = {
        id: `missed-${Date.now()}`,
        content: `${icon} **${label}** — ${callType === 'video' ? 'Video' : 'Audio'} call with ${userName}`,
        createdAt: new Date().toISOString(), editedAt: null,
        sender: { id: 'system', username: 'System', alias: 'System', avatarUrl: null },
        reads: [], reactions: [], parentMessageId: null, replyCount: 0,
        isPinned: false, pinnedAt: null, pinnedBy: null,
      }
      if (selected?.id === dmConv.id) {
        setMessages(prev => [...prev, systemMsg])
      }
    }
    window.addEventListener('bundy-missed-call', onMissedCall)
    return () => window.removeEventListener('bundy-missed-call', onMissedCall)
  }, [channels, selected])

  // Initial load
  useEffect(() => {
    if (DEMO_MODE) {
      const demoChannels = buildDemoChannels()
      setChannels(demoChannels)
      setSelected(demoChannels[0])
      setMessages(buildDemoMessages())
      ogClientCache.set('https://github.com/electron/electron', {
        title: 'electron/electron: Build cross-platform desktop apps with JavaScript, HTML, and CSS',
        description: 'Build cross-platform desktop apps with JavaScript, HTML, and CSS.',
        image: 'https://opengraph.githubassets.com/1/electron/electron',
        siteName: 'GitHub',
      })
      return
    }
    loadChannels()
  }, [loadChannels])

  // Thread activities (loaded when threads view opens)
  useEffect(() => {
    if (!showThreadsView || DEMO_MODE) return
    apiFetch('/api/threads').then((data: any) => {
      setThreadActivities(data.threads ?? [])
    }).catch(() => {})
  }, [showThreadsView, apiFetch])

  // Periodic refresh of user profile info + tracker status
  useEffect(() => {
    if (DEMO_MODE) return
    function refreshUserInfo() {
      apiFetch('/api/users').then((data: { users: any[] }) => {
        const userMap: Record<string, any> = {}
        for (const u of (data.users ?? [])) userMap[u.id] = u
        setChannels(prev => prev.map(c => ({
          ...c,
          members: c.members.map(m => {
            const u = userMap[m.userId]
            if (!u) return m
            return { ...m, user: { ...m.user, alias: u.alias ?? m.user.alias, avatarUrl: u.avatarUrl ?? m.user.avatarUrl } }
          }),
        })))
      }).catch(() => {})
    }
    function refreshTrackerStatus() {
      apiFetch('/api/users/status').then((data: { statuses?: Record<string, string> }) => {
        if (data.statuses) { trackerStatusRef.current = data.statuses; setLastSeenTick(t => t + 1) }
      }).catch(() => {})
    }
    refreshUserInfo(); refreshTrackerStatus()
    const id = setInterval(refreshUserInfo, 30_000)
    const trackerId = setInterval(refreshTrackerStatus, 30_000)
    return () => { clearInterval(id); clearInterval(trackerId) }
  }, [apiFetch])

  // Handle self-leave from ChannelSettingsModal
  useEffect(() => {
    const onLeft = (e: Event) => {
      const { channelId } = (e as CustomEvent<{ channelId: string }>).detail
      setChannels(prev => prev.filter(c => c.id !== channelId))
      setSelected(prev => prev?.id === channelId ? null : prev)
    }
    window.addEventListener('bundy-channel-left', onLeft)
    return () => window.removeEventListener('bundy-channel-left', onLeft)
  }, [])

  const justSwitchedRef = useRef(false)
  useEffect(() => {
    if (!selected) return
    justSwitchedRef.current = true
    if (!DEMO_MODE) loadMessages(selected)
    setThreadParent(null); setThreadMessages([]); setShowPinned(false); setEmojiPickerMsgId(null)
    if (pendingThreadRef.current) {
      const pending = pendingThreadRef.current
      pendingThreadRef.current = null
      openThread(pending)
    }
  }, [selected, loadMessages]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleCreated(id: string) {
    loadChannels().then(() => {
      setChannels(prev => {
        const ch = prev.find(c => c.id === id)
        if (ch) setSelected(ch)
        return prev
      })
    })
  }

  // Mark active channel as read when user switches back to messages tab
  useEffect(() => {
    if (!isVisible || !selected || DEMO_MODE) return
    setChannels(prev => prev.map(c => c.id === selected.id ? { ...c, unread: 0 } : c))
    setMentionedChannels(prev => { const next = new Set(prev); next.delete(selected.id); return next })
    fetch(`${config.apiBase}/api/channels/${selected.id}/read`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.token}` },
    }).catch(() => {})
  }, [isVisible]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll on new message
  useEffect(() => {
    if (justSwitchedRef.current) {
      justSwitchedRef.current = false
      requestAnimationFrame(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }) })
    } else {
      const el = messagesScrollRef.current
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }, [messages])

  const typingTimerRef = useRef<NodeJS.Timeout | null>(null)
  function sendTyping() {
    if (!selected) return
    if (typingTimerRef.current) return
    typingTimerRef.current = setTimeout(() => { typingTimerRef.current = null }, 2000)
    fetch(`${config.apiBase}/api/channels/${selected.id}/typing`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    }).catch(() => {})
  }

  async function send() {
    if (!input.trim() || !selected || sending) return
    const content = input.trim()
    setSending(true); setInput('')
    try {
      await apiFetch(`/api/channels/${selected.id}/messages`, { method: 'POST', body: JSON.stringify({ content }) })
      await loadMessages(selected)
      setChannels(prev => prev.map(c =>
        c.id === selected.id
          ? { ...c, lastMessage: `${auth.username}: ${content}`, lastTime: new Date().toISOString() }
          : c
      ))
    } catch { /* offline */ } finally { setSending(false) }
  }

  async function handleEditMessage() {
    if (!editingMsgId || !editingContent.trim() || !selected) return
    try {
      await apiFetch(`/api/channels/${selected.id}/messages/${editingMsgId}`, {
        method: 'PATCH', body: JSON.stringify({ content: editingContent.trim() }),
      })
      setMessages(prev => prev.map(m =>
        m.id === editingMsgId ? { ...m, content: editingContent.trim(), editedAt: new Date().toISOString() } : m
      ))
    } catch (err) { console.error('[Messages] edit failed:', err) }
    setEditingMsgId(null); setEditingContent('')
  }

  async function handleDeleteMessage(msgId: string) {
    if (!selected) return
    try {
      await apiFetch(`/api/channels/${selected.id}/messages/${msgId}`, { method: 'DELETE' })
      setMessages(prev => prev.filter(m => m.id !== msgId))
    } catch (err) { console.error('[Messages] delete failed:', err) }
  }

  function handleSearchInput(q: string) {
    setSearchQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!q.trim() || q.trim().length < 2) { setSearchResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await apiFetch(`/api/channels/search?${new URLSearchParams({ q: q.trim() })}`)
        setSearchResults(data.messages ?? [])
      } catch { setSearchResults([]) }
      setSearching(false)
    }, 400)
  }

  function handleSearchResultClick(result: typeof searchResults[0]) {
    const ch = channels.find(c => c.id === result.channelId)
    if (ch) setSelected(ch)
    setShowSearch(false); setSearchQuery(''); setSearchResults([])
  }

  async function loadOlderMessages() {
    if (!selected || loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)
    const container = messagesScrollRef.current
    const prevScrollHeight = container?.scrollHeight ?? 0
    const prevScrollTop = container?.scrollTop ?? 0
    try {
      const oldest = messages[0]
      const data = await apiFetch(`/api/channels/${selected.id}/messages?before=${oldest.id}&limit=50`)
      const older: ChatMessage[] = (data.messages ?? []).map((m: any) => ({
        ...m, reactions: m.reactions ?? [], replyCount: m.replyCount ?? 0, isPinned: m.isPinned ?? false,
      }))
      flushSync(() => { setMessages(prev => [...older, ...prev]); setHasMore(data.hasMore ?? false) })
      if (container) container.scrollTop = prevScrollTop + (container.scrollHeight - prevScrollHeight)
    } catch { /* offline */ } finally { setLoadingMore(false) }
  }

  async function toggleReaction(msgId: string, emoji: string, isThread = false) {
    if (!selected) return
    try {
      const res = await apiFetch(`/api/channels/${selected.id}/messages/${msgId}/reactions`, {
        method: 'POST', body: JSON.stringify({ emoji }),
      })
      const action = res.action as 'added' | 'removed'
      const updateFn = (prev: ChatMessage[]) => prev.map(m => {
        if (m.id !== msgId) return m
        const reactions = [...(m.reactions ?? [])]
        if (action === 'added') {
          reactions.push({ emoji, userId: auth.userId, user: { id: auth.userId, username: auth.username, alias: null } })
        } else {
          const idx = reactions.findIndex(r => r.emoji === emoji && r.userId === auth.userId)
          if (idx >= 0) reactions.splice(idx, 1)
        }
        return { ...m, reactions }
      })
      if (isThread) setThreadMessages(updateFn); else setMessages(updateFn)
    } catch { /* offline */ }
    setEmojiPickerMsgId(null)
  }

  async function togglePin(msgId: string) {
    if (!selected) return
    try {
      const res = await apiFetch(`/api/channels/${selected.id}/messages/${msgId}/pin`, { method: 'POST' })
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, isPinned: res.isPinned, pinnedAt: res.pinnedAt, pinnedBy: res.pinnedBy } : m
      ))
    } catch { /* offline */ }
  }

  async function loadPinnedMessages() {
    if (!selected) return
    try {
      const data = await apiFetch(`/api/channels/${selected.id}/pins`)
      setPinnedMessages(data.messages ?? [])
    } catch { setPinnedMessages([]) }
  }

  async function loadSharedMedia() {
    if (!selected) return
    setLoadingSharedMedia(true)
    try {
      const data = await apiFetch(`/api/channels/${selected.id}/shared-media`) as { links: any[]; media: any[]; files: any[] }
      setSharedMedia(data)
    } catch { setSharedMedia({ links: [], media: [], files: [] }) }
    finally { setLoadingSharedMedia(false) }
  }

  async function openThread(msg: ChatMessage) {
    setThreadParent(msg); setThreadInput('')
    try {
      const data = await apiFetch(`/api/channels/${selected!.id}/messages?parentMessageId=${msg.id}`)
      setThreadMessages((data.messages ?? []).map((m: ChatMessage) => ({ ...m, reactions: m.reactions ?? [], replyCount: m.replyCount ?? 0 })))
    } catch { setThreadMessages([]) }
  }

  async function sendThreadReply() {
    if (!threadInput.trim() || !selected || !threadParent || sendingThread) return
    const content = threadInput.trim()
    setSendingThread(true); setThreadInput('')
    try {
      await apiFetch(`/api/channels/${selected.id}/messages`, {
        method: 'POST', body: JSON.stringify({ content, parentMessageId: threadParent.id }),
      })
      const data = await apiFetch(`/api/channels/${selected.id}/messages?parentMessageId=${threadParent.id}`)
      setThreadMessages((data.messages ?? []).map((m: ChatMessage) => ({ ...m, reactions: m.reactions ?? [], replyCount: m.replyCount ?? 0 })))
      setMessages(prev => prev.map(m => m.id === threadParent.id ? { ...m, replyCount: (m.replyCount ?? 0) + 1 } : m))
    } catch { /* offline */ } finally { setSendingThread(false) }
  }

  function groupReactions(reactions: NonNullable<ChatMessage['reactions']>) {
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

  const sortUnreadFirst = (a: Conversation, b: Conversation) => (b.unread ?? 0) - (a.unread ?? 0)
  const channelList = channels.filter(c => c.type === 'channel').sort(sortUnreadFirst)
  const groupList = channels.filter(c => c.type === 'group').sort(sortUnreadFirst)
  const dmList = channels.filter(c => c.type === 'dm').sort(sortUnreadFirst)
  const selectedTyping = selected ? (typingMap[selected.id] ?? []) : []

  // ─── Conference join helper ─────────────────────────────────────────────────
  async function joinConference(channelId: string, channelName: string) {
    try {
      const res = await fetch(`${config.apiBase}/api/calls`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
        body: JSON.stringify({ action: 'conference-join', channelId }),
      })
      const data = await res.json()
      if (!data.ok) return
      setMyConference({ channelId, channelName, participants: data.participants ?? [] })
    } catch {}
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {showNewConv && (
        <NewConvModal
          config={config} auth={auth}
          initialMode={showNewConv || 'dm'}
          onClose={() => setShowNewConv(false)}
          onCreated={handleCreated}
        />
      )}
      {showSettings && selected && (
        <ChannelSettingsModal
          config={config} auth={auth}
          conv={selected}
          onClose={() => setShowSettings(false)}
        />
      )}
      {activeCall && (
        <CallWidget
          config={config} auth={auth}
          targetUser={activeCall.targetUser}
          callType={activeCall.callType}
          offerSdp={activeCall.offerSdp}
          bufferedIce={iceBufferRef.current.splice(0)}
          onEnd={() => { iceBufferRef.current = []; answerSdpRef.current = null; setActiveCall(null) }}
        />
      )}
      {myConference && (
        <ConferenceWidget
          config={config} auth={auth}
          channelId={myConference.channelId}
          channelName={myConference.channelName}
          initialParticipants={myConference.participants}
          onLeave={() => setMyConference(null)}
        />
      )}

      {/* ─── Conversations sidebar ──────────────────────────────────────────── */}
      <div style={{
        width: 240, borderRight: `1px solid ${C.separator}`,
        background: 'rgba(22, 22, 22, 0.5)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, borderBottom: `1px solid ${C.separator}` }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: C.sidebarTextActive }}>Messages</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => { setShowSearch(!showSearch); if (showSearch) { setSearchQuery(''); setSearchResults([]) } }} title="Search messages"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: showSearch ? C.accent : C.sidebarText, padding: 4, borderRadius: 4 }}>
              <Search size={16} />
            </button>
            <button onClick={() => setShowNewConv('dm')} title="New Conversation"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sidebarText, padding: 4, borderRadius: 4 }}>
              <Edit2 size={16} />
            </button>
          </div>
        </div>
        {showSearch && (
          <div style={{ padding: '8px 12px 8px', flexShrink: 0 }}>
            <input
              value={searchQuery}
              onChange={e => handleSearchInput(e.target.value)}
              placeholder="Search messages…"
              autoFocus
              style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: `1px solid ${C.separator}`, borderRadius: 8, outline: 'none', background: C.bgInput, color: C.text }}
            />
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {showSearch && searchQuery.trim().length >= 2 ? (
            <div style={{ padding: '4px 0' }}>
              {searching && (
                <div style={{ padding: '12px 16px', color: C.textMuted, fontSize: 12, textAlign: 'center' }}>
                  <Loader size={14} /> Searching…
                </div>
              )}
              {!searching && searchResults.length === 0 && (
                <div style={{ padding: '12px 16px', color: C.textMuted, fontSize: 12, textAlign: 'center' }}>No results</div>
              )}
              {searchResults.map(r => (
                <button key={r.id} onClick={() => handleSearchResultClick(r)}
                  style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 16px', border: 'none', textAlign: 'left', background: 'transparent', cursor: 'pointer', borderBottom: `1px solid ${C.separator}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.accent }}>
                      {r.channel.type === 'channel' ? `#${r.channel.name}` : r.channel.name}
                    </span>
                    <span style={{ fontSize: 10, color: C.textMuted }}>{formatTime(r.createdAt)}</span>
                  </div>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{r.sender.alias ?? r.sender.username}</span>
                  <span style={{ fontSize: 12, color: C.text, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.content}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              {/* Threads button */}
              <button
                onClick={() => { setShowThreadsView(!showThreadsView); if (!showThreadsView) setSelected(null) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 16px', border: 'none', textAlign: 'left', cursor: 'pointer',
                  background: showThreadsView ? 'linear-gradient(90deg, rgba(0,0,255,0.22) 0%, rgba(0,0,255,0.12) 50%, rgba(0,0,255,0.08) 100%)' : 'transparent',
                  boxShadow: showThreadsView ? 'inset 0 0 0 1px rgba(0,0,255,0.16)' : 'none',
                  color: showThreadsView ? C.sidebarTextActive : C.sidebarText,
                  fontSize: 14, fontWeight: showThreadsView ? 600 : 500, borderRadius: 0, transition: 'all 0.15s ease',
                }}
              >
                <MessageCircle size={16} />
                <span style={{ flex: 1 }}>Threads</span>
                {threadActivities.filter(t => t.unread).length > 0 && (
                  <span style={{ minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px', background: C.danger, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {threadActivities.filter(t => t.unread).length}
                  </span>
                )}
              </button>

              {channelList.length > 0 && (
                <>
                  <div
                    onMouseEnter={() => setHoveredSection('channels')}
                    onMouseLeave={() => setHoveredSection(null)}
                    style={{ padding: '12px 16px 4px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  >
                    <ChevronDown size={12} color={C.sidebarText} style={{ transition: 'transform 0.15s ease', transform: collapsedSections.channels ? 'rotate(-90deg)' : 'rotate(0deg)' }} onClick={() => toggleSection('channels')} />
                    <span onClick={() => toggleSection('channels')} style={{ fontSize: 14, fontWeight: 600, color: C.sidebarText, flex: 1 }}>Channels</span>
                    <button onClick={e => { e.stopPropagation(); setShowNewConv('channel') }} title="Create channel"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sidebarText, padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', opacity: hoveredSection === 'channels' ? 1 : 0, transition: 'opacity 0.15s ease' }}>
                      <Plus size={14} />
                    </button>
                  </div>
                  {!collapsedSections.channels && channelList.map(c => (
                    <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} auth={auth} typingUsers={typingMap[c.id] ?? []} hasActiveCall={!!activeConferences[c.id]} isMentioned={mentionedChannels.has(c.id)} onClick={() => selectConv(c)} onClose={selected?.id === c.id ? () => selectConv(null) : undefined} />
                  ))}
                </>
              )}

              {groupList.length > 0 && (
                <>
                  <div
                    onMouseEnter={() => setHoveredSection('groups')}
                    onMouseLeave={() => setHoveredSection(null)}
                    style={{ padding: '12px 16px 4px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  >
                    <ChevronDown size={12} color={C.sidebarText} style={{ transition: 'transform 0.15s ease', transform: collapsedSections.groups ? 'rotate(-90deg)' : 'rotate(0deg)' }} onClick={() => toggleSection('groups')} />
                    <span onClick={() => toggleSection('groups')} style={{ fontSize: 14, fontWeight: 600, color: C.sidebarText, flex: 1 }}>Groups</span>
                    <button onClick={e => { e.stopPropagation(); setShowNewConv('group') }} title="Create group"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sidebarText, padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', opacity: hoveredSection === 'groups' ? 1 : 0, transition: 'opacity 0.15s ease' }}>
                      <Plus size={14} />
                    </button>
                  </div>
                  {!collapsedSections.groups && groupList.map(c => (
                    <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} auth={auth} typingUsers={typingMap[c.id] ?? []} hasActiveCall={!!activeConferences[c.id]} isMentioned={mentionedChannels.has(c.id)} onClick={() => selectConv(c)} onClose={selected?.id === c.id ? () => selectConv(null) : undefined} />
                  ))}
                </>
              )}

              {dmList.length > 0 && (
                <>
                  <div
                    onMouseEnter={() => setHoveredSection('dms')}
                    onMouseLeave={() => setHoveredSection(null)}
                    style={{ padding: '12px 16px 4px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  >
                    <ChevronDown size={12} color={C.sidebarText} style={{ transition: 'transform 0.15s ease', transform: collapsedSections.dms ? 'rotate(-90deg)' : 'rotate(0deg)' }} onClick={() => toggleSection('dms')} />
                    <span onClick={() => toggleSection('dms')} style={{ fontSize: 14, fontWeight: 600, color: C.sidebarText, flex: 1 }}>Direct messages</span>
                    <button onClick={e => { e.stopPropagation(); setShowNewConv('dm') }} title="New message"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sidebarText, padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', opacity: hoveredSection === 'dms' ? 1 : 0, transition: 'opacity 0.15s ease' }}>
                      <Plus size={14} />
                    </button>
                  </div>
                  {!collapsedSections.dms && dmList.map(c => {
                    const partnerId = c.partnerId
                    const partnerInCall = !!(partnerId && (usersInCall.has(partnerId) || Object.values(activeConferences).some(ps => ps.some(p => p.id === partnerId))))
                    return (
                      <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} auth={auth} typingUsers={typingMap[c.id] ?? []} hasActiveCall={partnerInCall} isMentioned={mentionedChannels.has(c.id)} onClick={() => selectConv(c)} onClose={selected?.id === c.id ? () => selectConv(null) : undefined} getPresence={getPresence} getTrackerStatus={getTrackerStatus} />
                    )
                  })}
                </>
              )}

              {channels.length === 0 && (
                <div style={{ padding: '20px 16px', color: C.textMuted, fontSize: 12, textAlign: 'center' }}>
                  No conversations yet.<br />
                  <button onClick={() => setShowNewConv('dm')} style={{ marginTop: 8, background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>+ Start one</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Threads View ───────────────────────────────────────────────────── */}
      {showThreadsView ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', background: C.contentBg }}>
          <div style={{ borderBottom: `1px solid ${C.separator}`, background: C.lgBg, flexShrink: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <MessageCircle size={18} color={C.text} />
            <span style={{ fontWeight: 700, fontSize: 15, color: C.text, flex: 1 }}>Threads</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {threadActivities.map((thread, i) => {
              const senderName = thread.parentMessage.sender.alias ?? thread.parentMessage.sender.username
              const replierName = thread.lastReply.sender.alias ?? thread.lastReply.sender.username
              return (
                <div key={thread.id}>
                  <button
                    onClick={() => {
                      setShowThreadsView(false)
                      const ch = channels.find(c => c.id === thread.channelId)
                        ?? channels.find(c => c.name === thread.channelName || `#${c.name?.replace('#', '')}` === thread.channelName)
                      if (!ch) return
                      const mockMsg: ChatMessage = {
                        id: thread.id, content: thread.parentMessage.content, createdAt: '', editedAt: null,
                        sender: { id: '', username: thread.parentMessage.sender.username, alias: thread.parentMessage.sender.alias, avatarUrl: thread.parentMessage.sender.avatarUrl },
                        reactions: [], replyCount: thread.replyCount, reads: [],
                      }
                      if (selected?.id === ch.id) { openThread(mockMsg) }
                      else { pendingThreadRef.current = mockMsg; setSelected(ch) }
                    }}
                    style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 20px', border: 'none', textAlign: 'left', background: 'transparent', cursor: 'pointer', transition: 'background 0.1s ease' }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.sidebarHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {thread.channelType === 'channel' ? <Hash size={12} color={C.textMuted} /> : thread.channelType === 'group' ? <Users size={12} color={C.textMuted} /> : null}
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>{thread.channelName}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <Avatar url={thread.parentMessage.sender.avatarUrl} name={senderName} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{senderName}</div>
                        <div style={{ fontSize: 13, color: C.text, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{thread.parentMessage.content}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 38 }}>
                      <Avatar url={thread.lastReply.sender.avatarUrl} name={replierName} size={18} />
                      <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>{thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}</span>
                      <span style={{ fontSize: 11, color: C.textMuted }}>{timeAgo(thread.lastReply.createdAt)}</span>
                      {thread.unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingLeft: 38, marginTop: -2 }}>
                      <span style={{ fontSize: 12, color: C.textMuted }}>
                        <span style={{ fontWeight: 600, color: C.sidebarText }}>{replierName}:</span>{' '}
                        {thread.lastReply.content}
                      </span>
                    </div>
                  </button>
                  {i < threadActivities.length - 1 && <div style={{ height: 1, background: C.separator, margin: '0 20px' }} />}
                </div>
              )
            })}
            {threadActivities.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
                <MessageCircle size={32} strokeWidth={1} style={{ marginBottom: 8, opacity: 0.5 }} /><br />
                No threads yet. Reply to a message to start a thread.
              </div>
            )}
          </div>
        </div>

      ) : selected ? (
        /* ─── Channel / DM view ────────────────────────────────────────────── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', background: C.contentBg }}>
          {/* Header */}
          <div style={{ borderBottom: `1px solid ${C.separator}`, background: C.lgBg, flexShrink: 0 }}>
            <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                {selected.type === 'dm' ? (() => {
                  const dotColor = (() => {
                    const p = selected.partnerId ? getPresence(selected.partnerId) : 'away'
                    return p === 'active' ? C.success : p === 'recent' ? C.warning : C.textMuted
                  })()
                  return (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar url={selected.avatar} name={selected.name} size={28} />
                      <div style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: dotColor, border: `2px solid ${C.lgBg}` }} />
                    </div>
                  )
                })() : selected.type === 'channel' ? (
                  <Hash size={18} color={C.textMuted} />
                ) : (
                  <Users size={18} color={C.textMuted} />
                )}
                <span style={{ fontWeight: 700, fontSize: 15, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selected.name}
                </span>
                {selected.type === 'dm' && selected.partnerId && (() => {
                  const ts = getTrackerStatus(selected.partnerId)
                  const label = ts === 'CHECK_IN' || ts === 'BACK' ? 'In' : ts === 'BREAK' ? 'Break' : ts === 'CLOCK_OUT' ? 'Out' : null
                  const color = ts === 'CHECK_IN' || ts === 'BACK' ? C.success : ts === 'BREAK' ? C.warning : ts === 'CLOCK_OUT' ? C.textMuted : null
                  return label ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: color!, padding: '1px 6px', borderRadius: 3, background: `${color!}20`, flexShrink: 0, lineHeight: '16px', letterSpacing: 0.3 }}>{label}</span>
                  ) : null
                })()}
                {selected.type !== 'dm' && selected.members.length > 0 && (
                  <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{selected.members.length} members</span>
                )}
              </div>

              {/* Action icons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                {selected.type === 'dm' && selected.partnerId && (() => {
                  const partner = selected.members.find(m => m.userId === selected.partnerId)
                  const targetUser = { id: selected.partnerId, name: partner?.user.alias ?? partner?.user.username ?? selected.name, avatar: selected.avatar ?? null }
                  return (
                    <>
                      <button onClick={() => setActiveCall({ targetUser, callType: 'audio' })} title="Audio call"
                        style={{ width: 32, height: 32, borderRadius: 6, background: 'none', border: `1px solid ${C.separator}`, cursor: 'pointer', color: C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = C.textMuted }}>
                        <Phone size={15} />
                      </button>
                      <button onClick={() => setActiveCall({ targetUser, callType: 'video' })} title="Video call"
                        style={{ width: 32, height: 32, borderRadius: 6, background: 'none', border: `1px solid ${C.separator}`, cursor: 'pointer', color: C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = C.textMuted }}>
                        <Video size={15} />
                      </button>
                    </>
                  )
                })()}

                {selected.type !== 'dm' && (() => {
                  const conf = activeConferences[selected.id]
                  const inThisConf = myConference?.channelId === selected.id
                  if (inThisConf) return null
                  if (conf && conf.length > 0) {
                    return (
                      <button onClick={() => joinConference(selected.id, selected.name)} title={`Join call (${conf.length})`}
                        style={{ background: C.success, border: 'none', cursor: 'pointer', color: '#fff', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={13} /> Join ({conf.length})
                      </button>
                    )
                  }
                  return (
                    <button onClick={() => joinConference(selected.id, selected.name)} title="Start call"
                      style={{ width: 32, height: 32, borderRadius: 6, background: 'none', border: `1px solid ${C.separator}`, cursor: 'pointer', color: C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = C.textMuted }}>
                      <Phone size={15} />
                    </button>
                  )
                })()}

                <button onClick={() => { setShowPinned(!showPinned); if (!showPinned) loadPinnedMessages() }} title="Pinned messages"
                  style={{ width: 32, height: 32, borderRadius: 6, background: 'none', border: `1px solid ${C.separator}`, cursor: 'pointer', color: showPinned ? C.accent : C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Pin size={15} />
                </button>
                <button onClick={() => { setShowSearch(!showSearch); if (showSearch) { setSearchQuery(''); setSearchResults([]) } }} title="Search messages"
                  style={{ width: 32, height: 32, borderRadius: 6, background: 'none', border: `1px solid ${C.separator}`, cursor: 'pointer', color: showSearch ? C.accent : C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Search size={15} />
                </button>
                {selected.type !== 'dm' && (
                  <button onClick={() => setShowSettings(true)} title="Channel settings"
                    style={{ width: 32, height: 32, borderRadius: 6, background: 'none', border: `1px solid ${C.separator}`, cursor: 'pointer', color: C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Settings2 size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 0, padding: '0 16px' }}>
              {[
                { id: 'messages' as const, label: 'Messages', icon: <MessageSquare size={14} /> },
                { id: 'pinned' as const, label: 'Pins', icon: <Pin size={14} /> },
                { id: 'files' as const, label: 'Files', icon: <FolderOpen size={14} /> },
              ].map(t => {
                const isActive = t.id === 'messages' ? (!showPinned && !showSharedMedia) : t.id === 'pinned' ? showPinned : showSharedMedia
                return (
                  <button key={t.id}
                    onClick={() => {
                      if (t.id === 'messages') { setShowPinned(false); setShowSharedMedia(false) }
                      else if (t.id === 'pinned') { setShowPinned(!showPinned); setShowSharedMedia(false); if (!showPinned) loadPinnedMessages() }
                      else { setShowSharedMedia(!showSharedMedia); setShowPinned(false); if (!showSharedMedia) loadSharedMedia() }
                    }}
                    style={{ padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? C.text : C.textMuted, borderBottom: `2px solid ${isActive ? C.accent : 'transparent'}`, marginBottom: -1 }}>
                    {t.icon}{t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Call in progress banner */}
          {selected.type !== 'dm' && activeConferences[selected.id] && myConference?.channelId !== selected.id && (() => {
            const conf = activeConferences[selected.id]
            return (
              <div style={{ padding: '8px 16px', background: 'linear-gradient(90deg, #43B58122, #43B58111)', borderBottom: `1px solid ${C.separator}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <Phone size={14} color="#43B581" />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#43B581' }}>Call in progress</span>
                  <span style={{ fontSize: 12, color: C.textMuted }}>·</span>
                  <div style={{ display: 'flex', gap: -4 }}>{conf.slice(0, 5).map(p => <Avatar key={p.id} url={p.avatar} name={p.name} size={20} />)}</div>
                  <span style={{ fontSize: 12, color: C.textMuted }}>{conf.length} participant{conf.length !== 1 ? 's' : ''}</span>
                </div>
                <button onClick={() => joinConference(selected.id, selected.name)}
                  style={{ background: '#43B581', border: 'none', cursor: 'pointer', color: '#fff', padding: '4px 14px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                  Join
                </button>
              </div>
            )
          })()}

          {/* Messages area */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
            <div ref={messagesScrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              {hasMore && (
                <button onClick={loadOlderMessages} disabled={loadingMore}
                  style={{ alignSelf: 'center', padding: '6px 16px', borderRadius: 20, border: `1px solid ${C.separator}`, background: C.lgBg, color: C.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {loadingMore ? <Loader size={12} /> : <ChevronUp size={12} />}
                  {loadingMore ? 'Loading…' : 'Load older messages'}
                </button>
              )}
              {loadingMsgs && messages.length === 0 && (
                <div style={{ textAlign: 'center', color: C.textMuted, padding: 20 }}><Loader size={18} /></div>
              )}

              {messages.map((msg, i) => {
                const isMe = msg.sender.id === auth.userId
                const prevMsg = messages[i - 1]
                const timeDiff = prevMsg ? new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() : Infinity
                const showHeader = !prevMsg || prevMsg.sender.id !== msg.sender.id || timeDiff > 5 * 60 * 1000
                const senderName = msg.sender.alias ?? msg.sender.username
                const isAttachment = /^\[📎\s[^\]]+?\]\(https?:\/\/\S+?\)\s*$/.test(msg.content)
                const plainUrls = isAttachment ? [] : extractUrls(msg.content).filter(u => !isImageUrl(u))
                const isEditing = editingMsgId === msg.id
                const isHovered = hoveredMsgId === msg.id
                const grouped = groupReactions(msg.reactions ?? [])
                const msgDate = new Date(msg.createdAt)
                const prevDate = prevMsg ? new Date(prevMsg.createdAt) : null
                const showDateSep = !prevDate || msgDate.toDateString() !== prevDate.toDateString()
                const todayDate = new Date()
                const yesterdayDate = new Date(todayDate); yesterdayDate.setDate(yesterdayDate.getDate() - 1)
                let dateLabel = msgDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                if (msgDate.toDateString() === todayDate.toDateString()) dateLabel = 'Today'
                else if (msgDate.toDateString() === yesterdayDate.toDateString()) dateLabel = 'Yesterday'

                return (
                  <div key={msg.id}>
                    {showDateSep && (
                      <div style={{ display: 'flex', alignItems: 'center', padding: '16px 16px 8px', gap: 12 }}>
                        <div style={{ flex: 1, height: 1, background: C.separator }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.textSecondary, whiteSpace: 'nowrap', padding: '2px 12px', border: `1px solid ${C.separator}`, borderRadius: 12, background: C.lgBg }}>{dateLabel}</span>
                        <div style={{ flex: 1, height: 1, background: C.separator }} />
                      </div>
                    )}
                    {msg.isPinned && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 56, marginBottom: 2 }}>
                        <Pin size={10} color={C.accent} />
                        <span style={{ fontSize: 10, color: C.accent, fontWeight: 600 }}>Pinned</span>
                      </div>
                    )}
                    <div
                      onMouseEnter={() => setHoveredMsgId(msg.id)}
                      onMouseLeave={() => { setHoveredMsgId(null); if (emojiPickerMsgId === msg.id) setEmojiPickerMsgId(null) }}
                      style={{
                        display: 'flex', padding: showHeader ? '8px 20px 4px' : '1px 20px',
                        position: 'relative', gap: 8,
                        background: isHovered ? `${C.text}0a` : 'transparent',
                        borderTop: isHovered ? `1px solid ${C.text}08` : '1px solid transparent',
                        borderBottom: isHovered ? `1px solid ${C.text}08` : '1px solid transparent',
                        marginTop: showHeader ? 0 : -1,
                      }}
                    >
                      {showHeader ? (
                        <div style={{ width: 36, flexShrink: 0 }}>
                          <Avatar url={msg.sender.avatarUrl} name={senderName} size={36} />
                        </div>
                      ) : (
                        <div style={{ width: 36, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                          {isHovered && (
                            <span style={{ fontSize: 10, color: C.textMuted, lineHeight: '20px', whiteSpace: 'nowrap' }}>
                              {msgDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </span>
                          )}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {showHeader && (
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{senderName}</span>
                            <span style={{ fontSize: 11, color: C.textMuted }}>
                              {msgDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </span>
                            {msg.editedAt && <span style={{ fontSize: 10, color: C.textMuted }}>(edited)</span>}
                          </div>
                        )}
                        {isEditing ? (
                          <div style={{ padding: '6px 10px', borderRadius: 4, background: C.bgInput, border: `2px solid ${C.accent}` }}>
                            <textarea
                              value={editingContent}
                              onChange={e => setEditingContent(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditMessage() }
                                if (e.key === 'Escape') { setEditingMsgId(null); setEditingContent('') }
                              }}
                              autoFocus
                              style={{ width: '100%', minHeight: 36, fontSize: 14, color: C.text, background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
                            />
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                              <button onClick={() => { setEditingMsgId(null); setEditingContent('') }}
                                style={{ fontSize: 11, color: C.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                              <button onClick={handleEditMessage}
                                style={{ fontSize: 11, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                            </div>
                          </div>
                        ) : isAttachment ? (
                          <InlineAttachment content={msg.content} isMe={isMe} config={config} onImageClick={(url, fn) => setLightbox({ url, filename: fn })} />
                        ) : (
                          <div style={{ fontSize: 14, color: C.text, lineHeight: 1.46, wordBreak: 'break-word', overflowWrap: 'break-word', userSelect: 'text', WebkitUserSelect: 'text' }}>
                            {renderMessageContent(msg.content, false)}
                          </div>
                        )}
                        {!isEditing && !showHeader && msg.editedAt && (
                          <span style={{ fontSize: 10, color: C.textMuted }}>(edited)</span>
                        )}
                        {plainUrls.map((url, ui) => <OgPreview key={ui} url={url} config={config} />)}
                        {grouped.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {grouped.map(r => (
                              <button key={r.emoji} onClick={() => toggleReaction(msg.id, r.emoji)} title={r.users.join(', ')}
                                style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 12, border: `1px solid ${r.reacted ? C.accent : C.separator}`, background: r.reacted ? C.accentLight : C.bgInput, cursor: 'pointer', fontSize: 12 }}>
                                <span>{r.emoji}</span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: r.reacted ? C.accent : C.textMuted }}>{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {(msg.replyCount ?? 0) > 0 && (
                          <button onClick={() => openThread(msg)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, background: 'transparent', border: '1px solid transparent', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, width: '100%', transition: 'background 0.15s, border-color 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = C.bgInput; e.currentTarget.style.borderColor = C.separator }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}>
                            <div style={{ width: 20, height: 20, borderRadius: 4, background: C.accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <MessageCircle size={11} color={C.accent} />
                            </div>
                            <span style={{ color: C.accent, fontSize: 12, fontWeight: 700 }}>{msg.replyCount} {msg.replyCount === 1 ? 'reply' : 'replies'}</span>
                            <span style={{ color: C.textMuted, fontSize: 11 }}>View thread</span>
                            <ChevronRight size={14} color={C.textMuted} style={{ marginLeft: 'auto' }} />
                          </button>
                        )}
                      </div>

                      {/* Hover toolbar */}
                      {isHovered && !isEditing && (
                        <div style={{ position: 'absolute', top: -16, right: 24, display: 'flex', gap: 0, background: C.bgInput, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.25)', border: `1px solid ${C.separator}`, padding: '1px 2px', zIndex: 10 }}>
                          {[{
                            icon: <Smile size={16} />, title: 'React',
                            onClick: () => setEmojiPickerMsgId(emojiPickerMsgId === msg.id ? null : msg.id), color: C.textSecondary,
                          }, {
                            icon: <MessageCircle size={16} />, title: 'Reply in thread',
                            onClick: () => openThread(msg), color: C.textSecondary,
                          }, {
                            icon: <CornerDownRight size={16} />, title: 'Forward',
                            onClick: () => {}, color: C.textSecondary,
                          }, {
                            icon: <Pin size={16} />, title: msg.isPinned ? 'Unpin' : 'Pin',
                            onClick: () => togglePin(msg.id), color: msg.isPinned ? C.accent : C.textSecondary,
                          }, ...(isMe ? [{
                            icon: <Edit2 size={16} />, title: 'Edit',
                            onClick: () => { setEditingMsgId(msg.id); setEditingContent(msg.content) },
                            color: C.textSecondary,
                            show: (Date.now() - new Date(msg.createdAt).getTime()) < 12 * 60 * 60 * 1000,
                          }, {
                            icon: <Trash2 size={16} />, title: 'Delete',
                            onClick: () => handleDeleteMessage(msg.id), color: C.danger, show: true,
                          }] : [])].filter((b: any) => b.show !== false).map((btn: any, bi) => (
                            <button key={bi} onClick={btn.onClick} title={btn.title}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${C.text}12` }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '5px 7px', color: btn.color, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.1s' }}>
                              {btn.icon}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Emoji picker popup */}
                      {emojiPickerMsgId === msg.id && (
                        <div style={{ position: 'absolute', top: -44, right: 24, display: 'flex', gap: 2, background: C.bgInput, borderRadius: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', border: `1px solid ${C.separator}`, padding: '4px 6px', zIndex: 20 }}>
                          {QUICK_EMOJIS.map(e => (
                            <button key={e} onClick={() => toggleReaction(msg.id, e)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '2px 4px', borderRadius: 6 }}>
                              {e}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {selectedTyping.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', paddingLeft: 8 }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: C.textMuted, display: 'inline-block', animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: C.textMuted }}>
                    {selectedTyping.join(', ')} {selectedTyping.length === 1 ? 'is' : 'are'} typing…
                  </span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Thread side panel */}
            {threadParent && (
              <div style={{ width: 320, borderLeft: `1px solid ${C.separator}`, background: C.lgBg, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.separator}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Thread</span>
                  <button onClick={() => { setThreadParent(null); setThreadMessages([]) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2 }}>
                    <X size={14} />
                  </button>
                </div>
                <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.separator}`, background: C.bgInput }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Avatar url={threadParent.sender.avatarUrl} name={threadParent.sender.alias ?? threadParent.sender.username} size={20} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>{threadParent.sender.alias ?? threadParent.sender.username}</span>
                    <span style={{ fontSize: 10, color: C.textMuted }}>{formatTime(threadParent.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                    {renderMessageContent(threadParent.content)}
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {threadMessages.length === 0 && (
                    <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 12, padding: 16 }}>No replies yet</div>
                  )}
                  {threadMessages.map(reply => {
                    const rName = reply.sender.alias ?? reply.sender.username
                    const rIsMe = reply.sender.id === auth.userId
                    const rGrouped = groupReactions(reply.reactions ?? [])
                    return (
                      <div key={reply.id}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <Avatar url={reply.sender.avatarUrl} name={rName} size={18} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: rIsMe ? C.accent : C.text }}>{rName}</span>
                          <span style={{ fontSize: 10, color: C.textMuted }}>{formatTime(reply.createdAt)}</span>
                        </div>
                        <div style={{ paddingLeft: 24, fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                          {renderMessageContent(reply.content)}
                        </div>
                        {rGrouped.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3, paddingLeft: 24 }}>
                            {rGrouped.map(r => (
                              <button key={r.emoji} onClick={() => toggleReaction(reply.id, r.emoji, true)} title={r.users.join(', ')}
                                style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '1px 5px', borderRadius: 8, border: `1px solid ${r.reacted ? C.accent : C.separator}`, background: r.reacted ? C.accentLight : C.bgInput, cursor: 'pointer', fontSize: 11 }}>
                                <span>{r.emoji}</span>
                                <span style={{ fontSize: 9, fontWeight: 600, color: r.reacted ? C.accent : C.textMuted }}>{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.separator}`, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea
                    value={threadInput}
                    onChange={e => setThreadInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendThreadReply() } }}
                    placeholder="Reply…"
                    rows={1}
                    style={{ flex: 1, resize: 'none', padding: '8px 10px', fontSize: 12, border: `1px solid ${C.separator}`, borderRadius: 8, outline: 'none', color: C.text, background: C.bgInput, minHeight: 32, maxHeight: 80, fontFamily: 'inherit' }}
                  />
                  <button onClick={sendThreadReply} disabled={!threadInput.trim() || sendingThread}
                    style={{ padding: '8px 10px', borderRadius: 8, border: 'none', background: threadInput.trim() ? C.accent : C.lgBg, color: threadInput.trim() ? '#fff' : C.textMuted, cursor: threadInput.trim() ? 'pointer' : 'default', flexShrink: 0 }}>
                    {sendingThread ? <Loader size={14} /> : <Send size={14} />}
                  </button>
                </div>
              </div>
            )}

            {/* Pinned messages side panel */}
            {showPinned && (
              <div style={{ width: 300, borderLeft: `1px solid ${C.separator}`, background: C.lgBg, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.separator}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Pin size={14} /> Pinned Messages
                  </span>
                  <button onClick={() => setShowPinned(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2 }}>
                    <X size={14} />
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
                  {pinnedMessages.length === 0 && (
                    <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 12, padding: 16 }}>No pinned messages</div>
                  )}
                  {pinnedMessages.map(pm => (
                    <div key={pm.id} style={{ padding: '10px 12px', borderRadius: 8, background: C.bgInput, border: `1px solid ${C.separator}`, marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Avatar url={pm.sender.avatarUrl} name={pm.sender.alias ?? pm.sender.username} size={18} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.accent }}>{pm.sender.alias ?? pm.sender.username}</span>
                        <span style={{ fontSize: 10, color: C.textMuted }}>{formatTime(pm.createdAt)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>{renderMessageContent(pm.content)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Shared media directory panel */}
            {showSharedMedia && (
              <div style={{ width: 300, borderLeft: `1px solid ${C.separator}`, background: C.lgBg, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.separator}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FolderOpen size={14} /> Shared Files
                  </span>
                  <button onClick={() => setShowSharedMedia(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2 }}>
                    <X size={14} />
                  </button>
                </div>
                <div style={{ display: 'flex', borderBottom: `1px solid ${C.separator}`, flexShrink: 0 }}>
                  {(['media', 'files', 'links'] as const).map(tab => (
                    <button key={tab} onClick={() => setSharedMediaTab(tab)}
                      style={{ flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer', background: sharedMediaTab === tab ? C.accent + '15' : 'transparent', color: sharedMediaTab === tab ? C.accent : C.textMuted, fontWeight: sharedMediaTab === tab ? 700 : 400, fontSize: 12, borderBottom: sharedMediaTab === tab ? `2px solid ${C.accent}` : '2px solid transparent' }}>
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
                  {loadingSharedMedia ? (
                    <div style={{ textAlign: 'center', padding: 20, color: C.textMuted }}><Loader size={16} /></div>
                  ) : sharedMediaTab === 'media' ? (
                    sharedMedia.media.length === 0 ? (
                      <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 12, padding: 16 }}>No shared media</div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                        {sharedMedia.media.map((m: any, i: number) => {
                          const fullUrl = `${config.apiBase}${m.url}`
                          return (
                            <div key={i} onClick={() => window.electronAPI.openExternal(fullUrl)} style={{ borderRadius: 6, overflow: 'hidden', aspectRatio: '1', background: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}>
                              {m.url.match(/\.(mp4|webm|mov)$/i) ? (
                                <video src={fullUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <AuthImage src={fullUrl} config={config} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  ) : sharedMediaTab === 'files' ? (
                    sharedMedia.files.length === 0 ? (
                      <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 12, padding: 16 }}>No shared files</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {sharedMedia.files.map((f: any, i: number) => (
                          <a key={i} href={`${config.apiBase}${f.url}`} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.separator}`, textDecoration: 'none' }}>
                            <Paperclip size={14} color={C.textMuted} />
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ fontSize: 12, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename.replace(/^\d+-/, '')}</div>
                              <div style={{ fontSize: 10, color: C.textMuted }}>{f.sender} · {new Date(f.createdAt).toLocaleDateString()}</div>
                            </div>
                          </a>
                        ))}
                      </div>
                    )
                  ) : (
                    sharedMedia.links.length === 0 ? (
                      <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 12, padding: 16 }}>No shared links</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {sharedMedia.links.map((l: any, i: number) => (
                          <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.separator}`, textDecoration: 'none' }}>
                            <ExternalLink size={14} color={C.accent} />
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ fontSize: 12, color: C.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url.replace(/^https?:\/\//, '').slice(0, 50)}</div>
                              <div style={{ fontSize: 10, color: C.textMuted }}>{l.sender} · {new Date(l.createdAt).toLocaleDateString()}</div>
                            </div>
                          </a>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Message input */}
          <MessageInput
            placeholder={`Message ${selected.name}…`}
            config={config}
            channelId={selected.id}
            onTyping={sendTyping}
            input={input}
            setInput={setInput}
            sendFn={send}
            sending={sending}
          />
        </div>

      ) : (
        /* ─── Empty state ──────────────────────────────────────────────────── */
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, flexDirection: 'column', gap: 12 }}>
          <MessageSquare size={40} strokeWidth={1} />
          <div style={{ fontSize: 14 }}>Select a conversation</div>
          <button onClick={() => setShowNewConv('dm')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', ...neu(), border: 'none', cursor: 'pointer', color: C.accent, fontWeight: 600, fontSize: 13 }}>
            <Edit2 size={15} /> New Conversation
          </button>
        </div>
      )}

      {/* ─── Lightbox overlay ──────────────────────────────────────────────── */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={20} color="#fff" />
          </button>
          <button
            onClick={e => {
              e.stopPropagation()
              fetch(lightbox.url, { headers: { Authorization: `Bearer ${config.token}` } })
                .then(r => r.blob())
                .then(blob => {
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = lightbox.filename
                  a.click()
                  setTimeout(() => URL.revokeObjectURL(a.href), 30_000)
                }).catch(() => {})
            }}
            style={{ position: 'absolute', top: 16, right: 64, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <Download size={18} color="#fff" />
          </button>
          <div style={{ position: 'absolute', top: 20, left: 20, color: '#fff', fontSize: 14, fontWeight: 600, opacity: 0.8, maxWidth: 'calc(100% - 140px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lightbox.filename}
          </div>
          <div onClick={e => e.stopPropagation()} style={{ cursor: 'default', maxWidth: '90vw', maxHeight: '85vh' }}>
            {config ? (
              <AuthImage src={lightbox.url} config={config} alt={lightbox.filename} style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 4 }} />
            ) : (
              <img src={lightbox.url} alt={lightbox.filename} style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 4 }} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
