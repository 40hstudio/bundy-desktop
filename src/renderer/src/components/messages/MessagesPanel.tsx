import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { flushSync, createPortal } from 'react-dom'
import {
  MessageSquare, Edit2, Search, Hash, Users, Plus, ChevronDown,
  Loader, Phone, Video, Pin, Settings2, MessageCircle, ChevronLeft, ChevronRight,
  Smile, CornerDownRight, Trash2, ChevronUp, Send, X,
  FolderOpen, Paperclip, ExternalLink, Download, Check, CheckCheck,
  Clock, Calendar, Volume2, MicOff, PhoneOff, Monitor, Mic, Headphones, HeadphoneOff, Eye, Quote,
  FileText, Link as LinkIcon,
} from 'lucide-react'
import { C, neu } from '../../theme'
import type { ApiConfig, Auth, Conversation, ChatMessage, ThreadActivity, UserInfo } from '../../types'
import { Avatar } from '../shared/Avatar'
import { NewConvModal } from './NewConvModal'
import { ChannelSettingsModal } from './ChannelSettingsModal'
import { ConvRow } from './ConvRow'
import { MessageInput } from './MessageInput'
import { OgPreview } from './OgPreview'
import { InlineAttachment, AuthImage } from './Attachments'
import { EmojiPicker } from './EmojiPicker'
import { PinnedView } from './PinnedView'
import { SharedMediaView } from './SharedMediaView'
import { ThreadView } from './ThreadView'
import { TaskDiscussionChannel } from './TaskDiscussionChannel'
import { renderMessageContent, extractUrls, isImageUrl, REPORT_LINK_RE, TASK_LINK_RE, FEEDBACK_LINK_RE, MESSAGE_LINK_RE } from '../../utils/markdown'
import { formatTime, timeAgo } from '../../utils/format'
import { ReportLinkCard } from './ReportLinkCard'
import { TaskLinkCard } from './TaskLinkCard'
import { FeedbackLinkCard } from './FeedbackLinkCard'
import { MessageLinkCard } from './MessageLinkCard'
import { useNotificationsStore } from '../../stores'
import { debugRecord } from '../../stores/debugStore'
import { useConferenceLockStore, readConferenceLock } from '../../stores/conferenceLockStore'
import { useLightboxClaim } from '../../utils/lightboxClaim'
import { apiFetch as sharedApiFetch } from '../../api/client'
import { QueuedWriteError } from '../../api/writeQueue'
import { playSound } from '../../utils/sounds'
import CallWidget from '../calls/CallWidget'
import VoiceChannelView from '../calls/VoiceChannelView'
import type { IncomingCallPayload } from './IncomingCallOverlay'
import { LightboxOverlay } from './LightboxOverlay'
import { ThreadItem } from './ThreadItem'
import { MessageRow } from './MessageRow'
import { useMessagesSearch } from './useMessagesSearch'
import { FloatingCallBar } from './FloatingCallBar'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🚀']

const ogClientCache = new Map<string, { title: string | null; description: string | null; image: string | null; siteName: string | null } | null>()

