import { useState, useEffect, useRef } from 'react'
import {
  Home, CheckSquare, Bell, Settings,
  Headphones, ChevronRight, Smile,
} from 'lucide-react'
import { C } from '../../theme'
import type { Auth } from '../../types'

// Electron-specific CSS property for window dragging
declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
  }
}

export type Tab = 'home' | 'messages' | 'tasks' | 'activity' | 'settings'

interface NavItem { id: Tab; icon: (active: boolean) => React.ReactNode; label: string }

const SIDEBAR_W = 72

const NAV: NavItem[] = [
  { id: 'home', icon: (a) => <Home size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Home' },
  { id: 'messages', icon: (a) => <Headphones size={20} strokeWidth={a ? 2 : 1.5} />, label: 'DMs' },
  { id: 'tasks', icon: (a) => <CheckSquare size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Tasks' },
  { id: 'activity', icon: (a) => <Bell size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Activity' },
]

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ tab, setTab, auth, onLogout, isOnline, messageBadge, messageMention, updateBadge }: {
  tab: Tab; setTab: (t: Tab) => void
  auth: Auth; onLogout: () => void; isOnline: boolean; messageBadge?: number; messageMention?: boolean; updateBadge?: boolean
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
        <ProfileButton auth={auth} isOnline={isOnline} onLogout={onLogout} setTab={setTab} />
      </div>
    </nav>
  )
}

// ─── Profile Button ───────────────────────────────────────────────────────────

function ProfileButton({ auth, isOnline, onLogout, setTab }: {
  auth: Auth; isOnline: boolean; onLogout: () => void; setTab: (t: Tab) => void
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

  const statusText = isOnline ? 'Active' : 'Away'

  const StatusIcon = ({ size = 10, border = C.bgTertiary }: { size?: number; border?: string }) => (
    <span style={{
      width: size, height: size, borderRadius: 2,
      background: isOnline ? C.success : 'transparent',
      border: isOnline ? `2px solid ${border}` : `2px solid ${C.sidebarText}`,
      display: 'block', boxSizing: 'border-box',
    }} />
  )

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 36, height: 36, borderRadius: 8, border: 'none',
          background: hovered || menuOpen ? C.fillPrimary : C.fillSecondary,
          color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', transition: 'background 0.15s ease',
        }}
      >
        {(auth.username[0] ?? '?').toUpperCase()}
        <span style={{ position: 'absolute', bottom: -2, right: -2 }}>
          <StatusIcon size={10} border={C.bgTertiary} />
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
          <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{auth.username}</span>
          <StatusIcon size={8} border={C.bgFloating} />
        </div>
      )}
      {menuOpen && (
        <div style={{
          position: 'absolute', left: 44, bottom: -8, width: 280,
          background: C.bgFloating, border: `1px solid ${C.separator}`,
          borderRadius: 10, overflow: 'hidden', zIndex: 9999, boxShadow: C.shadowModal,
        }}>
          <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 8, flexShrink: 0,
              background: C.fillSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 16, fontWeight: 700,
            }}>
              {(auth.username[0] ?? '?').toUpperCase()}
            </div>
            <div>
              <div style={{ color: C.text, fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{auth.username}</div>
              <div style={{ color: C.textMuted, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <StatusIcon size={8} border={C.bgFloating} />
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
            <ProfileMenuItem label={`Set yourself as ${isOnline ? 'away' : 'active'}`} bold={isOnline ? 'away' : 'active'} onClick={() => setMenuOpen(false)} />
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
