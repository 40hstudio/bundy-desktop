import { useState, useEffect, useRef } from 'react'
import {
  Home, CheckSquare, Bell, Settings, Shield, Box,
  WifiOff, Loader, Headphones, ChevronRight, Smile, Calendar,
} from 'lucide-react'
import { C } from '../theme'
import { useApiConfig } from '../hooks/useApiConfig'
import type { Auth } from '../types'
import { Avatar } from '../components/shared/Avatar'
import HomePanel from '../components/home/HomePanel'
import { MessagesPanel } from '../components/messages/MessagesPanel'
import TasksPanel from '../components/tasks/TasksPanel'
import ActivityPanel from '../components/activity/ActivityPanel'
import SettingsPanel from '../components/settings/SettingsPanel'
import ReportPanel from '../components/report/ReportPanel'
import CalendarPanel from '../components/calendar/CalendarPanel'
import MeetingRoom from '../components/calendar/MeetingRoom'
import FloatingConferenceBar from '../components/calendar/FloatingConferenceBar'
import type { CalendarEvent } from '../components/calendar/types'
import AdminPanel from '../components/admin/AdminPanel'
import NotificationTray from '../components/notifications/NotificationTray'
import NotificationBanner from '../components/notifications/NotificationBanner'
import { DebugOverlay } from '../components/debug/DebugOverlay'
import { useNotificationsStore } from '../stores/notificationsStore'
import { useConferenceLockStore, readConferenceLock } from '../stores/conferenceLockStore'
import { IncomingCallOverlay } from '../components/messages/IncomingCallOverlay'
import type { IncomingCallPayload } from '../components/messages/IncomingCallOverlay'
import { ErrorBoundary } from '../components/shared/ErrorBoundary'
import { useWriteQueue } from '../api/writeQueue'
import { playSound } from '../utils/sounds'
import { track } from '../utils/eventLogger'
import { CallPurposePromptHost } from '../components/calls/CallPurposePrompt'

// Electron-specific CSS property for window dragging
declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'home' | 'messages' | 'tasks' | 'activity' | 'calendar' | 'report' | 'admin' | 'settings'
interface NavItem { id: Tab; icon: (active: boolean) => React.ReactNode; label: string }
interface Props { auth: Auth; onLogout: () => void }

const SIDEBAR_W = 72

