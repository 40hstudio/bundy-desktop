import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { flushSync, createPortal } from 'react-dom'
import {
  MessageSquare, Edit2, Search, Hash, Users, Plus, ChevronDown,
  Loader, Phone, Video, Pin, Settings2, MessageCircle, ChevronRight,
  Smile, CornerDownRight, Trash2, ChevronUp, Send, X,
  FolderOpen, Paperclip, ExternalLink, Download, Check, CheckCheck,
  Clock, Calendar, Volume2, MicOff, PhoneOff, Monitor, Mic, Headphones, HeadphoneOff,
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
import { renderMessageContent, extractUrls, isImageUrl, REPORT_LINK_RE, TASK_LINK_RE } from '../../utils/markdown'
import { formatTime, timeAgo } from '../../utils/format'
import { ReportLinkCard } from './ReportLinkCard'
import { TaskLinkCard } from './TaskLinkCard'
import CallWidget from '../calls/CallWidget'
import ConferenceWidget from '../calls/ConferenceWidget'
import VoiceChannelView from '../calls/VoiceChannelView'
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

// ─── Thread Item (used in Threads view) ───────────────────────────────────────

function ThreadItem({ thread, senderName, displayChannelName, replies, config, apiFetch, onOpenThread, onReplySent }: {
  thread: ThreadActivity
  senderName: string
  displayChannelName: string
  replies: { content: string; createdAt: string; sender: { alias: string | null; username: string; avatarUrl: string | null } }[]
  config: ApiConfig
  apiFetch: (path: string, opts?: RequestInit) => Promise<any>
  onOpenThread: () => void
  onReplySent: (reply: { content: string; createdAt: string; sender: { alias: string | null; username: string; avatarUrl: string | null } }) => void
}) {
  const [replyInput, setReplyInput] = useState('')
  const [sending, setSending] = useState(false)
  const [hovered, setHovered] = useState(false)

  async function handleSendReply() {
    if (!replyInput.trim() || sending) return
    const content = replyInput.trim()
    setSending(true)
    setReplyInput('')
    try {
      const data = await apiFetch(`/api/channels/${thread.channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, parentMessageId: thread.id }),
      })
      const sender = data?.sender ?? { alias: null, username: 'You', avatarUrl: null }
      onReplySent({ content, createdAt: new Date().toISOString(), sender })
    } catch { /* offline */ } finally { setSending(false) }
  }

  const allRepliesShown = replies.length >= thread.replyCount

  return (
    <div style={{ padding: '0 16px', marginBottom: 10 }}>
      <div
        style={{
          background: hovered ? C.sidebarHover : C.bgSecondary,
          border: `1px solid ${C.separator}`,
          borderRadius: 10,
          padding: '14px 16px',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Channel name header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, cursor: 'pointer' }} onClick={onOpenThread}>
          {thread.channelType === 'channel' ? <Hash size={12} color={C.textMuted} /> : thread.channelType === 'group' ? <Users size={12} color={C.textMuted} /> : <MessageSquare size={12} color={C.textMuted} />}
          <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayChannelName}</span>
        </div>

        {/* Parent message */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }} onClick={onOpenThread}>
          <Avatar url={thread.parentMessage.sender.avatarUrl} name={senderName} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{senderName}</div>
            <div style={{ fontSize: 13, color: C.text, marginTop: 2, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{thread.parentMessage.content}</div>
          </div>
        </div>

        {/* Reply count + time — hidden when all replies are already shown inline */}
        {!allRepliesShown && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 38, marginTop: 6, cursor: 'pointer' }} onClick={onOpenThread}>
            <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>{thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}</span>
            <span style={{ fontSize: 11, color: C.textMuted }}>{timeAgo(thread.lastReply.createdAt)}</span>
            {thread.unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />}
          </div>
        )}

        {/* Recent replies (up to 3) */}
        <div style={{ paddingLeft: 38, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {replies.map((reply, idx) => {
            const name = reply.sender.alias ?? reply.sender.username
            return (
              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', cursor: 'pointer' }} onClick={onOpenThread}>
                <Avatar url={reply.sender.avatarUrl} name={name} size={18} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.textMuted, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                  <span style={{ fontWeight: 600, color: C.sidebarText }}>{name}:</span>{' '}{reply.content}
                </div>
              </div>
            )
          })}
        </div>

        {/* Time indicator when all replies shown */}
        {allRepliesShown && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 38, marginTop: 6, cursor: 'pointer' }} onClick={onOpenThread}>
            <span style={{ fontSize: 11, color: C.textMuted }}>{timeAgo(thread.lastReply.createdAt)}</span>
            {thread.unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />}
          </div>
        )}

        {/* Inline reply input */}
        <div style={{ paddingLeft: 38, marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Reply..."
            value={replyInput}
            onChange={e => setReplyInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply() } }}
            style={{
              flex: 1, padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.separator}`,
              background: C.bgInput, color: C.text, fontSize: 12, outline: 'none',
            }}
          />
          <button
            onClick={handleSendReply}
            disabled={!replyInput.trim() || sending}
            style={{
              padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: replyInput.trim() ? C.accent : 'transparent',
              color: replyInput.trim() ? '#fff' : C.textMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: sending ? 0.5 : 1,
            }}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
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
  const channelsRef = useRef<Conversation[]>([])
  channelsRef.current = channels

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

  // In-conversation search state (separate from global sidebar search)
  const [convSearchQuery, setConvSearchQuery] = useState('')
  const [convSearchResults, setConvSearchResults] = useState<Array<{
    id: string; channelId: string; content: string; createdAt: string
    sender: { id: string; username: string; alias: string | null; avatarUrl: string | null }
    channel: { id: string; name: string | null; type: string }
  }>>([])
  const [convSearching, setConvSearching] = useState(false)
  const [showConvSearch, setShowConvSearch] = useState(false)
  const convSearchTimer = useRef<NodeJS.Timeout | null>(null)

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
  const [fullEmojiPickerMsgId, setFullEmojiPickerMsgId] = useState<string | null>(null)

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
  // Voice channel chat
  const [selectedVc, setSelectedVc] = useState<VoiceChannelInfo | null>(null)
  type VcMsg = { id: string; content: string; createdAt: string; sender: { id: string; username: string; alias: string | null; avatarUrl: string | null } }
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
  const [, forceVcTimerTick] = useState(0)
  // Track own VC state from VoiceChannelView via custom events
  const [vcLocalState, setVcLocalState] = useState<{ muted: boolean; deafened: boolean; screenSharing: boolean }>({ muted: false, deafened: false, screenSharing: false })

  const selectConv = (c: Conversation | null) => { if (c) { setShowThreadsView(false); setShowScheduledView(false); setSelectedVc(null); setShowConvSearch(false); setConvSearchQuery(''); setConvSearchResults([]) }; setSelected(c) }

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
                    // Track new messages when scrolled up
                    if (payload.senderId !== auth.userId && !isNearBottomRef.current) {
                      setNewMsgCount(c => c + 1)
                    }
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
                    // Show native desktop notification via main process
                    if (!document.hasFocus()) {
                      window.electronAPI?.showNotification?.('New message', `${payload.senderAlias ?? payload.senderName}: ${payload.content}`)
                    }
                    // Dispatch to in-app notification tray
                    const _ch = channelsRef.current.find(c => c.id === channelId)
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
                  new Audio('sounds/mentioned-message.mp3').play().catch(() => {})
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
              } else if (ev === 'conference-deafen') {
                window.dispatchEvent(new CustomEvent('bundy-conference-deafen', { detail: payload }))
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
              } else if (ev === 'user-activity') {
                window.dispatchEvent(new CustomEvent('bundy-user-activity', { detail: payload }))
                // Track idle status for presence
                if (payload.userId && payload.userId !== auth.userId) {
                  userIdleRef.current[payload.userId] = !!payload.idle
                  onlineUsersRef.current.add(payload.userId) // receiving heartbeat = online
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

  // Load scheduled messages count on mount + when view opens
  useEffect(() => {
    if (DEMO_MODE) return
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
    setNewMsgCount(0)
    isNearBottomRef.current = true
    if (!DEMO_MODE) loadMessages(selected)
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
    if (!isVisible || !selected || DEMO_MODE) return
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
    if (ch) {
      pendingScrollMsgRef.current = result.id
      if (ch.id === selected?.id) {
        // Same channel — check DOM first, otherwise reload around the target
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
        setSelected(ch) // useEffect will call loadMessages with around param
      }
    }
    setShowSearch(false); setSearchQuery(''); setSearchResults([])
  }

  // In-conversation search handler (scoped to current channel)
  function handleConvSearchInput(q: string) {
    setConvSearchQuery(q)
    if (convSearchTimer.current) clearTimeout(convSearchTimer.current)
    if (!q.trim() || q.trim().length < 2) { setConvSearchResults([]); return }
    if (!selected) return
    convSearchTimer.current = setTimeout(async () => {
      setConvSearching(true)
      try {
        const data = await apiFetch(`/api/channels/search?${new URLSearchParams({ q: q.trim(), channelId: selected.id })}`)
        setConvSearchResults(data.messages ?? [])
      } catch { setConvSearchResults([]) }
      setConvSearching(false)
    }, 400)
  }

  function handleConvSearchResultClick(result: typeof convSearchResults[0]) {
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
    setShowConvSearch(false); setConvSearchQuery(''); setConvSearchResults([])
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
    setFullEmojiPickerMsgId(null)
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

  // ─── Voice Channels ────────────────────────────────────────────────────────
  const loadVoiceChannels = useCallback(async () => {
    try {
      const data = await apiFetch('/api/voice-channels') as { voiceChannels: VoiceChannelInfo[] }
      setVoiceChannels(data.voiceChannels)
    } catch {}
  }, [apiFetch])

  // Load voice channels on mount and ensure personal channels exist
  useEffect(() => {
    apiFetch('/api/voice-channels/ensure-personal', { method: 'POST' }).then(() => loadVoiceChannels())
  }, [loadVoiceChannels]) // eslint-disable-line react-hooks/exhaustive-deps

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

  async function joinVoiceChannel(vc: VoiceChannelInfo) {
    // If already in this VC, just show the call view
    if (myConference?.channelId === `vc_${vc.id}`) {
      setSelected(null); setSelectedVc(null); setShowThreadsView(false); setShowScheduledView(false)
      return
    }
    // If in a different VC, disconnect first then auto-join new one
    if (myConference && myConference.channelId.startsWith('vc_')) {
      window.dispatchEvent(new CustomEvent('bundy-vc-disconnect'))
      // Force clear state synchronously so we can proceed to join immediately
      flushSync(() => { setMyConference(null); setVcLocalState({ muted: false, deafened: false, screenSharing: false }) })
      // Small delay for WebRTC cleanup
      await new Promise(r => setTimeout(r, 200))
    }
    if (myConference) return // still in a non-VC call
    try {
      const res = await apiFetch('/api/voice-channels', {
        method: 'POST',
        body: JSON.stringify({ action: 'join', voiceChannelId: vc.id }),
      })
      const data = res as { ok: boolean; channelId: string; participants: Array<{ id: string; name: string; avatar: string | null }> }
      if (!data.ok) return
      setMyConference({ channelId: data.channelId, channelName: vc.name, participants: data.participants ?? [] })
    } catch {}
  }

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
    loadVcMessages(vc.id)
  }

  // VC chat: listen for real-time messages
  useEffect(() => {
    const onVcMsg = (e: Event) => {
      const msg = (e as CustomEvent<VcMsg & { voiceChannelId: string }>).detail
      if (msg.voiceChannelId === selectedVc?.id) {
        setVcMessages(prev => [...prev, { id: msg.id, content: msg.content, createdAt: msg.createdAt, sender: msg.sender }])
        setTimeout(() => vcMsgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
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
      {myConference && !myConference.channelId.startsWith('vc_') && (
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
                    return (
                      <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} typingUsers={typingMap[c.id] ?? []} hasActiveCall={partnerInCall} isMentioned={mentionedChannels.has(c.id)} onClick={() => selectConv(c)} onClose={selected?.id === c.id ? () => selectConv(null) : undefined} getPresence={getPresence} getTrackerStatus={getTrackerStatus} />
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
                          {/* Chat icon — only visible on hover */}
                          <button
                            onClick={e => { e.stopPropagation(); openVcChat(vc) }}
                            title="Open chat"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sidebarText, padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', opacity: isHovered ? 0.7 : 0, transition: 'opacity 0.15s' }}
                          >
                            <MessageSquare size={12} />
                          </button>
                          {hasParticipants && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              <span style={{ fontSize: 10, color: C.success, fontWeight: 600 }}>{vc.participants.length}</span>
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

        {/* Floating VC control bar at bottom of sidebar */}
        {myConference && myConference.channelId.startsWith('vc_') && (
          <div style={{
            borderTop: `1px solid ${C.separator}`, background: C.bgSecondary, flexShrink: 0,
            padding: '8px 10px',
          }}>
            {/* Top line: status + show call icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Volume2 size={14} color={C.success} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.success }}>Voice Connected</div>
                <div style={{ fontSize: 10, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{myConference.channelName}</div>
              </div>
              <button
                onClick={() => { setSelected(null); setSelectedVc(null); setShowThreadsView(false); setShowScheduledView(false) }}
                title="Show Call"
                style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, padding: 5, cursor: 'pointer', color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
              >
                <Monitor size={14} />
              </button>
            </div>
            {/* Bottom line: mute, deafen, screen share, end call */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('bundy-vc-toggle-mute'))}
                title={vcLocalState.muted ? 'Unmute' : 'Mute'}
                style={{
                  flex: 1, background: vcLocalState.muted ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.06)',
                  border: 'none', borderRadius: 6, padding: '6px 0', cursor: 'pointer',
                  color: vcLocalState.muted ? '#f87171' : C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.8' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                {vcLocalState.muted ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('bundy-vc-toggle-deafen'))}
                title={vcLocalState.deafened ? 'Undeafen' : 'Deafen'}
                style={{
                  flex: 1, background: vcLocalState.deafened ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.06)',
                  border: 'none', borderRadius: 6, padding: '6px 0', cursor: 'pointer',
                  color: vcLocalState.deafened ? '#f87171' : C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.8' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                {vcLocalState.deafened ? <HeadphoneOff size={15} /> : <Headphones size={15} />}
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('bundy-vc-toggle-screenshare'))}
                title={vcLocalState.screenSharing ? 'Stop Sharing' : 'Share Screen'}
                style={{
                  flex: 1, background: vcLocalState.screenSharing ? 'rgba(59,165,93,0.2)' : 'rgba(255,255,255,0.06)',
                  border: 'none', borderRadius: 6, padding: '6px 0', cursor: 'pointer',
                  color: vcLocalState.screenSharing ? C.success : C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.8' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                <Monitor size={15} />
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('bundy-vc-disconnect'))}
                title="Disconnect"
                style={{
                  flex: 1, background: 'rgba(237,66,69,0.15)', border: 'none', borderRadius: 6,
                  padding: '6px 0', cursor: 'pointer', color: '#f87171',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.8' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                <PhoneOff size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── VoiceChannelView (always mounted when in VC, hidden when navigating) ─── */}
      {myConference && myConference.channelId.startsWith('vc_') && (
        <div style={{
          flex: 1, display: (showThreadsView || showScheduledView || selectedVc || selected) ? 'none' : 'flex',
          flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden',
        }}>
          <VoiceChannelView
            config={config} auth={{ ...auth, avatarUrl: myAvatarUrl }}
            channelId={myConference.channelId}
            channelName={myConference.channelName}
            initialParticipants={myConference.participants}
            onLeave={() => { setMyConference(null); setVcLocalState({ muted: false, deafened: false, screenSharing: false }) }}
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
                      <div style={{ fontSize: 14, color: C.text, lineHeight: 1.45, wordBreak: 'break-word' }}>{renderMessageContent(msg.content, false)}</div>
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
                <button onClick={() => { setShowConvSearch(!showConvSearch); if (showConvSearch) { setConvSearchQuery(''); setConvSearchResults([]) } }} title="Search in conversation"
                  style={{ width: 32, height: 32, borderRadius: 6, background: 'none', border: `1px solid ${C.separator}`, cursor: 'pointer', color: showConvSearch ? C.accent : C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                <button onClick={() => { setShowConvSearch(false); setConvSearchQuery(''); setConvSearchResults([]) }}
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

              {messages.map((msg, i) => {
                const isMe = msg.sender.id === auth.userId
                const prevMsg = messages[i - 1]
                const timeDiff = prevMsg ? new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() : Infinity
                const showHeader = !prevMsg || prevMsg.sender.id !== msg.sender.id || timeDiff > 5 * 60 * 1000
                const senderName = msg.sender.alias ?? msg.sender.username
                const isAttachment = /^\[📎\s[^\]]+?\]\(https?:\/\/\S+?\)\s*$/.test(msg.content)
                const fwdMatch = msg.content.match(/^<!--fwd:(\{.*?\})-->\n([\s\S]*)$/)
                const fwdMeta = fwdMatch ? (() => { try { return JSON.parse(fwdMatch[1]) as { s: string; t: string; c: string; ct?: string } } catch { return null } })() : null
                const fwdContent = fwdMatch ? fwdMatch[2] : null
                const REPORT_URL_RE = /\/report\/[a-z0-9]+\/[a-z0-9]+/i
                const TASK_URL_RE = /\/tasks\/[a-z0-9]+$/i
                const allUrls = isAttachment ? [] : extractUrls(msg.content)
                const plainUrls = allUrls.filter(u => !isImageUrl(u) && !REPORT_URL_RE.test(u) && !TASK_URL_RE.test(u))
                const reportLinks = allUrls.map(u => REPORT_LINK_RE.exec(u)).filter(Boolean) as RegExpExecArray[]
                const taskLinks = allUrls.map(u => TASK_LINK_RE.exec(u)).filter(Boolean) as RegExpExecArray[]
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
                  <div key={msg.id} id={`msg-${msg.id}`}>
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
                      onMouseLeave={() => { setHoveredMsgId(null); if (emojiPickerMsgId === msg.id && fullEmojiPickerMsgId !== msg.id) setEmojiPickerMsgId(null) }}
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
                            {isMe && (() => {
                              const otherReads = (msg.reads ?? []).filter(r => r.userId !== auth.userId)
                              const isRead = otherReads.length > 0
                              const fmtOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }
                              const sentTime = msgDate.toLocaleString('en-US', fmtOpts)
                              const readTime = isRead && otherReads[0]?.readAt
                                ? new Date(otherReads[0].readAt).toLocaleString('en-US', fmtOpts)
                                : null
                              const Icon = isRead ? CheckCheck : Check
                              return (
                                <span style={{ position: 'relative', alignSelf: 'center', display: 'inline-flex', cursor: 'default' }}
                                  onMouseEnter={e => {
                                    const tip = e.currentTarget.querySelector('[data-tip]') as HTMLElement
                                    if (tip) tip.style.opacity = '1'
                                  }}
                                  onMouseLeave={e => {
                                    const tip = e.currentTarget.querySelector('[data-tip]') as HTMLElement
                                    if (tip) tip.style.opacity = '0'
                                  }}>
                                  <Icon size={14} color={C.textMuted} />
                                  <span data-tip="" style={{
                                    position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                                    marginBottom: 6, padding: '6px 10px', borderRadius: 6,
                                    background: C.bgInput, border: `1px solid ${C.separator}`,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                    fontSize: 11, fontWeight: 500, color: C.text,
                                    whiteSpace: 'nowrap', pointerEvents: 'none',
                                    opacity: 0, transition: 'opacity 0.15s',
                                    zIndex: 50, display: 'flex', flexDirection: 'column', gap: 2,
                                  }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={11} color={C.textMuted} />Sent {sentTime}</span>
                                    {isRead && readTime && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CheckCheck size={11} color={C.textMuted} />Read {readTime}</span>}
                                  </span>
                                </span>
                              )
                            })()}
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
                        ) : fwdMeta && fwdContent !== null ? (
                          <div style={{ borderRadius: 6, background: C.bgInput, padding: '8px 12px', marginTop: 2 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                              <CornerDownRight size={12} color={C.accent} />
                              <span style={{ fontSize: 11, fontWeight: 700, color: C.accent }}>Forwarded</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{fwdMeta.s}</span>
                              <span style={{ fontSize: 10, color: C.textMuted }}>{formatTime(fwdMeta.t)}</span>
                              {fwdMeta.c && (
                                <>
                                  <span style={{ fontSize: 10, color: C.textMuted }}>·</span>
                                  <span style={{ fontSize: 10, color: C.textMuted }}>{fwdMeta.ct === 'channel' ? '#' : ''}{fwdMeta.c}</span>
                                </>
                              )}
                            </div>
                            <div style={{ fontSize: 14, color: C.text, lineHeight: 1.46, wordBreak: 'break-word', overflowWrap: 'break-word', userSelect: 'text', WebkitUserSelect: 'text' }}>
                              {renderMessageContent(fwdContent, false, usersMap)}
                            </div>
                          </div>
                        ) : (() => {
                          // Check for VC invite embed
                          const vcInviteMatch = msg.content.match(/^\[vc-invite:([^:]+):(.+)\]$/)
                          if (vcInviteMatch) {
                            const [, vcId, vcName] = vcInviteMatch
                            const isMe = msg.sender.id === auth.userId
                            return (
                              <div style={{ background: C.bgInput, border: `1px solid ${C.separator}`, borderRadius: 10, padding: 14, maxWidth: 380, marginTop: 2 }}>
                                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>
                                  {isMe ? 'You sent an invite to join a voice channel' : `${msg.sender.alias ?? msg.sender.username} sent an invite to join a voice channel`}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <div style={{ width: 44, height: 44, borderRadius: 10, background: C.cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Volume2 size={20} color={C.accent} />
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{vcName}</div>
                                    <div style={{ fontSize: 11, color: C.textMuted }}>Voice Channel</div>
                                  </div>
                                  <button
                                    onClick={() => {
                                      const vc = voiceChannels.find(v => v.id === vcId)
                                      if (vc) joinVoiceChannel(vc)
                                    }}
                                    style={{ background: C.success, border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, padding: '8px 16px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                                  >
                                    Join Voice
                                  </button>
                                </div>
                              </div>
                            )
                          }
                          return (
                            <div style={{ fontSize: 14, color: C.text, lineHeight: 1.46, wordBreak: 'break-word', overflowWrap: 'break-word', userSelect: 'text', WebkitUserSelect: 'text' }}>
                              {renderMessageContent(msg.content, false, usersMap)}
                            </div>
                          )
                        })()}
                        {!isEditing && !showHeader && msg.editedAt && (
                          <span style={{ fontSize: 10, color: C.textMuted }}>(edited)</span>
                        )}
                        {plainUrls.map((url, ui) => <OgPreview key={ui} url={url} config={config} />)}
                        {reportLinks.map((m, ri) => <ReportLinkCard key={`r${ri}`} clientId={m[1]} projectId={m[2]} itemType={m[3] || null} itemId={m[4] || null} config={config} />)}
                        {taskLinks.map((m, ti) => <TaskLinkCard key={`t${ti}`} taskId={m[1]} config={config} />)}
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
                            {(msg.replySenders?.length ?? 0) > 0 ? (
                              <div style={{ display: 'flex', flexShrink: 0 }}>
                                {msg.replySenders!.slice(0, 3).map((rs, ri) => (
                                  <div key={rs.id} style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${C.bgPrimary}`, marginLeft: ri === 0 ? 0 : -8, zIndex: 3 - ri, position: 'relative', overflow: 'hidden', background: C.bgInput }}>
                                    <Avatar url={rs.avatarUrl} name={rs.alias ?? rs.username} size={18} />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ width: 20, height: 20, borderRadius: 4, background: C.accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <MessageCircle size={11} color={C.accent} />
                              </div>
                            )}
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
                            onClick: () => setForwardingMsg(msg), color: C.textSecondary,
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
                      {emojiPickerMsgId === msg.id && fullEmojiPickerMsgId !== msg.id && (
                        <div style={{ position: 'absolute', top: -44, right: 24, display: 'flex', gap: 2, background: C.bgInput, borderRadius: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', border: `1px solid ${C.separator}`, padding: '4px 6px', zIndex: 20 }}>
                          {QUICK_EMOJIS.map(e => (
                            <button key={e} onClick={() => toggleReaction(msg.id, e)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '2px 4px', borderRadius: 6 }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                              {e}
                            </button>
                          ))}
                          <button onClick={() => setFullEmojiPickerMsgId(msg.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 6px', borderRadius: 6, color: C.textMuted, display: 'flex', alignItems: 'center' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                            title="More emojis">
                            <Plus size={14} />
                          </button>
                        </div>
                      )}
                      {/* Full emoji picker for reactions */}
                      {fullEmojiPickerMsgId === msg.id && (
                        <div style={{ position: 'relative' }}>
                          <EmojiPicker
                            onSelect={(emoji) => { toggleReaction(msg.id, emoji); setFullEmojiPickerMsgId(null); setEmojiPickerMsgId(null) }}
                            onClose={() => { setFullEmojiPickerMsgId(null); setEmojiPickerMsgId(null) }}
                          />
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
            {/* Floating new messages button */}
            {newMsgCount > 0 && (
              <button
                onClick={() => {
                  const el = messagesScrollRef.current
                  if (el) el.scrollTop = el.scrollHeight
                  setNewMsgCount(0)
                }}
                style={{
                  position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                  padding: '6px 16px', borderRadius: 20, border: 'none',
                  background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)', zIndex: 10,
                }}
              >
                <ChevronDown size={14} />
                {newMsgCount} new message{newMsgCount > 1 ? 's' : ''}
              </button>
            )}
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
                    {renderMessageContent(threadParent.content, false, usersMap)}
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
                          {renderMessageContent(reply.content, false, usersMap)}
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
                      <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>{renderMessageContent(pm.content, false, usersMap)}</div>
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

      ) : !(myConference && myConference.channelId.startsWith('vc_')) ? (
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