// Hoisted out of the messages.map() body — these were rebuilt once per
// message per render, which at 100 messages × 4 regexes is 400 needless
// allocations per re-render. They're stateless, so module scope is fine.
const REPORT_URL_RE_MSG = /\/report\/[a-z0-9]+\/[a-z0-9]+/i
const TASK_URL_RE_MSG = /\/tasks\/[a-z0-9]+$/i
const FEEDBACK_URL_RE_MSG = /\/report\/feedback\/[a-z0-9]+/i
const MESSAGE_URL_RE_MSG = /\/messages\/[a-z0-9]+\/[a-z0-9]+/i

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
  // ── API helper (defined first; hooks below depend on it) ────────────────
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

  const [channels, setChannels] = useState<Conversation[]>([])
  const channelsRef = useRef<Conversation[]>([])
  channelsRef.current = channels

  // Standalone VC fetch helper — defined early so it can be used by any useEffect
  const fetchVoiceChannels = useCallback(async () => {
    try {
      const res = await fetch(`${config.apiBase}/api/voice-channels`, {
        headers: { 'Authorization': `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      })
      if (!res.ok) return
      const data = await res.json() as { voiceChannels: VoiceChannelInfo[] }
      setVoiceChannels(data.voiceChannels)
    } catch {}
  }, [config.apiBase, config.token])

  // Build username → alias map from all channel members for mention display
  const usersMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const ch of channels) {
      for (const m of ch.members) {
        if (m.user?.alias) map[m.user.username] = m.user.alias
      }
    }
    return map
  }, [channels])

  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const showToast = useNotificationsStore((s) => s.show)

  const [mentionedChannels, setMentionedChannels] = useState<Set<string>>(new Set())
  const [input, setInputState] = useState('')
  // Mirror of `input` so the draft-persistence effect can read the value
  // SYNCHRONOUSLY when `selected.id` changes (state updates haven't flushed
  // to the new render yet at that point).
  const inputRef = useRef<string>('')
  // Wrap setInput so the ref stays current. Stable identity (deps: []) so
  // the draft-persistence useEffect below doesn't need to depend on it.
  const setInput = useCallback((v: string | ((prev: string) => string)) => {
    setInputState((prev) => {
      const next = typeof v === 'function' ? v(prev) : v
      inputRef.current = next
      return next
    })
  }, [])

  // P2.15 (DMs batch) — tag the activity heartbeat with the focused channel
  // so the daily rollup can populate `messagingSeconds`. Mirrors how
  // setCurrentTask / setCurrentReportDocument work.
  useEffect(() => {
    window.electronAPI.setCurrentChannel(selected?.id ?? null)
    return () => { window.electronAPI.setCurrentChannel(null) }
  }, [selected?.id])

  // P3.20 — per-channel draft persistence. When the user switches channels
  // mid-compose, we stash the unsent text in localStorage. Restored when
  // the same channel is reopened. Cleared on send (parent clears `input`
  // to '' after a successful POST → empty string overwrites the draft).
  const prevSelectedIdRef = useRef<string | null>(null)
  useEffect(() => {
    const prevId = prevSelectedIdRef.current
    if (prevId) {
      try {
        const draft = inputRef.current
        if (draft && draft.trim()) {
          window.localStorage.setItem(`bundy.msg.draft.${prevId}`, draft)
        } else {
          window.localStorage.removeItem(`bundy.msg.draft.${prevId}`)
        }
      } catch { /* ignore */ }
    }
    const newId = selected?.id ?? null
    if (newId) {
      try { setInput(window.localStorage.getItem(`bundy.msg.draft.${newId}`) ?? '') }
      catch { setInput('') }
    } else {
      setInput('')
    }
    prevSelectedIdRef.current = newId
    // setInput is stable (useCallback deps: []) so excluding it is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])
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

  // Sidebar global search + in-conversation search both follow the same
  // debounced-fetch shape — extracted into useMessagesSearch.
  const sidebarSearch = useMessagesSearch(apiFetch, (q) => `/api/channels/search?${new URLSearchParams({ q })}`)
  const {
    query: searchQuery,
    results: searchResults,
    searching,
    show: showSearch, setShow: setShowSearch,
    handleInput: handleSearchInput,
    reset: resetSidebarSearch,
  } = sidebarSearch
  // In-conversation search: scopes to currently-selected channel; skips
  // fetch when nothing is selected.
  const convSearch = useMessagesSearch(apiFetch, (q) => {
    if (!selected) return null
    return `/api/channels/search?${new URLSearchParams({ q, channelId: selected.id })}`
  })
  const {
    query: convSearchQuery,
    results: convSearchResults,
    searching: convSearching,
    show: showConvSearch, setShow: setShowConvSearch,
    handleInput: handleConvSearchInput,
    reset: resetConvSearch,
  } = convSearch

  // Pagination
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Thread panel
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null)
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([])
  // P3-#13 v2 — when a search hit is a thread reply, ThreadView scrolls to + highlights it.
  const [threadFocusReplyId, setThreadFocusReplyId] = useState<string | null>(null)
  const [threadInput, setThreadInput] = useState('')
  const [sendingThread, setSendingThread] = useState(false)

  // Emoji picker
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState<string | null>(null)
  const [fullEmojiPickerMsgId, setFullEmojiPickerMsgId] = useState<string | null>(null)

  // Pinned messages panel
  const [showPinned, setShowPinned] = useState(false)
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([])

  // Collapsed sidebar sections
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [hoveredSection, setHoveredSection] = useState<string | null>(null)
  const toggleSection = (key: string) => setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }))

  // Projects section: tasks the user is on that have at least one comment.
  // Clicking a row opens the task drawer at its discussion tab — same UX
  // as opening it from the Tasks panel. Acts as a "central inbox" for all
  // task discussions alongside DMs / channels / groups.
  const [projectTasks, setProjectTasks] = useState<Array<{
    id: string; title: string; commentCount: number; updatedAt: string
    project?: { id: string; name: string; color: string | null } | null
  }>>([])
  // Selected task discussion — when set, the main pane renders the
  // TaskDiscussionChannel mirror instead of a regular conversation.
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  // In-memory unread count per task discussion. Increments when a
  // comment SSE arrives for a task the user isn't currently viewing,
  // clears when the user opens the row. Persisted to localStorage so
  // badges survive app restart.
  const [unreadByTask, setUnreadByTask] = useState<Record<string, number>>(() => {
    try {
      const raw = window.localStorage.getItem('bundy.discussion.unread')
      return raw ? JSON.parse(raw) as Record<string, number> : {}
    } catch { return {} }
  })
  useEffect(() => {
    try { window.localStorage.setItem('bundy.discussion.unread', JSON.stringify(unreadByTask)) } catch { /* quota exceeded */ }
  }, [unreadByTask])
  // Clear unread when the user opens the row's view — either the
  // legacy TaskDiscussionChannel mount (selectedTaskId) or the
  // post-migration channel selection (selected.taskId).
  useEffect(() => {
    const taskId = selectedTaskId ?? (selected?.type === 'task' ? selected.taskId : null)
    if (!taskId) return
    setUnreadByTask(prev => {
      if (!prev[taskId]) return prev
      const next = { ...prev }
      delete next[taskId]
      return next
    })
  }, [selectedTaskId, selected?.id, selected?.type, selected?.taskId])
  // Tally incoming task comments + fire a group-chat-style banner +
  // sound, matching the DM channel UX. The banner uses channelType:'task'
  // so the notification tray can route a click back to the discussion.
  useEffect(() => {
    function onTaskComment(e: Event) {
      const detail = (e as CustomEvent).detail as {
        taskId?: string; mainTaskId?: string; actorId?: string
        actorName?: string; taskTitle?: string; commentId?: string; summary?: string
      } | undefined
      if (!detail) return
      if (detail.actorId === auth.userId) return
      const taskId = detail.mainTaskId ?? detail.taskId
      if (!taskId) return

      // Bump the sidebar unread count unless the user is currently
      // looking at that task's discussion.
      if (selectedTaskId !== taskId) {
        setUnreadByTask(prev => ({ ...prev, [taskId]: (prev[taskId] ?? 0) + 1 }))
      }

      // Sound + banner — same path channel/group messages use, so the
      // notification tray treats discussion comments uniformly.
      playSound('message.task.in')
      const senderName = detail.actorName ?? 'Someone'
      const taskTitle = detail.taskTitle ?? 'Discussion'
      const body = detail.summary ?? ''
      if (!document.hasFocus()) {
        try { window.electronAPI?.showNotification?.(`${taskTitle} discussion`, `${senderName}: ${body}`) } catch { /* ignore */ }
      }
      window.dispatchEvent(new CustomEvent('bundy-notification', { detail: {
        id: detail.commentId ?? `${taskId}-${Date.now()}`,
        type: 'message',
        title: senderName,
        body,
        channelId: taskId,
        channelName: `${taskTitle} discussion`,
        channelType: 'task',
        senderAvatar: null,
        timestamp: new Date().toISOString(),
        read: false,
      } }))
    }
    window.addEventListener('bundy-task-comment-added', onTaskComment)
    return () => window.removeEventListener('bundy-task-comment-added', onTaskComment)
  }, [auth.userId, selectedTaskId])

  // Threads view
  const [showThreadsView, setShowThreadsView] = useState(false)
  const [threadActivities, setThreadActivities] = useState<ThreadActivity[]>([])
  const pendingThreadRef = useRef<ChatMessage | null>(null)

  // Scheduled messages view
  const [showScheduledView, setShowScheduledView] = useState(false)
  const [scheduledMessages, setScheduledMessages] = useState<Array<{
    id: string; channelId: string; content: string; scheduledAt: string; createdAt: string
    channelDisplayName?: string; attachmentCount?: number; partnerAvatarUrl?: string | null
    channel: { id: string; name: string; type: string; members?: { user: { id: string; avatarUrl: string | null; alias: string | null; username: string } }[] }
  }>>([])
  const [loadingScheduled, setLoadingScheduled] = useState(false)
  const [editingScheduledId, setEditingScheduledId] = useState<string | null>(null)
  const [editingScheduledContent, setEditingScheduledContent] = useState('')

  // Shared media directory
  const [showSharedMedia, setShowSharedMedia] = useState(false)
  const [sharedMediaTab, setSharedMediaTab] = useState<'links' | 'media' | 'files'>('media')
  const [sharedMedia, setSharedMedia] = useState<{ links: any[]; media: any[]; files: any[] }>({ links: [], media: [], files: [] })
  const [loadingSharedMedia, setLoadingSharedMedia] = useState(false)

  // Activity-based presence
  const lastSeenRef = useRef<Record<string, number>>({})
  const [lastSeenTick, setLastSeenTick] = useState(0)
  const onlineUsersRef = useRef<Set<string>>(new Set())
  const userIdleRef = useRef<Record<string, boolean>>({})

  // DM partner current activity status (e.g. "Active on Chrome — github.com")
  const [partnerActivity, setPartnerActivity] = useState<{ app: string | null; url: string | null } | null>(null)
  const userActivityRef = useRef<Record<string, { app: string | null; url: string | null }>>({})

  // Forward message
  const [forwardingMsg, setForwardingMsg] = useState<ChatMessage | null>(null)
  const [forwardSearch, setForwardSearch] = useState('')
  const [forwardSending, setForwardSending] = useState(false)

  // New messages while scrolled up
  const [newMsgCount, setNewMsgCount] = useState(0)
  const isNearBottomRef = useRef(true)
  // P3-#14 — render-driven mirror of `isNearBottomRef` so the floating
  // scroll-down button can show whenever the user is scrolled up, not only
  // when there's an unread badge.
  const [isNearBottom, setIsNearBottom] = useState(true)

  // Lightbox
  // Lightbox can hold a single item or a gallery (#1) — when `items` has
  // more than one entry, the overlay shows prev/next arrows + ←/→ keys.
  const [lightbox, setLightbox] = useState<{ url: string; filename: string; items?: Array<{ url: string; filename: string }>; index?: number } | null>(null)

  // P3-#10 — listen for `bundy-open-lightbox` CustomEvent emitted by inline
  // image tags inside parseContent so any image rendered through the
  // markdown pipeline opens in the lightbox instead of a browser tab.
  // Route the DMs lightbox through the same claim stack the drawer +
  // task discussion mirror use. MessagesPanel is mounted at app boot
  // so its claim sits at the BOTTOM of the stack and only fires when
  // no overlay (drawer / channel mirror) is currently above it. This
  // replaces the old direct window listener, which fired in the
  // wrong phase order and let two lightboxes stack on top of each
  // other when an overlay was active.
  useLightboxClaim((detail) => {
    setLightbox(detail as { url: string; filename: string; items?: Array<{ url: string; filename: string }>; index?: number })
  })
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  // #12 — Deep-link handler for copied message links. Anyone clicking a
  // `bundy.40h.studio/messages/{channelId}/{messageId}` URL inside the app
  // ends up here: switch channel + scroll the target into view.
  useEffect(() => {
    const onOpenMsg = (e: Event) => {
      const detail = (e as CustomEvent).detail as { channelId: string; messageId: string } | undefined
      if (!detail) return
      const ch = channels.find(c => c.id === detail.channelId)
      if (!ch) {
        showToast({ kind: 'warning', message: 'You don’t have access to that conversation' })
        return
      }
      pendingScrollMsgRef.current = detail.messageId
      if (ch.id === selected?.id) {
        const el = document.getElementById(`msg-${detail.messageId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.style.background = `${C.accent}22`
          setTimeout(() => { el.style.background = '' }, 2000)
          pendingScrollMsgRef.current = null
        }
      } else {
        setShowThreadsView(false); setShowScheduledView(false)
        setSelected(ch)
      }
    }
    window.addEventListener('bundy-open-message', onOpenMsg)
    return () => window.removeEventListener('bundy-open-message', onOpenMsg)
  }, [channels, selected?.id, showToast])

  // Notification tray "task" entries route here so the user lands in
  // the Discussion mirror instead of the task drawer.
  useEffect(() => {
    function onOpenTaskDiscussion(e: Event) {
      const detail = (e as CustomEvent).detail as { taskId?: string } | undefined
      if (!detail?.taskId) return
      selectConv(null)
      setSelectedVc(null)
      setShowThreadsView(false)
      setShowScheduledView(false)
      setSelectedTaskId(detail.taskId)
    }
    window.addEventListener('bundy-open-task-discussion', onOpenTaskDiscussion)
    return () => window.removeEventListener('bundy-open-task-discussion', onOpenTaskDiscussion)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // v1.5.2111 — toast cards from the notifications store dispatch this
  // when clicked (also dispatched from FullDashboard tab-switch). If the
  // channel is in our current list we select it directly; if it isn't,
  // it'll appear after the next /api/threads refresh and the user can
  // click again. Idempotent.
  useEffect(() => {
    function onOpenConversation(e: Event) {
      const detail = (e as CustomEvent).detail as { channelId?: string } | undefined
      if (!detail?.channelId) return
      const ch = channelsRef.current.find(c => c.id === detail.channelId)
      if (ch) selectConv(ch)
    }
    window.addEventListener('bundy-open-conversation', onOpenConversation)
    return () => window.removeEventListener('bundy-open-conversation', onOpenConversation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    joinSeq?: number
  } | null>(null)

  // Guard: timestamp of the last VC join — used to ignore stale conference-ended SSE events
  const conferenceJoinedAtRef = useRef(0)
  const myConferenceRef = useRef(myConference)
  myConferenceRef.current = myConference

  // Mirror VC/DM-call presence to the conference-lock store so:
  //   1. The calendar can refuse to start a meeting when the user is
  //      already in a call (mutex — v1.5.2105).
  //   2. FullDashboard can render the cross-tab FloatingConferenceBar
  //      when off the messages tab (v1.5.2106).
  // We pass the full info, not just a boolean, so the floating bar
  // has the channel name + joinedAt without re-fetching.
  const setInVoiceOrCall = useConferenceLockStore((s) => s.setInVoiceOrCall)
  useEffect(() => {
    if (!myConference) {
      setInVoiceOrCall(null)
      return
    }
    const kind: 'vc' | 'call' = myConference.channelId.startsWith('vc_') ? 'vc' : 'call'
    setInVoiceOrCall({
      channelId: myConference.channelId,
      channelName: myConference.channelName,
      joinedAt: conferenceJoinedAtRef.current || Date.now(),
      kind,
    })
  }, [myConference, setInVoiceOrCall])

  // Cross-tab Leave from FloatingConferenceBar dispatches
  // `bundy-vc-leave-from-bar`. We tear down the LiveKit session via
  // the existing `bundy-vc-disconnect` channel that VoiceChannelView
  // listens for, then clear local state.
  useEffect(() => {
    const handler = () => {
      if (!myConferenceRef.current) return
      window.dispatchEvent(new CustomEvent('bundy-vc-disconnect'))
      flushSync(() => {
        setMyConference(null)
        setVcLocalState({ muted: false, deafened: false, screenSharing: false })
        setVcPreview(null)
      })
    }
    window.addEventListener('bundy-vc-leave-from-bar', handler)
    return () => window.removeEventListener('bundy-vc-leave-from-bar', handler)
  }, [])

  // Users currently in 1:1 calls
  const [usersInCall, setUsersInCall] = useState<Set<string>>(new Set())

  // Voice channels
  type VoiceChannelInfo = {
    id: string; name: string; ownerId: string; isPersonal: boolean
    owner: { id: string; username: string; alias: string | null; avatarUrl: string | null }
    participants: Array<{ id: string; name: string; avatar: string | null }>
  }
  const [voiceChannels, setVoiceChannels] = useState<VoiceChannelInfo[]>([])
  const [vcCreateName, setVcCreateName] = useState('')
  const [showVcCreate, setShowVcCreate] = useState(false)
  const [vcSaving, setVcSaving] = useState(false)
  const [vcDeleteConfirm, setVcDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  // Call switching — no longer needs a state (direct switch now)
  // Voice channel chat
  const [selectedVc, setSelectedVc] = useState<VoiceChannelInfo | null>(null)
  type VcMsg = { id: string; content: string; createdAt: string; sender: { id: string; username: string; alias: string | null; avatarUrl: string | null }; system?: boolean }
  const [vcMessages, setVcMessages] = useState<VcMsg[]>([])
  const [vcInput, setVcInput] = useState('')
  const [vcSending, setVcSending] = useState(false)
  const vcMsgEndRef = useRef<HTMLDivElement>(null)
  const [vcInviteOpen, setVcInviteOpen] = useState(false)
  const [vcInviteUsers, setVcInviteUsers] = useState<UserInfo[]>([])
  const [hoveredVcId, setHoveredVcId] = useState<string | null>(null)
  // Track mute/deafen state per user across VCs: Map<`${channelId}:${userId}`, { muted, deafened }>
  const [vcUserStates, setVcUserStates] = useState<Map<string, { muted: boolean; deafened: boolean }>>(new Map())
  // Track when each VC became active (first participant joined)
  const [vcActiveTimers, setVcActiveTimers] = useState<Map<string, number>>(new Map())
  // Track unread VC message counts per voice channel id
  const [vcUnreadCounts, setVcUnreadCounts] = useState<Map<string, number>>(new Map())
  const [, forceVcTimerTick] = useState(0)
  // Track own VC state from VoiceChannelView via custom events
  const [vcLocalState, setVcLocalState] = useState<{ muted: boolean; deafened: boolean; screenSharing: boolean }>({ muted: false, deafened: false, screenSharing: false })
  // Floating bar speaker video preview
  const [vcPreview, setVcPreview] = useState<{ stream: MediaStream; name: string } | null>(null)
  const vcPreviewVideoRef = useRef<HTMLVideoElement>(null)

  // #5 — switching conversations needs to drop *all* per-conversation
  // overlays so we don't land on User B with User A's Files / Pinned /
  // Thread / search state still active. Drafts are already keyed per
  // channelId in the persistence effect; this just makes the visible
  // state match the new conversation.
  const selectConv = (c: Conversation | null) => {
    if (c && c.id === selected?.id) { setSelected(c); return }
    setShowThreadsView(false)
    setShowScheduledView(false)
    setShowPinned(false)
    setShowSharedMedia(false)
    setThreadParent(null)
    setThreadMessages([])
    setThreadFocusReplyId(null)
    setSelectedVc(null)
    resetConvSearch()
    setEditingMsgId(null)
    setEditingContent('')
    if (c) setSelectedTaskId(null) // a regular conv clears any task mirror
    setLightbox(null) // close any leftover lightbox from previous view
    setSelected(c)
  }

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
      // Re-fetch voice channels on SSE reconnect to restore the list after server restart
      fetchVoiceChannels()
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
      // Guard: ignore stale conference-ended events that arrive within 5s of joining
      // This prevents a race where a delayed leave from a failed init kills the new session
      const mc = myConferenceRef.current
      if (mc?.channelId === payload.channelId && Date.now() - conferenceJoinedAtRef.current < 5000) return
      setActiveConferences(prev => { const { [payload.channelId]: _, ...rest } = prev; return rest })
      setMyConference(prev => prev?.channelId === payload.channelId ? null : prev)
    }
    const onConfInvite = (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; fromName: string; channelId: string; channelName: string }>).detail
      window.dispatchEvent(new CustomEvent('bundy-vc-invite-banner', { detail: payload }))
      window.electronAPI?.showNotification?.(`Call invite from ${payload.fromName}`, `Join ${payload.channelName}`)
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
  }, [fetchVoiceChannels])

  // Track mute/deafen per user in VCs and VC active timers
  useEffect(() => {
    const onMute = (e: Event) => {
      const { from, channelId: cId, muted: m } = (e as CustomEvent<{ from: string; channelId: string; muted: boolean }>).detail
      if (!cId?.startsWith('vc_')) return
      setVcUserStates(prev => { const next = new Map(prev); const key = `${cId}:${from}`; const cur = next.get(key) ?? { muted: false, deafened: false }; next.set(key, { ...cur, muted: m }); return next })
    }
    const onDeafen = (e: Event) => {
      const { from, channelId: cId, deafened: d } = (e as CustomEvent<{ from: string; channelId: string; deafened: boolean }>).detail
      if (!cId?.startsWith('vc_')) return
      setVcUserStates(prev => { const next = new Map(prev); const key = `${cId}:${from}`; const cur = next.get(key) ?? { muted: false, deafened: false }; next.set(key, { ...cur, deafened: d }); return next })
    }
    const onVcJoined = (e: Event) => {
      const { channelId: cId } = (e as CustomEvent<{ channelId: string }>).detail
      if (!cId?.startsWith('vc_')) return
      setVcActiveTimers(prev => { if (prev.has(cId)) return prev; const next = new Map(prev); next.set(cId, Date.now()); return next })
    }
    const onVcLeft = (e: Event) => {
      const { channelId: cId } = (e as CustomEvent<{ channelId: string }>).detail
      if (!cId?.startsWith('vc_')) return
      // Timer removal handled by checking participants count in render
    }
    window.addEventListener('bundy-conference-mute', onMute)
    window.addEventListener('bundy-conference-deafen', onDeafen)
    window.addEventListener('bundy-conference-joined', onVcJoined)
    window.addEventListener('bundy-conference-left', onVcLeft)
    return () => {
      window.removeEventListener('bundy-conference-mute', onMute)
      window.removeEventListener('bundy-conference-deafen', onDeafen)
      window.removeEventListener('bundy-conference-joined', onVcJoined)
      window.removeEventListener('bundy-conference-left', onVcLeft)
    }
  }, [])

  // Tick every second to update VC active duration display (hh:mm:ss)
  useEffect(() => {
    const id = setInterval(() => forceVcTimerTick(t => t + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  // Presence tick
  useEffect(() => {
    const id = setInterval(() => setLastSeenTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // Listen for real-time user activity updates via SSE
  useEffect(() => {
    const onActivity = (e: Event) => {
      const { userId, app, url } = (e as CustomEvent<{ userId: string; app: string | null; url: string | null }>).detail
      userActivityRef.current[userId] = { app, url }
      // If this is the current DM partner, update display immediately
      if (selected?.type === 'dm' && selected?.partnerId === userId) {
        setPartnerActivity(app ? { app, url } : null)
      }
    }
    window.addEventListener('bundy-user-activity', onActivity)
    return () => window.removeEventListener('bundy-user-activity', onActivity)
  }, [selected?.id, selected?.type, selected?.partnerId])

  // When switching to a DM, show cached activity for that partner
  useEffect(() => {
    if (!selected || selected.type !== 'dm' || !selected.partnerId) {
      setPartnerActivity(null)
      return
    }
    const cached = userActivityRef.current[selected.partnerId]
    setPartnerActivity(cached?.app ? cached : null)
  }, [selected?.id, selected?.type, selected?.partnerId])

  const getPresence = useCallback((userId: string): 'active' | 'recent' | 'away' => {
    void lastSeenTick
    // Grey: user is offline (not connected via SSE)
    if (!onlineUsersRef.current.has(userId)) return 'away'
    // Amber: user is online but system idle >5 min
    if (userIdleRef.current[userId]) return 'recent'
    // Stale heartbeat — they're nominally online but haven't pinged in
    // 90 s, so the green "active" dot would be misleading. Downgrade to
    // amber until a fresh user-activity event lands.
    const lastSeen = lastSeenRef.current[userId]
    if (lastSeen && Date.now() - lastSeen > 90_000) return 'recent'
    // Green: user is online and active
    return 'active'
  }, [lastSeenTick])

  const trackerStatusRef = useRef<Record<string, string>>({})
  const getTrackerStatus = useCallback((userId: string): string | null => {
    void lastSeenTick
    return trackerStatusRef.current[userId] ?? null
  }, [lastSeenTick])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const typingTimers = useRef<Record<string, NodeJS.Timeout>>({})

  // Delegates to the shared cache-aware apiFetch — GETs to whitelisted
  // paths fall back to IndexedDB on network failure, so the panel keeps
  // rendering when the server is unreachable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadScheduledMessages = useCallback(async () => {
    setLoadingScheduled(true)
    try {
      const data = await apiFetch('/api/scheduled-messages')
      setScheduledMessages(data.messages ?? [])
    } catch (e) { console.error('Failed to load scheduled messages', e) }
    finally { setLoadingScheduled(false) }
  }, [apiFetch])

  const loadChannels = useCallback(async () => {
    try {
      const data = await apiFetch('/api/channels') as {
        channels: Array<{
          id: string; type: string; name: string | null; createdBy?: string
          taskId?: string | null
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
        } else if (ch.type === 'task') {
          name = ch.name ?? 'Discussion'
        } else {
          name = `#${ch.name ?? 'channel'}`
        }
        const last = ch.messages[0]
        return {
          id: ch.id, type: ch.type as Conversation['type'], name, avatar, partnerId,
          members, createdBy: ch.createdBy,
          taskId: ch.taskId ?? null,
          lastMessage: last ? `${last.sender.alias ?? last.sender.username}: ${last.content}` : undefined,
          lastTime: last?.createdAt,
          unread: ch.unread ?? 0,
        }
      })
      // If a channel is currently open + we're already reading it,
      // pin its unread to 0. Without this, /api/channels can race
      // ahead of the /read POST and stamp a stale non-zero count
      // back on, which is what makes the DMs tab badge linger after
      // the user has clearly read everything.
      const openId = selectedRef.current?.id
      setChannels(convs.map(c => openId && c.id === openId ? { ...c, unread: 0 } : c))
    } catch { /* offline */ }
  }, [apiFetch, auth.userId])

  // Derive current user's avatar from loaded conversations (same source as DM sidebar avatars)
  const myAvatarUrl = useMemo(() => {
    if (auth.avatarUrl) return auth.avatarUrl
    for (const ch of channels) {
      const self = ch.members?.find(m => m.userId === auth.userId)
      if (self?.user?.avatarUrl) return self.user.avatarUrl
    }
    return null
  }, [auth.avatarUrl, auth.userId, channels])

  // Broadcast unread count to FullDashboard for sidebar badge
  useEffect(() => {
    const total = channels.reduce((sum, c) => sum + (c.unread ?? 0), 0)
    const hasMention = channels.some(c => mentionedChannels.has(c.id) && (c.unread ?? 0) > 0)
    window.dispatchEvent(new CustomEvent('bundy-unread-update', { detail: { count: total, mention: hasMention } }))
    window.electronAPI?.setBadgeCount?.(total)
  }, [channels, mentionedChannels])

  const pendingScrollMsgRef = useRef<string | null>(null)

  const loadMessages = useCallback(async (conv: Conversation) => {
    setLoadingMsgs(true)
    const aroundMsgId = pendingScrollMsgRef.current
    try {
      const qs = aroundMsgId ? `?around=${aroundMsgId}&limit=50` : `?limit=50`
      const data = await apiFetch(`/api/channels/${conv.id}/messages${qs}`) as {
        messages: Array<{
          id: string; content: string; createdAt: string; editedAt: string | null
          sender: { id: string; username: string; alias: string | null; avatarUrl: string | null }
          reads: { userId: string; readAt?: string }[]
          reactions?: ChatMessage['reactions']
          parentMessageId?: string | null; replyCount?: number
          replySenders?: { id: string; username: string; alias: string | null; avatarUrl: string | null }[]
          isPinned?: boolean; pinnedAt?: string | null; pinnedBy?: string | null
        }>
        hasMore?: boolean
      }
      setMessages(data.messages.map(m => ({
        id: m.id, content: m.content, createdAt: m.createdAt, editedAt: m.editedAt,
        sender: m.sender, reads: m.reads, reactions: m.reactions ?? [],
        parentMessageId: m.parentMessageId, replyCount: m.replyCount ?? 0,
        replySenders: m.replySenders ?? [],
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
        // v1.5.2203 — every successful SSE handshake triggers a resync.
        // The stream itself doesn't replay missed events on reconnect, so
        // anything that landed during the disconnect window would otherwise
        // stay invisible until the next focus / visibility change. Firing
        // bundy-sse-reconnected makes panels (Discussion list, channels,
        // tasks panel etc.) catch up immediately.
        window.dispatchEvent(new CustomEvent('bundy-sse-reconnected'))
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
            // v1.5.2204 — debug: record every SSE arrival timestamp.
            debugRecord.sse(ev)
            try {
              const payload = JSON.parse(dataMatch[1])
              if (payload.senderId && payload.senderId !== auth.userId) {
                lastSeenRef.current[payload.senderId] = Date.now()
              }
              if (ev === 'channel-message') {
                const channelId = payload.channelId as string
                const parentMsgId = payload.parentMessageId as string | null | undefined
                const isCurrentChannel = selectedRef.current?.id === channelId
                // Relay to anyone outside MessagesPanel that needs to
                // react to channel-message events (e.g. the task drawer
                // subscribed to its discussion channel).
                window.dispatchEvent(new CustomEvent('bundy-channel-message', { detail: payload }))
                // Clear "typing…" for this sender — their message has
                // landed, so the indicator should drop instantly instead
                // of lingering until the 3 s timeout fires.
                if (payload.senderId && payload.senderId !== auth.userId) {
                  const senderName = (payload.senderAlias ?? payload.senderName) as string | undefined
                  if (senderName) {
                    const timerKey = `${channelId}:${senderName}`
                    if (typingTimers.current[timerKey]) {
                      clearTimeout(typingTimers.current[timerKey])
                      delete typingTimers.current[timerKey]
                    }
                    setTypingMap(prev => {
                      const cur = (prev[channelId] ?? []).filter(n => n !== senderName)
                      if (cur.length === 0) { const { [channelId]: _, ...rest } = prev; return rest }
                      return { ...prev, [channelId]: cur }
                    })
                  }
                }
                if (isCurrentChannel) {
                  if (parentMsgId) {
                    // P3-#13 — always update replySenders (incl. self-replies)
                    // so the avatar stack on the parent message refreshes
                    // immediately after sending instead of after a reload.
                    setMessages(prev => prev.map(m =>
                      m.id === parentMsgId ? {
                        ...m, replyCount: (m.replyCount ?? 0) + 1,
                        replySenders: (() => {
                          const cur = m.replySenders ?? []
                          if (cur.some(s => s.id === payload.senderId)) return cur
                          const newSender = { id: payload.senderId, username: payload.senderName, alias: payload.senderAlias ?? payload.senderName, avatarUrl: payload.senderAvatar ?? null }
                          return [...cur, newSender].slice(0, 3)
                        })()
                      } : m
                    ))
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
                        // v1.5.2111 — mark unread when the message lands in a
                        // thread the user isn't currently viewing. Previously
                        // hard-coded `unread: false` swallowed badges.
                        unread: threadParent?.id !== parentMsgId,
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
                    // Track new messages when scrolled up
                    if (payload.senderId !== auth.userId && !isNearBottomRef.current) {
                      setNewMsgCount(c => c + 1)
                    }
                  }
                  // v1.5.2111 — only auto-mark-as-read when the user is
                  // actually viewing the message's location (main view OR
                  // the same thread it landed in) AND scrolled to the
                  // bottom (so the message is visible). Previously any
                  // incoming message would mark the WHOLE channel as read,
                  // swallowing unread badges even when the user was
                  // scrolled up reading older history. The "1 new" pill
                  // already uses isNearBottomRef for the same reason —
                  // the unread badge now mirrors that signal.
                  const userInOpenThread = parentMsgId && threadParent?.id === parentMsgId
                  const userInMainView = !parentMsgId && !threadParent && isNearBottomRef.current
                  const isUserViewingThisLocation = isVisibleRef.current && (userInOpenThread || userInMainView)
                  if (isUserViewingThisLocation) {
                    fetch(`${config.apiBase}/api/channels/${channelId}/read`, {
                      method: 'POST', headers: { Authorization: `Bearer ${config.token}` },
                    }).catch(() => {})
                  } else {
                    setChannels(prev => prev.map(c =>
                      c.id === channelId ? { ...c, unread: (c.unread ?? 0) + 1 } : c
                    ))
                  }
                  if (payload.senderId !== auth.userId) {
                    // Material Design pack — pick the sound for this channel
                    // type so the user can hear DM vs group vs channel without
                    // looking. @mention overrides because attention beats type.
                    const _ch = channelsRef.current.find(c => c.id === channelId)
                    const isMentioned = !!payload.content && payload.content.toLowerCase().includes(`@${auth.username.toLowerCase()}`)
                    if (isMentioned) playSound('message.mention')
                    else if (_ch?.type === 'dm') playSound('message.dm.in')
                    else if (_ch?.type === 'group') playSound('message.group.in')
                    else if (_ch?.type === 'task') playSound('message.task.in')
                    else playSound('message.channel.in')
                    // Show native desktop notification via main process
                    if (!document.hasFocus()) {
                      window.electronAPI?.showNotification?.('New message', `${payload.senderAlias ?? payload.senderName}: ${payload.content}`)
                    }
                    // v1.5.2111 — surface a top-right toast card when the
                    // message arrives in a different thread than the user
                    // is actively viewing. Otherwise the user only hears
                    // a sound and might miss the message entirely.
                    const isInOpenThread = parentMsgId && threadParent?.id === parentMsgId
                    const isInMainViewWithThreadOpen = !parentMsgId && threadParent
                    if (!isInOpenThread || isInMainViewWithThreadOpen) {
                      // v1.5.2111 — richer toast: include WHERE the message
                      // landed (channel/task/group/DM) and WHETHER it's a
                      // thread reply so the user can triage by urgency
                      // without opening the panel.
                      const senderName = payload.senderAlias ?? payload.senderName
                      const venueLabel = (() => {
                        if (!_ch) return null
                        if (_ch.type === 'task') return `task: ${_ch.name}`
                        if (_ch.type === 'group') return `group: ${_ch.name}`
                        if (_ch.type === 'channel') return `#${_ch.name}`
                        return 'DM'
                      })()
                      const replyLabel = parentMsgId ? ' · in thread' : ''
                      const title = isMentioned
                        ? `${senderName} mentioned you${venueLabel ? ` in ${venueLabel}` : ''}${replyLabel}`
                        : venueLabel ? `${senderName} → ${venueLabel}${replyLabel}` : senderName
                      useNotificationsStore.getState().show({
                        kind: isMentioned ? 'task-mention' : (_ch?.type === 'task' ? 'task-discussion' : 'info'),
                        title,
                        message: (payload.content || '').slice(0, 200),
                        // durationMs omitted → persist until manual close.
                        onClick: () => {
                          const ch = channelsRef.current.find(c => c.id === channelId)
                          if (ch) selectConv(ch)
                          else {
                            window.dispatchEvent(new CustomEvent('bundy-open-conversation', {
                              detail: { channelId, parentMessageId: parentMsgId ?? null },
                            }))
                          }
                        },
                      })
                    }
                    // Dispatch to in-app notification tray (reuse the
                    // _ch resolved above for the sound branch).
                    window.dispatchEvent(new CustomEvent('bundy-notification', { detail: {
                      id: payload.id,
                      type: parentMsgId ? 'thread-reply' : 'message',
                      title: `${payload.senderAlias ?? payload.senderName}`,
                      body: payload.content,
                      channelId,
                      channelName: _ch?.name ?? undefined,
                      channelType: _ch?.type ?? undefined,
                      senderAvatar: payload.senderAvatar ?? null,
                      timestamp: payload.createdAt,
                      read: false,
                    } }))
                  }
                } else if (payload.senderId !== auth.userId) {
                  const isMention = !!payload.content && (
                    payload.content.toLowerCase().includes(`@${auth.username.toLowerCase()}`)
                  )
                  setChannels(prev => prev.map(c =>
                    c.id === channelId ? { ...c, unread: (c.unread ?? 0) + 1 } : c
                  ))
                  if (isMention) setMentionedChannels(prev => new Set([...prev, channelId]))
                  // v1.5.2111 — toast card for messages arriving in OTHER
                  // channels. Same shape + enrichment as in-channel toasts.
                  {
                    const _bgChForToast = channelsRef.current.find(c => c.id === channelId)
                    const senderName = payload.senderAlias ?? payload.senderName
                    const venueLabel = (() => {
                      if (!_bgChForToast) return null
                      if (_bgChForToast.type === 'task') return `task: ${_bgChForToast.name}`
                      if (_bgChForToast.type === 'group') return `group: ${_bgChForToast.name}`
                      if (_bgChForToast.type === 'channel') return `#${_bgChForToast.name}`
                      return 'DM'
                    })()
                    const replyLabel = parentMsgId ? ' · in thread' : ''
                    const title = isMention
                      ? `${senderName} mentioned you${venueLabel ? ` in ${venueLabel}` : ''}${replyLabel}`
                      : venueLabel ? `${senderName} → ${venueLabel}${replyLabel}` : senderName
                    useNotificationsStore.getState().show({
                      kind: isMention ? 'task-mention' : (_bgChForToast?.type === 'task' ? 'task-discussion' : 'info'),
                      title,
                      message: (payload.content || '').slice(0, 200),
                      // durationMs omitted → persist until manual close.
                      onClick: () => {
                        const ch = channelsRef.current.find(c => c.id === channelId)
                        if (ch) selectConv(ch)
                        else {
                          window.dispatchEvent(new CustomEvent('bundy-open-conversation', {
                            detail: { channelId, parentMessageId: parentMsgId ?? null },
                          }))
                        }
                      },
                    })
                  }
                  // Background-channel sound — pick by channel type unless
                  // you're @mentioned (which always wins).
                  const _bgCh = channelsRef.current.find(c => c.id === channelId)
                  if (isMention) playSound('message.mention')
                  else if (_bgCh?.type === 'dm') playSound('message.dm.in')
                  else if (_bgCh?.type === 'group') playSound('message.group.in')
                  else if (_bgCh?.type === 'task') playSound('message.task.in')
                  else playSound('message.channel.in')
                  window.electronAPI?.showNotification?.(
                    isMention ? '📣 You were mentioned' : 'New message',
                    `${payload.senderAlias ?? payload.senderName}: ${payload.content}`
                  )
                  // Dispatch to in-app notification tray
                  const _ch2 = channelsRef.current.find(c => c.id === channelId)
                  window.dispatchEvent(new CustomEvent('bundy-notification', { detail: {
                    id: payload.id,
                    type: isMention ? 'mention' : (parentMsgId ? 'thread-reply' : 'message'),
                    title: isMention
                      ? `${payload.senderAlias ?? payload.senderName} mentioned you`
                      : `${payload.senderAlias ?? payload.senderName}`,
                    body: payload.content,
                    channelId,
                    channelName: _ch2?.name ?? undefined,
                    channelType: _ch2?.type ?? undefined,
                    senderAvatar: payload.senderAvatar ?? null,
                    timestamp: payload.createdAt,
                    read: false,
                  } }))
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
                window.dispatchEvent(new CustomEvent('bundy-channel-message-edit', { detail: payload }))
                const updater = (prev: ChatMessage[]) => prev.map(m =>
                  m.id === payload.messageId ? { ...m, content: payload.content, editedAt: payload.editedAt } : m
                )
                setMessages(updater)
                setThreadMessages(updater)
              } else if (ev === 'channel-message-delete') {
                window.dispatchEvent(new CustomEvent('bundy-channel-message-delete', { detail: payload }))
                setMessages(prev => prev.filter(m => m.id !== payload.messageId))
                setThreadMessages(prev => prev.filter(m => m.id !== payload.messageId))
              } else if (ev === 'channel-typing') {
                window.dispatchEvent(new CustomEvent('bundy-channel-typing', { detail: payload }))
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
                    ? { ...m, reads: [...(m.reads ?? []), { userId: payload.userId, readAt: new Date().toISOString() }] }
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
              } else if (ev === 'conference-speaking') {
                window.dispatchEvent(new CustomEvent('bundy-conference-speaking', { detail: payload }))
              } else if (ev === 'conference-deafen') {
                window.dispatchEvent(new CustomEvent('bundy-conference-deafen', { detail: payload }))
              } else if (ev === 'conference-video') {
                window.dispatchEvent(new CustomEvent('bundy-conference-video', { detail: payload }))
              } else if (ev === 'conference-screen-share') {
                window.dispatchEvent(new CustomEvent('bundy-conference-screen-share', { detail: payload }))
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
              } else if (ev === 'vc-message') {
                window.dispatchEvent(new CustomEvent('bundy-vc-message', { detail: payload }))
                // Increment unread count if VC chat is not currently open for this channel
                if (payload.sender?.id && payload.sender.id !== auth.userId) {
                  const vcId = payload.voiceChannelId
                  setVcUnreadCounts(prev => {
                    const next = new Map(prev)
                    next.set(vcId, (next.get(vcId) ?? 0) + 1)
                    return next
                  })
                }
                // Desktop notification for VC messages from other users
                if (payload.sender?.id && payload.sender.id !== auth.userId) {
                  const senderName = payload.sender.alias ?? payload.sender.username
                  window.electronAPI?.showNotification?.('Voice Channel', `${senderName}: ${payload.content}`)
                }
              } else if (ev === 'user-activity') {
                window.dispatchEvent(new CustomEvent('bundy-user-activity', { detail: payload }))
                // Track idle status for presence
                if (payload.userId && payload.userId !== auth.userId) {
                  userIdleRef.current[payload.userId] = !!payload.idle
                  onlineUsersRef.current.add(payload.userId) // receiving heartbeat = online
                  // Also stamp last-seen so the stale-presence check in
                  // getPresence can dim users who haven't pinged in a while.
                  lastSeenRef.current[payload.userId] = Date.now()
                  setLastSeenTick(t => t + 1)
                }
              } else if (ev === 'online-users') {
                // Initial list of online user IDs on SSE connect
                const ids = payload as string[]
                onlineUsersRef.current = new Set(ids)
                setLastSeenTick(t => t + 1)
              } else if (ev === 'online-change') {
                const { userId, online } = payload as { userId: string; online: boolean }
                if (online) {
                  onlineUsersRef.current.add(userId)
                  userIdleRef.current[userId] = false
                } else {
                  onlineUsersRef.current.delete(userId)
                  delete userIdleRef.current[userId]
                }
                setLastSeenTick(t => t + 1)
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
    loadChannels()
  }, [loadChannels])

  // Fetch task discussions for the Projects sidebar section. Limits to
  // tasks where the user is involved + has at least one comment, sorted
  // by most-recently-updated. Refreshed when the user adds a comment
  // anywhere (the bundy-task-comment-added event fires from the drawer).
  const loadProjectTasks = useCallback(async () => {
    const _debugStartedAt = Date.now()
    try {
      // `involved=1` (server-side filter) returns tasks I'm assigned to,
      // created, or have commented on. Older backends ignore the param
      // and return all tasks; we narrow client-side to ones with at least
      // one comment to avoid surfacing every task in the workspace.
      const data = await apiFetch('/api/tasks?involved=1&my=1&includeSubtasks=1') as {
        tasks: Array<{
          id: string; title: string; updatedAt: string; status: string
          parentTaskId?: string | null
          project?: { id: string; name: string; color: string | null } | null
          _count?: { comments?: number }
          mentionedMe?: boolean
        }>
      }
      // v1.5.2201 — Discussion-list visibility rules (per UX spec):
      //  * Show: any task I'm involved in (assigned / mentioned / commented
      //    / subtask-assigned) that ISN'T marked done/cancelled.
      //  * Show: tasks marked done/cancelled IF I was @mentioned in their
      //    discussion. The mention is the ongoing-conversation signal —
      //    the "thanks, can you also..." reply still needs to surface.
      //  * Hide: tasks marked done/cancelled where I'm only an assignee
      //    or commenter, never mentioned. Once shipped, my participation
      //    is archived.
      const filtered = (data.tasks ?? [])
        .filter(t => !t.parentTaskId)
        .filter(t => {
          const isFinal = t.status === 'done' || t.status === 'cancelled'
          if (!isFinal) return true
          return !!t.mentionedMe
        })
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .map(t => ({
          id: t.id, title: t.title, updatedAt: t.updatedAt,
          commentCount: t._count?.comments ?? 0,
          project: t.project ?? null,
        }))
      setProjectTasks(filtered)
      // v1.5.2204 — debug record. Tracks how long the API took and how
      // many tasks the filter ended up with.
      debugRecord.load(Date.now() - _debugStartedAt, filtered.length)
      debugRecord.render(filtered.length)
    } catch (err) {
      console.error('[messages] loadProjectTasks failed:', err)
      debugRecord.load(Date.now() - _debugStartedAt, -1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    loadProjectTasks()
    // SSE is the instant trigger for new tasks / comments / notifications.
    // Window-focus + visibility cover the "wake from sleep, SSE was
    // dropped" case. No polling timer needed — DMs parity.
    // Also reload /api/channels so any task channel I just got added
    // to (subtask assignment, parent task assignment via PATCH)
    // appears in `channels` state — otherwise the Discussion row
    // can't find a matching channel and falls back to opening the
    // drawer instead of the DMs main pane.
    function onAny() { void loadProjectTasks(); void loadChannels() }
    // Optimistic removal: the moment a task PATCH lands a status of
    // done/cancelled, drop it from the Discussion sidebar locally so
    // the row disappears without waiting for the loadProjectTasks
    // re-fetch round-trip.
    function onTaskUpdate(e: Event) {
      const detail = (e as CustomEvent).detail as { taskId?: string; mainTaskId?: string; changes?: { status?: string } } | undefined
      const newStatus = detail?.changes?.status
      if (newStatus === 'done' || newStatus === 'cancelled') {
        const tid = detail?.mainTaskId ?? detail?.taskId
        if (tid) setProjectTasks(prev => prev.filter(t => t.id !== tid))
      }
      void loadProjectTasks(); void loadChannels()
    }
    // Local read sync — DiscussionPanel inside the task drawer fires
    // this when it marks its channel as read. Without it, MessagesPanel's
    // unread state can lag behind and the DMs tab badge stays elevated.
    function onLocalRead(e: Event) {
      const detail = (e as CustomEvent).detail as { channelId?: string } | undefined
      if (!detail?.channelId) return
      setChannels(prev => prev.map(c => c.id === detail.channelId ? { ...c, unread: 0 } : c))
      setMentionedChannels(prev => { const next = new Set(prev); next.delete(detail.channelId!); return next })
    }
    // Phase 2 — when the queue replays a queued write, swap the
    // optimistic temp message id for the server-assigned id so reactions
    // / edits / deletes work normally afterward.
    function onReplayed(e: Event) {
      const detail = (e as CustomEvent).detail as {
        kind: string
        tempId?: string
        response?: { message?: ChatMessage }
      } | undefined
      if (!detail || detail.kind !== 'message' || !detail.tempId) return
      const real = detail.response?.message
      if (!real) return
      setMessages(prev => prev.map(m => m.id === detail.tempId ? { ...real, reactions: real.reactions ?? [], reads: real.reads ?? [], replyCount: real.replyCount ?? 0 } : m))
    }
    window.addEventListener('bundy-task-comment-added', onAny)
    window.addEventListener('bundy-task-updated', onTaskUpdate)
    window.addEventListener('bundy-task-notification', onAny)
    // v1.5.2203 — SSE reconnect resync (catches events lost during the
    // 3s reconnect gap, including Cloudflare-tunnel idle drops).
    window.addEventListener('bundy-sse-reconnected', onAny)
    window.addEventListener('bundy-channel-read-local', onLocalRead)
    window.addEventListener('bundy-write-replayed', onReplayed)
    window.addEventListener('focus', onAny)
    document.addEventListener('visibilitychange', onAny)
    // v1.5.2203 — belt-and-suspenders: every 30s, if the document is
    // visible, force a silent resync. Catches any SSE event that was
    // dropped silently (network glitches, server-side broadcaster blips
    // before they're noticed). 30s feels near-instant + costs ~120 KB
    // /min for two endpoints.
    const periodicResync = setInterval(() => {
      if (document.visibilityState === 'visible') onAny()
    }, 30_000)
    return () => {
      window.removeEventListener('bundy-task-comment-added', onAny)
      window.removeEventListener('bundy-task-updated', onTaskUpdate)
      window.removeEventListener('bundy-task-notification', onAny)
      window.removeEventListener('bundy-sse-reconnected', onAny)
      window.removeEventListener('bundy-channel-read-local', onLocalRead)
      window.removeEventListener('bundy-write-replayed', onReplayed)
      window.removeEventListener('focus', onAny)
      document.removeEventListener('visibilitychange', onAny)
      clearInterval(periodicResync)
    }
  }, [loadProjectTasks, loadChannels])

  // Thread activities (loaded when threads view opens)
  useEffect(() => {
    if (!showThreadsView) return
    apiFetch('/api/threads').then((data: any) => {
      setThreadActivities(data.threads ?? [])
    }).catch(() => {})
  }, [showThreadsView, apiFetch])

  // Load scheduled messages count on mount + when view opens
  useEffect(() => {
    apiFetch('/api/scheduled-messages').then((data: any) => {
      setScheduledMessages(data.messages ?? [])
    }).catch(() => {})
  }, [apiFetch])

  // Auto-close scheduled view when all messages are removed
  useEffect(() => {
    if (showScheduledView && scheduledMessages.length === 0 && !loadingScheduled) {
      setShowScheduledView(false)
    }
  }, [scheduledMessages.length, showScheduledView, loadingScheduled])

  // Periodic refresh of user profile info + tracker status
  useEffect(() => {
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
    setNewMsgCount(0)
    isNearBottomRef.current = true
    setIsNearBottom(true)
    loadMessages(selected)
    setThreadParent(null); setThreadMessages([]); setShowPinned(false); setEmojiPickerMsgId(null); setFullEmojiPickerMsgId(null)
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
    if (!isVisible || !selected) return
    setChannels(prev => prev.map(c => c.id === selected.id ? { ...c, unread: 0 } : c))
    setMentionedChannels(prev => { const next = new Set(prev); next.delete(selected.id); return next })
    fetch(`${config.apiBase}/api/channels/${selected.id}/read`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.token}` },
    }).catch(() => {})
  }, [isVisible]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for notification tray clicks to open a specific channel
  useEffect(() => {
    function onOpenChannel(e: Event) {
      const { channelId } = (e as CustomEvent<{ channelId: string }>).detail
      const ch = channels.find(c => c.id === channelId)
      if (ch) { setShowThreadsView(false); setSelected(ch) }
    }
    window.addEventListener('bundy-open-channel', onOpenChannel)
    return () => window.removeEventListener('bundy-open-channel', onOpenChannel)
  }, [channels])

  // Auto-scroll on new message (or scroll to pending search target)
  useEffect(() => {
    if (pendingScrollMsgRef.current) {
      const targetId = pendingScrollMsgRef.current
      justSwitchedRef.current = false
      requestAnimationFrame(() => {
        const el = document.getElementById(`msg-${targetId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'auto', block: 'center' })
          el.style.background = `${C.accent}22`
          setTimeout(() => { el.style.background = '' }, 2000)
        }
        pendingScrollMsgRef.current = null
      })
    } else if (justSwitchedRef.current) {
      justSwitchedRef.current = false
      setNewMsgCount(0)
      // Double rAF ensures DOM is fully painted before scrolling
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = messagesScrollRef.current
          if (el) el.scrollTop = el.scrollHeight
        })
      })
    } else {
      const el = messagesScrollRef.current
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        setNewMsgCount(0)
      }
    }
  }, [messages])

  function handleMessagesScroll() {
    const el = messagesScrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    isNearBottomRef.current = nearBottom
    setIsNearBottom(nearBottom)
    if (nearBottom) setNewMsgCount(0)
  }

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
    const channelId = selected.id
    setSending(true); setInput('')
    const tempId = `temp-${(crypto as Crypto).randomUUID?.() ?? Math.random().toString(36).slice(2)}`
    try {
      await sharedApiFetch(`/api/channels/${channelId}/messages`, {
        method: 'POST', body: { content }, tempId,
      })
      await loadMessages(selected)
      setChannels(prev => prev.map(c =>
        c.id === channelId
          ? { ...c, lastMessage: `${auth.username}: ${content}`, lastTime: new Date().toISOString() }
          : c
      ))
    } catch (err) {
      if (err instanceof QueuedWriteError) {
        // Queue accepted the send — render an optimistic placeholder so
        // the user's message lands in the thread immediately.
        const optimistic: ChatMessage = {
          id: tempId,
          content,
          createdAt: new Date().toISOString(),
          editedAt: null,
          sender: { id: auth.userId, username: auth.username, alias: null, avatarUrl: auth.avatarUrl ?? null },
          reactions: [], reads: [], replyCount: 0,
          parentMessageId: null,
          isPinned: false, pinnedAt: null, pinnedBy: null,
        }
        setMessages(prev => [...prev, optimistic])
        setChannels(prev => prev.map(c =>
          c.id === channelId
            ? { ...c, lastMessage: `${auth.username}: ${content}`, lastTime: new Date().toISOString() }
            : c
        ))
      } else {
        console.error('[Messages] send failed:', err)
      }
    } finally { setSending(false) }
  }

  // Refs hold the latest editing state without changing identity — the
  // useCallback below stays referentially stable (no editingContent dep)
  // so React.memo on <MessageRow> can short-circuit while the user types.
  const editingMsgIdRef = useRef(editingMsgId)
  const editingContentRef = useRef(editingContent)
  editingMsgIdRef.current = editingMsgId
  editingContentRef.current = editingContent
  const handleEditMessage = useCallback(async () => {
    const id = editingMsgIdRef.current
    const content = editingContentRef.current
    if (!id || !content.trim() || !selected) return
    try {
      await apiFetch(`/api/channels/${selected.id}/messages/${id}`, {
        method: 'PATCH', body: JSON.stringify({ content: content.trim() }),
      })
      setMessages(prev => prev.map(m =>
        m.id === id ? { ...m, content: content.trim(), editedAt: new Date().toISOString() } : m
      ))
    } catch (err) { console.error('[Messages] edit failed:', err) }
    setEditingMsgId(null); setEditingContent('')
  }, [selected, apiFetch])

  const handleDeleteMessage = useCallback(async (msgId: string) => {
    if (!selected) return
    try {
      await apiFetch(`/api/channels/${selected.id}/messages/${msgId}`, { method: 'DELETE' })
      setMessages(prev => prev.filter(m => m.id !== msgId))
    } catch (err) { console.error('[Messages] delete failed:', err) }
  }, [selected, apiFetch])

  async function handleSearchResultClick(result: typeof searchResults[0]) {
    const ch = channels.find(c => c.id === result.channelId)
    if (!ch) {
      resetSidebarSearch()
      return
    }
    // P3-#9 — thread-reply hits open the thread panel instead of trying to
    // scroll the main list (which only contains top-level messages).
    if (result.parentMessageId) {
      // Switch channel if needed first; loadMessages will fetch top-level msgs.
      if (ch.id !== selected?.id) {
        setSelected(ch)
        // Wait for channel switch + initial load before opening thread.
        await new Promise(r => setTimeout(r, 200))
      }
      // P3-#13 v2 — directly fetch the parent message without using `around=`,
      // which only returns top-level messages and was returning [] for thread
      // parents whose own row is buried in pagination. Pass the focus id to
      // ThreadView so it scrolls to + highlights the matched reply.
      try {
        const parentRes = await apiFetch(`/api/channels/${ch.id}/messages?around=${result.parentMessageId}`)
        let parent: ChatMessage | undefined = (parentRes.messages ?? []).find((m: ChatMessage) => m.id === result.parentMessageId)
        if (!parent) {
          // Last resort: synthesize a minimal parent from the search payload.
          parent = {
            id: result.parentMessageId,
            content: '(loading thread parent…)',
            createdAt: result.createdAt,
            sender: { id: '', username: '?', alias: null, avatarUrl: null },
            reactions: [], reads: [], replyCount: 0,
          } as ChatMessage
        }
        setThreadFocusReplyId(result.id)
        openThread(parent)
      } catch (err) { console.error('[search] open thread failed:', err) }
      resetSidebarSearch()
      return
    }
    // Top-level hit — original flow.
    pendingScrollMsgRef.current = result.id
    if (ch.id === selected?.id) {
      const el = document.getElementById(`msg-${result.id}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.style.background = `${C.accent}22`
        setTimeout(() => { el.style.background = '' }, 2000)
        pendingScrollMsgRef.current = null
      } else {
        loadMessages(ch)
      }
    } else {
      setSelected(ch)
    }
    resetSidebarSearch()
  }

  async function handleConvSearchResultClick(result: typeof convSearchResults[0]) {
    // #5 — thread-reply hits open the ThreadView with the matched reply
    // highlighted, instead of trying to scroll the main list (which only
    // ever holds top-level messages).
    if (result.parentMessageId && selected) {
      try {
        const parentRes = await apiFetch(`/api/channels/${selected.id}/messages?around=${result.parentMessageId}`)
        let parent: ChatMessage | undefined = (parentRes.messages ?? []).find((m: ChatMessage) => m.id === result.parentMessageId)
        if (!parent) {
          parent = {
            id: result.parentMessageId,
            content: '(loading thread parent…)',
            createdAt: result.createdAt,
            sender: { id: '', username: '?', alias: null, avatarUrl: null },
            reactions: [], reads: [], replyCount: 0,
          } as ChatMessage
        }
        setThreadFocusReplyId(result.id)
        openThread(parent)
      } catch (err) {
        console.error('[search] open thread failed:', err)
      }
      resetConvSearch()
      return
    }
    const el = document.getElementById(`msg-${result.id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.background = `${C.accent}22`
      setTimeout(() => { el.style.background = '' }, 2000)
    } else if (selected) {
      // Message not in loaded batch — reload around it
      pendingScrollMsgRef.current = result.id
      loadMessages(selected)
    }
    resetConvSearch()
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
        ...m, reactions: m.reactions ?? [], replyCount: m.replyCount ?? 0, replySenders: m.replySenders ?? [], isPinned: m.isPinned ?? false,
      }))
      flushSync(() => { setMessages(prev => [...older, ...prev]); setHasMore(data.hasMore ?? false) })
      if (container) container.scrollTop = prevScrollTop + (container.scrollHeight - prevScrollHeight)
    } catch { /* offline */ } finally { setLoadingMore(false) }
  }

  const toggleReaction = useCallback(async (msgId: string, emoji: string, isThread = false) => {
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
    setFullEmojiPickerMsgId(null)
  }, [selected, apiFetch, auth.userId, auth.username])

  const togglePin = useCallback(async (msgId: string) => {
    if (!selected) return
    try {
      const res = await apiFetch(`/api/channels/${selected.id}/messages/${msgId}/pin`, { method: 'POST' })
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, isPinned: res.isPinned, pinnedAt: res.pinnedAt, pinnedBy: res.pinnedBy } : m
      ))
    } catch { /* offline */ }
  }, [selected, apiFetch])

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

  const openThread = useCallback(async (msg: ChatMessage) => {
    setThreadParent(msg); setThreadInput('')
    try {
      const data = await apiFetch(`/api/channels/${selected!.id}/messages?parentMessageId=${msg.id}`)
      setThreadMessages((data.messages ?? []).map((m: ChatMessage) => ({ ...m, reactions: m.reactions ?? [], replyCount: m.replyCount ?? 0 })))
    } catch { setThreadMessages([]) }
  }, [selected, apiFetch])

  async function sendThreadReply() {
    if (!threadInput.trim() || !selected || !threadParent || sendingThread) return
    const content = threadInput.trim()
    setSendingThread(true); setThreadInput('')
    try {
      await apiFetch(`/api/channels/${selected.id}/messages`, {
        method: 'POST', body: JSON.stringify({ content, parentMessageId: threadParent.id }),
      })
      // P3-#6 — replyCount + replySenders + threadMessages all refresh via the
      // `channel-message` SSE handler (lines ~767-794). The previous optimistic
      // `+1` here was running BOTH paths and double-counting self-replies.
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
    // Mutex: refuse to enter a DM/group call while a calendar meeting
    // is active (v1.5.2105).
    if (readConferenceLock().inMeeting) {
      useNotificationsStore.getState().show({
        kind: 'warning',
        title: 'Already in a meeting',
        message: 'Leave the calendar meeting before joining a call.',
      })
      return
    }
    try {
      const res = await fetch(`${config.apiBase}/api/calls`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
        body: JSON.stringify({ action: 'conference-join', channelId }),
      })
      const data = await res.json()
      if (!data.ok) return
      setMyConference({ channelId, channelName, participants: data.participants ?? [] })
      if (!channelId.startsWith('vc_')) setSelected(null)
      window.dispatchEvent(new CustomEvent('bundy-vc-joined'))
    } catch {}
  }

  // Listen for global join-conference events (from invite banner in FullDashboard)
  useEffect(() => {
    const onJoin = (e: Event) => {
      const { channelId, channelName } = (e as CustomEvent<{ channelId: string; channelName: string }>).detail
      joinConference(channelId, channelName)
    }
    window.addEventListener('bundy-join-conference', onJoin)
    return () => window.removeEventListener('bundy-join-conference', onJoin)
  }, [config])

  // ─── Voice Channels ────────────────────────────────────────────────────────
  // (fetchVoiceChannels is defined at the top of the component)

  // Load voice channels on mount and ensure personal channels exist
  useEffect(() => {
    apiFetch('/api/voice-channels/ensure-personal', { method: 'POST' })
      .catch(() => {}) // Don't block VC loading if ensure-personal fails
      .then(() => fetchVoiceChannels())
  }, [fetchVoiceChannels]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update voice channel participants when activeConferences changes
  useEffect(() => {
    setVoiceChannels(prev => prev.map(vc => {
      const roomId = `vc_${vc.id}`
      return { ...vc, participants: activeConferences[roomId] ?? [] }
    }))
    // Update VC active timers — set start time for newly active VCs, remove for inactive ones
    setVcActiveTimers(prev => {
      const next = new Map(prev)
      for (const [roomId, participants] of Object.entries(activeConferences)) {
        if (roomId.startsWith('vc_') && participants.length > 0 && !next.has(roomId)) {
          next.set(roomId, Date.now())
        }
      }
      // Remove timers for VCs that are no longer active
      for (const roomId of next.keys()) {
        if (!(roomId in activeConferences) || (activeConferences[roomId]?.length ?? 0) === 0) {
          next.delete(roomId)
        }
      }
      return next
    })
  }, [activeConferences])

  // Adapter wrapper used by <MessageRow> for VC-invite cards. Looks up
  // the VC by id from the current list and forwards to joinVoiceChannel.
  // useRef so the wrapper reference stays stable as joinVoiceChannel
  // closure rebuilds each render (its inner state changes are frequent).
  const joinVoiceChannelRef = useRef<((vc: VoiceChannelInfo) => Promise<void>) | null>(null)
  const onJoinVoiceChannel = useCallback((vcId: string) => {
    const vc = voiceChannels.find(v => v.id === vcId)
    if (vc) void joinVoiceChannelRef.current?.(vc)
  }, [voiceChannels])

  async function joinVoiceChannel(vc: VoiceChannelInfo) {
    // Mutex: refuse to enter a VC while a calendar meeting is active.
    // The user has to leave the meeting first (v1.5.2105).
    if (readConferenceLock().inMeeting) {
      useNotificationsStore.getState().show({
        kind: 'warning',
        title: 'Already in a meeting',
        message: 'Leave the calendar meeting before joining a voice channel.',
      })
      return
    }
    // If already in this VC, just show the call view
    if (myConference?.channelId === `vc_${vc.id}`) {
      setSelected(null); setSelectedVc(null); setShowThreadsView(false); setShowScheduledView(false)
      return
    }
    // If in any call (VC or DM), disconnect first then join new VC directly — no confirmation
    if (myConference) {
      window.dispatchEvent(new CustomEvent('bundy-vc-disconnect'))
      // Force clear state synchronously so we can proceed to join immediately
      flushSync(() => { setMyConference(null); setVcLocalState({ muted: false, deafened: false, screenSharing: false }); setVcPreview(null) })
      // Small delay for WebRTC cleanup
      await new Promise(r => setTimeout(r, 200))
    }
    try {
      const res = await apiFetch('/api/voice-channels', {
        method: 'POST',
        body: JSON.stringify({ action: 'join', voiceChannelId: vc.id }),
      })
      const data = res as { ok: boolean; channelId: string; participants: Array<{ id: string; name: string; avatar: string | null }>; joinSeq?: number }
      if (!data.ok) return
      conferenceJoinedAtRef.current = Date.now()
      setMyConference({ channelId: data.channelId, channelName: vc.name, participants: data.participants ?? [], joinSeq: data.joinSeq })
      window.dispatchEvent(new CustomEvent('bundy-vc-joined'))
    } catch {}
  }
  joinVoiceChannelRef.current = joinVoiceChannel

  async function createVoiceChannel() {
    if (!vcCreateName.trim() || vcSaving) return
    setVcSaving(true)
    try {
      const res = await apiFetch('/api/voice-channels', {
        method: 'POST',
        body: JSON.stringify({ name: vcCreateName.trim() }),
      })
      const data = res as { voiceChannel: VoiceChannelInfo }
      if (data.voiceChannel) {
        setVoiceChannels(prev => [...prev, data.voiceChannel])
        setVcCreateName('')
        setShowVcCreate(false)
      }
    } catch {} finally { setVcSaving(false) }
  }

  async function deleteVoiceChannel(vcId: string) {
    try {
      await fetch(`${config.apiBase}/api/voice-channels?id=${vcId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.token}` },
      })
      setVoiceChannels(prev => prev.filter(vc => vc.id !== vcId))
    } catch {}
    setVcDeleteConfirm(null)
  }

  // VC chat: load messages
  async function loadVcMessages(vcId: string) {
    try {
      const data = await apiFetch(`/api/voice-channels/${vcId}/messages?limit=50`) as { messages: VcMsg[]; hasMore: boolean }
      setVcMessages(data.messages)
      setTimeout(() => vcMsgEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50)
    } catch { setVcMessages([]) }
  }

  // VC chat: send message
  async function sendVcMessage() {
    if (!vcInput.trim() || !selectedVc || vcSending) return
    const content = vcInput.trim()
    setVcSending(true); setVcInput('')
    try {
      await apiFetch(`/api/voice-channels/${selectedVc.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
    } catch {} finally { setVcSending(false) }
  }

  // VC chat: open chat panel only (from icon)
  function openVcChat(vc: VoiceChannelInfo) {
    setSelectedVc(vc)
    setSelected(null)
    setShowThreadsView(false)
    setShowScheduledView(false)
    setVcUnreadCounts(prev => { const next = new Map(prev); next.delete(vc.id); return next })
    loadVcMessages(vc.id)
  }

  // VC chat: listen for real-time messages
  useEffect(() => {
    const onVcMsg = (e: Event) => {
      const msg = (e as CustomEvent<VcMsg & { voiceChannelId: string }>).detail
      if (msg.voiceChannelId === selectedVc?.id) {
        setVcMessages(prev => [...prev, { id: msg.id, content: msg.content, createdAt: msg.createdAt, sender: msg.sender }])
        setTimeout(() => vcMsgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        // Clear unread since user is viewing this VC chat
        setVcUnreadCounts(prev => { const next = new Map(prev); next.delete(selectedVc!.id); return next })
      }
    }
    window.addEventListener('bundy-vc-message', onVcMsg)
    return () => window.removeEventListener('bundy-vc-message', onVcMsg)
  }, [selectedVc?.id])

  // Listen for VC state updates from VoiceChannelView (mute/deafen/screenshare)
  useEffect(() => {
    const onState = (e: Event) => {
      const { muted, deafened, screenSharing } = (e as CustomEvent<{ muted: boolean; deafened: boolean; screenSharing: boolean }>).detail
      setVcLocalState({ muted, deafened, screenSharing })
    }
    window.addEventListener('bundy-vc-state-update', onState)
    return () => window.removeEventListener('bundy-vc-state-update', onState)
  }, [])

  // Listen for active speaker preview stream from useConference
  useEffect(() => {
    const onPreview = (e: Event) => {
      const { stream, name } = (e as CustomEvent<{ stream: MediaStream | null; name: string }>).detail
      if (stream && stream.getVideoTracks().some(t => t.readyState === 'live')) {
        setVcPreview({ stream, name })
      } else {
        setVcPreview(null)
      }
    }
    window.addEventListener('bundy-vc-preview-stream', onPreview)
    return () => window.removeEventListener('bundy-vc-preview-stream', onPreview)
  }, [])

  // Sync preview video element srcObject
  useEffect(() => {
    if (vcPreviewVideoRef.current && vcPreview?.stream) {
      if (vcPreviewVideoRef.current.srcObject !== vcPreview.stream) {
        vcPreviewVideoRef.current.srcObject = vcPreview.stream
        vcPreviewVideoRef.current.play().catch(() => {})
      }
      // Auto-clear preview if all video tracks end
      const tracks = vcPreview.stream.getVideoTracks()
      const onEnded = () => {
        if (vcPreview.stream.getVideoTracks().every(t => t.readyState === 'ended')) {
          setVcPreview(null)
        }
      }
      tracks.forEach(t => t.addEventListener('ended', onEnded))
      return () => { tracks.forEach(t => t.removeEventListener('ended', onEnded)) }
    } else if (vcPreviewVideoRef.current && !vcPreview) {
      vcPreviewVideoRef.current.srcObject = null
    }
  }, [vcPreview])

  // VC join/leave/screen-share system notifications in chat
  useEffect(() => {
    const sysMsg = (content: string) => ({
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      content,
      createdAt: new Date().toISOString(),
      sender: { id: 'system', username: 'System', alias: null, avatarUrl: null },
      system: true,
    })
    const myVcId = () => myConferenceRef.current?.channelId
    const onJoin = (e: Event) => {
      const { channelId: cId, userName } = (e as CustomEvent<{ channelId: string; userId: string; userName: string }>).detail
      if (cId === myVcId()) {
        setVcMessages(prev => [...prev, sysMsg(`${userName} joined the voice channel`)])
        setTimeout(() => vcMsgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
    }
    const onLeave = (e: Event) => {
      const { channelId: cId, userId: uid } = (e as CustomEvent<{ channelId: string; userId: string }>).detail
      if (cId === myVcId()) {
        // Find name from active conference participants
        const name = activeConferences[cId]?.find(p => p.id === uid)?.name ?? uid
        setVcMessages(prev => [...prev, sysMsg(`${name} left the voice channel`)])
        setTimeout(() => vcMsgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
    }
    const onScreenShare = (e: Event) => {
      const { from, channelId: cId, screenSharing: ss } = (e as CustomEvent<{ from: string; channelId: string; screenSharing: boolean }>).detail
      if (cId === myVcId()) {
        const name = activeConferences[cId]?.find(p => p.id === from)?.name ?? from
        setVcMessages(prev => [...prev, sysMsg(ss ? `${name} started screen sharing` : `${name} stopped screen sharing`)])
        setTimeout(() => vcMsgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
    }
    window.addEventListener('bundy-conference-joined', onJoin)
    window.addEventListener('bundy-conference-left', onLeave)
    window.addEventListener('bundy-conference-screen-share', onScreenShare)
    return () => {
      window.removeEventListener('bundy-conference-joined', onJoin)
      window.removeEventListener('bundy-conference-left', onLeave)
      window.removeEventListener('bundy-conference-screen-share', onScreenShare)
    }
  }, [activeConferences])

  // VC invite: load available users
  async function openVcInvite() {
    setVcInviteOpen(true)
    try {
      const data = await apiFetch('/api/users') as { users: UserInfo[] }
      setVcInviteUsers(data.users.filter(u => u.id !== auth.userId))
    } catch { setVcInviteUsers([]) }
  }

  // VC invite: send invite DM
  async function sendVcInvite(targetUserId: string) {
    if (!selectedVc) return
    try {
      await apiFetch('/api/voice-channels/invite', {
        method: 'POST',
        body: JSON.stringify({ voiceChannelId: selectedVc.id, targetUserId }),
      })
    } catch {}
    setVcInviteOpen(false)
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

      {/* ─── Conversations sidebar ──────────────────────────────────────────── */}
      <div style={{
        width: 240, borderRight: `1px solid ${C.separator}`,
        background: 'rgba(22, 22, 22, 0.5)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, borderBottom: `1px solid ${C.separator}` }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: C.sidebarTextActive }}>Messages</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={async () => {
              try {
                await apiFetch('/api/channels/read-all', { method: 'POST', body: JSON.stringify({}) })
                setChannels(prev => prev.map(c => ({ ...c, unread: 0 })))
                setMentionedChannels(new Set())
              } catch (err) { console.error('[messages] mark-all-read failed:', err) }
            }} title="Mark all as read"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sidebarText, padding: 4, borderRadius: 4 }}>
              <CheckCheck size={16} />
            </button>
            <button onClick={() => { if (showSearch) resetSidebarSearch(); else setShowSearch(true) }} title="Search messages"
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
              {searchResults.map(r => {
                const localCh = channels.find(c => c.id === r.channelId)
                const chLabel = localCh ? localCh.name : (r.channel.type === 'channel' ? `#${r.channel.name}` : r.channel.name)
                return (
                <button key={r.id} onClick={() => handleSearchResultClick(r)}
                  style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 16px', border: 'none', textAlign: 'left', background: 'transparent', cursor: 'pointer', borderBottom: `1px solid ${C.separator}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.accent }}>
                      {chLabel}
                    </span>
                    <span style={{ fontSize: 10, color: C.textMuted }}>{formatTime(r.createdAt)}</span>
                  </div>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{r.sender.alias ?? r.sender.username}</span>
                  <span style={{ fontSize: 12, color: C.text, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.content}</span>
                </button>
                )
              })}
            </div>
          ) : (
            <>
              {/* Threads button */}
              <button
                onClick={() => { setShowThreadsView(!showThreadsView); setShowScheduledView(false); if (!showThreadsView) setSelected(null) }}
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

              {/* Scheduled messages button — only shown when there are pending scheduled messages */}
              {(scheduledMessages.length > 0 || showScheduledView) && (
              <button
                onClick={() => {
                  const next = !showScheduledView
                  setShowScheduledView(next)
                  setShowThreadsView(false)
                  if (next) { setSelected(null); loadScheduledMessages() }
                }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 16px', border: 'none', textAlign: 'left', cursor: 'pointer',
                  background: showScheduledView ? 'linear-gradient(90deg, rgba(0,0,255,0.22) 0%, rgba(0,0,255,0.12) 50%, rgba(0,0,255,0.08) 100%)' : 'transparent',
                  boxShadow: showScheduledView ? 'inset 0 0 0 1px rgba(0,0,255,0.16)' : 'none',
                  color: showScheduledView ? C.sidebarTextActive : C.sidebarText,
                  fontSize: 14, fontWeight: showScheduledView ? 600 : 500, borderRadius: 0, transition: 'all 0.15s ease',
                }}
              >
                <Clock size={16} />
                <span style={{ flex: 1 }}>Scheduled</span>
                {scheduledMessages.length > 0 && (
                  <span style={{ minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px', background: C.accent, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {scheduledMessages.length}
                  </span>
                )}
              </button>
              )}

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
                    <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} typingUsers={typingMap[c.id] ?? []} hasActiveCall={!!activeConferences[c.id]} isMentioned={mentionedChannels.has(c.id)} onClick={() => selectConv(c)} onClose={selected?.id === c.id ? () => selectConv(null) : undefined} />
                  ))}
                </>
              )}

              {/* Discussion — task discussions surfaced as channel-like
                  rows. Grouped under a top-level "Discussion" section
                  with each project (InSync / Wahed / etc) as its own
                  collapsible sub-section. Two-way sync with the task
                  drawer via the existing bundy-task-comment-added SSE. */}
              {projectTasks.length > 0 && (() => {
                // Group tasks by project. Tasks without a project go
                // into a synthesized "No project" bucket so they're not
                // hidden from the user.
                const groups = new Map<string, { name: string; color: string | null; tasks: typeof projectTasks }>()
                for (const t of projectTasks) {
                  const key = t.project?.id ?? '__none'
                  const name = t.project?.name ?? 'No project'
                  const color = t.project?.color ?? null
                  if (!groups.has(key)) groups.set(key, { name, color, tasks: [] })
                  groups.get(key)!.tasks.push(t)
                }
                const sortedGroups = Array.from(groups.entries())
                  .sort(([, a], [, b]) => a.name.localeCompare(b.name))
                return (
                  <>
                    <div
                      onMouseEnter={() => setHoveredSection('discussion')}
                      onMouseLeave={() => setHoveredSection(null)}
                      style={{ padding: '12px 16px 4px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                    >
                      <ChevronDown size={12} color={C.sidebarText} style={{ transition: 'transform 0.15s ease', transform: collapsedSections.discussion ? 'rotate(-90deg)' : 'rotate(0deg)' }} onClick={() => toggleSection('discussion')} />
                      <span onClick={() => toggleSection('discussion')} style={{ fontSize: 14, fontWeight: 600, color: C.sidebarText, flex: 1 }}>Discussion</span>
                    </div>
                    {!collapsedSections.discussion && sortedGroups.map(([key, group]) => {
                      const groupKey = `discussion:${key}`
                      const isCollapsed = !!collapsedSections[groupKey]
                      const groupCount = group.tasks.reduce((n, t) => n + t.commentCount, 0)
                      return (
                        <div key={key}>
                          <div
                            onClick={() => toggleSection(groupKey)}
                            style={{ padding: '4px 24px 4px 28px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                          >
                            <ChevronDown size={10} color={C.sidebarText}
                              style={{ transition: 'transform 0.15s ease', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', opacity: 0.7 }} />
                            {group.color && (
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: group.color, flexShrink: 0 }} />
                            )}
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.sidebarText, opacity: 0.85, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {group.name}
                            </span>
                            <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 500 }}>{group.tasks.length}</span>
                          </div>
                          {!isCollapsed && group.tasks.map(t => {
                            // Each task has a 1:1 backing Channel
                            // (type="task") so the discussion inherits
                            // the channel pipeline. Click selects that
                            // channel — same UX as a group chat.
                            const taskChannel = channels.find(c => (c as Conversation & { taskId?: string | null }).taskId === t.id)
                            const isActive = taskChannel ? selected?.id === taskChannel.id : false
                            return (
                              <button key={t.id}
                                onClick={() => {
                                  setSelectedVc(null)
                                  setShowThreadsView(false)
                                  setShowScheduledView(false)
                                  setSelectedTaskId(null)
                                  if (taskChannel) {
                                    selectConv(taskChannel)
                                  } else {
                                    // No channel yet — fall back to opening the task drawer.
                                    window.dispatchEvent(new CustomEvent('bundy-open-task', { detail: { taskId: t.id, focusDiscussion: true } }))
                                  }
                                }}
                                title={t.title}
                                style={{
                                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '5px 16px 5px 36px', border: 'none', cursor: 'pointer',
                                  background: isActive ? C.sidebarActive ?? `${C.accent}1a` : 'transparent',
                                  textAlign: 'left', fontFamily: 'inherit',
                                }}
                                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = C.sidebarHover }}
                                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                                <div style={{
                                  width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                                  background: group.color ? `${group.color}33` : `${C.accent}22`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: group.color ?? C.accent,
                                }}>
                                  <MessageCircle size={11} />
                                </div>
                                {/* #4 — unread count comes from the
                                    channel itself (server-tracked,
                                    decreases when read) instead of the
                                    forever-on commentCount. Falls back
                                    to the in-memory counter if the
                                    channel isn't in state yet. */}
                                {(() => {
                                  const unread = (taskChannel?.unread ?? 0) + (unreadByTask[t.id] ?? 0)
                                  return (
                                    <>
                                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.sidebarText, fontWeight: unread > 0 ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {t.title}
                                      </span>
                                      {unread > 0 && (
                                        <span style={{
                                          background: C.danger ?? '#ef4444', color: '#fff',
                                          borderRadius: 10, fontSize: 10, padding: '1px 6px',
                                          fontWeight: 700, minWidth: 18, textAlign: 'center',
                                        }}>
                                          {unread > 99 ? '99+' : unread}
                                        </span>
                                      )}
                                    </>
                                  )
                                })()}
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}
                  </>
                )
              })()}

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
                    <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} typingUsers={typingMap[c.id] ?? []} hasActiveCall={!!activeConferences[c.id]} isMentioned={mentionedChannels.has(c.id)} onClick={() => selectConv(c)} onClose={selected?.id === c.id ? () => selectConv(null) : undefined} />
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
                    const dmHasConference = !!activeConferences[c.id]
                    // Check if partner is in a VC (voice channel) — key starts with "vc_"
                    const partnerVcEntry = partnerId ? Object.entries(activeConferences).find(([key, ps]) => key.startsWith('vc_') && ps.some(p => p.id === partnerId)) : undefined
                    const partnerInVc = partnerVcEntry ? (voiceChannels.find(vc => `vc_${vc.id}` === partnerVcEntry[0])?.name ?? 'Voice Channel') : null
                    const partnerVc = partnerVcEntry ? voiceChannels.find(vc => `vc_${vc.id}` === partnerVcEntry[0]) : undefined
                    // Detect partner in a calendar meeting (LiveKit room
                    // id `meeting_<eventId>`). The conferences map already
                    // tracks this — we just look for any meeting_* room
                    // that has this partner in it. (v1.5.2105)
                    const partnerInMeeting = !!(partnerId && Object.entries(activeConferences).some(
                      ([key, ps]) => key.startsWith('meeting_') && ps.some(p => p.id === partnerId)
                    ))
                    return (
                      <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} typingUsers={typingMap[c.id] ?? []} hasActiveCall={partnerInCall || dmHasConference} partnerInVc={partnerInVc} onJoinVc={partnerVc ? () => joinVoiceChannel(partnerVc) : undefined} partnerInMeeting={partnerInMeeting} isMentioned={mentionedChannels.has(c.id)} onClick={() => selectConv(c)} onClose={selected?.id === c.id ? () => selectConv(null) : undefined} getPresence={getPresence} getTrackerStatus={getTrackerStatus} />
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

              {/* ─── Voice Channels ───────────────────────────────────────── */}
              <div
                onMouseEnter={() => setHoveredSection('voice')}
                onMouseLeave={() => setHoveredSection(null)}
                style={{ padding: '12px 16px 4px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <ChevronDown size={12} color={C.sidebarText} style={{ transition: 'transform 0.15s ease', transform: collapsedSections.voice ? 'rotate(-90deg)' : 'rotate(0deg)' }} onClick={() => toggleSection('voice')} />
                <span onClick={() => toggleSection('voice')} style={{ fontSize: 14, fontWeight: 600, color: C.sidebarText, flex: 1 }}>Voice Channels</span>
                {auth.role === 'admin' && (
                  <button onClick={e => { e.stopPropagation(); setShowVcCreate(prev => !prev) }} title="Create voice channel"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sidebarText, padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', opacity: hoveredSection === 'voice' ? 1 : 0, transition: 'opacity 0.15s ease' }}>
                    <Plus size={14} />
                  </button>
                )}
              </div>

              {!collapsedSections.voice && (
                <>
                  {/* Create voice channel input */}
                  {showVcCreate && (
                    <div style={{ padding: '4px 16px 8px', display: 'flex', gap: 4 }}>
                      <input
                        value={vcCreateName}
                        onChange={e => setVcCreateName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') createVoiceChannel(); if (e.key === 'Escape') { setShowVcCreate(false); setVcCreateName('') } }}
                        placeholder="Channel name..."
                        autoFocus
                        style={{ flex: 1, background: C.inputBg, border: `1px solid ${C.separator}`, borderRadius: 4, padding: '4px 8px', fontSize: 12, color: C.text, outline: 'none' }}
                      />
                      <button onClick={createVoiceChannel} style={{ background: C.accent, border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 8px', cursor: 'pointer' }}>Add</button>
                    </div>
                  )}

                  {voiceChannels.map(vc => {
                    const isInThisVc = myConference?.channelId === `vc_${vc.id}`
                    const hasParticipants = vc.participants.length > 0
                    const isVcSelected = selectedVc?.id === vc.id
                    const isHovered = hoveredVcId === vc.id
                    const roomId = `vc_${vc.id}`
                    const activeStart = vcActiveTimers.get(roomId)
                    const activeDurationSec = hasParticipants && activeStart ? Math.floor((Date.now() - activeStart) / 1000) : 0
                    const activeHH = String(Math.floor(activeDurationSec / 3600)).padStart(2, '0')
                    const activeMM = String(Math.floor((activeDurationSec % 3600) / 60)).padStart(2, '0')
                    const activeSS = String(activeDurationSec % 60).padStart(2, '0')
                    const activeDurationStr = `${activeHH}:${activeMM}:${activeSS}`
                    return (
                      <div key={vc.id}>
                        {/* Voice channel row */}
                        <div
                          onClick={() => joinVoiceChannel(vc)}
                          onContextMenu={e => { e.preventDefault() }}
                          onMouseEnter={e => { setHoveredVcId(vc.id); if (!isVcSelected) e.currentTarget.style.background = C.bgHover }}
                          onMouseLeave={e => { setHoveredVcId(null); e.currentTarget.style.background = isVcSelected ? `${C.accent}18` : isInThisVc ? `${C.success}14` : 'transparent' }}
                          style={{
                            padding: '5px 16px', display: 'flex', alignItems: 'center', gap: 8,
                            cursor: 'pointer',
                            background: isVcSelected ? `${C.accent}18` : isInThisVc ? `${C.success}14` : 'transparent',
                            transition: 'background 0.1s',
                          }}
                        >
                          <Volume2 size={16} color={hasParticipants ? C.success : C.sidebarText} style={{ flexShrink: 0, opacity: hasParticipants ? 1 : 0.6 }} />
                          <span style={{ flex: 1, fontSize: 13, color: hasParticipants ? C.sidebarTextActive : C.sidebarText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {vc.name}
                          </span>
                          {/* Chat icon — visible on hover or when unread */}
                          {(() => {
                            const unread = vcUnreadCounts.get(vc.id) ?? 0
                            return (
                              <button
                                onClick={e => { e.stopPropagation(); openVcChat(vc) }}
                                title="Open chat"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: unread > 0 ? C.text : C.sidebarText, padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3, opacity: isHovered || unread > 0 ? 0.9 : 0, transition: 'opacity 0.15s', position: 'relative' }}
                              >
                                <MessageSquare size={12} />
                                {unread > 0 && (
                                  <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: '#ed4245', borderRadius: 6, minWidth: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>
                                    {unread > 99 ? '99+' : unread}
                                  </span>
                                )}
                              </button>
                            )
                          })()}
                          {hasParticipants && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              {activeDurationSec > 0 && (
                                <span style={{ fontSize: 9, color: C.textMuted }}>{activeDurationStr}</span>
                              )}
                            </span>
                          )}
                          {!vc.isPersonal && auth.role === 'admin' && (
                            <button
                              onClick={e => { e.stopPropagation(); setVcDeleteConfirm({ id: vc.id, name: vc.name }) }}
                              title="Delete channel"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', opacity: isHovered ? 0.5 : 0, transition: 'opacity 0.15s' }}
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>

                        {/* Participants inside the voice channel */}
                        {hasParticipants && vc.participants.map(p => {
                          const userState = vcUserStates.get(`${roomId}:${p.id}`)
                          const isMuted = userState?.muted ?? false
                          const isDeafened = userState?.deafened ?? false
                          return (
                            <div key={p.id} style={{ padding: '3px 16px 3px 40px', display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Avatar url={p.avatar} name={p.name} size={20} />
                              <span style={{ flex: 1, fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.name}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                                {isMuted && <MicOff size={10} color="#f87171" />}
                                {isDeafened && (
                                  <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 11L3 18a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                                    <path d="M21 11v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h2" />
                                    <path d="M12 5a9 9 0 0 0-9 9" /><path d="M12 5a9 9 0 0 1 9 9" />
                                    <line x1="2" y1="2" x2="22" y2="22" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </>
              )}
            </>
          )}
        </div>

        {/* Bottom-of-sidebar floating call control bar — see FloatingCallBar.tsx.
            The video preview only shows when the user is NOT currently viewing
            the call room itself; we gate that here by passing a possibly-null
            preview. */}
        <FloatingCallBar
          myConference={myConference}
          vcLocalState={vcLocalState}
          vcPreview={(selected || selectedVc || showThreadsView || showScheduledView) ? vcPreview : null}
          vcPreviewVideoRef={vcPreviewVideoRef}
          onShowCall={() => { setSelected(null); setSelectedVc(null); setShowThreadsView(false); setShowScheduledView(false) }}
        />
      </div>

      {/* ─── VoiceChannelView (always mounted when in call, hidden when navigating) ─── */}
      {myConference && (
        <div style={{
          flex: 1, display: (showThreadsView || showScheduledView || selectedVc || selected) ? 'none' : 'flex',
          flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden',
        }}>
          <VoiceChannelView
            config={config} auth={{ ...auth, avatarUrl: myAvatarUrl }}
            channelId={myConference.channelId}
            channelName={myConference.channelName}
            initialParticipants={myConference.participants}
            joinSeq={myConference.joinSeq}
            onLeave={() => { setMyConference(null); setVcLocalState({ muted: false, deafened: false, screenSharing: false }); setVcPreview(null) }}
            mode={myConference.channelId.startsWith('vc_') ? 'vc' : 'call'}
          />
        </div>
      )}

      {/* ─── Right panel content ──────────────────────────────────────────── */}
      {showThreadsView ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', background: C.contentBg }}>
          <div style={{ borderBottom: `1px solid ${C.separator}`, background: C.lgBg, flexShrink: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <MessageCircle size={18} color={C.text} />
            <span style={{ fontWeight: 700, fontSize: 15, color: C.text, flex: 1 }}>Threads</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {threadActivities.map((thread, i) => {
              const senderName = thread.parentMessage.sender.alias ?? thread.parentMessage.sender.username
              // Resolve friendly channel name for DMs from loaded channels
              let displayChannelName = thread.channelName
              if (thread.channelType === 'dm') {
                const ch = channels.find(c => c.id === thread.channelId)
                if (ch) displayChannelName = ch.name
              }
              const replies = thread.recentReplies ?? [{ content: thread.lastReply.content, createdAt: thread.lastReply.createdAt, sender: thread.lastReply.sender }]
              return (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  senderName={senderName}
                  displayChannelName={displayChannelName}
                  replies={replies}
                  config={config}
                  apiFetch={apiFetch}
                  onOpenThread={() => {
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
                  onReplySent={(newReply) => {
                    setThreadActivities(prev => prev.map(t => t.id === thread.id ? {
                      ...t,
                      replyCount: t.replyCount + 1,
                      lastReply: newReply,
                      recentReplies: [...(t.recentReplies ?? []), newReply].slice(-3),
                    } : t))
                  }}
                />
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

      ) : showScheduledView ? (
        /* ─── Scheduled Messages View ──────────────────────────────────────── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', background: C.contentBg }}>
          {/* Header */}
          <div style={{ borderBottom: `1px solid ${C.separator}`, background: C.lgBg, flexShrink: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Clock size={18} color={C.text} />
            <span style={{ fontWeight: 700, fontSize: 15, color: C.text, flex: 1 }}>Scheduled Messages</span>
            {scheduledMessages.length > 0 && (
              <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>
                {scheduledMessages.length} message{scheduledMessages.length !== 1 ? 's' : ''}
              </span>
            )}
            <button onClick={loadScheduledMessages} title="Refresh" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'color 0.15s ease' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.textMuted)}
            >
              <Loader size={14} style={{ animation: loadingScheduled ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {loadingScheduled && scheduledMessages.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
                <Loader size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12, opacity: 0.5 }} /><br />
                Loading scheduled messages…
              </div>
            ) : scheduledMessages.length === 0 ? (
              <div style={{ padding: '60px 24px', textAlign: 'center', color: C.textMuted }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(88,101,242,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Calendar size={28} strokeWidth={1.5} color={C.accent} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>No scheduled messages</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
                  Click the arrow next to the send button to schedule a message for later.
                </div>
              </div>
            ) : (() => {
              // Group messages by date
              const now = new Date()
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
              const tomorrow = new Date(today.getTime() + 86400000)
              const dayAfter = new Date(today.getTime() + 86400000 * 2)

              const groups: { label: string; msgs: typeof scheduledMessages }[] = []
              const todayMsgs = scheduledMessages.filter(m => { const d = new Date(m.scheduledAt); return d >= today && d < tomorrow })
              const tomorrowMsgs = scheduledMessages.filter(m => { const d = new Date(m.scheduledAt); return d >= tomorrow && d < dayAfter })
              const laterMsgs = scheduledMessages.filter(m => new Date(m.scheduledAt) >= dayAfter)
              const pastMsgs = scheduledMessages.filter(m => new Date(m.scheduledAt) < today)
              if (pastMsgs.length) groups.push({ label: 'Overdue', msgs: pastMsgs })
              if (todayMsgs.length) groups.push({ label: 'Today', msgs: todayMsgs })
              if (tomorrowMsgs.length) groups.push({ label: 'Tomorrow', msgs: tomorrowMsgs })
              if (laterMsgs.length) groups.push({ label: 'Upcoming', msgs: laterMsgs })

              return groups.map(group => (
                <div key={group.label}>
                  <div style={{ padding: '12px 16px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: group.label === 'Overdue' ? C.warning : C.textMuted }}>
                    {group.label}
                  </div>
                  {group.msgs.map(msg => {
                    const scheduledDate = new Date(msg.scheduledAt)
                    const diff = scheduledDate.getTime() - now.getTime()
                    const isOverdue = diff < 0
                    // Resolve channel display name
                    let channelLabel = msg.channelDisplayName || msg.channel.name
                    const isChannel = msg.channel.type === 'channel'
                    const isDm = msg.channel.type === 'dm'
                    // Try resolving from loaded channels for DMs
                    if (isDm) {
                      const ch = channels.find(c => c.id === msg.channelId)
                      if (ch) channelLabel = ch.name
                    }
                    if (isChannel) channelLabel = `#${channelLabel}`

                    // Relative time
                    const absMins = Math.abs(Math.floor(diff / 60000))
                    const absHours = Math.floor(absMins / 60)
                    let relativeTime = ''
                    if (isOverdue) {
                      relativeTime = absMins < 60 ? `${absMins}m overdue` : absHours < 24 ? `${absHours}h overdue` : `${Math.floor(absHours / 24)}d overdue`
                    } else {
                      relativeTime = absMins < 60 ? `in ${absMins}m` : absHours < 24 ? `in ${absHours}h` : `in ${Math.floor(absHours / 24)}d`
                    }

                    return (
                      <div key={msg.id} style={{
                        margin: '4px 8px', padding: '12px 14px', borderRadius: 10,
                        background: C.bgInput,
                        border: isOverdue ? `1px solid rgba(255,180,50,0.25)` : `1px solid ${C.separator}`,
                        display: 'flex', flexDirection: 'column', gap: 10,
                        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(88,101,242,0.15)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = isOverdue ? 'rgba(255,180,50,0.25)' : C.separator; e.currentTarget.style.boxShadow = 'none' }}
                      >
                        {/* Channel + relative time */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                            {isDm ? (() => {
                              const partnerAvatar = msg.partnerAvatarUrl
                                || msg.channel.members?.find(m => m.user.username !== auth.username)?.user.avatarUrl
                                || channels.find(c => c.id === msg.channelId)?.avatar
                              return <Avatar url={partnerAvatar ?? null} name={channelLabel} size={20} radius="6px" />
                            })() : (
                              <Hash size={14} color={C.textMuted} style={{ flexShrink: 0 }} />
                            )}
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {channelLabel}
                            </span>
                          </div>
                          <span style={{
                            fontSize: 11, fontWeight: 600, flexShrink: 0,
                            color: isOverdue ? C.warning : diff < 3600000 ? C.success : C.textMuted,
                            background: isOverdue ? 'rgba(255,180,50,0.1)' : diff < 3600000 ? 'rgba(35,165,90,0.1)' : 'transparent',
                            padding: isOverdue || diff < 3600000 ? '2px 8px' : '0',
                            borderRadius: 6,
                          }}>
                            {relativeTime}
                          </span>
                        </div>

                        {/* Message content */}
                        {editingScheduledId === msg.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <textarea
                              value={editingScheduledContent}
                              onChange={e => setEditingScheduledContent(e.target.value)}
                              autoFocus
                              rows={3}
                              style={{
                                width: '100%', resize: 'vertical', padding: '8px 10px',
                                borderRadius: 6, border: `1px solid ${C.accent}`, background: C.bgInput,
                                color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
                                lineHeight: 1.5,
                              }}
                            />
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button onClick={() => setEditingScheduledId(null)}
                                style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${C.separator}`, background: 'transparent', color: C.text, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                              >Cancel</button>
                              <button
                                onClick={async () => {
                                  try {
                                    await apiFetch(`/api/scheduled-messages/${msg.id}`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ content: editingScheduledContent }),
                                    })
                                    setScheduledMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: editingScheduledContent } : m))
                                    setEditingScheduledId(null)
                                  } catch (e) { console.error('Failed to edit', e) }
                                }}
                                disabled={!editingScheduledContent.trim()}
                                style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: editingScheduledContent.trim() ? 1 : 0.5 }}
                              >Save</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: C.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5, maxHeight: 80, overflow: 'hidden', position: 'relative' }}>
                            {msg.content || <span style={{ color: C.textMuted, fontStyle: 'italic' }}>No text content</span>}
                            {msg.content && msg.content.length > 150 && (
                              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 28, background: `linear-gradient(transparent, ${C.bgInput})` }} />
                            )}
                          </div>
                        )}

                        {/* Attachment indicator */}
                        {(msg.attachmentCount ?? 0) > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.textMuted }}>
                            <Paperclip size={12} />
                            <span>{msg.attachmentCount} attachment{msg.attachmentCount !== 1 ? 's' : ''}</span>
                          </div>
                        )}

                        {/* Schedule time + actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Clock size={12} color={isOverdue ? C.warning : C.textMuted} />
                          <span style={{ fontSize: 11, color: isOverdue ? C.warning : C.textMuted, flex: 1 }}>
                            {scheduledDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at {scheduledDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <div style={{ display: 'flex', gap: 2 }}>
                            {/* Edit */}
                            <button
                              title="Edit message"
                              onClick={() => { setEditingScheduledId(msg.id); setEditingScheduledContent(msg.content) }}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
                                borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4,
                                color: C.textMuted, fontSize: 11, fontWeight: 500,
                                transition: 'background 0.15s ease, color 0.15s ease',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = C.textMuted }}
                            >
                              <Edit2 size={11} />
                              <span>Edit</span>
                            </button>
                            {/* Send now */}
                            <button
                              title="Send now"
                              onClick={async () => {
                                try {
                                  await apiFetch(`/api/scheduled-messages/${msg.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ action: 'send-now' }),
                                  })
                                  setScheduledMessages(prev => prev.filter(m => m.id !== msg.id))
                                } catch (e) { console.error('Failed to send now', e) }
                              }}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
                                borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4,
                                color: C.accent, fontSize: 11, fontWeight: 600,
                                transition: 'background 0.15s ease',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(88,101,242,0.1)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            >
                              <Send size={12} />
                              <span>Send now</span>
                            </button>
                            {/* Open channel */}
                            <button
                              title="Open channel"
                              onClick={() => {
                                setShowScheduledView(false)
                                const ch = channels.find(c => c.id === msg.channelId)
                                if (ch) selectConv(ch)
                              }}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
                                borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4,
                                color: C.textMuted, fontSize: 11, fontWeight: 500,
                                transition: 'background 0.15s ease, color 0.15s ease',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = C.textMuted }}
                            >
                              <ExternalLink size={11} />
                              <span>Open</span>
                            </button>
                            {/* Delete */}
                            <button
                              title="Cancel scheduled message"
                              onClick={async () => {
                                if (!confirm('Cancel this scheduled message? It will be deleted.')) return
                                try {
                                  await apiFetch(`/api/scheduled-messages/${msg.id}`, { method: 'DELETE' })
                                  setScheduledMessages(prev => prev.filter(m => m.id !== msg.id))
                                } catch (e) { console.error('Failed to cancel', e) }
                              }}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
                                borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4,
                                color: C.textMuted, fontSize: 11, fontWeight: 500,
                                transition: 'background 0.15s ease, color 0.15s ease',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(237,66,69,0.1)'; e.currentTarget.style.color = C.danger }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = C.textMuted }}
                            >
                              <Trash2 size={11} />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))
            })()}
          </div>
        </div>

      ) : selectedVc ? (
        /* ─── Voice Channel Chat ───────────────────────────────────────────── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', background: C.contentBg }}>
          {/* Header */}
          <div style={{ borderBottom: `1px solid ${C.separator}`, background: C.lgBg, flexShrink: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Volume2 size={18} color={C.accent} />
            <span style={{ fontWeight: 700, fontSize: 15, color: C.text, flex: 1 }}>{selectedVc.name}</span>
            {/* Invite button */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => vcInviteOpen ? setVcInviteOpen(false) : openVcInvite()}
                title="Invite user"
                style={{ background: 'none', border: `1px solid ${C.separator}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: C.text, fontSize: 12 }}
              >
                <Users size={13} /> Invite
              </button>
              {vcInviteOpen && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: C.cardBg, border: `1px solid ${C.separator}`, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', width: 240, maxHeight: 280, overflowY: 'auto', zIndex: 100 }}>
                  <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.separator}`, fontSize: 12, fontWeight: 600, color: C.textMuted }}>Send invite to...</div>
                  {vcInviteUsers.length === 0 && (
                    <div style={{ padding: '16px 12px', textAlign: 'center', color: C.textMuted, fontSize: 12 }}>
                      <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                  )}
                  {vcInviteUsers.map(u => (
                    <div
                      key={u.id}
                      onClick={() => sendVcInvite(u.id)}
                      style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Avatar url={u.avatarUrl ?? null} name={u.alias ?? u.username} size={28} />
                      <span style={{ fontSize: 13, color: C.text }}>{u.alias ?? u.username}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {(() => {
              const isInThisVc = myConference?.channelId === `vc_${selectedVc.id}`
              return isInThisVc ? (
                <span style={{ fontSize: 12, color: C.success, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Volume2 size={13} /> Connected
                </span>
              ) : (
                <button
                  onClick={() => { if (!myConference) joinVoiceChannel(selectedVc) }}
                  disabled={!!myConference}
                  style={{
                    background: C.success, border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600,
                    padding: '6px 14px', cursor: myConference ? 'not-allowed' : 'pointer',
                    opacity: myConference ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <Phone size={13} /> Join Voice
                </button>
              )
            })()}
          </div>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {vcMessages.length === 0 && (
              <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, padding: '40px 0' }}>
                No messages yet. Start the conversation!
              </div>
            )}
            {vcMessages.map((msg, i) => {
              const prevMsg = vcMessages[i - 1]
              const timeDiff = prevMsg ? new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() : Infinity
              const showHeader = !prevMsg || prevMsg.sender.id !== msg.sender.id || timeDiff > 5 * 60 * 1000
              // Date separator
              const msgDate = new Date(msg.createdAt).toDateString()
              const prevDate = prevMsg ? new Date(prevMsg.createdAt).toDateString() : ''
              const showDateSep = msgDate !== prevDate
              const senderName = msg.sender.alias ?? msg.sender.username

              // System messages (join/leave/screen share)
              if (msg.system) {
                return (
                  <React.Fragment key={msg.id}>
                    {showDateSep && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 8px', paddingLeft: 48 }}>
                        <div style={{ flex: 1, height: 1, background: C.separator }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted }}>{new Date(msg.createdAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                        <div style={{ flex: 1, height: 1, background: C.separator }} />
                      </div>
                    )}
                    <div style={{ textAlign: 'center', padding: '4px 0', fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>
                      {msg.content}
                      <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </React.Fragment>
                )
              }

              return (
                <React.Fragment key={msg.id}>
                  {showDateSep && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 8px', paddingLeft: 48 }}>
                      <div style={{ flex: 1, height: 1, background: C.separator }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted }}>{new Date(msg.createdAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                      <div style={{ flex: 1, height: 1, background: C.separator }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, marginTop: showHeader ? 12 : 1, paddingLeft: showHeader ? 0 : 48 }}>
                    {showHeader && (
                      <div style={{ width: 36, height: 36, flexShrink: 0 }}>
                        <Avatar url={msg.sender.avatarUrl} name={senderName} size={36} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {showHeader && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{senderName}</span>
                          <span style={{ fontSize: 11, color: C.textMuted }}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      )}
                      <div style={{ fontSize: 14, color: C.text, lineHeight: 1.45, wordBreak: 'break-word' }}>{renderMessageContent(msg.content, false, usersMap)}</div>
                    </div>
                  </div>
                </React.Fragment>
              )
            })}
            <div ref={vcMsgEndRef} />
          </div>
          {/* Message input */}
          <MessageInput
            placeholder={`Message #${selectedVc.name}…`}
            config={config}
            channelId={`vc_${selectedVc.id}`}
            onTyping={() => {}}
            input={vcInput}
            setInput={setVcInput}
            sendFn={sendVcMessage}
            sending={vcSending}
          />
        </div>

      ) : selectedTaskId ? (
        /* ─── Task discussion mirror (Projects sidebar entry) ─────────────── */
        <TaskDiscussionChannel
          taskId={selectedTaskId}
          config={config}
          auth={auth}
          onClose={() => setSelectedTaskId(null)}
          onOpenInDrawer={() => {
            window.dispatchEvent(new CustomEvent('bundy-open-task', { detail: { taskId: selectedTaskId, focusDiscussion: true } }))
          }}
        />
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
                ) : selected.type === 'task' ? (
                  <MessageCircle size={18} color={C.accent} />
                ) : (
                  <Users size={18} color={C.textMuted} />
                )}
                {selected.type === 'dm' ? (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selected.name}
                      </span>
                      {selected.partnerId && (() => {
                        const ts = getTrackerStatus(selected.partnerId)
                        const label = ts === 'CHECK_IN' || ts === 'BACK' ? 'In' : ts === 'BREAK' ? 'Break' : ts === 'CLOCK_OUT' ? 'Out' : null
                        const color = ts === 'CHECK_IN' || ts === 'BACK' ? C.success : ts === 'BREAK' ? C.warning : ts === 'CLOCK_OUT' ? C.textMuted : null
                        return label ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: color!, padding: '1px 6px', borderRadius: 3, background: `${color!}20`, flexShrink: 0, lineHeight: '16px', letterSpacing: 0.3 }}>{label}</span>
                        ) : null
                      })()}
                    </div>
                    {partnerActivity?.app && (
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Active on <span style={{ color: C.textSecondary }}>{partnerActivity.app}</span>
                        {partnerActivity.url && <>{' · '}<span style={{ color: C.textSecondary }}>{partnerActivity.url}</span></>}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <span style={{ fontWeight: 700, fontSize: 15, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selected.name}
                    </span>
                    {selected.members.length > 0 && (
                      <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{selected.members.length} members</span>
                    )}
                  </>
                )}
              </div>

              {/* Action icons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                {/* #2 — Open task button for task discussions, replacing
                    the call button (you can't call into a task). */}
                {selected.type === 'task' && selected.taskId && (
                  <button onClick={() => window.dispatchEvent(new CustomEvent('bundy-open-task', { detail: { taskId: selected.taskId } }))}
                    title="Open task"
                    style={{ height: 32, display: 'flex', alignItems: 'center', background: 'none', border: `1px solid ${C.separator}`, cursor: 'pointer', color: C.textMuted, padding: '0 12px', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }}>
                    Open task
                  </button>
                )}
                {/* #3 — call button only for DMs / groups / channels. */}
                {selected.type !== 'task' && (() => {
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

                {/* #6 — pin button removed from the top-right action row;
                    the Pins tab below already covers it. */}
                <button onClick={() => { if (showConvSearch) resetConvSearch(); else setShowConvSearch(true) }} title="Search in conversation"
                  style={{ width: 32, height: 32, borderRadius: 6, background: 'none', border: `1px solid ${C.separator}`, cursor: 'pointer', color: showConvSearch ? C.accent : C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Search size={15} />
                </button>
                {/* Settings hidden on task channels — members are
                    auto-synced from task assignees / collaborators
                    / commenters; the "Open task" button above gives
                    you the actual control surface. */}
                {selected.type !== 'dm' && selected.type !== 'task' && (
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

          {/* In-conversation search bar */}
          {showConvSearch && (
            <div style={{ padding: '8px 16px', borderBottom: `1px solid ${C.separator}`, background: C.lgBg, flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <input
                  value={convSearchQuery}
                  onChange={e => handleConvSearchInput(e.target.value)}
                  placeholder="Search in this conversation…"
                  autoFocus
                  style={{ width: '100%', padding: '7px 32px 7px 10px', fontSize: 12, border: `1px solid ${C.separator}`, borderRadius: 8, outline: 'none', background: C.inputBg, color: C.text }}
                />
                <button onClick={() => { resetConvSearch() }}
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2, display: 'flex', alignItems: 'center' }}>
                  <X size={14} />
                </button>
              </div>
              {convSearchQuery.trim().length >= 2 && (
                <div style={{ marginTop: 6, maxHeight: 240, overflowY: 'auto', borderRadius: 6, border: `1px solid ${C.separator}`, background: C.contentBg }}>
                  {convSearching && (
                    <div style={{ padding: '10px 12px', color: C.textMuted, fontSize: 12, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Loader size={12} /> Searching…
                    </div>
                  )}
                  {!convSearching && convSearchResults.length === 0 && (
                    <div style={{ padding: '10px 12px', color: C.textMuted, fontSize: 12, textAlign: 'center' }}>No messages found</div>
                  )}
                  {convSearchResults.map(r => (
                    <button key={r.id} onClick={() => handleConvSearchResultClick(r)}
                      style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px', border: 'none', textAlign: 'left', background: 'transparent', cursor: 'pointer', borderBottom: `1px solid ${C.separator}` }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{r.sender.alias ?? r.sender.username}</span>
                        <span style={{ fontSize: 10, color: C.textMuted }}>{formatTime(r.createdAt)}</span>
                      </div>
                      <span style={{ fontSize: 12, color: C.textMuted, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.content}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Call in progress banner */}
          {activeConferences[selected.id] && myConference?.channelId !== selected.id && (() => {
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

          {/* Messages area — full-screen takeover for thread / pinned / files
              (P3-#7 v2 + P3-#8). When any of those is active, the entire
              main pane becomes that view; back-arrow returns to messages. */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          {threadParent ? (
            <ThreadView
              config={config}
              auth={auth}
              channelId={selected!.id}
              parent={threadParent}
              replies={threadMessages}
              replyCount={Math.max(threadParent.replyCount ?? 0, threadMessages.length)}
              loading={false}
              threadInput={threadInput}
              setThreadInput={setThreadInput}
              sendReply={sendThreadReply}
              sendingReply={sendingThread}
              groupReactions={groupReactions}
              toggleReaction={toggleReaction}
              usersMap={usersMap}
              onClose={() => { setThreadParent(null); setThreadMessages([]); setThreadFocusReplyId(null) }}
              onScheduled={loadScheduledMessages}
              focusReplyId={threadFocusReplyId}
            />
          ) : showPinned ? (
            <PinnedView
              pinnedMessages={pinnedMessages}
              onClose={() => setShowPinned(false)}
              usersMap={usersMap}
              onJump={(messageId) => {
                setShowPinned(false)
                pendingScrollMsgRef.current = messageId
                if (selected) loadMessages(selected)
              }}
            />
          ) : showSharedMedia ? (
            <SharedMediaView
              config={config}
              sharedMedia={sharedMedia}
              sharedMediaTab={sharedMediaTab}
              setSharedMediaTab={setSharedMediaTab}
              loadingSharedMedia={loadingSharedMedia}
              onClose={() => setShowSharedMedia(false)}
              onOpenFile={(url, filename) => setLightbox({ url, filename })}
            />
          ) : (
            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div ref={messagesScrollRef} onScroll={handleMessagesScroll} style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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

              {messages.map((msg, i) => (
                <MessageRow
                  key={msg.id}
                  msg={msg}
                  prevMsg={messages[i - 1] ?? null}
                  config={config}
                  auth={auth}
                  selected={selected}
                  usersMap={usersMap}
                  isEditing={editingMsgId === msg.id}
                  editingContent={editingContent}
                  isHovered={hoveredMsgId === msg.id}
                  showQuickEmojiPicker={emojiPickerMsgId === msg.id}
                  showFullEmojiPicker={fullEmojiPickerMsgId === msg.id}
                  setHoveredMsgId={setHoveredMsgId}
                  setEditingMsgId={setEditingMsgId}
                  setEditingContent={setEditingContent}
                  setEmojiPickerMsgId={setEmojiPickerMsgId}
                  setFullEmojiPickerMsgId={setFullEmojiPickerMsgId}
                  setForwardingMsg={setForwardingMsg}
                  setLightbox={setLightbox}
                  onEditMessage={handleEditMessage}
                  onDeleteMessage={handleDeleteMessage}
                  onToggleReaction={toggleReaction}
                  onTogglePin={togglePin}
                  onOpenThread={openThread}
                  onJoinVoiceChannel={onJoinVoiceChannel}
                  showToast={showToast}
                />
              ))}

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
            {/* Note: thread / pinned / shared-media side panels removed —
                thread now renders inline below the parent (see InlineThread
                inside the message map above), and pinned / files use full-
                screen views (PinnedView / SharedMediaView) above. */}
            {/* P3-#14 — Floating "scroll to latest" button. Shown whenever
                the user is scrolled up; badge shows new-message count if any. */}
            {!isNearBottom && (
              <button
                onClick={() => {
                  const el = messagesScrollRef.current
                  if (el) {
                    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
                  }
                  setNewMsgCount(0)
                }}
                title="Jump to latest"
                style={{
                  position: 'absolute', bottom: 20, right: 28,
                  height: 44, padding: newMsgCount > 0 ? '0 16px 0 14px' : 0,
                  width: newMsgCount > 0 ? 'auto' : 44,
                  borderRadius: 22,
                  background: C.accent,
                  color: '#fff',
                  fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  boxShadow: '0 6px 20px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08) inset',
                  zIndex: 10, border: 'none',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 24px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.12) inset' }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08) inset' }}
              >
                <ChevronDown size={20} strokeWidth={2.5} />
                {newMsgCount > 0 && <span>{newMsgCount} new</span>}
              </button>
            )}
            </div>
          )}

          {/* P3-#7/#8 — Right-pane sidebars deleted. Thread renders inline
              below the parent message; pin/files use full-screen views. */}
          </div>

          {/* Main message input — hidden when ThreadView / Pinned / Files
              has taken over the pane (each of those owns its own composer
              or is read-only). */}
          {!threadParent && !showPinned && !showSharedMedia && (
            <MessageInput
              placeholder={`Message ${selected.name}…`}
              config={config}
              channelId={selected.id}
              onTyping={sendTyping}
              input={input}
              setInput={setInput}
              sendFn={send}
              sending={sending}
              onScheduled={loadScheduledMessages}
            />
          )}
        </div>

      ) : !myConference ? (
        /* ─── Empty state ──────────────────────────────────────────────────── */
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, flexDirection: 'column', gap: 12 }}>
          <MessageSquare size={40} strokeWidth={1} />
          <div style={{ fontSize: 14 }}>Select a conversation</div>
          <button onClick={() => setShowNewConv('dm')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', ...neu(), border: 'none', cursor: 'pointer', color: C.accent, fontWeight: 600, fontSize: 13 }}>
            <Edit2 size={15} /> New Conversation
          </button>
        </div>
      ) : null}

      {/* ─── Forward Message Modal ──────────────────────────────────────── */}
      {forwardingMsg && (() => {
        const q = forwardSearch.toLowerCase()
        const filtered = channels.filter(c => {
          if (c.id === selected?.id) return false
          const label = c.type === 'channel' ? c.name.replace(/^#/, '') : c.name
          return label.toLowerCase().includes(q)
        })
        async function doForward(targetCh: Conversation) {
          if (!forwardingMsg || forwardSending) return
          setForwardSending(true)
          try {
            const senderName = forwardingMsg.sender.alias || forwardingMsg.sender.username
            const sourceName = selected ? (selected.type === 'channel' ? selected.name.replace(/^#/, '') : selected.name) : ''
            const meta = JSON.stringify({ s: senderName, t: forwardingMsg.createdAt, c: sourceName, ct: selected?.type ?? 'channel' })
            const body = `<!--fwd:${meta}-->\n${forwardingMsg.content}`
            await apiFetch(`/api/channels/${targetCh.id}/messages`, {
              method: 'POST', body: JSON.stringify({ content: body }),
            })
            setForwardingMsg(null)
            setForwardSearch('')
            if (targetCh.id === selected?.id) await loadMessages(selected)
          } catch (err) {
            console.error('[Messages] forward failed:', err)
          } finally { setForwardSending(false) }
        }
        return (
          <div onClick={() => { setForwardingMsg(null); setForwardSearch('') }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ width: 380, maxHeight: 460, background: C.bgPrimary, borderRadius: 12, border: `1px solid ${C.separator}`, boxShadow: '0 8px 32px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${C.separator}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Forward Message</span>
                <button onClick={() => { setForwardingMsg(null); setForwardSearch('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
                  <X size={16} />
                </button>
              </div>
              {/* Message preview */}
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.separator}`, background: C.bgSecondary }}>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>
                  From <span style={{ fontWeight: 600, color: C.textSecondary }}>{forwardingMsg.sender.alias || forwardingMsg.sender.username}</span>
                </div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4, maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis', wordBreak: 'break-word' }}>
                  {forwardingMsg.content.length > 200 ? forwardingMsg.content.slice(0, 200) + '\u2026' : forwardingMsg.content}
                </div>
              </div>
              {/* Search */}
              <div style={{ padding: '10px 16px 6px' }}>
                <input value={forwardSearch} onChange={e => setForwardSearch(e.target.value)}
                  placeholder="Search channels or people\u2026" autoFocus
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.separator}`, background: C.bgInput, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              {/* Channel list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 12px' }}>
                {filtered.length === 0 && (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>No conversations found</div>
                )}
                {filtered.map(ch => {
                  const label = ch.type === 'channel' ? `# ${ch.name.replace(/^#/, '')}` : ch.name
                  const typeLabel = ch.type === 'dm' ? 'Direct Message' : ch.type === 'group' ? 'Group' : 'Channel'
                  return (
                    <button key={ch.id} onClick={() => doForward(ch)} disabled={forwardSending}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.sidebarHover }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: forwardSending ? 'wait' : 'pointer', textAlign: 'left', transition: 'background 0.12s' }}>
                      <Avatar url={ch.avatar ?? null} name={ch.name} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                        <div style={{ fontSize: 11, color: C.textMuted }}>{typeLabel}</div>
                      </div>
                      <CornerDownRight size={14} color={C.textMuted} />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ─── Lightbox overlay ──────────────────────────────────────────────── */}
      {lightbox && (
        <LightboxOverlay lightbox={lightbox} config={config} onClose={() => setLightbox(null)} />
      )}

      {/* ─── Voice Channel Delete Confirmation ──────────────────────────── */}
      {vcDeleteConfirm && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setVcDeleteConfirm(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 251, background: C.cardBg, borderRadius: 12, padding: 24, minWidth: 360, maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={18} style={{ color: '#ef4444' }} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>Delete Voice Channel</div>
            </div>
            <div style={{ color: C.textMuted, fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
              Are you sure you want to delete <strong style={{ color: C.text }}>{vcDeleteConfirm.name}</strong>? This action cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setVcDeleteConfirm(null)} style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid ${C.separator}`, background: 'transparent', color: C.text, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => deleteVoiceChannel(vcDeleteConfirm.id)} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </>,
        document.body
      )}

    </div>
  )
}

// ─── Lightbox overlay ─────────────────────────────────────────────────────
// (#10 + #11b) Inline preview for images/videos under 10 MB; for files larger
// or non-previewable types (pdf, zip, audio/*, etc.) shows a download CTA so
// we don't burn bandwidth streaming a 50 MB file every click.
