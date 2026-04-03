import { useState, useEffect, useRef } from 'react'
import {
  Home, CheckSquare, Bell, FileText, Settings,
  WifiOff, Loader, Headphones, ChevronRight, Smile,
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
import NotificationTray from '../components/notifications/NotificationTray'
import { IncomingCallOverlay } from '../components/messages/IncomingCallOverlay'
import type { IncomingCallPayload } from '../components/messages/IncomingCallOverlay'
import { ErrorBoundary } from '../components/shared/ErrorBoundary'

// Electron-specific CSS property for window dragging
declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'home' | 'messages' | 'tasks' | 'activity' | 'report' | 'settings'
interface NavItem { id: Tab; icon: (active: boolean) => React.ReactNode; label: string }
interface Props { auth: Auth; onLogout: () => void }

const SIDEBAR_W = 72

const NAV: NavItem[] = [
  { id: 'home', icon: (a) => <Home size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Home' },
  { id: 'messages', icon: (a) => <Headphones size={20} strokeWidth={a ? 2 : 1.5} />, label: 'DMs' },
  { id: 'tasks', icon: (a) => <CheckSquare size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Tasks' },
  { id: 'activity', icon: (a) => <Bell size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Activity' },
  { id: 'report', icon: (a) => <FileText size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Report' },
]

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ tab, setTab, auth, onLogout, selfPresence, avatarUrl, alias, messageBadge, messageMention, updateBadge }: {
  tab: Tab; setTab: (t: Tab) => void
  auth: Auth; onLogout: () => void; selfPresence: 'active' | 'idle' | 'offline'
  avatarUrl?: string | null; alias?: string | null
  messageBadge?: number; messageMention?: boolean; updateBadge?: boolean
}) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)

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
          const hasBadge = item.id === 'messages' && (messageBadge ?? 0) > 0
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
                    background: messageMention ? C.warning : C.danger,
                    color: '#fff', fontSize: 9, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px', lineHeight: 1,
                    border: `2px solid ${C.bgTertiary}`,
                  }}>
                    {messageMention ? '@' : (messageBadge! > 99 ? '99+' : messageBadge)}
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
  const [isOnline, setIsOnline] = useState(true)
  const [incomingCall, setIncomingCall] = useState<IncomingCallPayload | null>(null)
  const [acceptedCall, setAcceptedCall] = useState<IncomingCallPayload | null>(null)
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const [pendingReport, setPendingReport] = useState<{ clientId: string; projectId: string; itemType?: string | null; itemId?: string | null } | null>(null)
  const [messageBadge, setMessageBadge] = useState(0)
  const [messageMention, setMessageMention] = useState(false)
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

  useEffect(() => {
    const unsub = window.electronAPI.onOnlineState((state) => setIsOnline(state.isOnline))
    const unsubUpdate = window.electronAPI.onUpdateAvailable(() => setUpdateBadge(true))
    const unsubDownloaded = window.electronAPI.onUpdateDownloaded(() => setUpdateBadge(true))
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
      const { taskId } = (e as CustomEvent<{ taskId: string }>).detail
      if (taskId) { setPendingTaskId(taskId); setTab('tasks') }
    }
    function onUnreadUpdate(e: Event) {
      const { count, mention } = (e as CustomEvent<{ count: number; mention?: boolean }>).detail
      setMessageBadge(count)
      setMessageMention(!!mention)
    }
    window.addEventListener('bundy-incoming-call', onIncoming)
    window.addEventListener('bundy-call-ice', onIce)
    window.addEventListener('bundy-call-answer', onAnswer)
    window.addEventListener('bundy-open-task', onOpenTask)
    window.addEventListener('bundy-unread-update', onUnreadUpdate)

    function onOpenReport(e: Event) {
      const detail = (e as CustomEvent<{ clientId: string; projectId: string; itemType?: string | null; itemId?: string | null }>).detail
      if (detail.clientId && detail.projectId) { setPendingReport(detail); setTab('report') }
    }
    window.addEventListener('bundy-open-report', onOpenReport)

    function onOpenChannel() {
      setTab('messages')
    }
    window.addEventListener('bundy-open-channel', onOpenChannel)

    return () => {
      window.removeEventListener('bundy-incoming-call', onIncoming)
      window.removeEventListener('bundy-call-ice', onIce)
      window.removeEventListener('bundy-call-answer', onAnswer)
      window.removeEventListener('bundy-open-task', onOpenTask)
      window.removeEventListener('bundy-unread-update', onUnreadUpdate)
      window.removeEventListener('bundy-open-report', onOpenReport)
      window.removeEventListener('bundy-open-channel', onOpenChannel)
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
        messageMention={messageMention}
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
        <div style={{
          flex: 1, overflow: 'hidden', position: 'relative',
          background: 'rgba(22, 22, 22, 0.5)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          {!isOnline && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
              background: C.bgInput, borderBottom: `1px solid ${C.warning}`,
              padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
            }}>
              <WifiOff size={14} color={C.warning} />
              <span style={{ color: C.warning, fontWeight: 500 }}>Server unreachable — changes will sync when reconnected</span>
            </div>
          )}

          {tab === 'home' && (
            <div style={{ position: 'absolute', top: isOnline ? 0 : 36, left: 0, right: 0, bottom: 0, overflowY: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <ErrorBoundary label="Home">
                <HomePanel auth={auth} config={apiConfig} onOpenTask={(taskId) => { setPendingTaskId(taskId); setTab('tasks') }} />
              </ErrorBoundary>
            </div>
          )}

          {apiConfig && (
            <div style={{
              position: 'absolute', top: isOnline ? 0 : 36, left: 0, right: 0, bottom: 0,
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
            <div style={{ position: 'absolute', top: isOnline ? 0 : 36, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <ErrorBoundary label="Tasks">
                <TasksPanel config={apiConfig} auth={auth} pendingTaskId={pendingTaskId} onPendingTaskHandled={() => setPendingTaskId(null)} />
              </ErrorBoundary>
            </div>
          )}

          {tab === 'activity' && apiConfig && (
            <div style={{ position: 'absolute', top: isOnline ? 0 : 36, left: 0, right: 0, bottom: 0, overflowY: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <ErrorBoundary label="Activity">
                <ActivityPanel config={apiConfig} />
              </ErrorBoundary>
            </div>
          )}

          {tab === 'report' && apiConfig && (
            <div style={{ position: 'absolute', top: isOnline ? 0 : 36, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <ErrorBoundary label="Report">
                <ReportPanel config={apiConfig} auth={auth} pendingReport={pendingReport} onPendingReportHandled={() => setPendingReport(null)} />
              </ErrorBoundary>
            </div>
          )}

          {tab === 'settings' && apiConfig && (
            <div style={{ position: 'absolute', top: isOnline ? 0 : 36, left: 0, right: 0, bottom: 0, overflowY: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <ErrorBoundary label="Settings">
                <SettingsPanel auth={auth} config={apiConfig} onLogout={onLogout} />
              </ErrorBoundary>
            </div>
          )}

          {(tab === 'tasks' || tab === 'activity' || tab === 'report' || tab === 'settings') && !apiConfig && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted }}>
              <Loader size={24} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