const BASE_NAV: NavItem[] = [
  { id: 'home', icon: (a) => <Home size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Home' },
  { id: 'messages', icon: (a) => <Headphones size={20} strokeWidth={a ? 2 : 1.5} />, label: 'DMs' },
  { id: 'tasks', icon: (a) => <CheckSquare size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Tasks' },
  { id: 'activity', icon: (a) => <Bell size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Activity' },
  { id: 'calendar', icon: (a) => <Calendar size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Calendar' },
  { id: 'report', icon: (a) => <Box size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Box' },
]
const ADMIN_NAV: NavItem = { id: 'admin', icon: (a) => <Shield size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Admin' }

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ tab, setTab, auth, onLogout, selfPresence, avatarUrl, alias, messageBadge, messageMention, taskBadge, calendarBadge, updateBadge }: {
  tab: Tab; setTab: (t: Tab) => void
  auth: Auth; onLogout: () => void; selfPresence: 'active' | 'idle' | 'offline'
  avatarUrl?: string | null; alias?: string | null
  messageBadge?: number; messageMention?: boolean; taskBadge?: number; calendarBadge?: number; updateBadge?: boolean
}) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)
  const NAV = auth.role === 'admin' ? [...BASE_NAV, ADMIN_NAV] : BASE_NAV

  return (
    <nav style={{
      width: SIDEBAR_W, minHeight: '100vh',
      background: 'transparent',
      display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0,
      WebkitAppRegion: 'drag',
    } as React.CSSProperties}>
      <div style={{ height: 38, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, WebkitAppRegion: 'no-drag' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          overflow: 'hidden', flexShrink: 0, marginBottom: 4, marginTop: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src="workspace-logo.svg" alt="Bundy" style={{ width: 36, height: 36 }} />
        </div>
        {NAV.map(item => {
          const active = tab === item.id
          const hovered = hoveredTab === item.id
          const hasBadge = (item.id === 'messages' && (messageBadge ?? 0) > 0)
            || (item.id === 'tasks' && (taskBadge ?? 0) > 0)
            || (item.id === 'calendar' && (calendarBadge ?? 0) > 0)
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              onMouseEnter={() => setHoveredTab(item.id)}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                width: 52, display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 8, padding: '6px 0 5px', borderRadius: 8, border: 'none',
                background: active
                  ? 'linear-gradient(90deg, rgba(0, 0, 255, 0.24) 0%, rgba(0, 0, 255, 0.14) 50%, rgba(0, 0, 255, 0.10) 100%)'
                  : hovered ? C.sidebarHover : 'transparent',
                boxShadow: active ? 'inset 0 0 0 1px rgba(0, 0, 255, 0.18), 0 0 12px rgba(0, 0, 255, 0.08)' : 'none',
                backdropFilter: active ? 'blur(12px)' : 'none',
                WebkitBackdropFilter: active ? 'blur(12px)' : 'none',
                color: active ? C.sidebarTextActive : hovered ? C.text : C.sidebarText,
                cursor: 'pointer', position: 'relative',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.icon(active)}
                {hasBadge && (
                  <span style={{
                    position: 'absolute', top: -6, right: -10,
                    minWidth: 16, height: 16, borderRadius: 8,
                    background: (item.id === 'messages' && messageMention) ? C.warning : C.danger,
                    color: '#fff', fontSize: 9, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px', lineHeight: 1,
                    border: `2px solid ${C.bgTertiary}`,
                  }}>
                    {item.id === 'messages'
                      ? (messageMention ? '@' : (messageBadge! > 99 ? '99+' : messageBadge))
                      : item.id === 'tasks'
                        ? (taskBadge! > 99 ? '99+' : taskBadge)
                        : (calendarBadge! > 99 ? '99+' : calendarBadge)}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, lineHeight: 1, letterSpacing: 0.1 }}>{item.label}</span>
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingBottom: 14, WebkitAppRegion: 'no-drag' }}>
        <button
          onClick={() => setTab('settings')}
          onMouseEnter={() => setHoveredTab('settings')}
          onMouseLeave={() => setHoveredTab(null)}
          style={{
            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, border: 'none',
            background: tab === 'settings' ? C.sidebarActive : hoveredTab === 'settings' ? C.sidebarHover : 'transparent',
            color: tab === 'settings' ? C.sidebarTextActive : hoveredTab === 'settings' ? C.text : C.sidebarText,
            cursor: 'pointer', position: 'relative',
            transition: 'background 0.15s ease, color 0.15s ease',
          }}
        >
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Settings size={22} strokeWidth={tab === 'settings' ? 2.2 : 1.7} />
            {updateBadge && (
              <span style={{
                position: 'absolute', top: -3, right: -3,
                width: 8, height: 8, borderRadius: '50%',
                background: C.accent,
                border: `2px solid ${C.bgTertiary}`,
              }} />
            )}
          </div>
        </button>
        <ProfileButton auth={auth} selfPresence={selfPresence} avatarUrl={avatarUrl} alias={alias} onLogout={onLogout} setTab={setTab} />
      </div>
    </nav>
  )
}

// ─── Profile Button ───────────────────────────────────────────────────────────

function PresenceDot({ presence, size = 10, border }: { presence: 'active' | 'idle' | 'offline'; size?: number; border: string }) {
  const bg = presence === 'active' ? C.success : presence === 'idle' ? C.warning : C.textMuted
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: bg,
      border: `2px solid ${border}`,
      display: 'block', boxSizing: 'border-box',
    }} />
  )
}

function ProfileButton({ auth, selfPresence, avatarUrl, alias, onLogout, setTab }: {
  auth: Auth; selfPresence: 'active' | 'idle' | 'offline'; avatarUrl?: string | null; alias?: string | null; onLogout: () => void; setTab: (t: Tab) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const statusText = selfPresence === 'active' ? 'Active' : selfPresence === 'idle' ? 'Idle' : 'Offline'
  const displayName = alias || auth.username

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 36, height: 36, borderRadius: 8, border: 'none',
          background: 'transparent',
          color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', transition: 'background 0.15s ease',
          padding: 0, overflow: 'hidden',
        }}
      >
        <Avatar url={avatarUrl} name={displayName} size={36} radius="8px" />
        <span style={{ position: 'absolute', bottom: -2, right: -2 }}>
          <PresenceDot presence={selfPresence} size={12} border={C.bgTertiary} />
        </span>
      </button>
      {hovered && !menuOpen && (
        <div style={{
          position: 'absolute', left: 44, bottom: 4,
          background: C.bgFloating, border: `1px solid ${C.separator}`,
          borderRadius: 8, padding: '6px 12px',
          display: 'flex', alignItems: 'center', gap: 6,
          whiteSpace: 'nowrap', zIndex: 9999, boxShadow: C.shadowMed, pointerEvents: 'none',
        }}>
          <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{displayName}</span>
          <PresenceDot presence={selfPresence} size={8} border={C.bgFloating} />
        </div>
      )}
      {menuOpen && (
        <div style={{
          position: 'absolute', left: 44, bottom: -8, width: 280,
          background: C.bgFloating, border: `1px solid ${C.separator}`,
          borderRadius: 10, overflow: 'hidden', zIndex: 9999, boxShadow: C.shadowModal,
        }}>
          <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar url={avatarUrl} name={displayName} size={40} radius="8px" />
            <div>
              <div style={{ color: C.text, fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{displayName}</div>
              <div style={{ color: C.textMuted, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <PresenceDot presence={selfPresence} size={8} border={C.bgFloating} />
                {statusText}
              </div>
            </div>
          </div>
          <div style={{ padding: '0 12px 12px' }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8,
                background: C.bgInput, cursor: 'pointer', color: C.textMuted, fontSize: 13,
              }}
              onClick={() => setMenuOpen(false)}
            >
              <Smile size={16} />
              <span>Update your status</span>
            </div>
          </div>
          <div style={{ height: 1, background: C.separator }} />
          <div style={{ padding: '6px 0' }}>
            <ProfileMenuItem label={`Set yourself as ${selfPresence === 'active' ? 'away' : 'active'}`} bold={selfPresence === 'active' ? 'away' : 'active'} onClick={() => setMenuOpen(false)} />
            <ProfileMenuItem label="Pause notifications" trailing={<ChevronRight size={14} color={C.textMuted} />} onClick={() => setMenuOpen(false)} />
          </div>
          <div style={{ height: 1, background: C.separator }} />
          <div style={{ padding: '6px 0' }}>
            <ProfileMenuItem label="Profile" onClick={() => { setMenuOpen(false); setTab('settings') }} />
            <ProfileMenuItem label="Preferences" shortcut="⌘," onClick={() => { setMenuOpen(false); setTab('settings') }} />
          </div>
          <div style={{ height: 1, background: C.separator }} />
          <div style={{ padding: '6px 0' }}>
            <ProfileMenuItem label="Sign out of Bundy" onClick={() => { setMenuOpen(false); onLogout() }} />
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileMenuItem({ label, shortcut, trailing, bold, onClick }: {
  label: string; shortcut?: string; trailing?: React.ReactNode; bold?: string; onClick?: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const renderLabel = () => {
    if (!bold) return label
    const idx = label.indexOf(bold)
    if (idx === -1) return label
    return <>{label.slice(0, idx)}<b style={{ fontWeight: 700 }}>{bold}</b>{label.slice(idx + bold.length)}</>
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 20px', border: 'none',
        background: hovered ? C.bgHover : 'transparent',
        color: C.text, fontSize: 13, fontWeight: 400, cursor: 'pointer', textAlign: 'left',
      }}
    >
      <span style={{ flex: 1 }}>{renderLabel()}</span>
      {shortcut && <span style={{ color: C.textMuted, fontSize: 12 }}>{shortcut}</span>}
      {trailing}
    </button>
  )
}

// ─── FullDashboard orchestrator ───────────────────────────────────────────────

export default function FullDashboard({ auth, onLogout }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('home')

  // Log every tab transition (programmatic + user click). Done via effect so
  // it stays correct even when other code paths call setTab — pendingTaskId,
  // pendingReport, deep-links, voice-channel callbacks, etc.
  useEffect(() => {
    track('nav:tab', { to: tab })
  }, [tab])
  const [isOnline, setIsOnline] = useState(true)
  // Phase 2 — queued offline writes counter (non-empty when there are
  // unsent messages / unsynced status changes still waiting to replay).
  const queuedCount = useWriteQueue((s) => s.items.length)
  const failedCount = useWriteQueue((s) => s.failed.length)
  const [incomingCall, setIncomingCall] = useState<IncomingCallPayload | null>(null)
  const [acceptedCall, setAcceptedCall] = useState<IncomingCallPayload | null>(null)
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const [pendingCommentId, setPendingCommentId] = useState<string | null>(null)
  const [pendingReport, setPendingReport] = useState<{ clientId: string; projectId: string; itemType?: string | null; itemId?: string | null } | null>(null)
  const [pendingCalendarEventId, setPendingCalendarEventId] = useState<string | null>(null)
  // Active meeting lives at the top level so the LiveKit connection
  // survives tab switches. When on the calendar tab the MeetingRoom is
  // rendered full-screen; on other tabs it's hidden (visibility:hidden,
  // pointer-events:none) but stays mounted, and a small floating bar
  // appears bottom-right with Return / Leave (Google Meet pattern).
  // `minimized: true` collapses the meeting to the floating bar even on
  // the calendar tab — the user explicitly hit "minimize" and wants to
  // keep working with the meeting in the background.
  const [activeMeeting, setActiveMeeting] = useState<{ event: CalendarEvent; joinedAt: number; minimized: boolean } | null>(null)
  // Mirror activeMeeting → conference-lock store so MessagesPanel can
  // block VC / DM-call entry when the user is in a meeting (mutex).
  const setInMeeting = useConferenceLockStore((s) => s.setInMeeting)
  useEffect(() => { setInMeeting(!!activeMeeting) }, [activeMeeting, setInMeeting])
  const [messageBadge, setMessageBadge] = useState(0)
  const [messageMention, setMessageMention] = useState(false)
  const [taskBadge, setTaskBadge] = useState(0)
  const [calendarBadge, setCalendarBadge] = useState(0)
  const [updateBadge, setUpdateBadge] = useState(false)
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
  const [userAlias, setUserAlias] = useState<string | null>(null)
  const apiConfig = useApiConfig()

  // Track user activity for self‑presence (green/amber/grey)
  const lastActivityRef = useRef(Date.now())
  const [selfPresence, setSelfPresence] = useState<'active' | 'idle' | 'offline'>('active')

  useEffect(() => {
    const bump = () => { lastActivityRef.current = Date.now() }
    window.addEventListener('mousemove', bump)
    window.addEventListener('keydown', bump)
    window.addEventListener('click', bump)
    window.addEventListener('scroll', bump, true)
    const interval = setInterval(() => {
      if (!isOnline) { setSelfPresence('offline'); return }
      const ago = Date.now() - lastActivityRef.current
      setSelfPresence(ago <= 5 * 60_000 ? 'active' : 'idle')
    }, 10_000)
    return () => {
      window.removeEventListener('mousemove', bump)
      window.removeEventListener('keydown', bump)
      window.removeEventListener('click', bump)
      window.removeEventListener('scroll', bump, true)
      clearInterval(interval)
    }
  }, [isOnline])

  // Re-fetch status when window regains focus (e.g. user switches back from another app)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        window.electronAPI.getStatus().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Fetch user profile for avatar and alias
  useEffect(() => {
    if (!apiConfig) return
    fetch(`${apiConfig.apiBase}/api/user/profile`, {
      headers: { Authorization: `Bearer ${apiConfig.token}` }
    }).then(r => r.json()).then((d: { user?: { avatarUrl: string | null; alias: string | null } }) => {
      if (d.user) {
        setUserAvatarUrl(d.user.avatarUrl)
        setUserAlias(d.user.alias)
      }
    }).catch(() => {})
  }, [apiConfig])

  const iceBufferRef = useRef<RTCIceCandidateInit[]>([])
  const answerSdpRef = useRef<string | null>(null)
  const [pendingInvite, setPendingInvite] = useState<{ from: string; fromName: string; channelId: string; channelName: string } | null>(null)

  useEffect(() => {
    const unsub = window.electronAPI.onOnlineState((state) => {
      setIsOnline(prev => {
        // Play a transition sound only when the value actually flips, so
        // the user gets a cue when the server drops out / comes back.
        if (prev !== state.isOnline) {
          playSound(state.isOnline ? 'system.online' : 'system.offline')
        }
        return state.isOnline
      })
    })
    const unsubUpdate = window.electronAPI.onUpdateAvailable(() => { setUpdateBadge(true); playSound('system.update-available') })
    const unsubDownloaded = window.electronAPI.onUpdateDownloaded(() => { setUpdateBadge(true); playSound('system.update-ready') })
    window.electronAPI.getUpdateState().then(state => {
      if (state && (state.version !== null || state.downloaded)) setUpdateBadge(true)
    }).catch(() => {})
    return () => { unsub(); unsubUpdate(); unsubDownloaded() }
  }, [])

  useEffect(() => {
    function onIncoming(e: Event) {
      const payload = (e as CustomEvent<IncomingCallPayload>).detail
      iceBufferRef.current = []
      answerSdpRef.current = null
      setIncomingCall(payload)
    }
    function onIce(e: Event) {
      const payload = (e as CustomEvent<{ candidate?: RTCIceCandidateInit }>).detail
      if (payload.candidate) iceBufferRef.current.push(payload.candidate)
    }
    function onAnswer(e: Event) {
      const payload = (e as CustomEvent<{ sdp?: string }>).detail
      if (payload.sdp) answerSdpRef.current = payload.sdp
    }
    function onOpenTask(e: Event) {
      const { taskId, commentId, focusDiscussion } = (e as CustomEvent<{ taskId: string; commentId?: string | null; focusDiscussion?: boolean }>).detail
      if (taskId) {
        setPendingTaskId(taskId)
        // commentId or focusDiscussion → drawer opens at discussion tab.
        // commentId additionally scrolls to that comment.
        setPendingCommentId(commentId ?? (focusDiscussion ? '' : null))
        setTab('tasks')
      }
    }

    // v1.5.2111 — toast cards from notificationsStore dispatch this when
    // clicked. Switch to the Messages tab; MessagesPanel listens to the
    // same event and selects the conversation once it's mounted/visible.
    function onOpenConversation(_e: Event) {
      setTab('messages')
    }

    // Push incoming task SSE notifications onto the banner stack.
    function onTaskBannerNotification(e: Event) {
      const detail = (e as CustomEvent<{
        taskId: string; type: string; message: string;
        commentId?: string | null; subtaskId?: string | null;
      }>).detail
      const kindMap: Record<string, 'task-mention' | 'task-assigned' | 'task-discussion' | 'task-subtask' | 'task-status'> = {
        mentioned: 'task-mention',
        assigned: 'task-assigned',
        discussion: 'task-discussion',
        subtask_update: 'task-subtask',
        status_change: 'task-status',
      }
      const kind = kindMap[detail.type] ?? 'task-discussion'
      const focusDiscussion = kind === 'task-discussion' || kind === 'task-mention' || kind === 'task-subtask'
      // Material Design pack — pick the sound by notification kind.
      // Banners on the in-app side are already shown; this just adds audio.
      if (kind === 'task-assigned') playSound('task.assigned')
      else if (kind === 'task-mention') playSound('task.mention')
      else if (kind === 'task-discussion') playSound('task.comment')
      else if (kind === 'task-subtask') playSound('task.subtask-added')
      else if (kind === 'task-status') playSound('task.status-change')
      useNotificationsStore.getState().show({
        kind,
        message: detail.message,
        onClick: () => {
          window.dispatchEvent(new CustomEvent('bundy-open-task', {
            detail: {
              taskId: detail.subtaskId ?? detail.taskId,
              commentId: detail.commentId ?? null,
              focusDiscussion,
            },
          }))
        },
      })
    }
    window.addEventListener('bundy-task-notification', onTaskBannerNotification)
    function onUnreadUpdate(e: Event) {
      const { count, mention } = (e as CustomEvent<{ count: number; mention?: boolean }>).detail
      setMessageBadge(count)
      setMessageMention(!!mention)
    }
    function onTaskUnreadUpdate(e: Event) {
      const { count } = (e as CustomEvent<{ count: number }>).detail
      setTaskBadge(count)
    }
    function onCalendarBadge(e: Event) {
      const { count } = (e as CustomEvent<{ count: number }>).detail
      setCalendarBadge(count)
    }
    window.addEventListener('bundy-calendar-badge', onCalendarBadge)
    window.addEventListener('bundy-incoming-call', onIncoming)
    window.addEventListener('bundy-call-ice', onIce)
    window.addEventListener('bundy-call-answer', onAnswer)
    window.addEventListener('bundy-open-task', onOpenTask)
    window.addEventListener('bundy-open-conversation', onOpenConversation)
    window.addEventListener('bundy-unread-update', onUnreadUpdate)
    window.addEventListener('bundy-task-unread-update', onTaskUnreadUpdate)

    function onOpenReport(e: Event) {
      const detail = (e as CustomEvent<{ clientId: string; projectId: string; itemType?: string | null; itemId?: string | null }>).detail
      if (detail.clientId && detail.projectId) { setPendingReport(detail); setTab('report') }
    }
    window.addEventListener('bundy-open-report', onOpenReport)

    function onOpenChannel() {
      setTab('messages')
    }
    window.addEventListener('bundy-open-channel', onOpenChannel)

    function onOpenCalendarEvent(e: Event) {
      const { eventId } = (e as CustomEvent<{ eventId: string }>).detail
      if (eventId) { setPendingCalendarEventId(eventId); setTab('calendar') }
    }
    window.addEventListener('bundy-open-calendar-event', onOpenCalendarEvent)

    function onVcInviteBanner(e: Event) {
      const payload = (e as CustomEvent<{ from: string; fromName: string; channelId: string; channelName: string }>).detail
      setPendingInvite(payload)
      // Looping VC-invite ringtone — kept on raw Audio() so the cleanup
      // can pause it. File swapped to Material Design ringtone for the
      // shared sound family.
      const audio = new Audio('sounds/material/ringtone_minimal.ogg')
      audio.loop = true; audio.volume = 0.5
      audio.play().catch(() => {})
      const stopAudio = () => { audio.pause(); audio.src = '' }
      // Stop sound when invite is dismissed, accepted, or after 30s
      const cleanup = () => {
        stopAudio()
        window.removeEventListener('bundy-vc-joined', cleanup)
      }
      window.addEventListener('bundy-vc-joined', cleanup, { once: true })
      setTimeout(() => {
        setPendingInvite(prev => prev?.from === payload.from ? null : prev)
        cleanup()
      }, 30000)
      // Store cleanup so Dismiss/Join can stop it
      ;(window as any).__inviteAudioCleanup = cleanup
      window.electronAPI?.focusWindow?.()
    }
    window.addEventListener('bundy-vc-invite-banner', onVcInviteBanner)

    function onVcJoined() { setPendingInvite(null) }
    window.addEventListener('bundy-vc-joined', onVcJoined)

    return () => {
      window.removeEventListener('bundy-incoming-call', onIncoming)
      window.removeEventListener('bundy-call-ice', onIce)
      window.removeEventListener('bundy-call-answer', onAnswer)
      window.removeEventListener('bundy-open-task', onOpenTask)
      window.removeEventListener('bundy-open-conversation', onOpenConversation)
      window.removeEventListener('bundy-task-notification', onTaskBannerNotification)
      window.removeEventListener('bundy-unread-update', onUnreadUpdate)
      window.removeEventListener('bundy-task-unread-update', onTaskUnreadUpdate)
      window.removeEventListener('bundy-open-report', onOpenReport)
      window.removeEventListener('bundy-open-channel', onOpenChannel)
      window.removeEventListener('bundy-open-calendar-event', onOpenCalendarEvent)
      window.removeEventListener('bundy-calendar-badge', onCalendarBadge)
      window.removeEventListener('bundy-vc-invite-banner', onVcInviteBanner)
      window.removeEventListener('bundy-vc-joined', onVcJoined)
    }
  }, [])

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: `radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0, 0, 255, 0.25) 0%, transparent 60%), radial-gradient(ellipse 100% 30% at 50% 0%, rgba(100, 160, 255, 0.10) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 0% 100%, rgba(0, 0, 255, 0.1) 0%, transparent 60%), ${C.bgTertiary}`,
      WebkitAppRegion: 'drag',
    } as React.CSSProperties}>
      <Sidebar
        tab={tab}
        setTab={(t) => { setTab(t); if (t === 'settings') setUpdateBadge(false) }}
        auth={auth}
        onLogout={onLogout}
        selfPresence={selfPresence}
        avatarUrl={userAvatarUrl}
        alias={userAlias}
        messageBadge={messageBadge}
        calendarBadge={calendarBadge}
        messageMention={messageMention}
        taskBadge={taskBadge}
        updateBadge={updateBadge}
      />

      {incomingCall && apiConfig && (
        <IncomingCallOverlay
          payload={incomingCall}
          config={apiConfig}
          auth={auth}
          onAccept={() => {
            setAcceptedCall(incomingCall)
            setTab('messages')
            setIncomingCall(null)
          }}
          onReject={() => {
            fetch(`${apiConfig.apiBase}/api/calls`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${apiConfig.token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'end', to: incomingCall.from }),
            }).catch(() => {})
            window.dispatchEvent(new CustomEvent('bundy-missed-call', {
              detail: { userId: incomingCall.from, userName: incomingCall.fromName, callType: incomingCall.callType, reason: 'declined' },
            }))
            iceBufferRef.current = []
            answerSdpRef.current = null
            setIncomingCall(null)
          }}
        />
      )}

      {/* Global VC invite banner — visible on all tabs */}
      {pendingInvite && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10002,
          background: C.bgSecondary, borderRadius: 12, padding: '12px 20px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 12,
          border: `1px solid ${C.separator}`, minWidth: 320,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>📞 {pendingInvite.fromName} invited you</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>Join {pendingInvite.channelName}</div>
          </div>
          <button onClick={() => {
            ;(window as any).__inviteAudioCleanup?.()
            window.dispatchEvent(new CustomEvent('bundy-join-conference', { detail: { channelId: pendingInvite.channelId, channelName: pendingInvite.channelName } }))
            setTab('messages')
            setPendingInvite(null)
          }}
            style={{ background: '#43B581', border: 'none', borderRadius: 8, color: '#fff', padding: '6px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Join
          </button>
          <button onClick={() => { ;(window as any).__inviteAudioCleanup?.(); setPendingInvite(null) }}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, color: '#9ca3af', padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
            Dismiss
          </button>
        </div>
      )}

      <div style={{
        flex: 1, overflow: 'hidden', position: 'relative',
        display: 'flex', flexDirection: 'column',
        paddingRight: 5, paddingBottom: 5,
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}>
        <div style={{ height: 38, flexShrink: 0, WebkitAppRegion: 'drag', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 12 } as React.CSSProperties}>
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <NotificationTray />
          </div>
        </div>
        {/* Wave C — post-call self-tag prompt. Mounts globally; only
            renders when a recent call ≥5 min ago is untagged. */}
        {apiConfig && <CallPurposePromptHost config={apiConfig} />}
        <div style={{
          flex: 1, overflow: 'hidden', position: 'relative',
          background: 'rgba(22, 22, 22, 0.5)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          {(!isOnline || queuedCount > 0 || failedCount > 0) && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
              background: C.bgInput, borderBottom: `1px solid ${!isOnline ? C.warning : C.accent}`,
              padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
            }}>
              <WifiOff size={14} color={!isOnline ? C.warning : C.accent} />
              <span style={{ color: !isOnline ? C.warning : C.accent, fontWeight: 500 }}>
                {!isOnline
                  ? (queuedCount > 0
                    ? `Offline — viewing cached data. ${queuedCount} action${queuedCount === 1 ? '' : 's'} queued.`
                    : 'Offline — viewing cached data. Changes will sync when reconnected.')
                  : `Syncing ${queuedCount} queued action${queuedCount === 1 ? '' : 's'}…`}
                {failedCount > 0 && (
                  <span style={{ marginLeft: 6, color: C.danger, fontWeight: 600 }}>
                    {failedCount} failed
                  </span>
                )}
              </span>
            </div>
          )}

          {tab === 'home' && (
            <div style={{ position: 'absolute', top: (!isOnline || queuedCount > 0 || failedCount > 0) ? 36 : 0, left: 0, right: 0, bottom: 0, overflowY: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <ErrorBoundary label="Home">
                <HomePanel auth={auth} config={apiConfig} onOpenTask={(taskId) => { setPendingTaskId(taskId); setTab('tasks') }} />
              </ErrorBoundary>
            </div>
          )}

          {apiConfig && (
            <div style={{
              position: 'absolute', top: (!isOnline || queuedCount > 0 || failedCount > 0) ? 36 : 0, left: 0, right: 0, bottom: 0,
              display: 'flex', flexDirection: 'column',
              visibility: tab === 'messages' ? 'visible' : 'hidden',
              pointerEvents: tab === 'messages' ? 'auto' : 'none',
            }}>
              <ErrorBoundary label="Messages">
                <MessagesPanel
                  config={apiConfig}
                  auth={auth}
                  acceptedCall={acceptedCall}
                  iceBufferRef={iceBufferRef}
                  answerSdpRef={answerSdpRef}
                  isVisible={tab === 'messages'}
                />
              </ErrorBoundary>
            </div>
          )}

          {tab === 'tasks' && apiConfig && (
            <div style={{ position: 'absolute', top: (!isOnline || queuedCount > 0 || failedCount > 0) ? 36 : 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <ErrorBoundary label="Tasks">
                <TasksPanel config={apiConfig} auth={auth} pendingTaskId={pendingTaskId} pendingCommentId={pendingCommentId} onPendingTaskHandled={() => { setPendingTaskId(null); setPendingCommentId(null) }} />
              </ErrorBoundary>
            </div>
          )}

          {tab === 'activity' && apiConfig && (
            <div style={{ position: 'absolute', top: (!isOnline || queuedCount > 0 || failedCount > 0) ? 36 : 0, left: 0, right: 0, bottom: 0, overflowY: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <ErrorBoundary label="Activity">
                <ActivityPanel config={apiConfig} />
              </ErrorBoundary>
            </div>
          )}

          {tab === 'calendar' && apiConfig && (
            <div style={{ position: 'absolute', top: (!isOnline || queuedCount > 0 || failedCount > 0) ? 36 : 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <ErrorBoundary label="Calendar">
                <CalendarPanel
                  config={apiConfig}
                  auth={auth}
                  pendingEventId={pendingCalendarEventId}
                  onPendingEventHandled={() => setPendingCalendarEventId(null)}
                  onOpenTask={(taskId) => { setPendingTaskId(taskId); setTab('tasks') }}
                  onJoinMeeting={(ev) => {
                    // Mutex: refuse to start a meeting if the user is
                    // already in a VC or DM call. The user has to leave
                    // the other conference first — in-app banner explains.
                    if (readConferenceLock().inVoiceOrCall) {
                      useNotificationsStore.getState().show({
                        kind: 'warning',
                        title: 'Already in a call',
                        message: 'Leave your current voice channel or DM call before joining a meeting.',
                      })
                      return
                    }
                    setActiveMeeting({ event: ev, joinedAt: Date.now(), minimized: false })
                  }}
                />
              </ErrorBoundary>
            </div>
          )}

          {tab === 'report' && apiConfig && (
            <div style={{ position: 'absolute', top: (!isOnline || queuedCount > 0 || failedCount > 0) ? 36 : 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <ErrorBoundary label="Report">
                <ReportPanel config={apiConfig} auth={auth} pendingReport={pendingReport} onPendingReportHandled={() => setPendingReport(null)} />
              </ErrorBoundary>
            </div>
          )}

          {tab === 'admin' && apiConfig && auth.role === 'admin' && (
            <div style={{ position: 'absolute', top: (!isOnline || queuedCount > 0 || failedCount > 0) ? 36 : 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <ErrorBoundary label="Admin">
                <AdminPanel config={apiConfig} auth={auth} />
              </ErrorBoundary>
            </div>
          )}

          {tab === 'settings' && apiConfig && (
            <div style={{ position: 'absolute', top: (!isOnline || queuedCount > 0 || failedCount > 0) ? 36 : 0, left: 0, right: 0, bottom: 0, overflowY: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <ErrorBoundary label="Settings">
                <SettingsPanel auth={auth} config={apiConfig} onLogout={onLogout} />
              </ErrorBoundary>
            </div>
          )}

          {(tab === 'tasks' || tab === 'activity' || tab === 'report' || tab === 'admin' || tab === 'settings') && !apiConfig && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted }}>
              <Loader size={24} />
            </div>
          )}
        </div>
      </div>
      {/* Active meeting — top-level overlay so the LiveKit session
           survives tab switches. Sits to the RIGHT of the sidebar
           (`left: SIDEBAR_W`) so the user can still navigate while in
           the meeting; the floating bar below handles the case where
           they're on a non-calendar tab. visibility:hidden +
           pointer-events:none keep the connection alive without
           covering the active tab. */}
      {activeMeeting && apiConfig && (() => {
        const showFull = tab === 'calendar' && !activeMeeting.minimized
        return (
          <div style={{
            position: 'fixed',
            top: 0, bottom: 0, right: 0,
            left: SIDEBAR_W,
            zIndex: showFull ? 50 : -1,
            visibility: showFull ? 'visible' : 'hidden',
            pointerEvents: showFull ? 'auto' : 'none',
            display: 'flex', flexDirection: 'column',
          }}>
            <MeetingRoom
              config={apiConfig}
              auth={auth}
              event={activeMeeting.event}
              onLeave={() => setActiveMeeting(null)}
              onMinimize={() => setActiveMeeting((m) => m ? { ...m, minimized: true } : m)}
            />
          </div>
        )
      })()}
      {activeMeeting && (tab !== 'calendar' || activeMeeting.minimized) && (
        <FloatingConferenceBar
          kind="meeting"
          title={activeMeeting.event.title}
          joinedAt={activeMeeting.joinedAt}
          onReturn={() => {
            // Restore the full meeting view: clear minimize and switch
            // to the calendar tab if needed.
            setActiveMeeting((m) => m ? { ...m, minimized: false } : m)
            setTab('calendar')
          }}
          onLeave={() => setActiveMeeting(null)}
        />
      )}
      {/* Cross-tab floating bar for VC + DM/group calls. Shown on
           every tab EXCEPT messages, since messages already renders
           the full VoiceChannelView inline (or its in-sidebar
           FloatingCallBar with mute/deafen quick controls when the
           user is viewing a different conversation). v1.5.2106. */}
      <VoiceOrCallFloatingBar tab={tab} setTab={setTab} />
      <NotificationBanner />
      <DebugOverlay />
    </div>
  )
}

/**
 * Cross-tab floating bar for active voice channels + DM/group calls.
 * Reads `voiceOrCall` from the conference-lock store (set by
 * MessagesPanel when myConference changes). Hidden on the messages
 * tab — there the user already sees either the inline
 * VoiceChannelView gallery or the in-sidebar FloatingCallBar with
 * quick controls. (v1.5.2106)
 */
function VoiceOrCallFloatingBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const voiceOrCall = useConferenceLockStore((s) => s.voiceOrCall)
  if (!voiceOrCall) return null
  if (tab === 'messages') return null
  return (
    <FloatingConferenceBar
      kind={voiceOrCall.kind}
      title={voiceOrCall.channelName}
      joinedAt={voiceOrCall.joinedAt}
      onReturn={() => setTab('messages')}
      onLeave={() => {
        // MessagesPanel listens for this and tears down the LiveKit
        // session via `bundy-vc-disconnect` + clears its local
        // myConference state.
        window.dispatchEvent(new CustomEvent('bundy-vc-leave-from-bar'))
      }}
    />
  )
}
