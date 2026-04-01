import { useState, useEffect, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import {
  Home, MessageSquare, CheckSquare, Activity, Settings,
  LogOut, Play, Pause, RotateCcw, Square, Plus, Trash2,
  Send, Hash, Users, Circle,
  Check, AlertCircle, Loader, WifiOff, RefreshCw,
  Layers, Settings2,
  UserPlus, AtSign, Paperclip, Video, Phone, VideoOff,
  MicOff, PhoneOff, Edit2, X,
  Bold, Italic, List, ExternalLink, FileText, PhoneIncoming,
  Mic, Maximize2, Minimize2, Move, Search,
  Flag, GitBranch, Calendar, Clock, FolderPlus,
  LayoutList, LayoutGrid, Filter, ChevronRight, AlignLeft,
  Copy, Link, CornerDownRight, Image,
  Smile, Pin, MessageCircle, ChevronUp,
  Monitor, MonitorOff, UserPlus2, Wifi, WifiLow, WifiZero,
  LogIn, LogOut as LogOutIcon, FolderOpen, ChevronDown,
  Headphones, Bell
} from 'lucide-react'

// Electron-specific CSS property for window dragging
declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

// Module-level apiBase — set once when config loads, used to resolve relative asset URLs
let _apiBase = ''

interface Auth { userId: string; username: string; role: string }
interface ApiConfig { apiBase: string; token: string }
interface BundyStatus {
  isClockedIn: boolean; onBreak: boolean; isTracking: boolean
  elapsedMs: number; username: string; role: string
}
interface UserInfo {
  id: string; username: string; alias: string | null; avatarUrl: string | null; role?: string; userStatus?: string | null
}
interface ChannelMember {
  userId: string; user: UserInfo
}
interface Conversation {
  id: string; type: 'channel' | 'group' | 'dm'
  name: string; avatar?: string | null
  lastMessage?: string; lastTime?: string
  unread?: number
  members: ChannelMember[]
  partnerId?: string    // for DM — the other user's id
  createdBy?: string    // creator userId for leave/delete
}
interface ChatMessage {
  id: string; content: string; createdAt: string; editedAt: string | null
  sender: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  reads?: { userId: string }[]
  reactions?: { emoji: string; userId: string; user: { id: string; username: string; alias: string | null } }[]
  parentMessageId?: string | null
  replyCount?: number
  isPinned?: boolean
  pinnedAt?: string | null
  pinnedBy?: string | null
}
interface ThreadActivity {
  id: string
  channelId: string
  channelName: string
  channelType: 'channel' | 'group' | 'dm'
  parentMessage: { content: string; sender: { alias: string | null; username: string; avatarUrl: string | null } }
  lastReply: { content: string; sender: { alias: string | null; username: string; avatarUrl: string | null }; createdAt: string }
  replyCount: number
  unread: boolean
}
interface Task {
  id: string; title: string; description: string | null
  status: string; priority: string
  dueDate: string | null; startDate?: string | null; estimatedHours: number | null
  createdBy: string
  projectId: string | null
  assigneeId: string | null
  sectionId?: string | null
  order?: number
  parentTaskId?: string | null
  project: { id: string; name: string; color: string } | null
  section: { id: string; name: string } | null
  assignee: { id: string; username: string; alias: string | null; avatarUrl: string | null } | null
  creator?: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  multiAssignees?: { user: UserInfo }[]
  comments?: TaskComment[]
  subtasks?: Task[]
  activities?: TaskActivityItem[]
  attachments?: TaskAttachment[]
  _count: { comments: number; subtasks: number }
}
interface TaskComment {
  id: string; body: string; createdAt: string; attachmentUrl: string | null; attachmentName: string | null
  parentCommentId: string | null
  user: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  replies?: TaskComment[]
}
interface TaskAttachment {
  id: string; url: string; name: string; mimeType: string | null; createdAt: string
  creator: { id: string; username: string; alias: string | null; avatarUrl: string | null }
}
interface TaskActivityItem {
  id: string; type: string; oldVal: string | null; newVal: string | null; createdAt: string
  user: { id: string; username: string; alias: string | null; avatarUrl: string | null }
}
interface TaskSection {
  id: string; name: string; order: number; projectId: string
}
interface TaskProject {
  id: string; name: string; color: string; clientName: string | null; description?: string | null
  _count?: { tasks: number }
}
interface LogEntry { id: string; action: string; timestamp: string }
interface PlanItem {
  id: string
  project: { id: string; name: string }
  details: string
  status: string
  outcome: string | null
}

// ─── Demo mode — set to true to populate all tabs with dummy data ────────────
const DEMO_MODE = false

// ─── Design tokens (VS Code × Discord dark) ─────────────────────────────────

const C = {
  // Backgrounds
  bgTertiary: '#0e0e0e',
  bgSecondary: '#161616',
  bgPrimary: '#1c1c1c',
  bgFloating: '#080808',
  bgInput: '#282828',
  bgHover: 'rgba(255, 255, 255, 0.05)',
  bgActive: 'rgba(255, 255, 255, 0.08)',

  // Sidebar
  sidebarBg: '#161616',
  sidebarBgFallback: '#161616',
  sidebarHover: 'rgba(255, 255, 255, 0.05)',
  sidebarActive: 'rgba(0, 0, 255, 0.12)',
  sidebarText: '#6b6b6b',
  sidebarTextActive: '#cccccc',

  // Content area
  contentBg: '#1c1c1c',
  materialBg: '#161616',
  materialBgSecondary: '#0e0e0e',
  materialBorder: 'rgba(255, 255, 255, 0.06)',

  // Text
  white: '#fff',
  text: '#cccccc',
  textSecondary: '#9d9d9d',
  textMuted: '#6b6b6b',
  textTertiary: '#6b6b6b',

  // Fills
  fillTertiary: '#282828',
  fillSecondary: '#333333',
  fillPrimary: '#3e3e3e',
  separator: 'rgba(255, 255, 255, 0.06)',

  // Accent & status
  accent: '#007acc',
  accentHover: '#1a8ad4',
  accentLight: 'rgba(0, 122, 204, 0.18)',
  success: '#43B581',
  warning: '#cca700',
  danger: '#f04747',

  // Shadows
  shadowLow: '0 1px 3px rgba(0, 0, 0, 0.5)',
  shadowMed: '0 4px 12px rgba(0, 0, 0, 0.5)',
  shadowHigh: '0 8px 16px rgba(0, 0, 0, 0.6)',
  shadowModal: '0 0 0 1px rgba(255, 255, 255, 0.04), 0 16px 64px rgba(0, 0, 0, 0.7)',

  // Legacy aliases
  lgBg: '#161616',
  lgBorderSide: 'rgba(255, 255, 255, 0.06)',
  lgBlur: 'none',
  lgShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
  lgShadowLg: '0 8px 16px rgba(0, 0, 0, 0.6)',
}

/** Panel surface — for modals, sheets, floating panels */
function panel() {
  return {
    background: C.bgPrimary,
    borderRadius: 8,
    boxShadow: C.shadowMed,
  } as React.CSSProperties
}

/** Backward-compat: liquidGlass → panel */
function liquidGlass() {
  return panel()
}

/** Recessed input field */
function insetField() {
  return {
    background: C.bgInput,
    border: 'none',
    borderRadius: 4,
  } as React.CSSProperties
}

/** Card — content surface */
function card() {
  return {
    background: 'rgba(22, 22, 22, 0.45)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 8,
    padding: 16,
    border: '1px solid rgba(255, 255, 255, 0.06)',
  } as React.CSSProperties
}

/** Backward-compat alias */
function neu(inset = false) {
  return inset ? insetField() : panel()
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useApiConfig() {
  const [config, setConfig] = useState<ApiConfig | null>(DEMO_MODE ? { apiBase: 'http://localhost:0', token: 'demo' } : null)
  useEffect(() => {
    if (DEMO_MODE) return
    window.electronAPI.getApiConfig().then(c => {
      _apiBase = c.apiBase
      setConfig(c)
    }).catch(() => {})
  }, [])
  return config
}

function useStatusTicker(baseMs: number, isTracking: boolean, snapshotAt: number) {
  const [displayMs, setDisplayMs] = useState(baseMs)
  useEffect(() => {
    setDisplayMs(isTracking ? baseMs + (Date.now() - snapshotAt) : baseMs)
    if (!isTracking) return
    const t = setInterval(() => setDisplayMs(baseMs + (Date.now() - snapshotAt)), 1_000)
    return () => clearInterval(t)
  }, [baseMs, isTracking, snapshotAt])
  return displayMs
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1_000)
  const h = Math.floor(s / 3_600)
  const m = Math.floor((s % 3_600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}

function insertMarkdownAt(
  ta: HTMLTextAreaElement,
  setContent: (v: string) => void,
  prefix: string,
  suffix = ''
): void {
  const { selectionStart: s, selectionEnd: e, value } = ta
  const selected = value.slice(s, e)
  const newVal = value.slice(0, s) + prefix + selected + suffix + value.slice(e)
  setContent(newVal)
  requestAnimationFrame(() => {
    ta.setSelectionRange(s + prefix.length, s + prefix.length + selected.length)
    ta.focus()
  })
}

function linkifyText(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(https?:\/\/[^\s<&]+(?:&amp;[^\s<&]+)*)/g, (m) => {
      const href = m.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      return `<a href="${href}" target="_blank" rel="noreferrer" style="color:${C.accent};text-decoration:underline;word-break:break-all">${m}</a>`
    })
    .replace(/\n/g, '<br>')
}

function simpleMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:0.88em;font-weight:700;margin:6px 0 2px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:1em;font-weight:700;margin:8px 0 3px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:1.1em;font-weight:700;margin:10px 0 4px">$1</h1>')
    .replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:2px solid #888;padding-left:7px;margin:3px 0;opacity:0.65">$1</blockquote>')
    .replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid rgba(128,128,128,0.3);margin:8px 0">')
    .replace(/^[*-] (.+)$/gm, '<li style="margin-left:16px;list-style:disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-left:16px;list-style:decimal">$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(128,128,128,0.15);padding:1px 4px;border-radius:3px;font-family:monospace;font-size:0.85em">$1</code>')
    .replace(/(https?:\/\/[^\s<&]+(?:&amp;[^\s<&]+)*)/g, (m) => {
      const href = m.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      return `<a href="${href}" target="_blank" rel="noreferrer" style="color:${C.accent};text-decoration:underline;word-break:break-all">${m}</a>`
    })
    .replace(/\n/g, '<br>')
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

type Tab = 'home' | 'messages' | 'tasks' | 'activity' | 'settings'
interface NavItem { id: Tab; icon: (active: boolean) => React.ReactNode; label: string }

const SIDEBAR_W = 72

const NAV: NavItem[] = [
  { id: 'home', icon: (a) => <Home size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Home' },
  { id: 'messages', icon: (a) => <Headphones size={20} strokeWidth={a ? 2 : 1.5} />, label: 'DMs' },
  { id: 'tasks', icon: (a) => <CheckSquare size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Tasks' },
  { id: 'activity', icon: (a) => <Bell size={20} strokeWidth={a ? 2 : 1.5} />, label: 'Activity' },
]

function Sidebar({ tab, setTab, auth, onLogout, isOnline, messageBadge, messageMention, updateBadge }: {
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
      {/* Titlebar drag area — traffic lights live here */}
      <div style={{ height: 38, flexShrink: 0 }} />

      {/* Main nav column — logo + items in one flow */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, WebkitAppRegion: 'no-drag' }}>
        {/* Workspace icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          overflow: 'hidden', flexShrink: 0, marginBottom: 4, marginTop: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src="workspace-logo.svg" alt="Bundy" style={{ width: 36, height: 36 }} />
        </div>

        {/* Nav items */}
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
                {/* Badge overlay */}
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

      {/* Bottom section — settings + user avatar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingBottom: 14, WebkitAppRegion: 'no-drag' }}>
        {/* Settings */}
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

        {/* User profile button */}
        <ProfileButton auth={auth} isOnline={isOnline} onLogout={onLogout} setTab={setTab} />
      </div>
    </nav>
  )
}

/* ─── Profile Button (Slack-style idle / hover / click) ───────────────────── */

function ProfileButton({ auth, isOnline, onLogout, setTab }: {
  auth: Auth; isOnline: boolean; onLogout: () => void; setTab: (t: Tab) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const statusText = isOnline ? 'Active' : 'Away'

  // Status indicator — small square with rounded corners like Slack
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
      {/* Avatar button */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 36, height: 36, borderRadius: 8, border: 'none',
          background: hovered || menuOpen ? C.fillPrimary : C.fillSecondary,
          color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
          transition: 'background 0.15s ease',
        }}
      >
        {(auth.username[0] ?? '?').toUpperCase()}
        {/* Status indicator on avatar */}
        <span style={{
          position: 'absolute', bottom: -2, right: -2,
        }}>
          <StatusIcon size={10} border={C.bgTertiary} />
        </span>
      </button>

      {/* Hover tooltip — name pill */}
      {hovered && !menuOpen && (
        <div style={{
          position: 'absolute', left: 44, bottom: 4,
          background: C.bgFloating,
          border: `1px solid ${C.separator}`,
          borderRadius: 8, padding: '6px 12px',
          display: 'flex', alignItems: 'center', gap: 6,
          whiteSpace: 'nowrap', zIndex: 9999,
          boxShadow: C.shadowMed,
          pointerEvents: 'none',
        }}>
          <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{auth.username}</span>
          <StatusIcon size={8} border={C.bgFloating} />
        </div>
      )}

      {/* Profile popup menu */}
      {menuOpen && (
        <div style={{
          position: 'absolute', left: 44, bottom: -8,
          width: 280, background: C.bgFloating,
          border: `1px solid ${C.separator}`,
          borderRadius: 10, overflow: 'hidden', zIndex: 9999,
          boxShadow: C.shadowModal,
        }}>
          {/* User header */}
          <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 8, flexShrink: 0,
              background: C.fillSecondary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
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

          {/* Update status row */}
          <div style={{ padding: '0 12px 12px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 8,
              background: C.bgInput, cursor: 'pointer',
              color: C.textMuted, fontSize: 13,
            }}
              onClick={() => { setMenuOpen(false) }}
            >
              <Smile size={16} />
              <span>Update your status</span>
            </div>
          </div>

          <div style={{ height: 1, background: C.separator }} />

          {/* Menu items */}
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
            <ProfileMenuItem label={`Sign out of Bundy`} onClick={() => { setMenuOpen(false); onLogout() }} />
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

  // If bold word is specified, wrap it in <b>
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
        color: C.text, fontSize: 13, fontWeight: 400, cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ flex: 1 }}>{renderLabel()}</span>
      {shortcut && <span style={{ color: C.textMuted, fontSize: 12 }}>{shortcut}</span>}
      {trailing}
    </button>
  )
}

// ─── Home Panel ───────────────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  'clock-in': '#43B581', 'clock-out': '#f04747',
  'break-start': '#007acc', 'break-end': '#007acc',
}

function HomePanel({ auth: _auth, config, onOpenTask }: { auth: Auth; config: ApiConfig | null; onOpenTask?: (taskId: string) => void }) {
  const [status, setStatus] = useState<BundyStatus | null>(null)
  const [todayTasks, setTodayTasks] = useState<Task[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [actioning, setActioning] = useState(false)
  const [snapshotAt] = useState(Date.now())

  // Clock-out report modal state
  const [planItems, setPlanItems] = useState<PlanItem[]>([])
  const [confirmItems, setConfirmItems] = useState<Array<{ itemId: string; status: string; outcome: string }>>([])
  const [clockOutStep, setClockOutStep] = useState<'tasks' | 'plan' | 'report'>('report')
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportContent, setReportContent] = useState('')
  const [taskStatusUpdates, setTaskStatusUpdates] = useState<Record<string, string>>({})
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [reportError, setReportError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const reportTextareaRef = useRef<HTMLTextAreaElement>(null)

  const displayMs = useStatusTicker(
    status?.elapsedMs ?? 0,
    status?.isTracking ?? false,
    snapshotAt
  )

  const load = useCallback(async () => {
    try {
      const s = await window.electronAPI.getStatus()
      setStatus(s)
    } catch { /* offline */ }
  }, [])

  const loadPlan = useCallback(async () => {
    try {
      const plan = await window.electronAPI.getDailyPlan()
      setPlanItems(plan?.items ?? [])
    } catch { /* non-fatal */ }
  }, [])

  const loadTasks = useCallback(async () => {
    if (!config) return
    setLoadingTasks(true)
    try {
      const res = await fetch(`${config.apiBase}/api/tasks?assigneeId=me&dueDate=today&includeSubtasks=1`, {
        headers: { 'Authorization': `Bearer ${config.token}` },
      })
      if (res.ok) {
        const data = await res.json() as { tasks: Task[] }
        setTodayTasks(data.tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled'))
      }
    } catch { /* offline */ } finally {
      setLoadingTasks(false)
    }
  }, [config])

  useEffect(() => {
    if (DEMO_MODE) {
      setStatus({ isClockedIn: true, onBreak: false, isTracking: true, elapsedMs: 14_520_000, username: 'john.doe', role: 'developer' })
      setTodayTasks([
        { id: 'd1', title: 'Fix login page responsiveness', description: 'The login page breaks on small screens', status: 'in-progress', priority: 'high', dueDate: new Date().toISOString(), estimatedHours: 3, createdBy: 'u1', projectId: 'p1', assigneeId: 'u2', project: { id: 'p1', name: 'Bundy Web', color: '#007acc' }, section: null, assignee: { id: 'u2', username: 'john.doe', alias: 'John', avatarUrl: null }, _count: { comments: 2, subtasks: 1 } },
        { id: 'd2', title: 'Write unit tests for auth module', description: null, status: 'todo', priority: 'medium', dueDate: new Date().toISOString(), estimatedHours: 2, createdBy: 'u1', projectId: 'p2', assigneeId: 'u2', project: { id: 'p2', name: 'Backend API', color: '#43B581' }, section: null, assignee: { id: 'u2', username: 'john.doe', alias: 'John', avatarUrl: null }, _count: { comments: 0, subtasks: 3 } },
        { id: 'd3', title: 'Update README documentation', description: 'Add new API endpoints to the docs', status: 'todo', priority: 'low', dueDate: new Date().toISOString(), estimatedHours: 1, createdBy: 'u3', projectId: 'p1', assigneeId: 'u2', project: { id: 'p1', name: 'Bundy Web', color: '#007acc' }, section: null, assignee: { id: 'u2', username: 'john.doe', alias: 'John', avatarUrl: null }, _count: { comments: 5, subtasks: 0 } },
        { id: 'd4', title: 'Review PR #142 — Dashboard redesign', description: null, status: 'in-progress', priority: 'urgent', dueDate: new Date().toISOString(), estimatedHours: 1, createdBy: 'u4', projectId: 'p3', assigneeId: 'u2', project: { id: 'p3', name: 'Desktop App', color: '#cca700' }, section: null, assignee: { id: 'u2', username: 'john.doe', alias: 'John', avatarUrl: null }, _count: { comments: 8, subtasks: 0 } },
      ])
      setPlanItems([
        { id: 'pl1', project: { id: 'p1', name: 'Bundy Web' }, details: 'Fix responsive issues on login + dashboard', status: 'in-progress', outcome: null },
        { id: 'pl2', project: { id: 'p2', name: 'Backend API' }, details: 'Write auth module unit tests (target 80% coverage)', status: 'pending', outcome: null },
        { id: 'pl3', project: { id: 'p3', name: 'Desktop App' }, details: 'Review and merge dashboard redesign PR', status: 'pending', outcome: null },
      ])
      return
    }
    load()
    loadTasks()
    loadPlan()
    const unsub = window.electronAPI.onStatusUpdate((s) => setStatus(s))
    const unsubPlan = window.electronAPI.onPlanUpdate((plan) => setPlanItems(plan.items ?? []))
    return () => { unsub(); unsubPlan() }
  }, [load, loadTasks, loadPlan])

  function openClockOutModal() {
    setReportContent('')
    setReportError('')
    setConfirmItems(planItems.map(i => ({ itemId: i.id, status: i.status, outcome: '' })))
    setTaskStatusUpdates({})
    const openTasks = todayTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')
    if (openTasks.length > 0) {
      setClockOutStep('tasks')
    } else if (planItems.length > 0) {
      setClockOutStep('plan')
    } else {
      setClockOutStep('report')
    }
    setShowReportModal(true)
  }

  async function doAction(action: string) {
    if (action === 'clock-out') { openClockOutModal(); return }
    new Audio('sounds/button-press.mp3').play().catch(() => {})
    setActioning(true)
    try {
      await window.electronAPI.doAction(action)
      const s = await window.electronAPI.getStatus()
      setStatus(s)
    } catch { /* offline, queued */ } finally {
      setActioning(false)
    }
  }

  async function markTaskDone(taskId: string) {
    if (!config) return
    try {
      await fetch(`${config.apiBase}/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      })
      setTodayTasks(prev => prev.filter(t => t.id !== taskId))
    } catch { /* offline */ }
  }

  const actions = status ? (
    status.isClockedIn
      ? status.isTracking
        ? [{ id: 'break-start', label: 'Take Break' }, { id: 'clock-out', label: 'Clock Out' }]
        : [{ id: 'break-end', label: 'Resume' }, { id: 'clock-out', label: 'Clock Out' }]
      : [{ id: 'clock-in', label: 'Clock In' }]
  ) : []

  const statusLabel = !status ? 'Loading…'
    : status.isTracking ? 'Tracking'
    : status.onBreak ? 'On Break'
    : status.isClockedIn ? 'Clocked In'
    : 'Not Started'

  const statusColor = !status ? C.textMuted
    : status.isTracking ? C.success
    : status.onBreak ? C.warning
    : C.textMuted

  const TASK_STATUS_ICONS: Record<string, React.ReactNode> = {
    todo: <Circle size={13} />, 'in-progress': <Play size={13} />,
    done: <Check size={13} />, cancelled: <AlertCircle size={13} />,
  }
  const TASK_STATUS_COLORS: Record<string, string> = {
    todo: C.textMuted, 'in-progress': C.accent, done: C.success, cancelled: C.danger,
  }
  const PRIORITY_COLORS: Record<string, string> = {
    urgent: '#f04747', high: '#007acc', medium: '#007acc', low: '#43B581',
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>

      {/* Timer Card */}
      <div style={{ ...card(), textAlign: 'center', padding: '42px 36px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 1.5, color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase', marginBottom: 10 }}>
          Today's Work Time
        </div>
        <div style={{
          fontSize: 78, fontWeight: 700, letterSpacing: -2, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
          color: '#ffffff',
        }}>
          {formatMs(displayMs)}
        </div>
        <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6,
          background: C.accentLight, borderRadius: 20, padding: '5px 14px',
          color: statusColor, fontSize: 13, fontWeight: 600 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
          {statusLabel}
        </div>
      </div>

      {/* Action Buttons */}
      {actions.length > 0 && (
        <div style={{ display: 'flex', gap: 12 }}>
          {actions.map(a => (
            <button
              key={a.id}
              onClick={() => doAction(a.id)}
              disabled={actioning}
              style={{
                flex: 1, padding: '16px 0', borderRadius: 3, border: 'none',
                background: ACTION_COLORS[a.id] ?? C.accent,
                color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                opacity: actioning ? 0.6 : 1,
                boxShadow: `0 4px 12px ${ACTION_COLORS[a.id] ?? C.accent}44`,
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Today's Tasks */}
      <div style={{ ...card() }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Today's Tasks</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>
            {todayTasks.length} {todayTasks.length === 1 ? 'task' : 'tasks'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 280, overflowY: 'auto' }}>
          {loadingTasks ? (
            <div style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
              <Loader size={16} />
            </div>
          ) : todayTasks.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
              No tasks due today. Manage tasks in the Tasks tab.
            </div>
          ) : (
            todayTasks.map((task, i) => (
              <div
                key={task.id}
                onClick={() => onOpenTask?.(task.id)}
                style={{
                  padding: '10px 4px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer',
                  borderTop: i > 0 ? `1px solid ${C.separator}` : 'none',
                  transition: 'background 0.12s',
                  borderRadius: 4,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = '' }}
              >
                {/* Status icon */}
                <div style={{ color: TASK_STATUS_COLORS[task.status] ?? C.textMuted, flexShrink: 0 }}>
                  {TASK_STATUS_ICONS[task.status] ?? <Circle size={14} />}
                </div>

                {/* Task info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 500, color: C.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {task.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    {task.project && (
                      <span style={{
                        fontSize: 11, color: task.project.color || C.textMuted,
                        fontWeight: 500,
                      }}>
                        {task.project.name}
                      </span>
                    )}
                    <span style={{
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      color: PRIORITY_COLORS[task.priority] ?? C.textMuted,
                    }}>
                      {task.priority}
                    </span>
                  </div>
                </div>

                {/* View chevron */}
                <ChevronRight size={14} color={C.textMuted} style={{ flexShrink: 0, opacity: 0.5 }} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Clock-out Report Modal */}
      {showReportModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties} onClick={() => { setShowReportModal(false); setShowPreview(false) }}>
          <div onClick={e => e.stopPropagation()} style={{
            ...neu(), width: 500, maxHeight: '80vh', overflowY: 'auto', padding: 24,
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>
                {clockOutStep === 'tasks' ? '✅ Open Tasks' : clockOutStep === 'plan' ? '📋 Confirm Plan Status' : '🔴 Clock Out Report'}
              </span>
              <button
                onClick={() => { setShowReportModal(false); setShowPreview(false) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4 }}
              ><X size={16} /></button>
            </div>

            {/* ─── Step 0: Open Tasks ─── */}
            {clockOutStep === 'tasks' && (
              <>
                <div style={{ fontSize: 12, color: C.textMuted }}>
                  You have open tasks. Update their status before clocking out.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                  {todayTasks.map(task => (
                    <div key={task.id} style={{ ...neu(true), padding: 12, borderRadius: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>
                        {task.title}
                        {task.project && <span style={{ fontSize: 10, color: task.project.color || C.textMuted, background: (task.project.color || C.accent) + '18', padding: '1px 6px', borderRadius: 4, marginLeft: 8 }}>{task.project.name}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(['todo', 'in-progress', 'done', 'cancelled'] as const).map(s => {
                          const cur = taskStatusUpdates[task.id] ?? task.status
                          return (
                            <button
                              key={s}
                              onClick={() => setTaskStatusUpdates(prev => ({ ...prev, [task.id]: s }))}
                              style={{
                                fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                                border: 'none',
                                ...(cur === s ? neu() : { background: 'transparent' }),
                                color: cur === s ? (TASK_STATUS_COLORS[s] ?? C.textMuted) : C.textMuted,
                                fontWeight: cur === s ? 600 : 400,
                              }}
                            >{s}</button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowReportModal(false); setShowPreview(false) }}
                    style={{ flex: 1, ...neu(), padding: '10px', border: 'none', cursor: 'pointer', fontSize: 13, color: C.textMuted }}>
                    Cancel
                  </button>
                  <button onClick={async () => {
                    if (config && Object.keys(taskStatusUpdates).length > 0) {
                      await Promise.allSettled(Object.entries(taskStatusUpdates).map(([id, status]) =>
                        fetch(`${config.apiBase}/api/tasks/${id}`, {
                          method: 'PATCH',
                          headers: { 'Authorization': `Bearer ${config.token}`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status }),
                        })
                      ))
                      await loadTasks()
                    }
                    setClockOutStep(planItems.length > 0 ? 'plan' : 'report')
                  }}
                    style={{ flex: 1, ...neu(), padding: '10px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.accent }}>
                    Next →
                  </button>
                </div>
              </>
            )}

            {/* ─── Step 1: Plan Confirmation ─── */}
            {clockOutStep === 'plan' && (
              <>
                <div style={{ fontSize: 12, color: C.textMuted }}>
                  Update the status of each task before clocking out.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {planItems.map((item, idx) => {
                    const ci = confirmItems[idx]
                    if (!ci) return null
                    return (
                      <div key={item.id} style={{ ...neu(true), padding: 12, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.accent }}>{item.project.name}</span>
                          <span style={{ fontSize: 11, color: C.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.details}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {([
                            { value: 'completed', label: '✅ Done', color: C.success },
                            { value: 'continued', label: '🔁 To be continued', color: C.warning },
                            { value: 'planned', label: '📌 Haven\'t started', color: C.textMuted },
                            { value: 'blocked', label: '🚫 Blocked', color: C.danger },
                          ] as const).map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => setConfirmItems(prev => prev.map((c, i) => i === idx ? { ...c, status: opt.value } : c))}
                              style={{
                                fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                                border: 'none',
                                ...(ci.status === opt.value ? neu() : { background: 'transparent' }),
                                color: ci.status === opt.value ? opt.color : C.textMuted,
                                fontWeight: ci.status === opt.value ? 600 : 400,
                              }}
                            >{opt.label}</button>
                          ))}
                        </div>
                        <input
                          value={ci.outcome}
                          onChange={e => setConfirmItems(prev => prev.map((c, i) => i === idx ? { ...c, outcome: e.target.value } : c))}
                          placeholder="Outcome note (optional)"
                          style={{
                            ...neu(true), fontSize: 11, padding: '6px 10px', border: 'none', outline: 'none',
                            color: C.text, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => {
                    const openTasks = todayTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')
                    if (openTasks.length > 0) setClockOutStep('tasks')
                    else { setShowReportModal(false); setShowPreview(false) }
                  }}
                    style={{ flex: 1, ...neu(), padding: '10px', border: 'none', cursor: 'pointer', fontSize: 13, color: C.textMuted }}>
                    {todayTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length > 0 ? '← Back' : 'Cancel'}
                  </button>
                  <button onClick={() => setClockOutStep('report')}
                    style={{ flex: 1, ...neu(), padding: '10px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.accent }}>
                    Next →
                  </button>
                </div>
              </>
            )}

            {/* ─── Step 2: Report Editor ─── */}
            {clockOutStep === 'report' && (
              <>
                {/* Write / Preview tabs */}
                <div style={{ ...neu(true), display: 'flex', borderRadius: 4, padding: 3, gap: 3 }}>
                  {(['Write', 'Preview'] as const).map(t => (
                    <button key={t} onClick={() => setShowPreview(t === 'Preview')}
                      style={{
                        flex: 1, padding: '6px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer',
                        ...(!showPreview === (t === 'Write') ? neu() : { background: 'transparent' }),
                        color: !showPreview === (t === 'Write') ? C.text : C.textMuted,
                      }}>{t}</button>
                  ))}
                </div>

                {/* Formatting toolbar */}
                {!showPreview && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {([
                      { label: 'B', prefix: '**', suffix: '**', title: 'Bold', style: { fontWeight: 700 } as React.CSSProperties },
                      { label: 'I', prefix: '_', suffix: '_', title: 'Italic', style: { fontStyle: 'italic' } as React.CSSProperties },
                      { label: '~~', prefix: '~~', suffix: '~~', title: 'Strikethrough', style: { textDecoration: 'line-through' } as React.CSSProperties },
                      { label: 'H1', prefix: '# ', suffix: '', title: 'Heading 1', style: {} as React.CSSProperties },
                      { label: 'H2', prefix: '## ', suffix: '', title: 'Heading 2', style: {} as React.CSSProperties },
                      { label: '•', prefix: '\n- ', suffix: '', title: 'Bullet list', style: {} as React.CSSProperties },
                      { label: '1.', prefix: '\n1. ', suffix: '', title: 'Numbered list', style: {} as React.CSSProperties },
                      { label: '`c`', prefix: '`', suffix: '`', title: 'Inline code', style: { fontFamily: 'monospace' } as React.CSSProperties },
                    ]).map(({ label, prefix, suffix, title, style: btnStyle }) => (
                      <button key={title} title={title} onClick={() => {
                        if (reportTextareaRef.current) insertMarkdownAt(reportTextareaRef.current, setReportContent, prefix, suffix)
                      }}
                        style={{
                          ...neu(), padding: '4px 8px', fontSize: 11, border: 'none', cursor: 'pointer', borderRadius: 6,
                          fontFamily: 'SF Mono, Menlo, monospace', ...btnStyle,
                        }}>{label}</button>
                    ))}
                  </div>
                )}

                {/* Editor */}
                {!showPreview ? (
                  <textarea
                    ref={reportTextareaRef}
                    value={reportContent}
                    onChange={e => setReportContent(e.target.value)}
                    onKeyDown={e => {
                      const ta = e.currentTarget
                      if (e.key === 'Tab') { e.preventDefault(); insertMarkdownAt(ta, setReportContent, '  ', ''); return }
                      const mod = e.ctrlKey || e.metaKey
                      if (mod && e.key === 'b') { e.preventDefault(); insertMarkdownAt(ta, setReportContent, '**', '**') }
                      else if (mod && e.key === 'i') { e.preventDefault(); insertMarkdownAt(ta, setReportContent, '_', '_') }
                    }}
                    placeholder="What did you work on today?&#10;&#10;- Task 1&#10;- Task 2&#10;&#10;## Notes&#10;Any blockers?"
                    rows={8}
                    style={{
                      width: '100%', borderRadius: 4, padding: 12, fontSize: 13, fontFamily: 'SF Mono, Menlo, monospace',
                      ...neu(true), border: 'none', outline: 'none', color: C.text,
                      resize: 'none', boxSizing: 'border-box', lineHeight: 1.6,
                    }}
                  />
                ) : (
                  <div style={{
                    width: '100%', minHeight: 160, borderRadius: 4, padding: 12, fontSize: 13,
                    ...neu(true), color: C.text, boxSizing: 'border-box', lineHeight: 1.6, overflowY: 'auto',
                  }}
                    dangerouslySetInnerHTML={{
                      __html: reportContent.trim() ? simpleMarkdown(reportContent) : '<span style="opacity:0.4">Nothing to preview yet…</span>'
                    }}
                  />
                )}

                {/* Footer stats */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 11, color: C.textMuted }}>
                    {reportContent.split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>

                {reportError && <div style={{ fontSize: 12, color: C.danger }}>{reportError}</div>}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { planItems.length > 0 ? setClockOutStep('plan') : todayTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length > 0 ? setClockOutStep('tasks') : (setShowReportModal(false), setShowPreview(false)) }}
                    style={{ flex: 1, ...neu(), padding: '10px', border: 'none', cursor: 'pointer', fontSize: 13, color: C.textMuted }}>
                    {planItems.length > 0 || todayTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length > 0 ? '← Back' : 'Cancel'}
                  </button>
                  <button
                    onClick={async () => {
                      if (!reportContent.trim()) return
                      setReportSubmitting(true)
                      setReportError('')
                      try {
                        await window.electronAPI.submitReportWithPlan(
                          reportContent.trim(),
                          confirmItems.map(ci => ({
                            itemId: ci.itemId,
                            status: ci.status,
                            ...(ci.outcome.trim() ? { outcome: ci.outcome.trim() } : {}),
                          }))
                        )
                        setShowReportModal(false)
                        setShowPreview(false)
                        setReportContent('')
                        await loadPlan()
                        const s = await window.electronAPI.getStatus()
                        setStatus(s)
                      } catch (err: unknown) {
                        setReportError(err instanceof Error ? err.message : 'Failed to submit')
                      } finally {
                        setReportSubmitting(false)
                      }
                    }}
                    disabled={!reportContent.trim() || reportSubmitting}
                    style={{
                      flex: 1, ...neu(), padding: '10px', border: 'none', cursor: 'pointer',
                      fontSize: 13, fontWeight: 700, color: C.danger,
                      opacity: (!reportContent.trim() || reportSubmitting) ? 0.5 : 1,
                    }}>
                    {reportSubmitting ? 'Submitting…' : 'Submit & Clock Out'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Avatar helper ────────────────────────────────────────────────────────────

function Avatar({ url, name, size = 30, radius = '50%' }: { url?: string | null; name: string; size?: number; radius?: string }) {
  const [err, setErr] = useState(false)
  // Resolve server-relative URLs (e.g. /uploads/avatars/...) using the stored apiBase
  const resolvedUrl = url && url.startsWith('/') ? `${_apiBase}${url}` : url
  if (resolvedUrl && !err) {
    return (
      <img
        src={resolvedUrl} alt={name}
        onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, background: C.accentLight,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: C.accent, flexShrink: 0,
    }}>
      {(name[0] ?? '?').toUpperCase()}
    </div>
  )
}

// ─── Messages Panel ───────────────────────────────────────────────────────────

// Sub-modal: New DM / Group / Channel
function NewConvModal({ config, auth, onClose, onCreated, initialMode = 'dm' }: {
  config: ApiConfig; auth: Auth
  onClose: () => void; onCreated: (id: string) => void
  initialMode?: 'dm' | 'group' | 'channel'
}) {
  const [mode, setMode] = useState<'dm' | 'group' | 'channel'>(initialMode)
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${config.apiBase}/api/users`, { headers: { Authorization: `Bearer ${config.token}` } })
      .then(r => r.json())
      .then((d: { users: UserInfo[] }) => setUsers(d.users.filter(u => u.id !== auth.userId)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [config, auth.userId])

  const filtered = users.filter(u =>
    (u.alias ?? u.username).toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase())
  )

  async function create() {
    if (mode === 'dm') {
      if (selected.length !== 1) { setError('Pick one person'); return }
      setBusy(true)
      try {
        const res = await fetch(`${config.apiBase}/api/channels`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'dm', partnerId: selected[0] }),
        })
        const d = await res.json() as { channel?: { id: string }; error?: string }
        if (d.channel?.id) { onCreated(d.channel.id); onClose() }
        else setError(d.error ?? 'Failed to create')
      } catch { setError('Failed to create') } finally { setBusy(false) }
    } else {
      if (!name.trim()) { setError('Name is required'); return }
      if (mode === 'group' && selected.length === 0) { setError('Pick at least one member'); return }
      setBusy(true)
      try {
        const res = await fetch(`${config.apiBase}/api/channels`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: mode, name: name.trim(), memberIds: selected }),
        })
        const d = await res.json() as { channel?: { id: string }; error?: string }
        if (d.channel?.id) { onCreated(d.channel.id); onClose() }
        else setError(d.error ?? 'Failed to create')
      } catch { setError('Failed to create') } finally { setBusy(false) }
    }
  }

  const modeLabels = { dm: 'Direct Message', group: 'Group Chat', channel: 'Channel' }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        ...neu(), borderRadius: 8, padding: 20, width: 360,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>New Conversation</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}><X size={16} /></button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {(['dm', 'group', ...(auth.role === 'admin' ? ['channel'] : [])] as Array<'dm' | 'group' | 'channel'>).map(m => (
            <button key={m} onClick={() => { setMode(m); setSelected([]); setName(''); setError('') }}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: mode === m ? C.accent : C.lgBg,
                color: mode === m ? '#fff' : C.textMuted,
                boxShadow: mode === m ? `0 2px 6px ${C.accent}44` : C.lgShadow,
              }}>
              {modeLabels[m]}
            </button>
          ))}
        </div>

        {/* Name field for group/channel */}
        {(mode === 'group' || mode === 'channel') && (
          <input value={name} onChange={e => setName(e.target.value)} placeholder={mode === 'channel' ? 'channel-name' : 'Group name'}
            style={{ ...neu(true), padding: '8px 12px', fontSize: 13, color: C.text, border: 'none', outline: 'none', marginBottom: 10, borderRadius: 8 }} />
        )}

        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people…"
          style={{ ...neu(true), padding: '7px 12px', fontSize: 12, color: C.text, border: 'none', outline: 'none', marginBottom: 10, borderRadius: 8 }} />

        {/* User list */}
        {loading ? <div style={{ textAlign: 'center', padding: 20 }}><Loader size={20} /></div> : (
          <div style={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtered.map(u => {
              const isSel = selected.includes(u.id)
              return (
                <button key={u.id}
                  onClick={() => {
                    if (mode === 'dm') {
                      setSelected([u.id])
                    } else {
                      setSelected(prev => isSel ? prev.filter(id => id !== u.id) : [...prev, u.id])
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    background: isSel ? C.accentLight : 'transparent', borderRadius: 8,
                    border: isSel ? `1px solid ${C.accent}` : '1px solid transparent',
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                  <Avatar url={u.avatarUrl} name={u.alias ?? u.username} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{u.alias ?? u.username}</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>@{u.username}</div>
                  </div>
                  {isSel && <Check size={14} color={C.accent} />}
                </button>
              )
            })}
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: C.danger, marginTop: 8 }}>{error}</div>}

        {/* Create button */}
        <button onClick={create} disabled={busy || (mode === 'dm' && selected.length === 0)}
          style={{
            marginTop: 12, padding: '10px 0', borderRadius: 4, border: 'none', cursor: 'pointer',
            background: C.accent, color: '#fff', fontWeight: 700, fontSize: 13,
            opacity: busy ? 0.7 : 1,
          }}>
          {busy ? 'Creating…' : `Create ${modeLabels[mode]}`}
        </button>
      </div>
    </div>
  )
}

// ─── OG preview client cache ──────────────────────────────────────────────────

interface OgMeta { title: string | null; description: string | null; image: string | null; siteName: string | null }
const ogClientCache = new Map<string, OgMeta | null>()
const OG_CACHE_MAX = 200

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?.*)?$/i.test(url.split('?')[0])
}
function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url.split('?')[0])
}

// OG preview card rendered below a message bubble
function OgPreview({ url, config }: { url: string; config: ApiConfig }) {
  const [og, setOg] = useState<OgMeta | null | undefined>(ogClientCache.has(url) ? ogClientCache.get(url) : undefined)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (ogClientCache.has(url)) return
    const params = new URLSearchParams({ url })
    fetch(`${config.apiBase}/api/opengraph?${params}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(8000),
    })
      .then(r => r.json())
      .then((d: OgMeta & { error?: string }) => {
        const data = d.error ? null : (d.title || d.image ? d : null)
        if (ogClientCache.size >= OG_CACHE_MAX) {
          const firstKey = ogClientCache.keys().next().value
          if (firstKey !== undefined) ogClientCache.delete(firstKey)
        }
        ogClientCache.set(url, data)
        setOg(data)
      })
      .catch(() => {
        if (ogClientCache.size >= OG_CACHE_MAX) {
          const firstKey = ogClientCache.keys().next().value
          if (firstKey !== undefined) ogClientCache.delete(firstKey)
        }
        ogClientCache.set(url, null); setOg(null)
      })
  }, [url, config])

  if (!og) return null

  return (
    <div
      onClick={() => window.electronAPI.openExternal(url)}
      style={{
        marginTop: 6,
        borderLeft: '4px solid rgba(255, 255, 255, 0.15)',
        cursor: 'pointer',
        paddingLeft: 12,
        paddingTop: 4,
        paddingBottom: 4,
      }}
    >
      {og.siteName && (
        <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 2 }}>
          {og.siteName}
        </div>
      )}
      {og.title && (
        <div style={{ fontSize: 14, fontWeight: 600, color: C.accent, lineHeight: 1.3, marginBottom: 2 }}>
          {og.title}
        </div>
      )}
      {og.description && (
        <div style={{
          fontSize: 13, color: C.textSecondary, lineHeight: 1.4, marginBottom: 4,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
        }}>
          {og.description}
        </div>
      )}
      {og.image && (
        <img
          src={og.image} alt={og.title ?? ''}
          style={{
            maxWidth: 360, maxHeight: expanded ? 400 : 200, objectFit: 'cover',
            borderRadius: 6, display: 'block', marginTop: 4,
          }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          onClick={e => { e.stopPropagation(); setExpanded(!expanded) }}
        />
      )}
    </div>
  )
}

// ─── Message content renderer ─────────────────────────────────────────────────

// Parses text with [label](url) markdown links and bare https:// URLs.
// isMe controls link colour so it's readable on both blue and white bubbles.
// Task links matching /tasks/<id> are intercepted and opened in-app.
const TASK_LINK_RE = /\/tasks\/([a-z0-9]+)$/i

function parseContent(text: string, isMe = false): React.ReactNode {
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>\]"']+)/g
  const result: React.ReactNode[] = []
  let cursor = 0
  let m: RegExpExecArray | null
  let keyIdx = 0

  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > cursor) {
      result.push(formatInline(text.slice(cursor, m.index), keyIdx++))
    }
    const label = m[1] ?? m[3]
    const url = m[2] ?? m[3]
    const linkColor = isMe ? 'rgba(255,255,255,0.9)' : C.accent
    const taskMatch = TASK_LINK_RE.exec(url)
    if (taskMatch) {
      // Task link — open in-app
      const taskId = taskMatch[1]
      result.push(
        <a
          key={keyIdx++}
          href={url}
          onClick={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('bundy-open-task', { detail: { taskId } })) }}
          style={{ color: linkColor, textDecoration: 'underline', cursor: 'pointer', wordBreak: 'break-all', WebkitUserSelect: 'text', userSelect: 'text' }}
        >
          <CheckSquare size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
          {label.replace(/^https?:\/\/[^/]+/, '').startsWith('/tasks/') ? 'Open Task' : label}
        </a>
      )
    } else if (isImageUrl(url)) {
      result.push(
        <img key={keyIdx++} src={url} alt={label ?? ''} onClick={() => window.electronAPI.openExternal(url)}
          style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, display: 'block', marginTop: 4, cursor: 'pointer' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      )
    } else {
      result.push(
        <a
          key={keyIdx++}
          href={url}
          onClick={e => { e.preventDefault(); window.electronAPI.openExternal(url) }}
          style={{ color: linkColor, textDecoration: 'underline', cursor: 'pointer', wordBreak: 'break-all', WebkitUserSelect: 'text', userSelect: 'text' }}
        >
          {label}
          {' '}<ExternalLink size={10} style={{ display: 'inline', verticalAlign: 'middle' }} />
        </a>
      )
    }
    cursor = m.index + m[0].length
  }
  if (cursor < text.length) result.push(formatInline(text.slice(cursor), keyIdx++))
  return result.length === 1 ? result[0] : <>{result}</>
}

function formatInline(text: string, key?: number): React.ReactNode {
  // Bold and italic using dangerouslySetInnerHTML (trusted, no user input goes back unescaped)
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')
  return <span key={key} dangerouslySetInnerHTML={{ __html: html }} style={{ userSelect: 'text', WebkitUserSelect: 'text', wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} />
}

// Renders message content, handling lines, links, bold/italic
function renderMessageContent(text: string, isMe = false): React.ReactNode {
  return (
    <div style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}>
      {text.split('\n').map((line, li) => (
        <div key={li} style={{ lineHeight: 1.5, minHeight: li === 0 ? undefined : '1.5em', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
          {line ? parseContent(line, isMe) : <br />}
        </div>
      ))}
    </div>
  )
}

// Extracts bare URLs from text (in order)
function extractUrls(text: string): string[] {
  const urls: string[] = []
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>\]"']+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) urls.push(m[2] ?? m[3])
  return urls
}

// Auth-aware image component: fetches with bearer token so protected uploads render
function AuthImage({ src, config, alt, style, onClick }: { src: string; config: ApiConfig; alt?: string; style?: React.CSSProperties; onClick?: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!src) return
    let objectUrl: string | null = null
    let cancelled = false
    fetch(src, { headers: { Authorization: `Bearer ${config.token}` } })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob() })
      .then(blob => { if (!cancelled) { objectUrl = URL.createObjectURL(blob); setBlobUrl(objectUrl) } })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [src, config.token])
  if (error) return <div style={{ ...style, background: 'rgba(255, 255, 255, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}><FileText size={14} /></div>
  if (!blobUrl) return <div style={{ ...style, background: 'rgba(255, 255, 255, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}><Loader size={14} /></div>
  return <img src={blobUrl} alt={alt} style={style} onClick={onClick} />
}

// Inline image attachment (when message content matches attachment pattern)
function InlineAttachment({ content, config }: { content: string; isMe?: boolean; config?: ApiConfig }) {
  // Match [📎 filename](url) — allow any characters in filename including _ and spaces
  const match = content.match(/^\[📎\s([^\]]+?)\]\((https?:\/\/\S+?)\)\s*$/)
  if (!match) return null
  const [, filename, url] = match
  const cleanUrl = url.trim()
  const [expanded, setExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)

  // File type info for colored icon
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const extUpper = ext.toUpperCase() || 'FILE'
  const typeColor = (() => {
    switch (ext) {
      case 'zip': case 'rar': case '7z': case 'tar': case 'gz': return '#7B68EE'
      case 'csv': case 'xls': case 'xlsx': return '#2E7D32'
      case 'pdf': return '#C62828'
      case 'doc': case 'docx': return '#1565C0'
      case 'ppt': case 'pptx': return '#D84315'
      default: return '#5C6BC0'
    }
  })()

  // Slack-style filename header for media
  const fileHeader = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{filename}</span>
      <ChevronDown size={12} color={C.textMuted} />
    </div>
  )

  if (isImageUrl(cleanUrl)) {
    if (config) {
      return (
        <div style={{ marginTop: 4 }}>
          {fileHeader}
          <AuthImage
            src={cleanUrl}
            config={config}
            alt={filename}
            style={{
              maxWidth: 360, maxHeight: expanded ? 500 : 260,
              objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', display: 'block',
              border: `1px solid ${C.separator}`,
            }}
            onClick={() => setExpanded(!expanded)}
          />
        </div>
      )
    }
    if (imgError) {
      // Fallback to Slack-style file card on error
      return (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: C.textMuted }}>{extUpper}</span>
            <ChevronDown size={12} color={C.textMuted} />
          </div>
          <div
            onClick={() => window.electronAPI.openExternal(cleanUrl)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderRadius: 8,
              border: `1px solid ${C.separator}`,
              background: 'transparent',
              cursor: 'pointer', maxWidth: 400,
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 6, background: typeColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <FileText size={18} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{extUpper}</div>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div style={{ marginTop: 4 }}>
        {fileHeader}
        {!imgLoaded && !imgError && (
          <div style={{ width: 360, height: 200, borderRadius: 8, background: C.bgInput, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader size={18} color={C.textMuted} />
          </div>
        )}
        <img
          src={cleanUrl}
          alt={filename}
          loading="lazy"
          onClick={() => setExpanded(!expanded)}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          style={{
            maxWidth: 360, maxHeight: expanded ? 500 : 260,
            objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in',
            display: imgLoaded ? 'block' : 'none',
            border: `1px solid ${C.separator}`,
          }}
        />
      </div>
    )
  }
  if (isVideoUrl(cleanUrl)) {
    return (
      <div style={{ marginTop: 4 }}>
        {fileHeader}
        <video controls src={cleanUrl} style={{ maxWidth: 360, maxHeight: 260, borderRadius: 8, display: 'block' }} />
      </div>
    )
  }
  // Slack-style file card with colored type icon
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: C.textMuted }}>{extUpper}</span>
        <ChevronDown size={12} color={C.textMuted} />
      </div>
      <div
        onClick={() => window.electronAPI.openExternal(cleanUrl)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', borderRadius: 8,
          border: `1px solid ${C.separator}`,
          background: 'transparent',
          cursor: 'pointer', maxWidth: 400,
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 6, background: typeColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <FileText size={18} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>{extUpper}</div>
        </div>
      </div>
    </div>
  )
}

// ─── Incoming call overlay (shown regardless of active tab) ───────────────────

interface IncomingCallPayload { from: string; fromName: string; fromAvatar: string | null; sdp: string; callType: 'audio' | 'video' }

function IncomingCallOverlay({ payload, onAccept, onReject }: {
  payload: IncomingCallPayload
  config?: ApiConfig; auth?: Auth
  onAccept: () => void; onReject: () => void
}) {
  useEffect(() => {
    const audio = new Audio('sounds/incoming-call.mp3')
    audio.loop = true
    audio.volume = 0.6
    audio.play().catch(() => {})
    // System notification for incoming call (works even when minimized)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(`Incoming ${payload.callType === 'video' ? 'Video' : 'Audio'} Call`, {
        body: payload.fromName,
        silent: false,
      })
      n.onclick = () => { window.electronAPI.focusWindow(); onAccept() }
    }
    // Bring window to front
    window.electronAPI.focusWindow()
    return () => { audio.pause(); audio.src = '' }
  }, [])

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      ...neu(), padding: '16px 20px',
      display: 'flex', alignItems: 'center', gap: 14, minWidth: 280,
      animation: 'slideIn 0.2s ease-out',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%', background: C.accentLight,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <PhoneIncoming size={20} color={C.accent} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 500 }}>{payload.callType === 'video' ? 'Video call' : 'Audio call'}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{payload.fromName}</div>
      </div>
      <button
        onClick={onReject}
        style={{ width: 36, height: 36, borderRadius: '50%', background: C.danger, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title="Decline"
      >
        <PhoneOff size={16} color="#fff" />
      </button>
      <button
        onClick={onAccept}
        style={{ width: 36, height: 36, borderRadius: '50%', background: C.success, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title="Accept"
      >
        <Phone size={16} color="#fff" />
      </button>
    </div>
  )
}

// Sub-modal: Channel member management
function ChannelSettingsModal({ config, auth, conv, onClose }: {
  config: ApiConfig; auth: Auth; conv: Conversation; onClose: () => void
}) {
  const [members, setMembers] = useState<ChannelMember[]>(conv.members)
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [busy, setBusy] = useState(false)

  const isCreator = conv.createdBy === auth.userId
  // For 'channel' type, admin check deferred to server

  useEffect(() => {
    fetch(`${config.apiBase}/api/users`, { headers: { Authorization: `Bearer ${config.token}` } })
      .then(r => r.json())
      .then((d: { users: UserInfo[] }) => setAllUsers(d.users))
      .catch(() => {})
  }, [config])

  async function addMember(userId: string) {
    setBusy(true)
    try {
      const res = await fetch(`${config.apiBase}/api/channels/${conv.id}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const d = await res.json() as { ok?: boolean; user?: UserInfo }
      if (d.ok && d.user) setMembers(prev => [...prev, { userId, user: d.user! }])
    } catch (err) { console.error('[ChannelSettings] addMember failed:', err) } finally { setBusy(false) }
  }

  async function removeMember(userId: string) {
    setBusy(true)
    try {
      await fetch(`${config.apiBase}/api/channels/${conv.id}/members`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      setMembers(prev => prev.filter(m => m.userId !== userId))
    } catch (err) { console.error('[ChannelSettings] removeMember failed:', err) } finally { setBusy(false) }
  }

  async function leaveChannel() {
    if (!confirm(`Leave "${conv.name}"?`)) return
    setBusy(true)
    try {
      await fetch(`${config.apiBase}/api/channels/${conv.id}/members`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: auth.userId }),
      })
      onClose()
      // Channel removal handled by SSE or re-fetch
      window.dispatchEvent(new CustomEvent('bundy-channel-left', { detail: { channelId: conv.id } }))
    } catch (err) { console.error('[ChannelSettings] leave failed:', err) } finally { setBusy(false) }
  }

  async function deleteChannel() {
    if (!confirm(`Delete "${conv.name}" permanently? This cannot be undone.`)) return
    setBusy(true)
    try {
      await fetch(`${config.apiBase}/api/channels/${conv.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.token}` },
      })
      onClose()
    } catch (err) { console.error('[ChannelSettings] delete failed:', err) } finally { setBusy(false) }
  }

  const nonMembers = allUsers.filter(u => !members.some(m => m.userId === u.id))

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        ...neu(), borderRadius: 8, padding: 20, width: 340,
        maxHeight: '80vh', overflow: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{conv.name} — Members</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}><X size={16} /></button>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Current Members</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {members.map(m => (
            <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar url={m.user.avatarUrl} name={m.user.alias ?? m.user.username} size={28} />
              <span style={{ flex: 1, fontSize: 13, color: C.text }}>{m.user.alias ?? m.user.username}</span>
              {m.userId !== auth.userId && (
                <button onClick={() => removeMember(m.userId)} disabled={busy}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 4 }}>
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        {nonMembers.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Add Members</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {nonMembers.map(u => (
                <button key={u.id} onClick={() => addMember(u.id)} disabled={busy}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
                    background: 'transparent', border: `1px solid ${C.separator}`, cursor: 'pointer',
                    borderRadius: 8, textAlign: 'left',
                  }}>
                  <Avatar url={u.avatarUrl} name={u.alias ?? u.username} size={26} />
                  <span style={{ fontSize: 13, color: C.text }}>{u.alias ?? u.username}</span>
                  <UserPlus size={13} style={{ marginLeft: 'auto', color: C.accent }} />
                </button>
              ))}
            </div>
          </>
        )}

        {/* Leave / Delete actions */}
        {conv.type !== 'dm' && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.separator}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!isCreator && (
              <button onClick={leaveChannel} disabled={busy}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.separator}`,
                  background: 'transparent', color: C.warning, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
                }}>
                <LogOut size={14} /> Leave {conv.type === 'group' ? 'Group' : 'Channel'}
              </button>
            )}
            {isCreator && (
              <button onClick={deleteChannel} disabled={busy}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.danger}`,
                  background: 'transparent', color: C.danger, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
                }}>
                <Trash2 size={14} /> Delete {conv.type === 'group' ? 'Group' : 'Channel'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MessagesPanel({ config, auth, acceptedCall, iceBufferRef, answerSdpRef, isVisible }: {
  config: ApiConfig; auth: Auth
  /** Set when user accepts an incoming call from IncomingCallOverlay */
  acceptedCall?: IncomingCallPayload | null
  /** Pre-buffered ICE candidates from FullDashboard */
  iceBufferRef: React.MutableRefObject<RTCIceCandidateInit[]>
  /** Pre-buffered answer SDP from FullDashboard */
  answerSdpRef: React.MutableRefObject<string | null>
  /** Whether the messages panel is the currently active tab (visible to the user) */
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
  // Pagination state
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Thread panel state
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null)
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([])
  const [threadInput, setThreadInput] = useState('')
  const [sendingThread, setSendingThread] = useState(false)
  // Emoji picker state
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
  const selectConv = (c: Conversation | null) => { if (c) setShowThreadsView(false); setSelected(c) }
  // Shared media directory panel
  const [showSharedMedia, setShowSharedMedia] = useState(false)
  const [sharedMediaTab, setSharedMediaTab] = useState<'links' | 'media' | 'files'>('media')
  const [sharedMedia, setSharedMedia] = useState<{ links: any[]; media: any[]; files: any[] }>({ links: [], media: [], files: [] })
  const [loadingSharedMedia, setLoadingSharedMedia] = useState(false)
  // Active call state
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

  // When parent accepts an incoming call, open the CallWidget in answer mode
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

  // Track conference room events
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
      // If we were in this conference, leave
      setMyConference(prev => prev?.channelId === payload.channelId ? null : prev)
    }
    const onConfInvite = (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; fromName: string; channelId: string; channelName: string }>).detail
      if (Notification.permission === 'granted') {
        new Notification(`📞 Call invite from ${payload.fromName}`, { body: `Join #${payload.channelName}` })
      }
    }
    window.addEventListener('bundy-active-conferences', onActiveConfs)
    window.addEventListener('bundy-conference-joined', onConfJoined)
    window.addEventListener('bundy-conference-left', onConfLeft)
    window.addEventListener('bundy-conference-ended', onConfEnded)
    window.addEventListener('bundy-conference-invite', onConfInvite)
    return () => {
      window.removeEventListener('bundy-active-conferences', onActiveConfs)
      window.removeEventListener('bundy-conference-joined', onConfJoined)
      window.removeEventListener('bundy-conference-left', onConfLeft)
      window.removeEventListener('bundy-conference-ended', onConfEnded)
      window.removeEventListener('bundy-conference-invite', onConfInvite)
    }
  }, [])

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
      const data = await apiFetch('/api/channels') as { channels: Array<{
        id: string; type: string; name: string | null; createdBy?: string
        members: Array<{ userId: string; user: UserInfo }>
        messages: Array<{ content: string; createdAt: string; sender: { username: string; alias: string | null } }>
        unread?: number
      }> }
      const convs: Conversation[] = data.channels.map(ch => {
        let name = ch.name ?? ''
        let avatar: string | null = null
        let partnerId: string | undefined
        if (ch.type === 'dm') {
          const other = ch.members.find(m => m.userId !== auth.userId)
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
          members: ch.members, createdBy: ch.createdBy,
          lastMessage: last ? `${last.sender.alias ?? last.sender.username}: ${last.content}` : undefined,
          lastTime: last?.createdAt,
          unread: ch.unread ?? 0,
        }
      })
      setChannels(convs)
    } catch { /* offline */ }
  }, [apiFetch, auth.userId])

  // Broadcast total unread count to FullDashboard for sidebar badge
  useEffect(() => {
    const total = channels.reduce((sum, c) => sum + (c.unread ?? 0), 0)
    const hasMention = channels.some(c => mentionedChannels.has(c.id) && (c.unread ?? 0) > 0)
    window.dispatchEvent(new CustomEvent('bundy-unread-update', { detail: { count: total, mention: hasMention } }))
    // Update dock / taskbar badge
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
      // Clear unread for this channel immediately
      setChannels(prev => prev.map(c => c.id === conv.id ? { ...c, unread: 0 } : c))
      setMentionedChannels(prev => { const next = new Set(prev); next.delete(conv.id); return next })
      // Mark as read on server
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
              if (ev === 'channel-message') {
                const channelId = payload.channelId as string
                const parentMsgId = payload.parentMessageId as string | null | undefined
                const isCurrentChannel = selectedRef.current?.id === channelId
                if (isCurrentChannel) {
                  if (parentMsgId) {
                    // Thread reply — update reply count on parent + add to thread panel if open
                    // Skip replyCount increment for own messages (sendThreadReply already did it)
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
                        sender: {
                          id: payload.senderId,
                          username: payload.senderName,
                          alias: payload.senderAlias ?? payload.senderName,
                          avatarUrl: payload.senderAvatar ?? null,
                        },
                        reads: [],
                      }]
                    })
                    // Update thread activity list
                    setThreadActivities(prev => prev.map(t =>
                      t.id === parentMsgId ? {
                        ...t,
                        replyCount: t.replyCount + 1,
                        lastReply: {
                          content: payload.content,
                          sender: { alias: payload.senderAlias ?? null, username: payload.senderName, avatarUrl: payload.senderAvatar ?? null },
                          createdAt: payload.createdAt,
                        },
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
                        sender: {
                          id: payload.senderId,
                          username: payload.senderName,
                          alias: payload.senderAlias ?? payload.senderName,
                          avatarUrl: payload.senderAvatar ?? null,
                        },
                        reads: [],
                      }]
                    })
                  }
                  // Mark as read only when the messages panel is actually visible to the user
                  if (isVisibleRef.current) {
                    fetch(`${config.apiBase}/api/channels/${channelId}/read`, {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${config.token}` },
                    }).catch(() => {})
                  } else {
                    // Panel is hidden — treat like an unread message so badge appears
                    setChannels(prev => prev.map(c =>
                      c.id === channelId ? { ...c, unread: (c.unread ?? 0) + 1 } : c
                    ))
                  }
                  // Play subtle sound for incoming messages in the currently open chat
                  if (payload.senderId !== auth.userId) {
                    new Audio('sounds/new-message.mp3').play().catch(() => {})
                  }
                } else if (payload.senderId !== auth.userId) {
                  // Not our own message in another channel — increment unread + notify
                  const isMention = !!payload.content && (
                    payload.content.toLowerCase().includes(`@${auth.username.toLowerCase()}`) ||
                    (auth.username && payload.content.toLowerCase().includes(`@${auth.username.toLowerCase()}`))
                  )
                  setChannels(prev => prev.map(c =>
                    c.id === channelId ? { ...c, unread: (c.unread ?? 0) + 1 } : c
                  ))
                  if (isMention) {
                    setMentionedChannels(prev => new Set([...prev, channelId]))
                  }
                  // Always use the prominent sound for messages in non-active channels
                  new Audio('sounds/mentioned-message.mp3').play().catch(() => {})
                  // Desktop notification
                  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    void new Notification(isMention ? `📣 You were mentioned` : `New message`, {
                      body: `${payload.senderAlias ?? payload.senderName}: ${payload.content}`,
                      silent: false,
                    })
                  } else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
                    Notification.requestPermission()
                  }
                }
                // Update last message in sidebar
                setChannels(prev => prev.map(c =>
                  c.id === channelId
                    ? { ...c, lastMessage: `${payload.senderAlias ?? payload.senderName}: ${payload.content}`, lastTime: payload.createdAt }
                    : c
                ))
                // Update thread activity list for replies in non-current channels
                if (parentMsgId && payload.senderId !== auth.userId && !isCurrentChannel) {
                  setThreadActivities(prev => prev.map(t =>
                    t.id === parentMsgId ? {
                      ...t,
                      replyCount: t.replyCount + 1,
                      lastReply: {
                        content: payload.content,
                        sender: { alias: payload.senderAlias ?? null, username: payload.senderName, avatarUrl: payload.senderAvatar ?? null },
                        createdAt: payload.createdAt,
                      },
                      unread: true,
                    } : t
                  ))
                }
              } else if (ev === 'channel-message-edit') {
                setMessages(prev => prev.map(m =>
                  m.id === payload.messageId
                    ? { ...m, content: payload.content, editedAt: payload.editedAt }
                    : m
                ))
                setThreadMessages(prev => prev.map(m =>
                  m.id === payload.messageId
                    ? { ...m, content: payload.content, editedAt: payload.editedAt }
                    : m
                ))
              } else if (ev === 'channel-message-delete') {
                setMessages(prev => prev.filter(m => m.id !== payload.messageId))
                setThreadMessages(prev => prev.filter(m => m.id !== payload.messageId))
              } else if (ev === 'channel-typing') {
                const channelId = payload.channelId as string
                if (payload.userId !== auth.userId) {
                  const userName = payload.userName as string
                  setTypingMap(prev => {
                    const cur = prev[channelId] ?? []
                    if (cur.includes(userName)) return prev
                    return { ...prev, [channelId]: [...cur, userName] }
                  })
                  // Clear this user's typing after 3s
                  const timerKey = `${channelId}:${userName}`
                  if (typingTimers.current[timerKey]) clearTimeout(typingTimers.current[timerKey])
                  typingTimers.current[timerKey] = setTimeout(() => {
                    setTypingMap(prev => {
                      const cur = (prev[channelId] ?? []).filter(n => n !== userName)
                      if (cur.length === 0) {
                        const { [channelId]: _, ...rest } = prev
                        return rest
                      }
                      return { ...prev, [channelId]: cur }
                    })
                  }, 3000)
                }
              } else if (ev === 'channel-read') {
                setMessages(prev => prev.map(m =>
                  payload.messageIds?.includes(m.id)
                    ? { ...m, reads: [...(m.reads ?? []), { userId: payload.userId }] }
                    : m
                ))
                // Clear unread badge when WE read it (our userId matches)
                if (payload.userId === auth.userId) {
                  setChannels(prev => prev.map(c =>
                    c.id === payload.channelId ? { ...c, unread: 0 } : c
                  ))
                }
              } else if (ev === 'channel-created') {
                // A new channel/DM/group was created that includes us — reload list
                loadChannels()
              } else if (ev === 'channel-deleted') {
                // A channel was deleted — remove from list, clear if active
                const { channelId } = payload as { channelId: string }
                setChannels(prev => prev.filter(c => c.id !== channelId))
                setSelected(prev => prev?.id === channelId ? null : prev)
              } else if (ev === 'channel-reaction') {
                const { messageId, userId, emoji, action } = payload as { messageId: string; userId: string; emoji: string; action: 'add' | 'remove'; userName: string }
                // Skip SSE for own reactions — already handled optimistically in toggleReaction
                if (userId === auth.userId) continue
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
                // Real-time user status update (online/break/out)
                const { userId, userStatus } = payload as { userId: string; userStatus: string | null }
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
              } else if (ev === 'active-conferences') {
                window.dispatchEvent(new CustomEvent('bundy-active-conferences', { detail: payload }))
              }
            } catch { /* ignore parse errors */ }
          }
        }
        // Stream ended normally — reconnect
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
  }, [config, auth.userId, loadChannels])

  // Request notification permission once
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    if (DEMO_MODE) {
      const demoChannels: Conversation[] = [
        { id: 'ch1', type: 'channel', name: '#general', members: [], unread: 3, lastTime: new Date(Date.now() - 300_000).toISOString() },
        { id: 'ch2', type: 'channel', name: '#engineering', members: [], unread: 0, lastTime: new Date(Date.now() - 900_000).toISOString() },
        { id: 'ch3', type: 'channel', name: '#design', members: [], unread: 1, lastTime: new Date(Date.now() - 1800_000).toISOString() },
        { id: 'ch6', type: 'channel', name: '#random', members: [], unread: 0, lastTime: new Date(Date.now() - 120_000).toISOString() },
        { id: 'ch4', type: 'dm', name: 'Sarah Chen', avatar: null, partnerId: 'u3', members: [{ userId: 'u3', user: { id: 'u3', username: 'sarah.chen', alias: 'Sarah Chen', avatarUrl: null, userStatus: 'online' } }], unread: 0, lastTime: new Date(Date.now() - 600_000).toISOString() },
        { id: 'ch7', type: 'dm', name: 'Mike Torres', avatar: null, partnerId: 'u4', members: [{ userId: 'u4', user: { id: 'u4', username: 'mike.t', alias: 'Mike Torres', avatarUrl: null, userStatus: 'online' } }], unread: 0, lastTime: new Date(Date.now() - 1200_000).toISOString() },
        { id: 'ch8', type: 'dm', name: 'Alex Kim', avatar: null, partnerId: 'u5', members: [{ userId: 'u5', user: { id: 'u5', username: 'alex.k', alias: 'Alex Kim', avatarUrl: null, userStatus: 'break' } }], unread: 0, lastTime: new Date(Date.now() - 7200_000).toISOString() },
        { id: 'ch5', type: 'group', name: 'Marc, Robert Siemens', members: [{ userId: 'u4', user: { id: 'u4', username: 'mike.t', alias: 'Marc', avatarUrl: null } }, { userId: 'u5', user: { id: 'u5', username: 'alex.k', alias: 'Robert Siemens', avatarUrl: null } }], unread: 2, lastTime: new Date(Date.now() - 3600_000).toISOString() },
        { id: 'ch9', type: 'dm', name: 'Lisa Martinez', avatar: null, partnerId: 'u6', members: [{ userId: 'u6', user: { id: 'u6', username: 'lisa.m', alias: 'Lisa Martinez', avatarUrl: null, userStatus: 'out' } }], unread: 0, lastTime: new Date(Date.now() - 10800_000).toISOString() },
      ]
      setChannels(demoChannels)
      setSelected(demoChannels[0])
      setThreadActivities([
        {
          id: 'th1', channelId: 'ch1', channelName: '#general', channelType: 'channel',
          parentMessage: { content: 'Hey team 👋 Quick update on the Q4 roadmap. I\'ve broken down the remaining work into three priorities...', sender: { alias: 'Sarah Chen', username: 'sarah.chen', avatarUrl: null } },
          lastReply: { content: 'I can take the dashboard redesign. Already started the Figma mockups.', sender: { alias: 'Mike Torres', username: 'mike.t', avatarUrl: null }, createdAt: new Date(Date.now() - 1200_000).toISOString() },
          replyCount: 5, unread: true,
        },
        {
          id: 'th2', channelId: 'ch2', channelName: '#engineering', channelType: 'channel',
          parentMessage: { content: 'Just pushed the hotfix for the login timeout issue. Can someone review? PR #156', sender: { alias: 'Alex Kim', username: 'alex.k', avatarUrl: null } },
          lastReply: { content: 'LGTM! Approved and merged. Nice catch on the token refresh.', sender: { alias: 'Sarah Chen', username: 'sarah.chen', avatarUrl: null }, createdAt: new Date(Date.now() - 3600_000).toISOString() },
          replyCount: 3, unread: true,
        },
        {
          id: 'th3', channelId: 'ch3', channelName: '#design', channelType: 'channel',
          parentMessage: { content: 'New dashboard mockups are ready for review. Check the Figma link in the channel description.', sender: { alias: 'Mike Torres', username: 'mike.t', avatarUrl: null } },
          lastReply: { content: 'Love the new color scheme! Just left some comments on the spacing.', sender: { alias: 'Lisa Martinez', username: 'lisa.m', avatarUrl: null }, createdAt: new Date(Date.now() - 7200_000).toISOString() },
          replyCount: 8, unread: false,
        },
        {
          id: 'th4', channelId: 'ch4', channelName: 'Sarah Chen', channelType: 'dm',
          parentMessage: { content: 'Can you share the API docs for the new endpoints?', sender: { alias: 'Sarah Chen', username: 'sarah.chen', avatarUrl: null } },
          lastReply: { content: 'Sure, just sent them over. Let me know if you need the auth tokens too.', sender: { alias: null, username: 'you', avatarUrl: null }, createdAt: new Date(Date.now() - 14400_000).toISOString() },
          replyCount: 4, unread: false,
        },
        {
          id: 'th5', channelId: 'ch1', channelName: '#general', channelType: 'channel',
          parentMessage: { content: 'Sprint review starts at 10 AM. @mike.t are you ready with the dashboard demo?', sender: { alias: 'Lisa Martinez', username: 'lisa.m', avatarUrl: null } },
          lastReply: { content: 'All set! Screen recording backup is ready too 😅', sender: { alias: 'Mike Torres', username: 'mike.t', avatarUrl: null }, createdAt: new Date(Date.now() - 9000_000).toISOString() },
          replyCount: 4, unread: false,
        },
      ])
      const _yesterday = Date.now() - 86400_000
      const _today = Date.now()
      setMessages([
        // — Yesterday —
        { id: 'm1', content: 'Hey team 👋 Quick update on the Q4 roadmap. I\'ve broken down the remaining work into three priorities:\n\n1. Finish the dashboard redesign (ETA Friday)\n2. Auth service migration to OAuth 2.0\n3. Performance audit on the search API\n\nLet me know if anyone has concerns or wants to swap assignments.', createdAt: new Date(_yesterday + 3600_000 * 9).toISOString(), editedAt: null, sender: { id: 'u3', username: 'sarah.chen', alias: 'Sarah Chen', avatarUrl: null }, reactions: [{ emoji: '👍', userId: 'u4', user: { id: 'u4', username: 'mike.t', alias: 'Mike Torres' } }, { emoji: '👍', userId: 'u5', user: { id: 'u5', username: 'alex.k', alias: 'Alex Kim' } }], replyCount: 3 },
        { id: 'm2', content: 'I can take the OAuth migration. Already started looking into the PKCE flow for our mobile clients.', createdAt: new Date(_yesterday + 3600_000 * 9.25).toISOString(), editedAt: null, sender: { id: 'u5', username: 'alex.k', alias: 'Alex Kim', avatarUrl: null } },
        { id: 'm3', content: '@alex.k Nice, that would be great. Make sure to coordinate with @lisa.m — she has the client secrets and the current token rotation schedule.', createdAt: new Date(_yesterday + 3600_000 * 9.5).toISOString(), editedAt: null, sender: { id: 'u3', username: 'sarah.chen', alias: 'Sarah Chen', avatarUrl: null } },
        { id: 'm4', content: 'Just pushed the hotfix for the login timeout issue. Can someone review?\n\nPR #156 — fixes the session expiry bug where users were getting logged out after 5 minutes instead of 30.\n\nChanges:\n• Updated token refresh logic in auth-middleware.ts\n• Added retry with exponential backoff\n• New integration tests for session lifecycle', createdAt: new Date(_yesterday + 3600_000 * 14).toISOString(), editedAt: null, sender: { id: 'u5', username: 'alex.k', alias: 'Alex Kim', avatarUrl: null }, isPinned: true, pinnedAt: new Date(_yesterday + 3600_000 * 14.5).toISOString(), pinnedBy: 'u3', reactions: [{ emoji: '👀', userId: 'u2', user: { id: 'u2', username: 'john.doe', alias: 'John' } }] },
        { id: 'm5', content: 'Looking at it now. The session handling looks solid 👍 Just left a few minor comments on the error messages.', createdAt: new Date(_yesterday + 3600_000 * 15).toISOString(), editedAt: null, sender: { id: 'u2', username: 'john.doe', alias: 'John', avatarUrl: null }, reactions: [{ emoji: '✅', userId: 'u5', user: { id: 'u5', username: 'alex.k', alias: 'Alex Kim' } }] },
        // — Today —
        { id: 'm6', content: 'Good morning everyone! 🌅 Sprint review starts at 10 AM. @mike.t are you ready with the dashboard demo?', createdAt: new Date(_today - 3600_000 * 3).toISOString(), editedAt: null, sender: { id: 'u6', username: 'lisa.m', alias: 'Lisa Martinez', avatarUrl: null }, reactions: [{ emoji: '☕', userId: 'u3', user: { id: 'u3', username: 'sarah.chen', alias: 'Sarah Chen' } }, { emoji: '☕', userId: 'u5', user: { id: 'u5', username: 'alex.k', alias: 'Alex Kim' } }] },
        { id: 'm7', content: 'Yep! All set. I\'ve prepared the demo for the new dashboard features including:\n\n• Real-time activity tracking\n• Redesigned message panel\n• New task board with drag & drop\n\nScreen recording is ready as backup in case the live demo gods are not on our side 😅', createdAt: new Date(_today - 3600_000 * 2.5).toISOString(), editedAt: null, sender: { id: 'u4', username: 'mike.t', alias: 'Mike Torres', avatarUrl: null }, replyCount: 4 },
        { id: 'm8', content: 'Here\'s the updated API documentation for the v2 endpoints:\n\n```\nGET  /api/v2/users\nPOST /api/v2/tasks\nPATCH /api/v2/tasks/:id\nDEL  /api/v2/tasks/:id\n```\n\nFull docs are on Confluence. Let me know if anything is missing.', createdAt: new Date(_today - 3600_000 * 2).toISOString(), editedAt: new Date(_today - 3600_000 * 1.8).toISOString(), sender: { id: 'u4', username: 'mike.t', alias: 'Mike Torres', avatarUrl: null } },
        { id: 'm8b', content: '[📎 dashboard-mockup.png](https://picsum.photos/seed/bundy-dash/800/450.jpg)', createdAt: new Date(_today - 3600_000 * 1.9).toISOString(), editedAt: null, sender: { id: 'u4', username: 'mike.t', alias: 'Mike Torres', avatarUrl: null } },
        { id: 'm8c', content: '[📎 project-assets-v2.zip](https://example.com/files/project-assets-v2.zip)', createdAt: new Date(_today - 3600_000 * 1.85).toISOString(), editedAt: null, sender: { id: 'u4', username: 'mike.t', alias: 'Mike Torres', avatarUrl: null } },
        { id: 'm8d', content: 'Found this great article on the architecture pattern we discussed: https://github.com/electron/electron', createdAt: new Date(_today - 3600_000 * 1.7).toISOString(), editedAt: null, sender: { id: 'u5', username: 'alex.k', alias: 'Alex Kim', avatarUrl: null } },
        { id: 'm9', content: 'Deployed v2.3.1 to production. All health checks passing ✅\n\nZero downtime this time — the blue-green deployment strategy is working perfectly.', createdAt: new Date(_today - 3600_000).toISOString(), editedAt: null, sender: { id: 'u5', username: 'alex.k', alias: 'Alex Kim', avatarUrl: null }, reactions: [{ emoji: '🚀', userId: 'u2', user: { id: 'u2', username: 'john.doe', alias: 'John' } }, { emoji: '🎉', userId: 'u3', user: { id: 'u3', username: 'sarah.chen', alias: 'Sarah Chen' } }, { emoji: '🚀', userId: 'u6', user: { id: 'u6', username: 'lisa.m', alias: 'Lisa Martinez' } }] },
        { id: 'm10', content: 'Amazing work team! 🙌 The client demo went perfectly. They loved the new dashboard and especially the real-time features.', createdAt: new Date(_today - 1800_000).toISOString(), editedAt: null, sender: { id: 'u3', username: 'sarah.chen', alias: 'Sarah Chen', avatarUrl: null } },
        { id: 'm11', content: 'Great to hear! Drinks are on me tonight 🍕🎉', createdAt: new Date(_today - 900_000).toISOString(), editedAt: null, sender: { id: 'u3', username: 'sarah.chen', alias: 'Sarah Chen', avatarUrl: null }, reactions: [{ emoji: '🍕', userId: 'u4', user: { id: 'u4', username: 'mike.t', alias: 'Mike Torres' } }, { emoji: '🎉', userId: 'u5', user: { id: 'u5', username: 'alex.k', alias: 'Alex Kim' } }, { emoji: '❤️', userId: 'u6', user: { id: 'u6', username: 'lisa.m', alias: 'Lisa Martinez' } }] },
      ])
      // Pre-populate OG cache for demo links
      ogClientCache.set('https://github.com/electron/electron', {
        title: 'electron/electron: Build cross-platform desktop apps with JavaScript, HTML, and CSS',
        description: 'Build cross-platform desktop apps with JavaScript, HTML, and CSS. Electron uses Chromium and Node.js so you can develop with web technologies.',
        image: 'https://opengraph.githubassets.com/1/electron/electron',
        siteName: 'GitHub',
      })
      return
    }
    loadChannels()
  }, [loadChannels])

  // Load thread activities when threads view is opened
  useEffect(() => {
    if (!showThreadsView || DEMO_MODE) return
    apiFetch('/api/threads').then((data: any) => {
      setThreadActivities(data.threads ?? [])
    }).catch(() => {})
  }, [showThreadsView, apiFetch])

  // Periodically refresh member statuses so DM list stays up-to-date
  useEffect(() => {
    if (DEMO_MODE) return
    function refreshStatuses() {
      apiFetch('/api/users/statuses').then((data: any) => {
        const statusMap: Record<string, string | null> = {}
        for (const u of (data.users ?? [])) statusMap[u.id] = u.userStatus ?? null
        setChannels(prev => prev.map(c => ({
          ...c,
          members: c.members.map(m =>
            m.userId in statusMap ? { ...m, user: { ...m.user, userStatus: statusMap[m.userId] } } : m
          ),
        })))
      }).catch(() => {})
    }
    // Fetch immediately on mount, then every 30 seconds
    refreshStatuses()
    const id = setInterval(refreshStatuses, 30_000)
    return () => clearInterval(id)
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

  useEffect(() => {
    if (!selected) return
    if (!DEMO_MODE) loadMessages(selected)
    // Close thread/pinned panel when switching channels
    setThreadParent(null)
    setThreadMessages([])
    setShowPinned(false)
    setEmojiPickerMsgId(null)
    // Open thread if navigated from thread activity
    if (pendingThreadRef.current) {
      const pending = pendingThreadRef.current
      pendingThreadRef.current = null
      openThread(pending)
    }
  }, [selected, loadMessages]) // eslint-disable-line react-hooks/exhaustive-deps

  // After new channel created, open it
  function handleCreated(id: string) {
    loadChannels().then(() => {
      setChannels(prev => {
        const ch = prev.find(c => c.id === id)
        if (ch) setSelected(ch)
        return prev
      })
    })
  }

  // When user switches back to the messages tab, mark the active channel as read
  useEffect(() => {
    if (!isVisible || !selected || DEMO_MODE) return
    setChannels(prev => prev.map(c => c.id === selected.id ? { ...c, unread: 0 } : c))
    setMentionedChannels(prev => { const next = new Set(prev); next.delete(selected.id); return next })
    fetch(`${config.apiBase}/api/channels/${selected.id}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}` },
    }).catch(() => {})
  }, [isVisible]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const typingTimerRef = useRef<NodeJS.Timeout | null>(null)
  function sendTyping() {
    if (!selected) return
    if (typingTimerRef.current) return
    typingTimerRef.current = setTimeout(() => { typingTimerRef.current = null }, 2000)
    fetch(`${config.apiBase}/api/channels/${selected.id}/typing`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    }).catch(() => {})
  }

  async function send() {
    if (!input.trim() || !selected || sending) return
    const content = input.trim()
    setSending(true)
    setInput('')
    try {
      await apiFetch(`/api/channels/${selected.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
      await loadMessages(selected)
      setChannels(prev => prev.map(c =>
        c.id === selected.id
          ? { ...c, lastMessage: `${auth.username}: ${content}`, lastTime: new Date().toISOString() }
          : c
      ))
    } catch { /* offline */ } finally {
      setSending(false)
    }
  }

  async function handleEditMessage() {
    if (!editingMsgId || !editingContent.trim() || !selected) return
    try {
      await apiFetch(`/api/channels/${selected.id}/messages/${editingMsgId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: editingContent.trim() }),
      })
      setMessages(prev => prev.map(m =>
        m.id === editingMsgId ? { ...m, content: editingContent.trim(), editedAt: new Date().toISOString() } : m
      ))
    } catch (err) { console.error('[Messages] edit failed:', err) }
    setEditingMsgId(null)
    setEditingContent('')
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
        const params = new URLSearchParams({ q: q.trim() })
        const data = await apiFetch(`/api/channels/search?${params}`)
        setSearchResults(data.messages ?? [])
      } catch { setSearchResults([]) }
      setSearching(false)
    }, 400)
  }

  function handleSearchResultClick(result: typeof searchResults[0]) {
    // Navigate to the channel and close search
    const ch = channels.find(c => c.id === result.channelId)
    if (ch) setSelected(ch)
    setShowSearch(false)
    setSearchQuery('')
    setSearchResults([])
  }

  // Load older messages (pagination) — preserves scroll position
  async function loadOlderMessages() {
    if (!selected || loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)
    const container = messagesScrollRef.current
    const prevScrollHeight = container?.scrollHeight ?? 0
    const prevScrollTop = container?.scrollTop ?? 0
    try {
      const oldest = messages[0]
      const data = await apiFetch(`/api/channels/${selected.id}/messages?before=${oldest.id}&limit=50`)
      const older: ChatMessage[] = (data.messages ?? []).map((m: ChatMessage & { reactions?: ChatMessage['reactions'] }) => ({
        ...m, reactions: m.reactions ?? [], replyCount: m.replyCount ?? 0,
        isPinned: m.isPinned ?? false,
      }))
      flushSync(() => {
        setMessages(prev => [...older, ...prev])
        setHasMore(data.hasMore ?? false)
      })
      // After DOM update, restore scroll position so user stays at same position
      if (container) {
        container.scrollTop = prevScrollTop + (container.scrollHeight - prevScrollHeight)
      }
    } catch { /* offline */ } finally { setLoadingMore(false) }
  }

  // Emoji reactions
  const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🚀']

  async function toggleReaction(msgId: string, emoji: string, isThread = false) {
    if (!selected) return
    try {
      const res = await apiFetch(`/api/channels/${selected.id}/messages/${msgId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
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
      if (isThread) setThreadMessages(updateFn)
      else setMessages(updateFn)
    } catch { /* offline */ }
    setEmojiPickerMsgId(null)
  }

  // Pin/unpin messages
  async function togglePin(msgId: string) {
    if (!selected) return
    try {
      const res = await apiFetch(`/api/channels/${selected.id}/messages/${msgId}/pin`, { method: 'POST' })
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, isPinned: res.isPinned, pinnedAt: res.pinnedAt, pinnedBy: res.pinnedBy } : m
      ))
    } catch { /* offline */ }
  }

  // Load pinned messages
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

  // Open thread panel
  async function openThread(msg: ChatMessage) {
    setThreadParent(msg)
    setThreadInput('')
    try {
      const data = await apiFetch(`/api/channels/${selected!.id}/messages?parentMessageId=${msg.id}`)
      setThreadMessages((data.messages ?? []).map((m: ChatMessage) => ({
        ...m, reactions: m.reactions ?? [], replyCount: m.replyCount ?? 0,
      })))
    } catch { setThreadMessages([]) }
  }

  // Send thread reply
  async function sendThreadReply() {
    if (!threadInput.trim() || !selected || !threadParent || sendingThread) return
    const content = threadInput.trim()
    setSendingThread(true)
    setThreadInput('')
    try {
      await apiFetch(`/api/channels/${selected.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, parentMessageId: threadParent.id }),
      })
      // Reload thread
      const data = await apiFetch(`/api/channels/${selected.id}/messages?parentMessageId=${threadParent.id}`)
      setThreadMessages((data.messages ?? []).map((m: ChatMessage) => ({
        ...m, reactions: m.reactions ?? [], replyCount: m.replyCount ?? 0,
      })))
      // Update reply count in main messages
      setMessages(prev => prev.map(m => m.id === threadParent.id ? { ...m, replyCount: (m.replyCount ?? 0) + 1 } : m))
    } catch { /* offline */ } finally { setSendingThread(false) }
  }

  // Group reactions by emoji for display
  function groupReactions(reactions: NonNullable<ChatMessage['reactions']>) {
    const map = new Map<string, { emoji: string; count: number; users: string[]; reacted: boolean }>()
    for (const r of reactions) {
      const existing = map.get(r.emoji)
      if (existing) {
        existing.count++
        existing.users.push(r.user.alias ?? r.user.username)
        if (r.userId === auth.userId) existing.reacted = true
      } else {
        map.set(r.emoji, {
          emoji: r.emoji, count: 1,
          users: [r.user.alias ?? r.user.username],
          reacted: r.userId === auth.userId,
        })
      }
    }
    return Array.from(map.values())
  }

  const sortUnreadFirst = (a: Conversation, b: Conversation) => (b.unread ?? 0) - (a.unread ?? 0)
  const channelList = channels.filter(c => c.type === 'channel').sort(sortUnreadFirst)
  const groupList = channels.filter(c => c.type === 'group').sort(sortUnreadFirst)
  const dmList = channels.filter(c => c.type === 'dm').sort(sortUnreadFirst)

  // Render markdown-like content with selectable text
  // renderContent is replaced by module-level renderMessageContent + OG previews per bubble

  const selectedTyping = selected ? (typingMap[selected.id] ?? []) : []

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {showNewConv && <NewConvModal config={config} auth={auth} initialMode={showNewConv || 'dm'} onClose={() => setShowNewConv(false)} onCreated={handleCreated} />}
      {showSettings && selected && <ChannelSettingsModal config={config} auth={auth} conv={selected} onClose={() => setShowSettings(false)} />}
      {activeCall && (
        <CallWidget
          config={config}
          auth={auth}
          targetUser={activeCall.targetUser}
          callType={activeCall.callType}
          offerSdp={activeCall.offerSdp}
          bufferedIce={iceBufferRef.current.splice(0)}
          onEnd={() => { iceBufferRef.current = []; answerSdpRef.current = null; setActiveCall(null) }}
        />
      )}
      {myConference && (
        <ConferenceWidget
          config={config}
          auth={auth}
          channelId={myConference.channelId}
          channelName={myConference.channelName}
          initialParticipants={myConference.participants}
          onLeave={() => setMyConference(null)}
        />
      )}

      {/* Conversations sidebar */}
      <div style={{
        width: 240, borderRight: `1px solid ${C.separator}`,
        background: 'rgba(22, 22, 22, 0.5)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
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
              style={{
                width: '100%', padding: '6px 10px', fontSize: 12,
                border: `1px solid ${C.separator}`, borderRadius: 8,
                outline: 'none', background: C.bgInput, color: C.text,
              }}
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
                  style={{
                    width: '100%', display: 'flex', flexDirection: 'column', gap: 2,
                    padding: '8px 16px', border: 'none', textAlign: 'left',
                    background: 'transparent', cursor: 'pointer',
                    borderBottom: `1px solid ${C.separator}`,
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.accent }}>
                      {r.channel.type === 'channel' ? `#${r.channel.name}` : r.channel.name}
                    </span>
                    <span style={{ fontSize: 10, color: C.textMuted }}>{formatTime(r.createdAt)}</span>
                  </div>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{r.sender.alias ?? r.sender.username}</span>
                  <span style={{
                    fontSize: 12, color: C.text, overflow: 'hidden',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>{r.content}</span>
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
              background: showThreadsView
                ? 'linear-gradient(90deg, rgba(0, 0, 255, 0.22) 0%, rgba(0, 0, 255, 0.12) 50%, rgba(0, 0, 255, 0.08) 100%)'
                : 'transparent',
              boxShadow: showThreadsView ? 'inset 0 0 0 1px rgba(0, 0, 255, 0.16)' : 'none',
              backdropFilter: showThreadsView ? 'blur(12px)' : 'none',
              WebkitBackdropFilter: showThreadsView ? 'blur(12px)' : 'none',
              color: showThreadsView ? C.sidebarTextActive : C.sidebarText,
              fontSize: 14, fontWeight: showThreadsView ? 600 : 500,
              borderRadius: 0,
              transition: 'all 0.15s ease',
            }}
          >
            <MessageCircle size={16} />
            <span style={{ flex: 1 }}>Threads</span>
            {threadActivities.filter(t => t.unread).length > 0 && (
              <span style={{
                minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px',
                background: C.danger, color: '#fff', fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
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
                <button onClick={(e) => { e.stopPropagation(); setShowNewConv('channel') }} title="Create channel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sidebarText, padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', opacity: hoveredSection === 'channels' ? 1 : 0, transition: 'opacity 0.15s ease' }}>
                  <Plus size={14} />
                </button>
              </div>
              {!collapsedSections.channels && channelList.map(c => <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} auth={auth} typingUsers={typingMap[c.id] ?? []} hasActiveCall={!!activeConferences[c.id]} isMentioned={mentionedChannels.has(c.id)} onClick={() => selectConv(c)} onClose={selected?.id === c.id ? () => selectConv(null) : undefined} />)}
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
                <button onClick={(e) => { e.stopPropagation(); setShowNewConv('group') }} title="Create group" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sidebarText, padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', opacity: hoveredSection === 'groups' ? 1 : 0, transition: 'opacity 0.15s ease' }}>
                  <Plus size={14} />
                </button>
              </div>
              {!collapsedSections.groups && groupList.map(c => <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} auth={auth} typingUsers={typingMap[c.id] ?? []} hasActiveCall={!!activeConferences[c.id]} isMentioned={mentionedChannels.has(c.id)} onClick={() => selectConv(c)} onClose={selected?.id === c.id ? () => selectConv(null) : undefined} />)}
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
                <button onClick={(e) => { e.stopPropagation(); setShowNewConv('dm') }} title="New message" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sidebarText, padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', opacity: hoveredSection === 'dms' ? 1 : 0, transition: 'opacity 0.15s ease' }}>
                  <Plus size={14} />
                </button>
              </div>
              {!collapsedSections.dms && dmList.map(c => <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} auth={auth} typingUsers={typingMap[c.id] ?? []} isMentioned={mentionedChannels.has(c.id)} onClick={() => selectConv(c)} onClose={selected?.id === c.id ? () => selectConv(null) : undefined} />)}
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

      {/* Threads Activity View */}
      {showThreadsView ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', background: C.contentBg }}>
          <div style={{
            borderBottom: `1px solid ${C.separator}`, background: C.lgBg, flexShrink: 0,
            padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
          }}>
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
                        id: thread.id,
                        content: thread.parentMessage.content,
                        createdAt: '',
                        editedAt: null,
                        sender: { id: '', username: thread.parentMessage.sender.username, alias: thread.parentMessage.sender.alias, avatarUrl: thread.parentMessage.sender.avatarUrl },
                        reactions: [], replyCount: thread.replyCount, reads: [],
                      }
                      if (selected?.id === ch.id) {
                        openThread(mockMsg)
                      } else {
                        pendingThreadRef.current = mockMsg
                        setSelected(ch)
                      }
                    }}
                    style={{
                      width: '100%', display: 'flex', flexDirection: 'column', gap: 8,
                      padding: '14px 20px', border: 'none', textAlign: 'left',
                      background: 'transparent', cursor: 'pointer',
                      transition: 'background 0.1s ease',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.sidebarHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Channel label */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {thread.channelType === 'channel' ? <Hash size={12} color={C.textMuted} /> : thread.channelType === 'group' ? <Users size={12} color={C.textMuted} /> : null}
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>{thread.channelName}</span>
                    </div>

                    {/* Parent message */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <Avatar url={thread.parentMessage.sender.avatarUrl} name={senderName} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{senderName}</span>
                        </div>
                        <div style={{
                          fontSize: 13, color: C.text, marginTop: 2,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {thread.parentMessage.content}
                        </div>
                      </div>
                    </div>

                    {/* Reply info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 38 }}>
                      <Avatar url={thread.lastReply.sender.avatarUrl} name={replierName} size={18} />
                      <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>
                        {thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}
                      </span>
                      <span style={{ fontSize: 11, color: C.textMuted }}>{timeAgo(thread.lastReply.createdAt)}</span>
                      {thread.unread && (
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />
                      )}
                    </div>

                    {/* Last reply preview */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingLeft: 38, marginTop: -2 }}>
                      <span style={{ fontSize: 12, color: C.textMuted }}>
                        <span style={{ fontWeight: 600, color: C.sidebarText }}>{replierName}:</span>{' '}
                        {thread.lastReply.content}
                      </span>
                    </div>
                  </button>
                  {i < threadActivities.length - 1 && (
                    <div style={{ height: 1, background: C.separator, margin: '0 20px' }} />
                  )}
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', background: C.contentBg }}>
          {/* Slack-style header */}
          <div style={{
            borderBottom: `1px solid ${C.separator}`,
            background: C.lgBg,
            flexShrink: 0,
          }}>
            {/* Top row: avatar, name, actions */}
            <div style={{
              padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              {/* Channel/DM icon + name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                {selected.type === 'dm' ? (() => {
                  const partnerStatus = selected.members?.find(m => m.userId === selected.partnerId)?.user?.userStatus
                    ?? selected.members?.[0]?.user?.userStatus
                  const dotColor = partnerStatus === 'online' ? C.success : partnerStatus === 'break' ? C.warning : C.textMuted
                  return (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar url={selected.avatar} name={selected.name} size={28} />
                      <div style={{
                        position: 'absolute', bottom: -1, right: -1,
                        width: 10, height: 10, borderRadius: '50%',
                        background: dotColor, border: `2px solid ${C.lgBg}`,
                      }} />
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
                {selected.type !== 'dm' && selected.members.length > 0 && (
                  <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>
                    {selected.members.length} members
                  </span>
                )}
              </div>

              {/* Right action icons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                {/* Phone / Call buttons */}
                {selected.type === 'dm' && selected.partnerId && (() => {
                  const partner = selected.members.find(m => m.userId === selected.partnerId)
                  const targetUser = {
                    id: selected.partnerId,
                    name: partner?.user.alias ?? partner?.user.username ?? selected.name,
                    avatar: selected.avatar ?? null,
                  }
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

                {/* Conference call for channels/groups */}
                {selected.type !== 'dm' && (() => {
                  const conf = activeConferences[selected.id]
                  const inThisConf = myConference?.channelId === selected.id
                  if (inThisConf) return null
                  if (conf && conf.length > 0) {
                    return (
                      <button onClick={async () => {
                        try {
                          const res = await fetch(`${config.apiBase}/api/calls`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
                            body: JSON.stringify({ action: 'conference-join', channelId: selected.id }),
                          })
                          const data = await res.json()
                          if (!data.ok) return
                          setMyConference({ channelId: selected.id, channelName: selected.name, participants: data.participants ?? [] })
                        } catch {}
                      }} title={`Join call (${conf.length})`}
                        style={{ background: C.success, border: 'none', cursor: 'pointer', color: '#fff', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={13} /> Join ({conf.length})
                      </button>
                    )
                  }
                  return (
                    <button onClick={async () => {
                      try {
                        const res = await fetch(`${config.apiBase}/api/calls`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
                          body: JSON.stringify({ action: 'conference-join', channelId: selected.id }),
                        })
                        const data = await res.json()
                        if (!data.ok) return
                        setMyConference({ channelId: selected.id, channelName: selected.name, participants: data.participants ?? [] })
                      } catch {}
                    }} title="Start call"
                      style={{ width: 32, height: 32, borderRadius: 6, background: 'none', border: `1px solid ${C.separator}`, cursor: 'pointer', color: C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = C.textMuted }}>
                      <Phone size={15} />
                    </button>
                  )
                })()}

                {/* Notification / Pin */}
                <button onClick={() => { setShowPinned(!showPinned); if (!showPinned) loadPinnedMessages() }} title="Pinned messages"
                  style={{ width: 32, height: 32, borderRadius: 6, background: 'none', border: `1px solid ${C.separator}`, cursor: 'pointer', color: showPinned ? C.accent : C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseEnter={e => { if (!showPinned) { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text } }}
                  onMouseLeave={e => { if (!showPinned) { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = C.textMuted } }}>
                  <Pin size={15} />
                </button>

                {/* Search */}
                <button onClick={() => { setShowSearch(!showSearch); if (showSearch) { setSearchQuery(''); setSearchResults([]) } }} title="Search messages"
                  style={{ width: 32, height: 32, borderRadius: 6, background: 'none', border: `1px solid ${C.separator}`, cursor: 'pointer', color: showSearch ? C.accent : C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseEnter={e => { if (!showSearch) { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text } }}
                  onMouseLeave={e => { if (!showSearch) { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = C.textMuted } }}>
                  <Search size={15} />
                </button>

                {/* Settings / more */}
                {selected.type !== 'dm' && (
                  <button onClick={() => setShowSettings(true)} title="Channel settings"
                    style={{ width: 32, height: 32, borderRadius: 6, background: 'none', border: `1px solid ${C.separator}`, cursor: 'pointer', color: C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = C.textMuted }}>
                    <Settings2 size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Tab bar (Slack-style) */}
            <div style={{ display: 'flex', gap: 0, padding: '0 16px' }}>
              {[
                { id: 'messages' as const, label: 'Messages', icon: <MessageSquare size={14} /> },
                { id: 'pinned' as const, label: 'Pins', icon: <Pin size={14} /> },
                { id: 'files' as const, label: 'Files', icon: <FolderOpen size={14} /> },
              ].map(t => {
                const isActive = t.id === 'messages' ? (!showPinned && !showSharedMedia) : t.id === 'pinned' ? showPinned : showSharedMedia
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      if (t.id === 'messages') { setShowPinned(false); setShowSharedMedia(false) }
                      else if (t.id === 'pinned') { setShowPinned(!showPinned); setShowSharedMedia(false); if (!showPinned) loadPinnedMessages() }
                      else { setShowSharedMedia(!showSharedMedia); setShowPinned(false); if (!showSharedMedia) loadSharedMedia() }
                    }}
                    style={{
                      padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 13, fontWeight: isActive ? 600 : 400,
                      color: isActive ? C.text : C.textMuted,
                      borderBottom: `2px solid ${isActive ? C.accent : 'transparent'}`,
                      marginBottom: -1,
                      transition: 'color 0.1s, border-color 0.1s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = C.text }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = C.textMuted }}>
                    {t.icon}
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Call in progress banner */}
          {selected.type !== 'dm' && activeConferences[selected.id] && myConference?.channelId !== selected.id && (() => {
            const conf = activeConferences[selected.id]
            return (
              <div style={{
                padding: '8px 16px', background: 'linear-gradient(90deg, #43B58122, #43B58111)',
                borderBottom: `1px solid ${C.separator}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
              }}>
                <Phone size={14} color="#43B581" />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#43B581' }}>Call in progress</span>
                  <span style={{ fontSize: 12, color: C.textMuted }}>·</span>
                  <div style={{ display: 'flex', gap: -4 }}>
                    {conf.slice(0, 5).map(p => (
                      <Avatar key={p.id} url={p.avatar} name={p.name} size={20} />
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: C.textMuted }}>{conf.length} participant{conf.length !== 1 ? 's' : ''}</span>
                </div>
                <button onClick={async () => {
                  try {
                    const res = await fetch(`${config.apiBase}/api/calls`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
                      body: JSON.stringify({ action: 'conference-join', channelId: selected.id }),
                    })
                    const data = await res.json()
                    if (!data.ok) return
                    setMyConference({ channelId: selected.id, channelName: selected.name, participants: data.participants ?? [] })
                  } catch {}
                }} style={{
                  background: '#43B581', border: 'none', cursor: 'pointer', color: '#fff',
                  padding: '4px 14px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                }}>
                  Join
                </button>
              </div>
            )
          })()}

          {/* Messages */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          <div ref={messagesScrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {/* Load older messages button */}
            {hasMore && (
              <button onClick={loadOlderMessages} disabled={loadingMore}
                style={{
                  alignSelf: 'center', padding: '6px 16px', borderRadius: 20, border: `1px solid ${C.separator}`,
                  background: C.lgBg, color: C.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                {loadingMore ? <Loader size={12} /> : <ChevronUp size={12} />}
                {loadingMore ? 'Loading…' : 'Load older messages'}
              </button>
            )}
            {loadingMsgs && messages.length === 0 && (
              <div style={{ textAlign: 'center', color: C.textMuted, padding: 20 }}>
                <Loader size={18} />
              </div>
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
              // Date separator
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
                  {/* Date separator */}
                  {showDateSep && (
                    <div style={{ display: 'flex', alignItems: 'center', padding: '16px 16px 8px', gap: 12 }}>
                      <div style={{ flex: 1, height: 1, background: C.separator }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.textSecondary, whiteSpace: 'nowrap', padding: '2px 12px', border: `1px solid ${C.separator}`, borderRadius: 12, background: C.lgBg }}>{dateLabel}</span>
                      <div style={{ flex: 1, height: 1, background: C.separator }} />
                    </div>
                  )}
                  {/* Pinned indicator */}
                  {msg.isPinned && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 56, marginBottom: 2 }}>
                      <Pin size={10} color={C.accent} />
                      <span style={{ fontSize: 10, color: C.accent, fontWeight: 600 }}>Pinned</span>
                    </div>
                  )}
                  {/* Message row */}
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
                    {/* Avatar or hover-timestamp spacer */}
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
                    {/* Content area */}
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
                            style={{
                              width: '100%', minHeight: 36, fontSize: 14, color: C.text,
                              background: 'transparent', border: 'none', outline: 'none',
                              resize: 'none', fontFamily: 'inherit',
                            }}
                          />
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                            <button onClick={() => { setEditingMsgId(null); setEditingContent('') }}
                              style={{ fontSize: 11, color: C.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleEditMessage}
                              style={{ fontSize: 11, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                          </div>
                        </div>
                      ) : isAttachment ? (
                        <InlineAttachment content={msg.content} isMe={isMe} config={config} />
                      ) : (
                        <div style={{ fontSize: 14, color: C.text, lineHeight: 1.46, wordBreak: 'break-word', overflowWrap: 'break-word', userSelect: 'text', WebkitUserSelect: 'text' }}>
                          {renderMessageContent(msg.content, false)}
                        </div>
                      )}
                      {!isEditing && !showHeader && msg.editedAt && (
                        <span style={{ fontSize: 10, color: C.textMuted }}>(edited)</span>
                      )}
                      {plainUrls.map((url, ui) => (
                        <OgPreview key={ui} url={url} config={config} />
                      ))}
                      {/* Reactions */}
                      {grouped.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {grouped.map(r => (
                            <button key={r.emoji} onClick={() => toggleReaction(msg.id, r.emoji)}
                              title={r.users.join(', ')}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 3,
                                padding: '2px 6px', borderRadius: 12, border: `1px solid ${r.reacted ? C.accent : C.separator}`,
                                background: r.reacted ? C.accentLight : C.bgInput, cursor: 'pointer', fontSize: 12,
                              }}>
                              <span>{r.emoji}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: r.reacted ? C.accent : C.textMuted }}>{r.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Thread reply count — Slack style */}
                      {(msg.replyCount ?? 0) > 0 && (
                        <button onClick={() => openThread(msg)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
                            background: 'transparent', border: `1px solid transparent`,
                            cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
                            width: '100%', transition: 'background 0.15s, border-color 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = C.bgInput; e.currentTarget.style.borderColor = C.separator }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}>
                          <div style={{ width: 20, height: 20, borderRadius: 4, background: C.accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <MessageCircle size={11} color={C.accent} />
                          </div>
                          <span style={{ color: C.accent, fontSize: 12, fontWeight: 700 }}>
                            {msg.replyCount} {msg.replyCount === 1 ? 'reply' : 'replies'}
                          </span>
                          <span style={{ color: C.textMuted, fontSize: 11 }}>View thread</span>
                          <ChevronRight size={14} color={C.textMuted} style={{ marginLeft: 'auto' }} />
                        </button>
                      )}
                    </div>
                    {/* Hover toolbar — floating top-right, Slack style */}
                    {isHovered && !isEditing && (
                      <div style={{
                        position: 'absolute', top: -16, right: 24,
                        display: 'flex', gap: 0, background: C.bgInput,
                        borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                        border: `1px solid ${C.separator}`, padding: '1px 2px', zIndex: 10,
                      }}>
                        {[{
                          icon: <Smile size={16} />, title: 'React',
                          onClick: () => setEmojiPickerMsgId(emojiPickerMsgId === msg.id ? null : msg.id),
                          color: C.textSecondary,
                        }, {
                          icon: <MessageCircle size={16} />, title: 'Reply in thread',
                          onClick: () => openThread(msg),
                          color: C.textSecondary,
                        }, {
                          icon: <CornerDownRight size={16} />, title: 'Forward',
                          onClick: () => {},
                          color: C.textSecondary,
                        }, {
                          icon: <Pin size={16} />, title: msg.isPinned ? 'Unpin' : 'Pin',
                          onClick: () => togglePin(msg.id),
                          color: msg.isPinned ? C.accent : C.textSecondary,
                        }, ...(isMe ? [{
                          icon: <Edit2 size={16} />, title: 'Edit',
                          onClick: () => { setEditingMsgId(msg.id); setEditingContent(msg.content) },
                          color: C.textSecondary,
                          show: (Date.now() - new Date(msg.createdAt).getTime()) < 12 * 60 * 60 * 1000,
                        }, {
                          icon: <Trash2 size={16} />, title: 'Delete',
                          onClick: () => handleDeleteMessage(msg.id),
                          color: C.danger,
                          show: true,
                        }] : [])].filter((b: any) => b.show !== false).map((btn: any, bi) => (
                          <button key={bi} onClick={btn.onClick} title={btn.title}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${C.text}12` }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                            style={{
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              padding: '5px 7px', color: btn.color, borderRadius: 6,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'background 0.1s',
                            }}>
                            {btn.icon}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Emoji picker popup */}
                    {emojiPickerMsgId === msg.id && (
                      <div style={{
                        position: 'absolute', top: -44, right: 24,
                        display: 'flex', gap: 2, background: C.bgInput,
                        borderRadius: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                        border: `1px solid ${C.separator}`, padding: '4px 6px', zIndex: 20,
                      }}>
                        {QUICK_EMOJIS.map(e => (
                          <button key={e} onClick={() => toggleReaction(msg.id, e)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 16, padding: '2px 4px', borderRadius: 6,
                            }}>
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {/* Typing indicator for current channel */}
            {selectedTyping.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', paddingLeft: 8 }}>
                <div style={{ display: 'flex', gap: 3 }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 6, height: 6, borderRadius: '50%', background: C.textMuted,
                      display: 'inline-block', animation: `bounce 1.2s ${i * 0.2}s infinite`,
                    }} />
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
            <div style={{
              width: 320, borderLeft: `1px solid ${C.separator}`, background: C.lgBg,
              
              display: 'flex', flexDirection: 'column', flexShrink: 0,
            }}>
              {/* Thread header */}
              <div style={{
                padding: '10px 14px', borderBottom: `1px solid ${C.separator}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Thread</span>
                <button onClick={() => { setThreadParent(null); setThreadMessages([]) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2 }}>
                  <X size={14} />
                </button>
              </div>
              {/* Parent message */}
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
              {/* Thread replies */}
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
                            <button key={r.emoji} onClick={() => toggleReaction(reply.id, r.emoji, true)}
                              title={r.users.join(', ')}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 2,
                                padding: '1px 5px', borderRadius: 8, border: `1px solid ${r.reacted ? C.accent : C.separator}`,
                                background: r.reacted ? C.accentLight : C.bgInput, cursor: 'pointer', fontSize: 11,
                              }}>
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
              {/* Thread input */}
              <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.separator}`, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  value={threadInput}
                  onChange={e => setThreadInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendThreadReply() }
                  }}
                  placeholder="Reply…"
                  rows={1}
                  style={{
                    flex: 1, resize: 'none', padding: '8px 10px', fontSize: 12,
                    border: `1px solid ${C.separator}`, borderRadius: 8, outline: 'none',
                    color: C.text, background: C.bgInput, minHeight: 32, maxHeight: 80,
                    fontFamily: 'inherit',
                  }}
                />
                <button onClick={sendThreadReply} disabled={!threadInput.trim() || sendingThread}
                  style={{
                    padding: '8px 10px', borderRadius: 8, border: 'none',
                    background: threadInput.trim() ? C.accent : C.lgBg,
                    color: threadInput.trim() ? '#fff' : C.textMuted,
                    cursor: threadInput.trim() ? 'pointer' : 'default', flexShrink: 0,
                  }}>
                  {sendingThread ? <Loader size={14} /> : <Send size={14} />}
                </button>
              </div>
            </div>
          )}

          {/* Pinned messages side panel */}
          {showPinned && (
            <div style={{
              width: 300, borderLeft: `1px solid ${C.separator}`, background: C.lgBg,
              
              display: 'flex', flexDirection: 'column', flexShrink: 0,
            }}>
              <div style={{
                padding: '10px 14px', borderBottom: `1px solid ${C.separator}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Pin size={14} /> Pinned Messages
                </span>
                <button onClick={() => setShowPinned(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2 }}>
                  <X size={14} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
                {pinnedMessages.length === 0 && (
                  <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 12, padding: 16 }}>No pinned messages</div>
                )}
                {pinnedMessages.map(pm => (
                  <div key={pm.id} style={{
                    padding: '10px 12px', borderRadius: 8, background: C.bgInput,
                    border: `1px solid ${C.separator}`, marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Avatar url={pm.sender.avatarUrl} name={pm.sender.alias ?? pm.sender.username} size={18} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.accent }}>{pm.sender.alias ?? pm.sender.username}</span>
                      <span style={{ fontSize: 10, color: C.textMuted }}>{formatTime(pm.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>
                      {renderMessageContent(pm.content)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shared media directory panel */}
          {showSharedMedia && (
            <div style={{
              width: 300, borderLeft: `1px solid ${C.separator}`, background: C.lgBg,
              
              display: 'flex', flexDirection: 'column', flexShrink: 0,
            }}>
              <div style={{
                padding: '10px 14px', borderBottom: `1px solid ${C.separator}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FolderOpen size={14} /> Shared Files
                </span>
                <button onClick={() => setShowSharedMedia(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2 }}>
                  <X size={14} />
                </button>
              </div>
              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: `1px solid ${C.separator}`, flexShrink: 0 }}>
                {(['media', 'files', 'links'] as const).map(tab => (
                  <button key={tab} onClick={() => setSharedMediaTab(tab)}
                    style={{
                      flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
                      background: sharedMediaTab === tab ? C.accent + '15' : 'transparent',
                      color: sharedMediaTab === tab ? C.accent : C.textMuted,
                      fontWeight: sharedMediaTab === tab ? 700 : 400, fontSize: 12,
                      borderBottom: sharedMediaTab === tab ? `2px solid ${C.accent}` : '2px solid transparent',
                    }}>
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
                      {sharedMedia.media.map((m, i) => {
                        const fullUrl = `${config.apiBase}${m.url}`
                        return (
                          <div key={i} onClick={() => window.electronAPI.openExternal(fullUrl)} style={{ borderRadius: 6, overflow: 'hidden', aspectRatio: '1', background: 'rgba(255, 255, 255, 0.3)', cursor: 'pointer' }}>
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
                      {sharedMedia.files.map((f, i) => (
                        <a key={i} href={`${config.apiBase}${f.url}`} target="_blank" rel="noopener noreferrer"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                            borderRadius: 8, border: `1px solid ${C.separator}`, textDecoration: 'none',
                          }}>
                          <Paperclip size={14} color={C.textMuted} />
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ fontSize: 12, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {f.filename.replace(/^\d+-/, '')}
                            </div>
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
                      {sharedMedia.links.map((l, i) => (
                        <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                            borderRadius: 8, border: `1px solid ${C.separator}`, textDecoration: 'none',
                          }}>
                          <ExternalLink size={14} color={C.accent} />
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ fontSize: 12, color: C.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {l.url.replace(/^https?:\/\//, '').slice(0, 50)}
                            </div>
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

          {/* Input */}
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
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, flexDirection: 'column', gap: 12 }}>
          <MessageSquare size={40} strokeWidth={1} />
          <div style={{ fontSize: 14 }}>Select a conversation</div>
          <button onClick={() => setShowNewConv('dm') }
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
              ...neu(), border: 'none', cursor: 'pointer', color: C.accent, fontWeight: 600, fontSize: 13,
            }}>
            <Edit2 size={15} /> New Conversation
          </button>
        </div>
      )}
    </div>
  )
}

function ConvRow({ conv, selected, typingUsers, hasActiveCall, isMentioned, onClick, onClose }: { conv: Conversation; selected: boolean; auth?: Auth; typingUsers: string[]; hasActiveCall?: boolean; isMentioned?: boolean; onClick: () => void; onClose?: () => void }) {
  const [hovered, setHovered] = useState(false)
  const hasUnread = (conv.unread ?? 0) > 0
  // Use partnerId to find the correct DM partner — members[0] may be the current user
  const dmPartner = conv.type === 'dm'
    ? (conv.partnerId ? conv.members?.find(m => m.userId === conv.partnerId) : conv.members?.[0])
    : null
  const dmStatus = dmPartner?.user?.userStatus ?? null
  const isOnlineDm = dmStatus === 'online'
  const statusDotColor = dmStatus === 'online' ? C.success : dmStatus === 'break' ? C.warning : C.textMuted

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', margin: '1px 8px',
        borderRadius: 6, overflow: 'hidden',
      }}
    >
    <button
      onClick={onClick}
      onMouseEnter={e => { setHovered(true); if (!selected) (e.currentTarget as HTMLButtonElement).style.background = C.sidebarHover }}
      onMouseLeave={e => { setHovered(false); if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 10px', border: 'none', textAlign: 'left',
        background: selected
          ? 'linear-gradient(90deg, rgba(0, 0, 255, 0.22) 0%, rgba(0, 0, 255, 0.12) 50%, rgba(0, 0, 255, 0.08) 100%)'
          : 'transparent',
        boxShadow: selected ? 'inset 0 0 0 1px rgba(0, 0, 255, 0.16)' : 'none',
        backdropFilter: selected ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: selected ? 'blur(12px)' : 'none',
        cursor: 'pointer', borderRadius: 0, minWidth: 0,
      }}
    >
      {conv.type === 'dm' ? (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar url={conv.avatar} name={conv.name} size={22} />
          {/* Online status dot */}
          <div style={{
            position: 'absolute', bottom: -1, right: -1,
            width: 9, height: 9, borderRadius: '50%',
            background: statusDotColor,
            border: `2px solid ${selected ? '#1e2a3a' : C.lgBg}`,
          }} />
        </div>
      ) : conv.type === 'group' ? (
        <div style={{ position: 'relative', flexShrink: 0, width: 22, height: 22 }}>
          {/* Stacked avatar for group */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: 16, height: 16, borderRadius: 4, background: C.bgInput, border: `1.5px solid ${C.lgBg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: C.textMuted, zIndex: 1 }}>
            {(conv.members?.[0]?.user?.alias?.[0] ?? conv.name[0] ?? '?').toUpperCase()}
          </div>
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, borderRadius: 4, background: C.fillSecondary, border: `1.5px solid ${C.lgBg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: C.textMuted, zIndex: 2 }}>
            {(conv.members?.[1]?.user?.alias?.[0] ?? '?').toUpperCase()}
          </div>
        </div>
      ) : null}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
        {conv.type === 'channel' && (
          <Hash size={14} color={hasUnread ? C.sidebarTextActive : C.sidebarText} style={{ marginRight: 4, flexShrink: 0 }} />
        )}
        <span style={{
          fontSize: 14, fontWeight: hasUnread ? 700 : 400,
          color: hasUnread || selected ? C.sidebarTextActive : C.sidebarText,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {conv.type === 'channel' ? conv.name.replace(/^#/, '') : conv.name}
        </span>
        {conv.type === 'dm' && dmStatus && (
          <span style={{
            fontSize: 9, fontWeight: 700, marginLeft: 6, flexShrink: 0,
            padding: '1px 6px', borderRadius: 10, letterSpacing: 0.5,
            background: 'transparent',
            color: dmStatus === 'online' ? C.success : dmStatus === 'break' ? C.warning : C.textMuted,
            border: `1px solid ${dmStatus === 'online' ? C.success : dmStatus === 'break' ? C.warning : C.textMuted}`,
          }}>
            {dmStatus === 'online' ? 'In' : dmStatus === 'break' ? 'Break' : 'Out'}
          </span>
        )}
        {typingUsers.length > 0 && (
          <span style={{ fontSize: 11, color: C.accent, fontStyle: 'italic', marginLeft: 6, flexShrink: 0 }}>typing…</span>
        )}
      </div>
      {hasActiveCall && (
        <Phone size={13} color={C.success} style={{ flexShrink: 0, animation: 'pulse 2s infinite' }} />
      )}
      {hasUnread && !selected && (
        <div style={{
          minWidth: 18, height: 18, borderRadius: 9,
          background: isMentioned ? C.danger : C.textMuted,
          color: '#fff', fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
          flexShrink: 0,
        }}>
          {conv.unread}
        </div>
      )}
      {/* X close button on hover/selected */}
      {selected && hovered && onClose && (
        <button onClick={e => { e.stopPropagation(); onClose() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sidebarText, padding: 2, flexShrink: 0, display: 'flex', alignItems: 'center', borderRadius: 4 }}>
          <X size={14} />
        </button>
      )}
    </button>
    </div>
  )
}

// ─── MessageInput (rich text, attachments, @mentions, calls) ─────────────────

function MessageInput({ placeholder, config, channelId, onTyping, input, setInput, sendFn, sending }: {
  placeholder: string; config: ApiConfig; channelId: string
  onTyping: () => void; input: string; setInput: (v: string) => void
  sendFn: () => void; sending: boolean
  onSend?: (content: string) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [, setMentionSearch] = useState<string | null>(null)
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [mentionResults, setMentionResults] = useState<UserInfo[]>([])
  const [dragOver, setDragOver] = useState(false)

  // Load users once for @mention
  useEffect(() => {
    fetch(`${config.apiBase}/api/users`, { headers: { Authorization: `Bearer ${config.token}` } })
      .then(r => r.json())
      .then((d: { users: UserInfo[] }) => setAllUsers(d.users))
      .catch(() => {})
  }, [config])

  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setInput(val)
    autoResize()
    onTyping()
    // @mention detection
    const cursor = e.target.selectionStart
    const textBefore = val.slice(0, cursor)
    const match = textBefore.match(/@(\w*)$/)
    if (match) {
      const q = match[1].toLowerCase()
      setMentionSearch(q)
      setMentionResults(allUsers.filter(u =>
        (u.alias?.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
      ).slice(0, 6))
    } else {
      setMentionSearch(null)
      setMentionResults([])
    }
  }

  function insertMention(user: UserInfo) {
    const el = textareaRef.current
    if (!el) return
    const cursor = el.selectionStart
    const textBefore = input.slice(0, cursor)
    const atIdx = textBefore.lastIndexOf('@')
    // Always use @username (not alias) so notifications can match
    const name = user.username
    const newVal = input.slice(0, atIdx) + `@${name} ` + input.slice(cursor)
    setInput(newVal)
    setMentionSearch(null)
    setMentionResults([])
    setTimeout(() => { el.focus(); el.setSelectionRange(atIdx + name.length + 2, atIdx + name.length + 2) }, 0)
  }

  function wrapSelection(before: string, after: string) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = input.slice(start, end)
    const newVal = input.slice(0, start) + before + selected + after + input.slice(end)
    setInput(newVal)
    setTimeout(() => { el.focus(); el.setSelectionRange(start + before.length, end + before.length) }, 0)
  }

  function insertPrefix(prefix: string) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const lineStart = input.lastIndexOf('\n', start - 1) + 1
    const newVal = input.slice(0, lineStart) + prefix + input.slice(lineStart)
    setInput(newVal)
    setTimeout(() => el.focus(), 0)
  }

  async function uploadFileBlob(file: File) {
    if (!channelId) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${config.apiBase}/api/channels/${channelId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}` },
        body: form,
      })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      const { url, filename } = await res.json() as { url: string; filename: string }
      const content = `[📎 ${filename}](${config.apiBase}${url})`
      await fetch(`${config.apiBase}/api/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
    } catch { /* ignore upload errors */ } finally {
      setUploading(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadFileBlob(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFileBlob(file)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionResults.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
      e.preventDefault(); return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendFn()
    }
  }

  return (
    <div style={{ padding: '8px 16px 12px', flexShrink: 0, position: 'relative' }}>
      {/* @mention dropdown */}
      {mentionResults.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 16, right: 16,
          background: C.bgFloating, borderRadius: 8, border: `1px solid ${C.separator}`,
          boxShadow: C.shadowHigh, overflow: 'hidden', zIndex: 50,
        }}>
          {mentionResults.map(u => (
            <button key={u.id} onClick={() => insertMention(u)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.bgHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <Avatar url={u.avatarUrl} name={u.alias ?? u.username} size={24} />
              <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{u.alias ?? u.username}</span>
              <span style={{ fontSize: 11, color: C.textMuted }}>@{u.username}</span>
            </button>
          ))}
        </div>
      )}

      <input ref={fileRef} type="file" hidden onChange={handleFile} />

      {/* Slack-style unified composer container */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `1px solid ${dragOver ? C.accent : C.fillTertiary}`,
          borderRadius: 8,
          background: C.bgSecondary,
          transition: 'border-color 0.15s',
          position: 'relative',
          overflow: 'hidden',
        }}>
        {/* Drag & drop overlay */}
        {dragOver && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0, 122, 204, 0.08)', zIndex: 30, pointerEvents: 'none',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>Drop file to upload</span>
          </div>
        )}

        {/* Textarea area */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          style={{
            width: '100%', resize: 'none', padding: '12px 14px 8px',
            fontSize: 14, color: C.text, border: 'none', outline: 'none',
            lineHeight: 1.5, minHeight: 40, maxHeight: 120, overflow: 'auto',
            fontFamily: 'inherit', background: 'transparent', display: 'block',
          }}
        />

        {/* Divider */}
        <div style={{ height: 1, background: C.separator, margin: '0 10px' }} />

        {/* Toolbar row */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 2 }}>
          {/* Left toolbar icons */}
          {[
            { icon: <Plus size={18} />, action: () => fileRef.current?.click(), title: 'Attach file' },
            { icon: <Bold size={16} />, action: () => wrapSelection('**', '**'), title: 'Bold' },
            { icon: <Smile size={16} />, action: () => {}, title: 'Emoji' },
            { icon: <AtSign size={16} />, action: () => { setInput(input + '@'); setTimeout(() => textareaRef.current?.focus(), 0) }, title: 'Mention' },
          ].map((btn, i) => (
            <button key={i} onClick={btn.action} title={btn.title}
              style={{
                width: 32, height: 32, borderRadius: 6, border: 'none',
                background: 'transparent', color: C.textMuted, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
              {btn.icon}
            </button>
          ))}

          {/* Separator */}
          <div style={{ width: 1, height: 20, background: C.separator, margin: '0 4px' }} />

          {[
            { icon: <Video size={16} />, action: () => {}, title: 'Video' },
            { icon: <Mic size={16} />, action: () => {}, title: 'Voice' },
          ].map((btn, i) => (
            <button key={`extra-${i}`} onClick={btn.action} title={btn.title}
              style={{
                width: 32, height: 32, borderRadius: 6, border: 'none',
                background: 'transparent', color: C.textMuted, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
              {btn.icon}
            </button>
          ))}

          {/* Separator */}
          <div style={{ width: 1, height: 20, background: C.separator, margin: '0 4px' }} />

          {[
            { icon: <Italic size={16} />, action: () => wrapSelection('*', '*'), title: 'Italic' },
            { icon: <List size={16} />, action: () => insertPrefix('• '), title: 'Bullet list' },
          ].map((btn, i) => (
            <button key={`fmt-${i}`} onClick={btn.action} title={btn.title}
              style={{
                width: 32, height: 32, borderRadius: 6, border: 'none',
                background: 'transparent', color: C.textMuted, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
              {btn.icon}
            </button>
          ))}

          {/* Spacer pushes send to the right */}
          <div style={{ flex: 1 }} />

          {/* Send button */}
          <button
            onClick={sendFn}
            disabled={!input.trim() || sending || uploading}
            title="Send message"
            style={{
              width: 32, height: 32, borderRadius: 6, border: 'none',
              background: input.trim() ? C.accent : 'transparent',
              color: input.trim() ? '#fff' : C.textMuted,
              cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {sending ? <Loader size={16} /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Call UI ─────────────────────────────────────────────────────────────────

// ─── CallControls (shared between CallWidget + ConferenceWidget) ────────────

function CallControls({ muted, onToggleMute, videoOff, onToggleVideo, videoActive, windowMode, onSetWindowMode, onHangup, participantCount, callDuration, screenSharing, onToggleScreenShare, onInvite, connectionQuality }: {
  muted: boolean; onToggleMute: () => void
  videoOff: boolean; onToggleVideo: () => void
  videoActive: boolean
  windowMode: 'mini' | 'normal' | 'fullscreen'
  onSetWindowMode: (m: 'mini' | 'normal' | 'fullscreen') => void
  onHangup: () => void
  participantCount?: number
  callDuration?: number
  screenSharing?: boolean; onToggleScreenShare?: () => void
  onInvite?: () => void
  connectionQuality?: 'good' | 'fair' | 'poor' | 'disconnected'
}) {
  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }
  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: windowMode === 'mini' ? 36 : 48, height: windowMode === 'mini' ? 36 : 48,
    borderRadius: '50%', border: 'none', cursor: 'pointer',
    background: active ? C.danger : 'rgba(255,255,255,0.15)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
  })
  const iconSize = windowMode === 'mini' ? 16 : 20
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: windowMode === 'mini' ? 8 : 14 }}>
      {callDuration !== undefined && (
        <span style={{ color: '#6b6b6b', fontSize: 12, fontVariantNumeric: 'tabular-nums', marginRight: 4 }}>
          {formatDuration(callDuration)}
        </span>
      )}
      {participantCount !== undefined && participantCount > 0 && (
        <span style={{ color: '#6b6b6b', fontSize: 11, marginRight: 4 }}>
          <Users size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} />{participantCount}
        </span>
      )}
      <button onClick={onToggleMute} style={btnStyle(muted)} title={muted ? 'Unmute' : 'Mute'}>
        {muted ? <MicOff size={iconSize} /> : <Mic size={iconSize} />}
      </button>
      <button onClick={onToggleVideo} style={btnStyle(videoOff && videoActive)} title={videoActive ? (videoOff ? 'Turn on camera' : 'Turn off camera') : 'Start video'}>
        {videoActive && !videoOff ? <Video size={iconSize} /> : <VideoOff size={iconSize} />}
      </button>
      {onToggleScreenShare && windowMode !== 'mini' && (
        <button onClick={onToggleScreenShare} style={btnStyle(!!screenSharing)} title={screenSharing ? 'Stop sharing' : 'Share screen'}>
          {screenSharing ? <Monitor size={iconSize} /> : <MonitorOff size={iconSize} />}
        </button>
      )}
      {onInvite && windowMode !== 'mini' && (
        <button onClick={onInvite} style={btnStyle(false)} title="Invite to call">
          <UserPlus2 size={iconSize} />
        </button>
      )}
      {connectionQuality && windowMode !== 'mini' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: windowMode === 'mini' ? 36 : 48, height: windowMode === 'mini' ? 36 : 48 }} title={`Connection: ${connectionQuality}`}>
          {connectionQuality === 'good' ? <Wifi size={iconSize} color="#43B581" /> :
           connectionQuality === 'fair' ? <WifiLow size={iconSize} color="#eab308" /> :
           connectionQuality === 'poor' ? <WifiZero size={iconSize} color="#F04747" /> :
           <WifiOff size={iconSize} color="#6b7280" />}
        </div>
      )}
      {windowMode !== 'mini' && (
        <button onClick={() => onSetWindowMode('mini')} style={btnStyle(false)} title="Minimize to mini window">
          <Minimize2 size={iconSize} />
        </button>
      )}
      {windowMode === 'mini' && (
        <button onClick={() => onSetWindowMode('normal')} style={btnStyle(false)} title="Expand">
          <Maximize2 size={iconSize} />
        </button>
      )}
      {windowMode === 'normal' && (
        <button onClick={() => onSetWindowMode('fullscreen')} style={btnStyle(false)} title="Fullscreen">
          <Maximize2 size={iconSize} />
        </button>
      )}
      {windowMode === 'fullscreen' && (
        <button onClick={() => onSetWindowMode('normal')} style={btnStyle(false)} title="Exit fullscreen">
          <Minimize2 size={iconSize} />
        </button>
      )}
      <button onClick={onHangup} style={{ ...btnStyle(true), background: C.danger }} title="Hang up">
        <PhoneOff size={iconSize + 2} />
      </button>
    </div>
  )
}

// ─── CallWidget (1:1 calls with window modes, dragging, video renegotiation) ─

function CallWidget({ config, auth: _auth, targetUser, callType, onEnd, offerSdp, bufferedIce }: {
  config: ApiConfig; auth: Auth
  targetUser: { id: string; name: string; avatar: string | null }
  callType: 'audio' | 'video'
  onEnd: () => void
  offerSdp?: string
  bufferedIce?: RTCIceCandidateInit[]
}) {
  const isReceiver = !!offerSdp
  const [status, setStatus] = useState<'calling' | 'connected' | 'ended'>('calling')
  const statusRef = useRef<'calling' | 'connected' | 'ended'>('calling')
  const [muted, setMuted] = useState(false)
  const [videoActive, setVideoActive] = useState(callType === 'video')
  const [videoOff, setVideoOff] = useState(false)
  const [windowMode, setWindowMode] = useState<'mini' | 'normal' | 'fullscreen'>('normal')
  const [floatingOnDesktop, setFloatingOnDesktop] = useState(false)
  const [position, setPosition] = useState({ x: window.innerWidth - 320, y: window.innerHeight - 240 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const [callDuration, setCallDuration] = useState(0)
  const durationTimer = useRef<NodeJS.Timeout | null>(null)
  const localVideo = useRef<HTMLVideoElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioEl = useRef<HTMLAudioElement | null>(null)
  const pc = useRef<RTCPeerConnection | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const iceBuffer = useRef<RTCIceCandidateInit[]>(bufferedIce ? [...bufferedIce] : [])
  const remoteDescSet = useRef(false)
  const [showControls, setShowControls] = useState(true)
  const hideTimer = useRef<NodeJS.Timeout | null>(null)
  const renegotiating = useRef(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const screenShareStream = useRef<MediaStream | null>(null)
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'fair' | 'poor' | 'disconnected'>('good')
  const [screenSources, setScreenSources] = useState<Array<{ id: string; name: string; thumbnail: string }> | null>(null)

  // Track remote video availability (when peer adds/removes video)
  const [remoteHasVideo, setRemoteHasVideo] = useState(false)
  const iceRestartTimer = useRef<NodeJS.Timeout | null>(null)
  const callingAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    // Demo mode: skip WebRTC, just show the UI
    if (DEMO_MODE) {
      setStatus('connected')
      statusRef.current = 'connected'
      durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000)
      return () => { if (durationTimer.current) clearInterval(durationTimer.current) }
    }
    const ctrl = new AbortController()
    listenForSignals(ctrl)
    if (isReceiver) {
      answerCall()
    } else {
      startCall()
    }
    // Play calling-idle ringtone for outgoing calls
    let callingAudio: HTMLAudioElement | null = null
    if (!isReceiver) {
      callingAudio = new Audio('sounds/calling-idle.mp3')
      callingAudio.loop = true
      callingAudio.volume = 0.5
      callingAudio.play().catch(() => {})
      callingAudioRef.current = callingAudio
    }
    let timeout: NodeJS.Timeout | undefined
    if (!isReceiver) {
      timeout = setTimeout(() => {
        if (statusRef.current === 'calling') {
          console.log('[CallWidget] call timeout — no answer after 30s')
          cleanup(true); setStatus('ended'); onEnd()
        }
      }, 30000)
    }
    return () => { ctrl.abort(); cleanup(false); if (timeout) clearTimeout(timeout); if (durationTimer.current) clearInterval(durationTimer.current); if (iceRestartTimer.current) clearTimeout(iceRestartTimer.current); if (callingAudio) { callingAudio.pause(); callingAudio.src = '' } }
  }, [])

  // Call duration timer
  useEffect(() => {
    if (status === 'connected' && !durationTimer.current) {
      durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000)
    }
    return () => { if (status === 'ended' && durationTimer.current) { clearInterval(durationTimer.current); durationTimer.current = null } }
  }, [status])

  // Imperative audio element for remote stream (survives mode switches)
  useEffect(() => {
    const audio = document.createElement('audio')
    audio.autoplay = true
    remoteAudioEl.current = audio
    return () => { audio.pause(); audio.srcObject = null; remoteAudioEl.current = null }
  }, [])

  // Re-attach remote stream to video element on mode switch
  useEffect(() => {
    if (remoteStreamRef.current && remoteVideo.current) {
      remoteVideo.current.srcObject = remoteStreamRef.current
      remoteVideo.current.play().catch(() => {})
    }
    // Also re-attach local stream on mode switch
    if (localStream.current && localVideo.current && videoActive) {
      localVideo.current.srcObject = localStream.current
      localVideo.current.play().catch(() => {})
    }
  }, [windowMode, videoActive])

  // Fix: when remote first enables video mid-call, the <video> element may not
  // have existed yet. Re-attach the stream as soon as remoteHasVideo becomes true.
  useEffect(() => {
    if (remoteHasVideo && remoteStreamRef.current && remoteVideo.current) {
      remoteVideo.current.srcObject = remoteStreamRef.current
      remoteVideo.current.play().catch(() => {})
    }
  }, [remoteHasVideo])

  // Dragging logic for mini mode
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      const x = Math.max(0, Math.min(window.innerWidth - 300, e.clientX - dragOffset.current.x))
      const y = Math.max(0, Math.min(window.innerHeight - 80, e.clientY - dragOffset.current.y))
      setPosition({ x, y })
    }
    const onUp = () => setIsDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [isDragging])

  // Fullscreen: auto-hide controls after 3s of no mouse movement
  useEffect(() => {
    if (windowMode !== 'fullscreen') { setShowControls(true); return }
    const onMouseMove = () => {
      setShowControls(true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setShowControls(false), 3000)
    }
    onMouseMove() // start the timer
    window.addEventListener('mousemove', onMouseMove)
    return () => { window.removeEventListener('mousemove', onMouseMove); if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [windowMode])

  // ─── Floating desktop window management ──────────────────────────────
  const handleSetWindowMode = (mode: 'mini' | 'normal' | 'fullscreen') => {
    if (mode === 'mini') {
      // Open a native floating window; keep WebRTC alive here (hidden)
      const state = {
        userName: targetUser.name,
        userAvatar: targetUser.avatar,
        status,
        duration: callDuration,
        muted,
        videoActive,
      }
      if (window.electronAPI?.openCallFloat) {
        setFloatingOnDesktop(true)
        window.electronAPI.openCallFloat(state)
      } else {
        // Fallback: in-app mini when Electron IPC isn't available (e.g. browser)
        setPosition({ x: window.innerWidth - 320, y: window.innerHeight - 120 })
        setWindowMode('mini')
      }
    } else {
      setWindowMode(mode)
    }
  }

  // Sync call state to floating window
  useEffect(() => {
    if (!floatingOnDesktop) return
    const state = {
      userName: targetUser.name,
      userAvatar: targetUser.avatar,
      status,
      duration: callDuration,
      muted,
      videoActive,
    }
    window.electronAPI?.updateCallFloat?.(state)
  }, [floatingOnDesktop, status, callDuration, muted, videoActive])

  // Listen for actions from floating window
  const floatActionsRef = useRef({ toggleMute: () => {}, hangup: () => {} })
  useEffect(() => {
    floatActionsRef.current = { toggleMute, hangup }
  })
  useEffect(() => {
    if (!floatingOnDesktop) return
    if (!window.electronAPI?.onCallFloatAction) return
    const unsub = window.electronAPI.onCallFloatAction((action) => {
      const act = (action as { action: string }).action
      if (act === 'expand') {
        setFloatingOnDesktop(false)
        setWindowMode('normal')
      } else if (act === 'mute' || act === 'unmute') {
        floatActionsRef.current.toggleMute()
      } else if (act === 'hangup') {
        setFloatingOnDesktop(false)
        window.electronAPI?.closeCallFloat?.()
        floatActionsRef.current.hangup()
      }
    })
    return unsub
  }, [floatingOnDesktop])

  // Close floating window when call ends
  useEffect(() => {
    if (status === 'ended' && floatingOnDesktop) {
      setFloatingOnDesktop(false)
      window.electronAPI?.closeCallFloat?.()
    }
  }, [status, floatingOnDesktop])

  async function setupPeer(stream: MediaStream) {
    const peerConn = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    })
    pc.current = peerConn
    stream.getTracks().forEach(t => peerConn.addTrack(t, stream))
    peerConn.ontrack = e => {
      let remoteStream = e.streams[0]
      if (!remoteStream) {
        if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream()
        remoteStreamRef.current.addTrack(e.track)
        remoteStream = remoteStreamRef.current
      } else {
        remoteStreamRef.current = remoteStream
      }
      console.log('[CallWidget] ontrack fired, tracks:', remoteStream.getTracks().map(t => `${t.kind}:${t.readyState}`))
      const hasVid = remoteStream.getVideoTracks().length > 0
      setRemoteHasVideo(hasVid)
      if (hasVid && remoteVideo.current) {
        remoteVideo.current.srcObject = remoteStream
        remoteVideo.current.play().catch(() => {})
      }
      if (remoteAudioEl.current) {
        remoteAudioEl.current.srcObject = remoteStream
        remoteAudioEl.current.play().catch(() => {})
      }
    }
    peerConn.onconnectionstatechange = () => {
      const state = peerConn.connectionState
      console.log('[CallWidget] connectionState:', state)
      if (state === 'connected') { setStatus('connected'); statusRef.current = 'connected'; if (callingAudioRef.current) { callingAudioRef.current.pause(); callingAudioRef.current.src = ''; callingAudioRef.current = null } }
    }
    peerConn.oniceconnectionstatechange = () => {
      const state = peerConn.iceConnectionState
      console.log('[CallWidget] iceConnectionState:', state)
      if (state === 'connected' || state === 'completed') { setStatus('connected'); statusRef.current = 'connected'; if (callingAudioRef.current) { callingAudioRef.current.pause(); callingAudioRef.current.src = ''; callingAudioRef.current = null } }
      else if (state === 'disconnected') {
        if (iceRestartTimer.current) clearTimeout(iceRestartTimer.current)
        iceRestartTimer.current = setTimeout(async () => {
          if (peerConn.iceConnectionState === 'disconnected' && statusRef.current !== 'ended') {
            console.log('[CallWidget] ICE disconnected — attempting restart')
            try {
              const offer = await peerConn.createOffer({ iceRestart: true })
              await peerConn.setLocalDescription(offer)
              await fetch(`${config.apiBase}/api/calls`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reoffer', to: targetUser.id, sdp: offer.sdp }),
              })
            } catch (err) { console.error('[CallWidget] ICE restart failed:', err) }
          }
        }, 5000)
      }
      else if (state === 'failed') {
        console.warn('[CallWidget] ICE failed — attempting restart')
        peerConn.createOffer({ iceRestart: true }).then(async offer => {
          await peerConn.setLocalDescription(offer)
          await fetch(`${config.apiBase}/api/calls`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reoffer', to: targetUser.id, sdp: offer.sdp }),
          })
        }).catch(() => { console.error('[CallWidget] ICE restart failed, ending call'); cleanup(true); setStatus('ended'); onEnd() })
      }
    }
    peerConn.onicecandidate = e => {
      if (e.candidate) {
        fetch(`${config.apiBase}/api/calls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ice', to: targetUser.id, candidate: e.candidate }),
        }).catch(() => {})
      }
    }
    return peerConn
  }

  async function drainIceBuffer(peerConn: RTCPeerConnection) {
    remoteDescSet.current = true
    for (const c of iceBuffer.current) {
      try { await peerConn.addIceCandidate(new RTCIceCandidate(c)) } catch { /* ignore */ }
    }
    iceBuffer.current = []
  }

  async function startCall() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' })
      localStream.current = stream
      if (localVideo.current && callType === 'video') localVideo.current.srcObject = stream
      const peerConn = await setupPeer(stream)
      const offer = await peerConn.createOffer()
      await peerConn.setLocalDescription(offer)
      await fetch(`${config.apiBase}/api/calls`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'offer', to: targetUser.id, sdp: offer.sdp, callType }),
      })
    } catch (err) {
      console.error('[CallWidget] startCall failed:', err)
      cleanup(true); onEnd()
    }
  }

  async function answerCall() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' })
      localStream.current = stream
      if (localVideo.current && callType === 'video') localVideo.current.srcObject = stream
      const peerConn = await setupPeer(stream)
      await peerConn.setRemoteDescription({ type: 'offer', sdp: offerSdp! })
      await drainIceBuffer(peerConn)
      const answer = await peerConn.createAnswer()
      await peerConn.setLocalDescription(answer)
      await fetch(`${config.apiBase}/api/calls`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'answer', to: targetUser.id, sdp: answer.sdp }),
      })
    } catch (err) {
      console.error('[CallWidget] answerCall failed:', err)
      cleanup(true); onEnd()
    }
  }

  function listenForSignals(ctrl: AbortController) {
    const onAnswer = async (e: Event) => {
      const payload = (e as CustomEvent<{ sdp?: string }>).detail
      if (!isReceiver && pc.current) {
        try {
          await pc.current.setRemoteDescription({ type: 'answer', sdp: payload.sdp! })
          await drainIceBuffer(pc.current)
        } catch (err) { console.error('[CallWidget] setRemoteDescription(answer) failed:', err) }
      }
    }
    const onIce = async (e: Event) => {
      const payload = (e as CustomEvent<{ candidate?: RTCIceCandidateInit }>).detail
      if (!payload.candidate) return
      if (remoteDescSet.current && pc.current) {
        try { await pc.current.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch { /* ignore */ }
      } else {
        iceBuffer.current.push(payload.candidate)
      }
    }
    const onCallEnd = () => { cleanup(false); setStatus('ended'); setTimeout(onEnd, 1000) }
    // Mid-call renegotiation (video toggle from remote)
    const onReoffer = async (e: Event) => {
      const payload = (e as CustomEvent<{ sdp?: string; from?: string }>).detail
      if (!payload.sdp || !pc.current) return
      try {
        renegotiating.current = true
        await pc.current.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
        const answer = await pc.current.createAnswer()
        await pc.current.setLocalDescription(answer)
        await fetch(`${config.apiBase}/api/calls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reanswer', to: targetUser.id, sdp: answer.sdp }),
        })
        renegotiating.current = false
      } catch (err) { console.error('[CallWidget] reoffer handling failed:', err); renegotiating.current = false }
    }
    const onReanswer = async (e: Event) => {
      const payload = (e as CustomEvent<{ sdp?: string }>).detail
      if (!payload.sdp || !pc.current) return
      try {
        await pc.current.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
        renegotiating.current = false
      } catch (err) { console.error('[CallWidget] reanswer handling failed:', err); renegotiating.current = false }
    }
    window.addEventListener('bundy-call-answer', onAnswer)
    window.addEventListener('bundy-call-ice', onIce)
    window.addEventListener('bundy-call-end', onCallEnd)
    window.addEventListener('bundy-call-reoffer', onReoffer)
    window.addEventListener('bundy-call-reanswer', onReanswer)
    ctrl.signal.addEventListener('abort', () => {
      window.removeEventListener('bundy-call-answer', onAnswer)
      window.removeEventListener('bundy-call-ice', onIce)
      window.removeEventListener('bundy-call-end', onCallEnd)
      window.removeEventListener('bundy-call-reoffer', onReoffer)
      window.removeEventListener('bundy-call-reanswer', onReanswer)
    })
  }

  function cleanup(sendEnd: boolean) {
    pc.current?.close()
    localStream.current?.getTracks().forEach(t => t.stop())
    screenShareStream.current?.getTracks().forEach(t => t.stop())
    if (sendEnd) {
      fetch(`${config.apiBase}/api/calls`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', to: targetUser.id }),
      }).catch(() => {})
    }
  }

  function toggleMute() {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = muted })
    setMuted(!muted)
  }

  async function toggleVideo() {
    if (DEMO_MODE) {
      if (!videoActive) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true })
          localStream.current = stream
          if (localVideo.current) { localVideo.current.srcObject = stream; localVideo.current.play().catch(() => {}) }
          // Mirror local feed to remote area to simulate a peer with camera
          if (remoteVideo.current) { remoteVideo.current.srcObject = stream; remoteVideo.current.play().catch(() => {}) }
          setVideoActive(true); setVideoOff(false); setRemoteHasVideo(true)
        } catch (err) { console.error('[Demo] camera failed:', err) }
      } else if (!videoOff) {
        localStream.current?.getVideoTracks().forEach(t => { t.enabled = false })
        setVideoOff(true)
      } else {
        localStream.current?.getVideoTracks().forEach(t => { t.enabled = true })
        setVideoOff(false)
      }
      return
    }
    if (!pc.current) return
    if (!videoActive) {
      // Enable video mid-call (request camera, add track, renegotiate)
      try {
        const vidStream = await navigator.mediaDevices.getUserMedia({ video: true })
        const videoTrack = vidStream.getVideoTracks()[0]
        localStream.current?.addTrack(videoTrack)
        pc.current.addTrack(videoTrack, localStream.current!)
        if (localVideo.current) localVideo.current.srcObject = localStream.current
        setVideoActive(true)
        setVideoOff(false)
        // Renegotiate
        renegotiating.current = true
        const offer = await pc.current.createOffer()
        await pc.current.setLocalDescription(offer)
        await fetch(`${config.apiBase}/api/calls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reoffer', to: targetUser.id, sdp: offer.sdp }),
        })
      } catch (err) { console.error('[CallWidget] enableVideo failed:', err) }
    } else if (!videoOff) {
      // Disable video track (keep it, just mute)
      localStream.current?.getVideoTracks().forEach(t => { t.enabled = false })
      setVideoOff(true)
    } else {
      // Re-enable video track
      localStream.current?.getVideoTracks().forEach(t => { t.enabled = true })
      setVideoOff(false)
    }
  }

  function hangup() { cleanup(true); setStatus('ended'); onEnd() }

  async function toggleScreenShare() {
    if (DEMO_MODE) {
      if (screenSharing) {
        // Stop screen share, restore camera stream if active
        screenShareStream.current?.getTracks().forEach(t => t.stop())
        screenShareStream.current = null
        setScreenSharing(false)
        if (videoActive && !videoOff && localStream.current) {
          if (remoteVideo.current) { remoteVideo.current.srcObject = localStream.current; remoteVideo.current.play().catch(() => {}) }
        } else {
          setRemoteHasVideo(false); setVideoActive(false)
        }
      } else {
        try {
          const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true })
          screenShareStream.current = stream
          if (remoteVideo.current) { remoteVideo.current.srcObject = stream; remoteVideo.current.play().catch(() => {}) }
          setRemoteHasVideo(true); setVideoActive(true); setVideoOff(false); setScreenSharing(true)
          stream.getVideoTracks()[0].onended = () => {
            setScreenSharing(false); screenShareStream.current = null
            if (videoActive && !videoOff && localStream.current) {
              if (remoteVideo.current) remoteVideo.current.srcObject = localStream.current
            } else { setRemoteHasVideo(false); setVideoActive(false) }
          }
        } catch (err) { console.error('[Demo] screen share failed:', err) }
      }
      return
    }
    if (!pc.current) return
    if (screenSharing) {
      // Stop screen sharing — restore camera or remove video
      screenShareStream.current?.getTracks().forEach(t => t.stop())
      screenShareStream.current = null
      const senders = pc.current.getSenders()
      const videoSender = senders.find(s => s.track?.kind === 'video')
      if (videoSender) {
        if (videoActive && localStream.current) {
          const camTrack = localStream.current.getVideoTracks()[0]
          if (camTrack) await videoSender.replaceTrack(camTrack)
        } else {
          await videoSender.replaceTrack(null)
        }
      }
      setScreenSharing(false)
    } else {
      // Fetch sources and show picker
      try {
        const sources = await (window as any).electronAPI.getScreenSources()
        if (!sources || sources.length === 0) return
        // Show picker modal
        setScreenSources(sources.map((s: any) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail ?? '' })))
      } catch (err) { console.error('[CallWidget] getScreenSources failed:', err) }
    }
  }

  async function startScreenShare(sourceId: string) {
    if (!pc.current) return
    setScreenSources(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } as any,
      })
      screenShareStream.current = stream
      const screenTrack = stream.getVideoTracks()[0]
      screenTrack.onended = () => { setScreenSharing(false); screenShareStream.current = null }
      const senders = pc.current.getSenders()
      const videoSender = senders.find(s => s.track?.kind === 'video')
      if (videoSender) {
        await videoSender.replaceTrack(screenTrack)
      } else {
        pc.current.addTrack(screenTrack, stream)
        renegotiating.current = true
        const offer = await pc.current.createOffer()
        await pc.current.setLocalDescription(offer)
        await fetch(`${config.apiBase}/api/calls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reoffer', to: targetUser.id, sdp: offer.sdp }),
        })
      }
      setScreenSharing(true)
      if (!videoActive) { setVideoActive(true); setVideoOff(false) }
    } catch (err) { console.error('[CallWidget] screen share failed:', err) }
  }

  // Connection quality monitoring
  useEffect(() => {
    if (status !== 'connected' || !pc.current) return
    let prev = { bytesReceived: 0, timestamp: 0 }
    const interval = setInterval(async () => {
      if (!pc.current) return
      try {
        const stats = await pc.current.getStats()
        let packetsLost = 0, packetsReceived = 0, currentRoundTrip = 0
        stats.forEach((report: any) => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            packetsLost = report.packetsLost || 0
            packetsReceived = report.packetsReceived || 0
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            currentRoundTrip = report.currentRoundTripTime || 0
          }
        })
        const total = packetsLost + packetsReceived
        const lossRate = total > 0 ? packetsLost / total : 0
        if (lossRate > 0.1 || currentRoundTrip > 0.5) setConnectionQuality('poor')
        else if (lossRate > 0.03 || currentRoundTrip > 0.2) setConnectionQuality('fair')
        else setConnectionQuality('good')
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [status])

  const handleDragStart = (e: React.MouseEvent) => {
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    setIsDragging(true)
  }

  const showVideo = videoActive || remoteHasVideo

  // Screen source picker modal
  if (screenSources !== null) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#080808', borderRadius: 8, padding: 24, maxWidth: 560, width: '90%', maxHeight: '80vh', overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Share Screen</span>
            <button onClick={() => setScreenSources(null)} style={{ background: 'none', border: 'none', color: '#6b6b6b', cursor: 'pointer' }}><X size={18} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {screenSources.map(src => (
              <button key={src.id} onClick={() => startScreenShare(src.id)}
                style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid transparent', borderRadius: 4, padding: 8, cursor: 'pointer', textAlign: 'center', transition: 'border-color 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#007acc')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
              >
                {src.thumbnail ? (
                  <img src={src.thumbnail} alt={src.name} style={{ width: '100%', borderRadius: 6, display: 'block', marginBottom: 6 }} />
                ) : (
                  <div style={{ width: '100%', aspectRatio: '16/9', background: C.bgFloating, borderRadius: 6, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Monitor size={28} color="#5865F2" />
                  </div>
                )}
                <span style={{ color: '#fff', fontSize: 11, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ─── Floating on desktop — keep WebRTC alive but render nothing visible ──
  if (floatingOnDesktop) {
    return (
      <div style={{ position: 'fixed', left: -9999, top: -9999, width: 0, height: 0, overflow: 'hidden' }}>
        <video ref={localVideo} autoPlay playsInline muted />
        <video ref={remoteVideo} autoPlay playsInline />
      </div>
    )
  }

  // ─── Mini mode ──────────────────────────────────────────────────────
  if (windowMode === 'mini') {
    return (
      <div style={{
        position: 'fixed', left: position.x, top: position.y, zIndex: 9998,
        width: 300, height: showVideo ? 220 : 100,
        background: '#080808', borderRadius: 12,
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Draggable header */}
        <div
          onMouseDown={handleDragStart}
          onDoubleClick={() => setWindowMode('normal')}
          style={{
            padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8,
            cursor: isDragging ? 'grabbing' : 'grab', background: 'rgba(255,255,255,0.05)', flexShrink: 0,
          }}
        >
          <Move size={10} color="#94a3b8" />
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {targetUser.name}
          </span>
          <span style={{ color: '#6b6b6b', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
            {status === 'calling' ? 'Calling…' : status === 'connected' ? `${Math.floor(callDuration / 60)}:${(callDuration % 60).toString().padStart(2, '0')}` : 'Ended'}
          </span>
        </div>
        {showVideo ? (
          <div style={{ flex: 1, position: 'relative', background: '#000', minHeight: 0 }}>
            <video ref={remoteVideo} autoPlay playsInline style={{
              width: '100%', height: '100%', objectFit: 'cover',
              display: remoteHasVideo ? 'block' : 'none',
            }} />
            {!remoteHasVideo && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Avatar url={targetUser.avatar} name={targetUser.name} size={24} />
                <span style={{ color: '#6b6b6b', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                  {status === 'calling' ? 'Calling…' : `Connected · ${Math.floor(callDuration / 60)}:${(callDuration % 60).toString().padStart(2, '0')}`}
                </span>
              </div>
            )}
            {videoActive && (
              <video ref={localVideo} autoPlay playsInline muted style={{
                position: 'absolute', bottom: 4, right: 4, width: 70, height: 52,
                borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.3)',
              }} />
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 0 }}>
            <Avatar url={targetUser.avatar} name={targetUser.name} size={32} />
            <span style={{ color: '#6b6b6b', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              {status === 'calling' ? 'Calling…' : `Connected · ${Math.floor(callDuration / 60)}:${(callDuration % 60).toString().padStart(2, '0')}`}
            </span>
          </div>
        )}
        <div style={{ padding: '6px 10px', display: 'flex', justifyContent: 'center', flexShrink: 0, background: 'rgba(0,0,0,0.3)' }}>
          <CallControls muted={muted} onToggleMute={toggleMute} videoOff={videoOff} onToggleVideo={toggleVideo}
            videoActive={videoActive} windowMode="mini" onSetWindowMode={handleSetWindowMode}
            onHangup={hangup} callDuration={status === 'connected' ? callDuration : undefined}
            screenSharing={screenSharing} onToggleScreenShare={toggleScreenShare} connectionQuality={connectionQuality} />
        </div>
        {/* Hidden local video for non-video mini mode (needed for renegotiation) */}
        {!showVideo && <video ref={localVideo} autoPlay playsInline muted style={{ display: 'none' }} />}
      </div>
    )
  }

  // ─── Normal / Fullscreen mode ───────────────────────────────────────
  const isFs = windowMode === 'fullscreen'
  return (
    <div style={{
      position: 'fixed', inset: 0, background: isFs ? '#000' : 'rgba(0,0,0,0.85)', zIndex: 9998,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: isFs ? 0 : 20,
    }}>
      {showVideo ? (
        <div style={{
          position: 'relative',
          width: isFs ? '100%' : 640, height: isFs ? '100%' : 420,
          borderRadius: isFs ? 0 : 16, overflow: 'hidden', background: '#000',
          flex: isFs ? 1 : undefined,
        }}>
          <video ref={remoteVideo} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: isFs ? 'contain' : 'cover' }} />
          {videoActive && (
            <video ref={localVideo} autoPlay playsInline muted style={{
              position: 'absolute', bottom: isFs ? 20 : 12, right: isFs ? 20 : 12,
              width: isFs ? 200 : 150, height: isFs ? 150 : 112,
              borderRadius: 8, objectFit: 'cover', border: '2px solid rgba(255,255,255,0.4)',
            }} />
          )}
          {/* Status overlay for video */}
          {status === 'calling' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
              <div style={{ textAlign: 'center' }}>
                <Avatar url={targetUser.avatar} name={targetUser.name} size={64} />
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginTop: 8 }}>{targetUser.name}</div>
                <div style={{ color: '#6b6b6b', fontSize: 13, marginTop: 8 }}>Calling…</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <Avatar url={targetUser.avatar} name={targetUser.name} size={80} />
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, marginTop: 12 }}>{targetUser.name}</div>
          <div style={{ color: '#6b6b6b', fontSize: 13, marginTop: 8 }}>
            {status === 'calling' ? 'Calling…' : status === 'connected' ? `Connected · ${Math.floor(callDuration / 60)}:${(callDuration % 60).toString().padStart(2, '0')}` : 'Call ended'}
          </div>
          <video ref={localVideo} autoPlay playsInline muted style={{ display: 'none' }} />
        </div>
      )}
      {/* Controls */}
      <div style={{
        ...(isFs ? { position: 'absolute' as const, bottom: 30, left: '50%', transform: 'translateX(-50%)', opacity: showControls ? 1 : 0, transition: 'opacity 0.3s' } : {}),
        padding: '10px 20px', borderRadius: 8, background: isFs ? 'rgba(0,0,0,0.6)' : 'transparent',
      }}>
        <CallControls muted={muted} onToggleMute={toggleMute} videoOff={videoOff} onToggleVideo={toggleVideo}
          videoActive={videoActive} windowMode={windowMode} onSetWindowMode={handleSetWindowMode}
          onHangup={hangup}
          screenSharing={screenSharing} onToggleScreenShare={toggleScreenShare} connectionQuality={connectionQuality} />
      </div>
    </div>
  )
}

// ─── ConferenceWidget (multi-peer mesh, max 8 participants) ──────────────────

interface ConferencePeer {
  pc: RTCPeerConnection
  stream: MediaStream | null
  name: string
  avatar: string | null
  iceBuffer: RTCIceCandidateInit[]
  remoteDescSet: boolean
}

function ConferenceWidget({ config, auth, channelId, channelName, initialParticipants, onLeave }: {
  config: ApiConfig; auth: Auth
  channelId: string; channelName: string
  initialParticipants: Array<{ id: string; name: string; avatar: string | null }>
  onLeave: () => void
}) {
  const [peers, setPeers] = useState<Map<string, { stream: MediaStream | null; name: string; avatar: string | null }>>(new Map())
  const peersRef = useRef<Map<string, ConferencePeer>>(new Map())
  const [muted, setMuted] = useState(false)
  const [videoActive, setVideoActive] = useState(false)
  const [videoOff, setVideoOff] = useState(false)
  const [windowMode, setWindowMode] = useState<'mini' | 'normal' | 'fullscreen'>('normal')
  const [position, setPosition] = useState({ x: window.innerWidth - 320, y: window.innerHeight - 260 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const [callDuration, setCallDuration] = useState(0)
  const durationTimer = useRef<NodeJS.Timeout | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const localVideo = useRef<HTMLVideoElement>(null)
  const [showControls, setShowControls] = useState(true)
  const hideTimer = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const iceRestartTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const [screenSharing, setScreenSharing] = useState(false)
  const screenShareStream = useRef<MediaStream | null>(null)
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'fair' | 'poor' | 'disconnected'>('good')
  const [screenSources, setScreenSources] = useState<Array<{ id: string; name: string; thumbnail: string }> | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteUsers, setInviteUsers] = useState<UserInfo[]>([])
  const [peerMuted, setPeerMuted] = useState<Map<string, boolean>>(new Map())
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set())
  const speakingTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())

  useEffect(() => {
    mountedRef.current = true
    const ctrl = new AbortController()
    initConference(ctrl)
    durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000)
    return () => {
      mountedRef.current = false
      ctrl.abort()
      cleanupAll(true)
      if (durationTimer.current) clearInterval(durationTimer.current)
      for (const t of iceRestartTimers.current.values()) clearTimeout(t)
      iceRestartTimers.current.clear()
    }
  }, [])

  // Dragging
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      const x = Math.max(0, Math.min(window.innerWidth - 300, e.clientX - dragOffset.current.x))
      const y = Math.max(0, Math.min(window.innerHeight - 80, e.clientY - dragOffset.current.y))
      setPosition({ x, y })
    }
    const onUp = () => setIsDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [isDragging])

  // Fullscreen auto-hide controls
  useEffect(() => {
    if (windowMode !== 'fullscreen') { setShowControls(true); return }
    const onMouseMove = () => {
      setShowControls(true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setShowControls(false), 3000)
    }
    onMouseMove()
    window.addEventListener('mousemove', onMouseMove)
    return () => { window.removeEventListener('mousemove', onMouseMove); if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [windowMode])

  function createPeerConnection(peerId: string, peerName: string, peerAvatar: string | null): RTCPeerConnection {
    const peerConn = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    })
    const peerData: ConferencePeer = { pc: peerConn, stream: null, name: peerName, avatar: peerAvatar, iceBuffer: [], remoteDescSet: false }
    peersRef.current.set(peerId, peerData)

    if (localStream.current) {
      localStream.current.getTracks().forEach(t => peerConn.addTrack(t, localStream.current!))
    }

    peerConn.ontrack = e => {
      // Always create a new MediaStream to force React re-render when tracks change
      if (e.streams[0]) {
        peerData.stream = new MediaStream(e.streams[0].getTracks())
      } else {
        const existingTracks = peerData.stream ? peerData.stream.getTracks() : []
        const allTracks = [...existingTracks.filter(t => t.id !== e.track.id), e.track]
        peerData.stream = new MediaStream(allTracks)
      }
      const remoteStream = peerData.stream
      console.log(`[Conference] ontrack from ${peerId}, tracks:`, remoteStream.getTracks().map(t => `${t.kind}:${t.readyState}`))
      // Imperative audio element per peer (survives re-renders)
      if (e.track.kind === 'audio') {
        let audioEl = audioElementsRef.current.get(peerId)
        if (!audioEl) {
          audioEl = document.createElement('audio')
          audioEl.autoplay = true
          audioElementsRef.current.set(peerId, audioEl)
        }
        audioEl.srcObject = remoteStream
        audioEl.play().catch(() => {})
      }
      if (mountedRef.current) {
        setPeers(prev => {
          const next = new Map(prev)
          next.set(peerId, { stream: remoteStream, name: peerName, avatar: peerAvatar })
          return next
        })
      }
    }

    peerConn.onicecandidate = e => {
      if (e.candidate) {
        fetch(`${config.apiBase}/api/calls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'conference-ice', to: peerId, channelId, candidate: e.candidate }),
        }).catch(() => {})
      }
    }

    peerConn.oniceconnectionstatechange = () => {
      const state = peerConn.iceConnectionState
      console.log(`[Conference] peer ${peerId} iceConnectionState: ${state}`)
      if (state === 'disconnected') {
        const prev = iceRestartTimers.current.get(peerId)
        if (prev) clearTimeout(prev)
        iceRestartTimers.current.set(peerId, setTimeout(async () => {
          iceRestartTimers.current.delete(peerId)
          if (peerConn.iceConnectionState === 'disconnected' && mountedRef.current) {
            console.log(`[Conference] peer ${peerId} ICE disconnected — attempting restart`)
            try {
              const offer = await peerConn.createOffer({ iceRestart: true })
              await peerConn.setLocalDescription(offer)
              await fetch(`${config.apiBase}/api/calls`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'conference-offer', to: peerId, channelId, sdp: offer.sdp }),
              })
            } catch (err) { console.error(`[Conference] peer ${peerId} ICE restart failed:`, err) }
          }
        }, 5000))
      } else if (state === 'failed') {
        peerConn.createOffer({ iceRestart: true }).then(async offer => {
          await peerConn.setLocalDescription(offer)
          await fetch(`${config.apiBase}/api/calls`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'conference-offer', to: peerId, channelId, sdp: offer.sdp }),
          })
        }).catch(() => { removePeer(peerId) })
      }
    }
    peerConn.onconnectionstatechange = () => {
      const state = peerConn.connectionState
      console.log(`[Conference] peer ${peerId} connectionState: ${state}`)
      if (state === 'closed') {
        removePeer(peerId)
      }
    }

    return peerConn
  }

  function removePeer(peerId: string) {
    const peer = peersRef.current.get(peerId)
    if (peer) {
      peer.pc.close()
      peersRef.current.delete(peerId)
      const audioEl = audioElementsRef.current.get(peerId)
      if (audioEl) { audioEl.pause(); audioEl.srcObject = null; audioElementsRef.current.delete(peerId) }
      const iceTimer = iceRestartTimers.current.get(peerId)
      if (iceTimer) { clearTimeout(iceTimer); iceRestartTimers.current.delete(peerId) }
      if (mountedRef.current) {
        setPeers(prev => { const next = new Map(prev); next.delete(peerId); return next })
      }
    }
  }

  async function drainPeerIceBuffer(peerId: string) {
    const peer = peersRef.current.get(peerId)
    if (!peer) return
    peer.remoteDescSet = true
    for (const c of peer.iceBuffer) {
      try { await peer.pc.addIceCandidate(new RTCIceCandidate(c)) } catch { /* ignore */ }
    }
    peer.iceBuffer = []
  }

  async function initConference(ctrl: AbortController) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStream.current = stream

      // Listen for conference signals
      listenForConferenceSignals(ctrl)

      // Create offers to all existing participants
      for (const p of initialParticipants) {
        const peerConn = createPeerConnection(p.id, p.name, p.avatar)
        const offer = await peerConn.createOffer()
        await peerConn.setLocalDescription(offer)
        await fetch(`${config.apiBase}/api/calls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'conference-offer', to: p.id, channelId, sdp: offer.sdp }),
        })
      }
    } catch (err) {
      console.error('[Conference] init failed:', err)
      cleanupAll(true); onLeave()
    }
  }

  function listenForConferenceSignals(ctrl: AbortController) {
    const onConfOffer = async (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; sdp: string; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      const fromId = payload.from
      let name = fromId, avatar: string | null = null
      const existing = peersRef.current.get(fromId)
      if (existing) { name = existing.name; avatar = existing.avatar }
      const peerConn = existing?.pc ?? createPeerConnection(fromId, name, avatar)
      try {
        // Polite-peer protocol: handle offer glare
        const isPolite = auth.userId < fromId
        if (peerConn.signalingState === 'have-local-offer') {
          if (!isPolite) {
            console.log(`[Conference] offer glare with ${fromId} — impolite, ignoring remote offer`)
            return
          }
          console.log(`[Conference] offer glare with ${fromId} — polite, rolling back`)
          await peerConn.setLocalDescription({ type: 'rollback' })
        }
        await peerConn.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
        await drainPeerIceBuffer(fromId)
        const answer = await peerConn.createAnswer()
        await peerConn.setLocalDescription(answer)
        await fetch(`${config.apiBase}/api/calls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'conference-answer', to: fromId, channelId, sdp: answer.sdp }),
        })
      } catch (err) { console.error('[Conference] handling offer from', fromId, err) }
    }

    const onConfAnswer = async (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; sdp: string; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      const peer = peersRef.current.get(payload.from)
      if (!peer) return
      try {
        await peer.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
        await drainPeerIceBuffer(payload.from)
      } catch (err) { console.error('[Conference] handling answer from', payload.from, err) }
    }

    const onConfIce = async (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; candidate: RTCIceCandidateInit; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      const peer = peersRef.current.get(payload.from)
      if (!peer) return
      if (peer.remoteDescSet) {
        try { await peer.pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch { /* ignore */ }
      } else {
        peer.iceBuffer.push(payload.candidate)
      }
    }

    const onConfJoined = (e: Event) => {
      const payload = (e as CustomEvent<{ userId: string; userName: string; avatar: string | null; channelId: string }>).detail
      if (payload.channelId !== channelId || payload.userId === auth.userId) return
      // New participant joined — they will send us an offer, we just wait.
      // But pre-register them so we have name/avatar info
      if (!peersRef.current.has(payload.userId)) {
        setPeers(prev => {
          const next = new Map(prev)
          next.set(payload.userId, { stream: null, name: payload.userName, avatar: payload.avatar })
          return next
        })
      }
    }

    const onConfLeft = (e: Event) => {
      const payload = (e as CustomEvent<{ userId: string; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      removePeer(payload.userId)
    }

    const onConfEnded = (e: Event) => {
      const payload = (e as CustomEvent<{ channelId: string }>).detail
      if (payload.channelId !== channelId) return
      cleanupAll(false)
      onLeave()
    }

    const onConfMute = (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; channelId: string; muted: boolean }>).detail
      if (payload.channelId !== channelId) return
      setPeerMuted(prev => { const next = new Map(prev); next.set(payload.from, payload.muted); return next })
    }

    window.addEventListener('bundy-conference-offer', onConfOffer)
    window.addEventListener('bundy-conference-answer', onConfAnswer)
    window.addEventListener('bundy-conference-ice', onConfIce)
    window.addEventListener('bundy-conference-joined', onConfJoined)
    window.addEventListener('bundy-conference-left', onConfLeft)
    window.addEventListener('bundy-conference-ended', onConfEnded)
    window.addEventListener('bundy-conference-mute', onConfMute)
    ctrl.signal.addEventListener('abort', () => {
      window.removeEventListener('bundy-conference-offer', onConfOffer)
      window.removeEventListener('bundy-conference-answer', onConfAnswer)
      window.removeEventListener('bundy-conference-ice', onConfIce)
      window.removeEventListener('bundy-conference-joined', onConfJoined)
      window.removeEventListener('bundy-conference-left', onConfLeft)
      window.removeEventListener('bundy-conference-ended', onConfEnded)
      window.removeEventListener('bundy-conference-mute', onConfMute)
    })
  }

  function cleanupAll(sendLeave: boolean) {
    for (const [, peer] of peersRef.current) { peer.pc.close() }
    peersRef.current.clear()
    for (const [, audioEl] of audioElementsRef.current) { audioEl.pause(); audioEl.srcObject = null }
    audioElementsRef.current.clear()
    localStream.current?.getTracks().forEach(t => t.stop())
    screenShareStream.current?.getTracks().forEach(t => t.stop())
    if (sendLeave) {
      fetch(`${config.apiBase}/api/calls`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'conference-leave', channelId }),
      }).catch(() => {})
    }
  }

  async function toggleVideo() {
    if (!videoActive) {
      try {
        const vidStream = await navigator.mediaDevices.getUserMedia({ video: true })
        const videoTrack = vidStream.getVideoTracks()[0]
        localStream.current?.addTrack(videoTrack)
        // Add track to all peer connections and renegotiate
        for (const [peerId, peer] of peersRef.current) {
          peer.pc.addTrack(videoTrack, localStream.current!)
          const offer = await peer.pc.createOffer()
          await peer.pc.setLocalDescription(offer)
          await fetch(`${config.apiBase}/api/calls`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'conference-offer', to: peerId, channelId, sdp: offer.sdp }),
          })
        }
        if (localVideo.current) localVideo.current.srcObject = localStream.current
        setVideoActive(true); setVideoOff(false)
      } catch (err) { console.error('[Conference] enableVideo failed:', err) }
    } else if (!videoOff) {
      localStream.current?.getVideoTracks().forEach(t => { t.enabled = false })
      setVideoOff(true)
    } else {
      localStream.current?.getVideoTracks().forEach(t => { t.enabled = true })
      setVideoOff(false)
    }
  }

  function handleLeave() { cleanupAll(true); onLeave() }

  function toggleMute() {
    const newMuted = !muted
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = muted })
    setMuted(newMuted)
    fetch(`${config.apiBase}/api/calls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'conference-mute', channelId, muted: newMuted }),
    }).catch(() => {})
  }

  async function toggleScreenShare() {
    if (screenSharing) {
      screenShareStream.current?.getTracks().forEach(t => t.stop())
      screenShareStream.current = null
      for (const [, peer] of peersRef.current) {
        const videoSender = peer.pc.getSenders().find(s => s.track?.kind === 'video')
        if (videoSender) {
          if (videoActive && localStream.current) {
            const camTrack = localStream.current.getVideoTracks()[0]
            if (camTrack) await videoSender.replaceTrack(camTrack)
          } else {
            await videoSender.replaceTrack(null)
          }
        }
      }
      setScreenSharing(false)
    } else {
      try {
        const sources = await (window as any).electronAPI.getScreenSources()
        if (!sources || sources.length === 0) return
        setScreenSources(sources)
      } catch (err) { console.error('[Conference] getScreenSources failed:', err) }
    }
  }

  async function startScreenShare(sourceId: string) {
    setScreenSources(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } as any,
      })
      screenShareStream.current = stream
      const screenTrack = stream.getVideoTracks()[0]
      screenTrack.onended = () => { setScreenSharing(false); screenShareStream.current = null }
      for (const [peerId, peer] of peersRef.current) {
        const videoSender = peer.pc.getSenders().find(s => s.track?.kind === 'video')
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack)
        } else {
          peer.pc.addTrack(screenTrack, stream)
          const offer = await peer.pc.createOffer()
          await peer.pc.setLocalDescription(offer)
          await fetch(`${config.apiBase}/api/calls`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'conference-offer', to: peerId, channelId, sdp: offer.sdp }),
          })
        }
      }
      setScreenSharing(true)
      if (!videoActive) { setVideoActive(true); setVideoOff(false) }
    } catch (err) { console.error('[Conference] screen share failed:', err) }
  }

  async function loadInviteUsers() {
    try {
      const res = await fetch(`${config.apiBase}/api/channels/${channelId}/members`, {
        headers: { Authorization: `Bearer ${config.token}` },
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data = await res.json()
      const inConf = new Set([auth.userId, ...Array.from(peersRef.current.keys())])
      const others = (data.members ?? data ?? []).filter((u: UserInfo) => !inConf.has(u.id))
      setInviteUsers(others)
      setShowInvite(true)
    } catch (err) { console.error('[Conference] loadInviteUsers failed:', err) }
  }

  // Connection quality monitoring (average across all peers)
  useEffect(() => {
    if (peersRef.current.size === 0) return
    const interval = setInterval(async () => {
      let worstQuality: 'good' | 'fair' | 'poor' | 'disconnected' = 'good'
      for (const [, peer] of peersRef.current) {
        try {
          const stats = await peer.pc.getStats()
          let packetsLost = 0, packetsReceived = 0, rtt = 0
          stats.forEach((report: any) => {
            if (report.type === 'inbound-rtp' && report.kind === 'audio') {
              packetsLost = report.packetsLost || 0
              packetsReceived = report.packetsReceived || 0
            }
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              rtt = report.currentRoundTripTime || 0
            }
          })
          const total = packetsLost + packetsReceived
          const lossRate = total > 0 ? packetsLost / total : 0
          let q: typeof worstQuality = 'good'
          if (lossRate > 0.1 || rtt > 0.5) q = 'poor'
          else if (lossRate > 0.03 || rtt > 0.2) q = 'fair'
          if (q === 'poor' || (q === 'fair' && worstQuality === 'good')) worstQuality = q
        } catch { /* ignore */ }
      }
      setConnectionQuality(worstQuality)
    }, 3000)
    return () => clearInterval(interval)
  }, [peers.size])

  const handleDragStart = (e: React.MouseEvent) => {
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    setIsDragging(true)
  }

  const peerList = Array.from(peers.entries())
  const totalParticipants = peerList.length + 1 // +1 for self
  const gridCols = totalParticipants <= 2 ? 1 : totalParticipants <= 4 ? 2 : 3

  function renderParticipantTile(id: string, stream: MediaStream | null, name: string, avatar: string | null, isSelf: boolean) {
    const isMuted = isSelf ? muted : !!peerMuted.get(id)
    const isSpeaking = speakingPeers.has(id)
    return (
      <div key={id} style={{
        background: C.bgFloating, borderRadius: 4, overflow: 'hidden', position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0,
        outline: isSpeaking ? '2px solid #43B581' : '2px solid transparent',
        transition: 'outline-color 0.15s',
      }}>
        {stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled ? (
          <video autoPlay playsInline muted={isSelf} ref={el => { if (el && el.srcObject !== stream) { el.srcObject = stream; el.play().catch(() => {}) } }}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ textAlign: 'center', padding: 12 }}>
            <Avatar url={avatar} name={name} size={windowMode === 'mini' ? 28 : 48} />
            <div style={{ color: '#fff', fontSize: windowMode === 'mini' ? 10 : 12, fontWeight: 600, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 4, left: 6, color: '#fff', fontSize: 10, textShadow: '0 1px 3px rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span>{isSelf ? 'You' : name}</span>
          {isMuted && <MicOff size={8} color="#f87171" />}
        </div>
      </div>
    )
  }

  // ─── Mini mode ──────────────────────────────────────────────────────
  if (windowMode === 'mini') {
    return (
      <>
        {screenSources && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: C.bgSecondary, borderRadius: 12, padding: 20, width: 480, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
              <div style={{ fontWeight: 700, color: '#fff', marginBottom: 14, fontSize: 15 }}>Choose what to share</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {screenSources.map(src => (
                  <button key={src.id} onClick={() => startScreenShare(src.id)}
                    style={{ background: '#080808', border: '2px solid #333333', borderRadius: 8, cursor: 'pointer', padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <img src={src.thumbnail} alt={src.name} style={{ width: '100%', borderRadius: 4, aspectRatio: '16/9', objectFit: 'cover', background: '#000' }} />
                    <span style={{ color: '#cccccc', fontSize: 11, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{src.name}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setScreenSources(null)} style={{ marginTop: 16, width: '100%', padding: '8px 0', background: '#282828', border: 'none', borderRadius: 8, color: '#cccccc', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            </div>
          </div>
        )}
        {showInvite && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: C.bgSecondary, borderRadius: 12, padding: 20, width: 340, maxHeight: '60vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
              <div style={{ fontWeight: 700, color: '#fff', marginBottom: 14, fontSize: 15 }}>Invite to call</div>
              {inviteUsers.length === 0 ? (
                <div style={{ color: '#6b6b6b', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>All channel members are already in the call</div>
              ) : inviteUsers.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #333333' }}>
                  <Avatar url={u.avatarUrl ?? null} name={u.alias ?? u.username} size={32} />
                  <span style={{ flex: 1, color: '#cccccc', fontSize: 13 }}>{u.alias ?? u.username}</span>
                  <button onClick={async () => {
                    await fetch(`${config.apiBase}/api/calls`, {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'conference-invite', to: u.id, channelId }),
                    }).catch(() => {})
                    setInviteUsers(prev => prev.filter(x => x.id !== u.id))
                  }} style={{ background: C.accent, border: 'none', borderRadius: 6, color: '#fff', padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Invite</button>
                </div>
              ))}
              <button onClick={() => setShowInvite(false)} style={{ marginTop: 16, width: '100%', padding: '8px 0', background: '#282828', border: 'none', borderRadius: 8, color: '#cccccc', cursor: 'pointer', fontSize: 13 }}>Close</button>
            </div>
          </div>
        )}
        <div style={{
          position: 'fixed', left: position.x, top: position.y, zIndex: 9998,
          width: 300, height: 200, background: '#080808', borderRadius: 12,
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div onMouseDown={handleDragStart} onDoubleClick={() => setWindowMode('normal')} style={{
            padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6,
            cursor: isDragging ? 'grabbing' : 'grab', background: 'rgba(255,255,255,0.05)', flexShrink: 0,
          }}>
            <Move size={10} color="#94a3b8" />
            <Hash size={10} color="#94a3b8" />
            <span style={{ color: '#fff', fontSize: 10, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channelName}</span>
            <span style={{ color: '#6b6b6b', fontSize: 10 }}><Users size={10} style={{ verticalAlign: 'middle' }} /> {totalParticipants}</span>
          </div>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${Math.min(gridCols, 2)}, 1fr)`, gap: 2, padding: 2, minHeight: 0 }}>
            {renderParticipantTile(auth.userId, localStream.current, 'You', null, true)}
            {peerList.slice(0, 3).map(([id, p]) => renderParticipantTile(id, p.stream, p.name, p.avatar, false))}
          </div>
          <div style={{ padding: '4px 8px', display: 'flex', justifyContent: 'center', flexShrink: 0, background: 'rgba(0,0,0,0.3)' }}>
            <CallControls muted={muted} onToggleMute={toggleMute} videoOff={videoOff} onToggleVideo={toggleVideo}
              videoActive={videoActive} windowMode="mini" onSetWindowMode={setWindowMode}
              onHangup={handleLeave} participantCount={totalParticipants} callDuration={callDuration}
              screenSharing={screenSharing} onToggleScreenShare={toggleScreenShare} connectionQuality={connectionQuality} />
          </div>
          <video ref={localVideo} autoPlay playsInline muted style={{ display: 'none' }} />
        </div>
      </>
    )
  }

  // ─── Normal / fullscreen mode ───────────────────────────────────────
  const isFs = windowMode === 'fullscreen'
  return (
    <>
      {screenSources && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.bgSecondary, borderRadius: 12, padding: 20, width: 520, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontWeight: 700, color: '#fff', marginBottom: 14, fontSize: 15 }}>Choose what to share</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {screenSources.map(src => (
                <button key={src.id} onClick={() => startScreenShare(src.id)}
                  style={{ background: '#080808', border: '2px solid #333333', borderRadius: 8, cursor: 'pointer', padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <img src={src.thumbnail} alt={src.name} style={{ width: '100%', borderRadius: 4, aspectRatio: '16/9', objectFit: 'cover', background: '#000' }} />
                  <span style={{ color: '#cccccc', fontSize: 11, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{src.name}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setScreenSources(null)} style={{ marginTop: 16, width: '100%', padding: '8px 0', background: '#282828', border: 'none', borderRadius: 8, color: '#cccccc', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}
      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.bgSecondary, borderRadius: 12, padding: 20, width: 340, maxHeight: '60vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontWeight: 700, color: '#fff', marginBottom: 14, fontSize: 15 }}>Invite to call</div>
            {inviteUsers.length === 0 ? (
              <div style={{ color: '#6b6b6b', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>All channel members are already in the call</div>
            ) : inviteUsers.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #333333' }}>
                <Avatar url={u.avatarUrl ?? null} name={u.alias ?? u.username} size={32} />
                <span style={{ flex: 1, color: '#cccccc', fontSize: 13 }}>{u.alias ?? u.username}</span>
                <button onClick={async () => {
                  await fetch(`${config.apiBase}/api/calls`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'conference-invite', to: u.id, channelId }),
                  }).catch(() => {})
                  setInviteUsers(prev => prev.filter(x => x.id !== u.id))
                }} style={{ background: C.accent, border: 'none', borderRadius: 6, color: '#fff', padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Invite</button>
              </div>
            ))}
            <button onClick={() => setShowInvite(false)} style={{ marginTop: 16, width: '100%', padding: '8px 0', background: '#282828', border: 'none', borderRadius: 8, color: '#cccccc', cursor: 'pointer', fontSize: 13 }}>Close</button>
          </div>
        </div>
      )}
    <div style={{
      position: 'fixed', inset: 0, background: isFs ? '#000' : 'rgba(0,0,0,0.85)', zIndex: 9998,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Hash size={16} color="#94a3b8" />
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{channelName}</span>
        <span style={{ color: '#6b6b6b', fontSize: 12 }}><Users size={12} style={{ verticalAlign: 'middle' }} /> {totalParticipants}</span>
      </div>
      {/* Participant grid */}
      <div style={{
        flex: 1, display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gap: 6, padding: '0 20px', minHeight: 0,
      }}>
        {renderParticipantTile(auth.userId, localStream.current, 'You', null, true)}
        {peerList.map(([id, p]) => renderParticipantTile(id, p.stream, p.name, p.avatar, false))}
      </div>
      {/* Controls */}
      <div style={{
        padding: '16px 0', display: 'flex', justifyContent: 'center', flexShrink: 0,
        ...(isFs ? { opacity: showControls ? 1 : 0, transition: 'opacity 0.3s' } : {}),
      }}>
        <div style={{ padding: '10px 24px', borderRadius: 8, background: isFs ? 'rgba(0,0,0,0.6)' : 'transparent' }}>
          <CallControls muted={muted} onToggleMute={toggleMute} videoOff={videoOff} onToggleVideo={toggleVideo}
            videoActive={videoActive} windowMode={windowMode} onSetWindowMode={setWindowMode}
            onHangup={handleLeave} participantCount={totalParticipants} callDuration={callDuration}
            screenSharing={screenSharing} onToggleScreenShare={toggleScreenShare} connectionQuality={connectionQuality}
            onInvite={loadInviteUsers} />
        </div>
      </div>
      <video ref={localVideo} autoPlay playsInline muted style={{ display: 'none' }} />
    </div>
    </>
  )
}

// ─── Tasks Panel ──────────────────────────────────────────────────────────────

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'To Do', 'in-progress': 'In Progress', review: 'Review', done: 'Done', blocked: 'Blocked'
}
const TASK_STATUS_COLORS: Record<string, string> = {
  todo: C.textMuted, 'in-progress': C.accent, review: '#1a8ad4', done: C.success, blocked: C.danger
}
const TASK_STATUS_ICONS: Record<string, React.ReactNode> = {
  todo: <Circle size={13} />, 'in-progress': <Play size={13} />,
  done: <Check size={13} />, cancelled: <AlertCircle size={13} />, blocked: <AlertCircle size={13} />,
}
const TASK_BOARD_COLS = [
  { key: 'todo', label: 'To Do' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
  { key: 'blocked', label: 'Blocked' },
]
const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low', none: 'None'
}
const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#f04747', high: '#007acc', medium: '#007acc', low: '#43B581', none: '#9ca3af'
}

function TasksPanel({ config, auth, pendingTaskId, onPendingTaskHandled }: { config: ApiConfig; auth: Auth; pendingTaskId?: string | null; onPendingTaskHandled?: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'mine' | 'todo' | 'in-progress' | 'overdue'>('mine')
  const [projects, setProjects] = useState<TaskProject[]>([])
  const [sections, setSections] = useState<TaskSection[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [dragOverSection, setDragOverSection] = useState<string | null>(null)
  const [showProjectFilter, setShowProjectFilter] = useState(false)
  const [editProject, setEditProject] = useState<TaskProject | null>(null)
  const [showManageSections, setShowManageSections] = useState(false)

  const apiFetch = useCallback(async (path: string, opts?: RequestInit) => {
    const res = await fetch(`${config.apiBase}${path}`, {
      ...opts,
      headers: { 'Authorization': `Bearer ${config.token}`, 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }, [config])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter === 'mine') params.set('assigneeId', 'me')
      if (filter === 'todo') params.set('status', 'todo')
      if (filter === 'in-progress') params.set('status', 'in-progress')
      if (filter === 'overdue') params.set('dueDate', 'overdue')
      if (selectedProjectId) params.set('projectId', selectedProjectId)
      const [taskData, projData] = await Promise.all([
        apiFetch(`/api/tasks?${params.toString()}`) as Promise<{ tasks: Task[] }>,
        apiFetch('/api/tasks/projects') as Promise<{ projects: TaskProject[] }>,
      ])
      setTasks(taskData.tasks)
      setProjects(projData.projects)
      // load sections if project is selected
      if (selectedProjectId) {
        const secData = await apiFetch(`/api/tasks/sections?projectId=${selectedProjectId}`) as { sections: TaskSection[] }
        setSections(secData.sections)
      } else {
        setSections([])
      }
    } catch { /* offline */ } finally {
      setLoading(false)
    }
  }, [apiFetch, filter, selectedProjectId])

  useEffect(() => {
    if (DEMO_MODE) {
      const demoProjects: TaskProject[] = [
        { id: 'p1', name: 'Bundy Web', color: '#007acc', clientName: 'Internal', description: 'Main web application', _count: { tasks: 12 } },
        { id: 'p2', name: 'Backend API', color: '#43B581', clientName: 'Internal', description: 'REST API services', _count: { tasks: 8 } },
        { id: 'p3', name: 'Desktop App', color: '#cca700', clientName: 'Internal', description: 'Electron desktop client', _count: { tasks: 6 } },
        { id: 'p4', name: 'Mobile App', color: '#f04747', clientName: 'Client XYZ', description: 'React Native mobile app', _count: { tasks: 4 } },
      ]
      const demoSections: TaskSection[] = [
        { id: 's1', name: 'Sprint 12', order: 0, projectId: 'p1' },
        { id: 's2', name: 'Backlog', order: 1, projectId: 'p1' },
      ]
      const mkTask = (id: string, title: string, status: string, priority: string, proj: TaskProject, section: TaskSection | null, assignee: string, dueOffset: number): Task => ({
        id, title, description: null, status, priority,
        dueDate: new Date(Date.now() + dueOffset * 86_400_000).toISOString(),
        estimatedHours: Math.ceil(Math.random() * 8),
        createdBy: 'u1', projectId: proj.id, assigneeId: 'u2',
        sectionId: section?.id ?? null,
        project: { id: proj.id, name: proj.name, color: proj.color },
        section: section ? { id: section.id, name: section.name } : null,
        assignee: { id: 'u2', username: assignee, alias: assignee.split('.').map(w => w[0].toUpperCase() + w.slice(1)).join(' '), avatarUrl: null },
        _count: { comments: Math.floor(Math.random() * 6), subtasks: Math.floor(Math.random() * 4) },
      })
      setTasks([
        mkTask('t1', 'Implement dark mode toggle', 'in-progress', 'high', demoProjects[0], demoSections[0], 'john.doe', 1),
        mkTask('t2', 'Fix sidebar scroll on mobile', 'todo', 'medium', demoProjects[0], demoSections[0], 'sarah.chen', 2),
        mkTask('t3', 'Add rate limiting to auth endpoints', 'in-progress', 'urgent', demoProjects[1], null, 'alex.k', 0),
        mkTask('t4', 'Write integration tests for /api/tasks', 'todo', 'medium', demoProjects[1], null, 'john.doe', 3),
        mkTask('t5', 'Update Electron to v33', 'done', 'low', demoProjects[2], null, 'mike.t', -1),
        mkTask('t6', 'Screenshot capture optimization', 'in-progress', 'high', demoProjects[2], null, 'john.doe', 2),
        mkTask('t7', 'Design new onboarding flow', 'todo', 'medium', demoProjects[0], demoSections[1], 'lisa.m', 5),
        mkTask('t8', 'Migrate database to PostgreSQL 16', 'todo', 'high', demoProjects[1], null, 'alex.k', 7),
        mkTask('t9', 'Push notification support', 'todo', 'low', demoProjects[3], null, 'sarah.chen', 10),
        mkTask('t10', 'Fix crash on offline mode', 'done', 'urgent', demoProjects[2], null, 'john.doe', -2),
        mkTask('t11', 'Add multi-language support', 'todo', 'low', demoProjects[0], demoSections[1], 'lisa.m', 14),
        mkTask('t12', 'Optimize bundle size', 'in-progress', 'medium', demoProjects[0], demoSections[0], 'mike.t', 3),
      ])
      setProjects(demoProjects)
      setSections(demoSections)
      setLoading(false)
      return
    }
    load()
  }, [load])

  // Handle pending task from external navigation (e.g. Home panel, chat link)
  useEffect(() => {
    if (pendingTaskId) {
      setDetailTaskId(pendingTaskId)
      onPendingTaskHandled?.()
    }
  }, [pendingTaskId, onPendingTaskHandled])

  async function handleDrop(targetStatus: string) {
    if (!dragId) return
    setDragOverCol(null)
    const task = tasks.find(t => t.id === dragId)
    if (!task || task.status === targetStatus) { setDragId(null); return }
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === dragId ? { ...t, status: targetStatus } : t))
    setDragId(null)
    try {
      await apiFetch(`/api/tasks/${dragId}`, { method: 'PATCH', body: JSON.stringify({ status: targetStatus }) })
    } catch {
      // Revert on error
      setTasks(prev => prev.map(t => t.id === dragId ? { ...t, status: task.status } : t))
    }
  }

  async function handleSectionDrop(targetSectionName: string) {
    if (!dragId) return
    setDragOverSection(null)
    const task = tasks.find(t => t.id === dragId)
    if (!task) { setDragId(null); return }
    const targetSection = sections.find(s => s.name === targetSectionName)
    const targetSectionId = targetSection?.id ?? null
    if (task.sectionId === targetSectionId) { setDragId(null); return }
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === dragId ? {
      ...t,
      sectionId: targetSectionId,
      section: targetSection ? { id: targetSection.id, name: targetSection.name } : null,
    } : t))
    setDragId(null)
    try {
      await apiFetch(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ sectionId: targetSectionId }) })
    } catch {
      // Revert on error
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, sectionId: task.sectionId, section: task.section } : t))
    }
  }

  // Group tasks
  const grouped = (() => {
    if (viewMode === 'board') return {} // board does its own grouping
    if (selectedProjectId && sections.length > 0) {
      const groups: Record<string, Task[]> = {}
      for (const sec of sections) groups[sec.name] = []
      groups['No Section'] = []
      for (const t of tasks) {
        const secName = t.section?.name ?? 'No Section'
        ;(groups[secName] ??= []).push(t)
      }
      return groups
    }
    // Default: group by project
    return tasks.reduce<Record<string, Task[]>>((acc, t) => {
      const key = t.project?.name ?? 'No Project'
      ;(acc[key] ??= []).push(t)
      return acc
    }, {})
  })()

  const selectedProject = projects.find(p => p.id === selectedProjectId)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minHeight: 0, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding: '10px 20px', borderBottom: `1px solid ${C.separator}`,
        background: C.lgBg, 
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap',
      }}>
        {/* Title + project filter */}
        <span style={{ fontWeight: 700, fontSize: 14, color: C.text, marginRight: 4 }}>Tasks</span>

        {/* Project filter dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowProjectFilter(!showProjectFilter)}
            style={{
              ...neu(), padding: '4px 10px', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: selectedProjectId ? C.accent : C.textMuted, fontWeight: 500,
            }}
          >
            <Filter size={11} />
            {selectedProject ? selectedProject.name : 'All Projects'}
            <ChevronRight size={10} style={{ transform: showProjectFilter ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {showProjectFilter && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
              background: C.lgBg, borderRadius: 4, boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
              border: `1px solid ${C.separator}`, minWidth: 200, padding: 6, maxHeight: 300, overflow: 'auto',
            }}>
              <button
                onClick={() => { setSelectedProjectId(''); setShowProjectFilter(false) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 6,
                  border: 'none', cursor: 'pointer', fontSize: 12, background: !selectedProjectId ? C.accentLight : 'transparent',
                  color: !selectedProjectId ? C.accent : C.text, fontWeight: !selectedProjectId ? 600 : 400,
                }}
              >
                All Projects
              </button>
              {projects.map(p => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                    borderRadius: 6,
                    background: selectedProjectId === p.id ? C.accentLight : 'transparent',
                  }}
                >
                  <button
                    onClick={() => { setSelectedProjectId(p.id); setShowProjectFilter(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, flex: 1, textAlign: 'left',
                      border: 'none', cursor: 'pointer', fontSize: 12, padding: 0, background: 'transparent',
                      color: selectedProjectId === p.id ? C.accent : C.text,
                      fontWeight: selectedProjectId === p.id ? 600 : 400,
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    {p._count?.tasks != null && <span style={{ fontSize: 10, color: C.textMuted }}>{p._count.tasks}</span>}
                  </button>
                  {auth.role === 'admin' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditProject(p); setShowProjectFilter(false) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2, flexShrink: 0, opacity: 0.5 }}
                      title="Edit project"
                    >
                      <Edit2 size={10} />
                    </button>
                  )}
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${C.separator}`, marginTop: 4, paddingTop: 4 }}>
                <button
                  onClick={() => { setShowCreateProject(true); setShowProjectFilter(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '7px 10px',
                    borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, color: C.accent, background: 'transparent',
                  }}
                >
                  <FolderPlus size={12} /> New Project
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 20, background: C.separator }} />

        {/* Status filters */}
        {(['all', 'mine', 'todo', 'in-progress', 'overdue'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '4px 10px', borderRadius: 8, border: 'none',
              background: filter === f ? C.accent : 'transparent',
              color: filter === f ? '#fff' : C.textMuted,
              fontSize: 11, fontWeight: filter === f ? 600 : 400, cursor: 'pointer',
              ...(filter === f ? {} : {}),
            }}
          >
            {f === 'in-progress' ? 'In Progress' : f === 'overdue' ? 'Overdue' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Manage Sections button — shown when a project is selected and user is admin */}
        {selectedProjectId && auth.role === 'admin' && (
          <button
            onClick={() => setShowManageSections(true)}
            style={{
              ...neu(), padding: '4px 10px', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: C.textMuted, fontWeight: 500,
            }}
          >
            <Layers size={11} /> Sections
          </button>
        )}

        {/* View toggle */}
        <div style={{ display: 'flex', background: C.lgBg, borderRadius: 8, padding: 2, border: `1px solid ${C.lgBorderSide}` }}>
          <button onClick={() => setViewMode('list')} style={{
            padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: viewMode === 'list' ? C.lgBg : 'transparent',
            color: viewMode === 'list' ? C.accent : C.textMuted,
            boxShadow: viewMode === 'list' ? C.lgShadow : 'none',
          }}>
            <LayoutList size={14} />
          </button>
          <button onClick={() => setViewMode('board')} style={{
            padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: viewMode === 'board' ? C.lgBg : 'transparent',
            color: viewMode === 'board' ? C.accent : C.textMuted,
            boxShadow: viewMode === 'board' ? C.lgShadow : 'none',
          }}>
            <LayoutGrid size={14} />
          </button>
        </div>

        <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4 }}>
          <RefreshCw size={14} />
        </button>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            padding: '5px 12px', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            color: '#fff', background: C.accent, borderRadius: 8, fontSize: 12, fontWeight: 600,
            boxShadow: `0 2px 8px ${C.accent}44`,
          }}
        >
          <Plus size={13} /> New Task
        </button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: viewMode === 'board' ? 'hidden' : 'auto', minHeight: 0, padding: viewMode === 'board' ? '16px 12px' : 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: C.textMuted, padding: 40 }}>
            <Loader size={24} />
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.textMuted, padding: 40 }}>
            <CheckSquare size={40} strokeWidth={1} style={{ opacity: 0.4, margin: '0 auto' }} />
            <div style={{ marginTop: 12, fontSize: 13 }}>No tasks found</div>
            <button onClick={() => setShowCreate(true)} style={{
              marginTop: 12, padding: '6px 14px', borderRadius: 8, border: 'none',
              background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>Create your first task</button>
          </div>
        ) : viewMode === 'board' ? (
          /* ─── Board View (Kanban) ─── */
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${TASK_BOARD_COLS.length}, 1fr)`, gap: 10, height: '100%' }}>
            {TASK_BOARD_COLS.map(col => {
              const colTasks = tasks.filter(t => t.status === col.key)
              const isOver = dragOverCol === col.key
              return (
                <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, minHeight: 0 }}>
                  {/* Column header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px', marginBottom: 2, flexShrink: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: TASK_STATUS_COLORS[col.key] }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{col.label}</span>
                    {colTasks.length > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.accent, background: C.accentLight, borderRadius: 4, padding: '1px 6px' }}>
                        {colTasks.length}
                      </span>
                    )}
                  </div>
                  {/* Drop zone */}
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOverCol(col.key) }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null) }}
                    onDrop={e => { e.preventDefault(); handleDrop(col.key) }}
                    style={{
                      flex: 1, borderRadius: 12, padding: 6, display: 'flex', flexDirection: 'column', gap: 6,
                      border: `2px ${isOver ? 'solid' : 'dashed'} ${isOver ? C.accent : C.separator}`,
                      background: isOver ? C.accentLight : 'transparent',
                      transition: 'all 0.15s ease',
                      minHeight: 80, overflow: 'auto',
                    }}
                  >
                    {colTasks.map(task => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={e => { setDragId(task.id); e.dataTransfer.effectAllowed = 'move' }}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => setDetailTaskId(task.id)}
                        style={{
                          ...neu(), padding: '10px 12px', cursor: 'pointer',
                          opacity: dragId === task.id ? 0.4 : 1,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        {/* Project badge + assignee */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          {task.project ? (
                            <span style={{ fontSize: 9, fontWeight: 600, color: task.project.color, background: task.project.color + '18', borderRadius: 4, padding: '1px 5px' }}>
                              {task.project.name}
                            </span>
                          ) : <span />}
                          {task.assignee && (
                            <Avatar url={task.assignee.avatarUrl} name={task.assignee.alias ?? task.assignee.username} size={20} />
                          )}
                        </div>
                        {/* Title */}
                        <div style={{
                          fontSize: 12, color: C.text, lineHeight: 1.4, marginBottom: 6,
                          textDecoration: task.status === 'done' ? 'line-through' : 'none',
                          opacity: task.status === 'done' ? 0.6 : 1,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                        }}>
                          {task.title}
                        </div>
                        {/* Meta row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLORS[task.priority] ?? C.textMuted }} />
                          <span style={{ fontSize: 9, color: C.textMuted }}>{PRIORITY_LABELS[task.priority] ?? task.priority}</span>
                          {task.dueDate && (
                            <span style={{ fontSize: 9, color: new Date(task.dueDate) < new Date() && task.status !== 'done' ? C.danger : C.textMuted, marginLeft: 'auto' }}>
                              {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          {(task._count?.subtasks ?? 0) > 0 && <span style={{ fontSize: 9, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 2 }}><GitBranch size={8} />{task._count.subtasks}</span>}
                          {(task._count?.comments ?? 0) > 0 && <span style={{ fontSize: 9, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 2 }}><MessageSquare size={8} />{task._count.comments}</span>}
                        </div>
                      </div>
                    ))}
                    {colTasks.length === 0 && (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.textMuted, opacity: 0.4, padding: 12 }}>
                        {isOver ? '↩ drop here' : 'empty'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ─── List View ─── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {Object.entries(grouped).map(([groupName, groupTasks]) => (
              <TaskListGroup
                key={groupName}
                name={groupName}
                tasks={groupTasks}
                auth={auth}
                onOpen={id => setDetailTaskId(id)}
                canDropSection={!!selectedProjectId && sections.length > 0}
                isDropOver={dragOverSection === groupName}
                onDragOver={() => setDragOverSection(groupName)}
                onDragLeave={() => setDragOverSection(null)}
                onDrop={() => handleSectionDrop(groupName)}
                onDragStartTask={id => setDragId(id)}
                onDragEndTask={() => setDragId(null)}
                draggingId={dragId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Overlays */}
      {detailTaskId && (
        <>
          <div
            onClick={() => setDetailTaskId(null)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 48 }}
          />
          <TaskDetailDrawer
            taskId={detailTaskId}
            config={config}
            auth={auth}
            projects={projects}
            onClose={() => setDetailTaskId(null)}
            onUpdated={(updated) => {
              setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))
            }}
            onDeleted={(id) => {
              setTasks(prev => prev.filter(t => t.id !== id))
              setDetailTaskId(null)
            }}
          />
        </>
      )}

      {showCreate && (
        <CreateTaskModal
          config={config}
          auth={auth}
          projects={projects}
          sections={sections}
          selectedProjectId={selectedProjectId}
          onClose={() => setShowCreate(false)}
          onCreated={(task) => {
            setTasks(prev => [task, ...prev])
            setShowCreate(false)
          }}
        />
      )}

      {showCreateProject && (
        <CreateProjectModal
          config={config}
          onClose={() => setShowCreateProject(false)}
          onCreated={(proj) => {
            setProjects(prev => [...prev, proj])
            setSelectedProjectId(proj.id)
            setShowCreateProject(false)
          }}
        />
      )}

      {editProject && (
        <EditProjectModal
          config={config}
          project={editProject}
          onClose={() => setEditProject(null)}
          onUpdated={(proj) => {
            setProjects(prev => prev.map(p => p.id === proj.id ? { ...p, ...proj } : p))
            setEditProject(null)
          }}
          onDeleted={(id) => {
            setProjects(prev => prev.filter(p => p.id !== id))
            if (selectedProjectId === id) setSelectedProjectId('')
            setEditProject(null)
          }}
        />
      )}

      {showManageSections && selectedProjectId && (
        <ManageSectionsModal
          config={config}
          projectId={selectedProjectId}
          projectName={selectedProject?.name ?? 'Project'}
          sections={sections}
          onClose={() => setShowManageSections(false)}
          onUpdated={(updated) => setSections(updated)}
        />
      )}

      {/* Click-away for project filter */}
      {showProjectFilter && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowProjectFilter(false)} />
      )}
    </div>
  )
}

// ─── Task List Group ──────────────────────────────────────────────────────────

function TaskListGroup({ name, tasks, auth, onOpen, canDropSection, isDropOver, onDragOver, onDragLeave, onDrop, onDragStartTask, onDragEndTask, draggingId }: {
  name: string; tasks: Task[]; auth: Auth; onOpen: (id: string) => void
  canDropSection?: boolean; isDropOver?: boolean
  onDragOver?: () => void; onDragLeave?: () => void; onDrop?: () => void
  onDragStartTask?: (id: string) => void; onDragEndTask?: () => void; draggingId?: string | null
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      onDragOver={canDropSection ? (e) => { e.preventDefault(); onDragOver?.() } : undefined}
      onDragLeave={canDropSection ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragLeave?.() } : undefined}
      onDrop={canDropSection ? (e) => { e.preventDefault(); onDrop?.() } : undefined}
      style={{
        borderRadius: 4, padding: canDropSection ? 4 : 0,
        border: canDropSection ? `2px ${isDropOver ? 'solid' : 'dashed'} ${isDropOver ? C.accent : 'transparent'}` : 'none',
        background: isDropOver ? C.accentLight : 'transparent',
        transition: 'all 0.15s',
      }}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px', marginBottom: 8,
          background: 'none', border: 'none', cursor: 'pointer', width: '100%',
        }}
      >
        <ChevronRight size={12} color={C.textMuted} style={{ transform: collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.15s' }} />
        <Layers size={12} color={C.textMuted} />
        <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{name}</span>
        <span style={{ fontSize: 10, color: C.textMuted }}>({tasks.length})</span>
      </button>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {tasks.map((task, i) => (
            <TaskListRow
              key={task.id} task={task} auth={auth} onOpen={() => onOpen(task.id)}
              draggable={canDropSection}
              onDragStart={() => onDragStartTask?.(task.id)}
              onDragEnd={() => onDragEndTask?.()}
              isDragging={draggingId === task.id}
              showDivider={i > 0}
            />
          ))}
          {tasks.length === 0 && isDropOver && (
            <div style={{ textAlign: 'center', padding: 8, fontSize: 11, color: C.accent }}>↩ drop here</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Task List Row ────────────────────────────────────────────────────────────

function TaskListRow({ task, auth: _auth, onOpen, draggable: canDrag, onDragStart, onDragEnd, isDragging, showDivider }: {
  task: Task; auth: Auth; onOpen: () => void
  draggable?: boolean; onDragStart?: () => void; onDragEnd?: () => void; isDragging?: boolean
  showDivider?: boolean
}) {
  const isDone = task.status === 'done'
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !isDone

  return (
    <div
      onClick={onOpen}
      draggable={canDrag}
      onDragStart={canDrag ? (e) => { onDragStart?.(); e.dataTransfer.effectAllowed = 'move' } : undefined}
      onDragEnd={canDrag ? () => onDragEnd?.() : undefined}
      style={{
        padding: '10px 4px',
        display: 'flex', alignItems: 'center', gap: 10, cursor: canDrag ? 'grab' : 'pointer',
        opacity: isDragging ? 0.4 : 1,
        borderTop: showDivider ? `1px solid ${C.separator}` : 'none',
        transition: 'background 0.12s',
        borderRadius: 4,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
      onMouseLeave={e => { e.currentTarget.style.background = '' }}
    >
      {/* Status icon */}
      <div style={{ color: TASK_STATUS_COLORS[task.status] ?? C.textMuted, flexShrink: 0 }}>
        {TASK_STATUS_ICONS[task.status] ?? <Circle size={14} />}
      </div>

      {/* Task info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: C.text,
          textDecoration: isDone ? 'line-through' : 'none',
          opacity: isDone ? 0.6 : 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {task.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          {task.project && (
            <span style={{
              fontSize: 11, color: task.project.color || C.textMuted,
              fontWeight: 500,
            }}>
              {task.project.name}
            </span>
          )}
          <span style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            color: PRIORITY_COLORS[task.priority] ?? C.textMuted,
          }}>
            {task.priority}
          </span>
        </div>
      </div>

      {/* Due date */}
      {task.dueDate && (
        <span style={{
          fontSize: 10, color: isOverdue ? C.danger : C.textMuted, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 3, fontWeight: isOverdue ? 600 : 400,
        }}>
          <Calendar size={10} />
          {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      )}

      {/* Counts */}
      {(task._count?.subtasks ?? 0) > 0 && (
        <span style={{ fontSize: 10, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <GitBranch size={10} /> {task._count.subtasks}
        </span>
      )}
      {(task._count?.comments ?? 0) > 0 && (
        <span style={{ fontSize: 10, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <MessageSquare size={10} /> {task._count.comments}
        </span>
      )}

      {/* Status label */}
      <span style={{
        fontSize: 10, fontWeight: 600, color: TASK_STATUS_COLORS[task.status] ?? C.textMuted,
        flexShrink: 0,
      }}>
        {TASK_STATUS_LABELS[task.status] ?? task.status}
      </span>

      {/* Assignee */}
      {task.assignee && (
        <Avatar url={task.assignee.avatarUrl} name={task.assignee.alias ?? task.assignee.username} size={22} />
      )}
    </div>
  )
}

// ─── Task Detail Drawer ───────────────────────────────────────────────────────

function TaskDetailDrawer({ taskId, config, auth, projects, onClose, onUpdated, onDeleted }: {
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
  // Subtask navigation stack
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

  // Load task detail
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

  // Load sections when project changes
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
      // Merge server response with local state (server omits comments/subtasks/activities)
      setDetail(prev => prev ? {
        ...prev,
        ...d.task,
        comments: prev.comments,
        subtasks: prev.subtasks,
        activities: prev.activities,
        attachments: prev.attachments,
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
        // Multipart form data for attachment
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
        if (parentId) {
          // Add reply to parent comment
          setComments(prev => prev.map(c => c.id === parentId ? { ...c, replies: [...(c.replies ?? []), d.comment] } : c))
        } else {
          setComments(prev => [...prev, d.comment])
        }
      } else {
        const d = await apiFetch(`/api/tasks/${viewTaskId}/comments`, {
          method: 'POST', body: JSON.stringify({ body: commentText.trim(), parentCommentId: parentId }),
        }) as { comment: TaskComment }
        if (parentId) {
          setComments(prev => prev.map(c => c.id === parentId ? { ...c, replies: [...(c.replies ?? []), d.comment] } : c))
        } else {
          setComments(prev => [...prev, d.comment])
        }
      }
      setCommentText('')
      setCommentAttach(null)
      setReplyTo(null)
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
        body: JSON.stringify({
          title: newSubtaskTitle.trim(),
          parentTaskId: viewTaskId,
          projectId: detail.projectId,
          assigneeId: detail.assigneeId,
        }),
      }) as { task: Task }
      setDetail(prev => prev ? { ...prev, subtasks: [...(prev.subtasks ?? []), d.task], _count: { ...prev._count, subtasks: prev._count.subtasks + 1 } } : prev)
      onUpdated({ ...detail, _count: { ...detail._count, subtasks: detail._count.subtasks + 1 } })
      setNewSubtaskTitle('')
    } catch (err) { console.error('[TaskDetail] createSubtask failed:', err) } finally { setAddingSubtask(false) }
  }

  async function toggleSubtask(subId: string, currentStatus: string) {
    const newStatus = currentStatus === 'done' ? 'todo' : 'done'
    // Optimistic
    setDetail(prev => prev ? {
      ...prev,
      subtasks: (prev.subtasks ?? []).map(s => s.id === subId ? { ...s, status: newStatus } : s),
    } : prev)
    try {
      await apiFetch(`/api/tasks/${subId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) })
    } catch {
      // Revert
      setDetail(prev => prev ? {
        ...prev,
        subtasks: (prev.subtasks ?? []).map(s => s.id === subId ? { ...s, status: currentStatus } : s),
      } : prev)
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
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}` },
        body: fd,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json() as { attachment: TaskAttachment }
      setAttachments(prev => [...prev, d.attachment])
    } catch (err) { console.error('[TaskDetail] uploadAttachment failed:', err) } finally { setUploadingAttach(false) }
  }

  async function deleteAttachment(attId: string) {
    setAttachments(prev => prev.filter(a => a.id !== attId))
    try {
      await apiFetch(`/api/tasks/${viewTaskId}/attachments`, {
        method: 'DELETE', body: JSON.stringify({ attachmentId: attId }),
      })
    } catch (err) {
      console.error('[TaskDetail] deleteAttachment failed:', err)
      // Re-fetch to restore
      apiFetch(`/api/tasks/${viewTaskId}`).then((d: { task: Task }) => setAttachments(d.task.attachments ?? []))
    }
  }

  function openSubtask(subId: string) {
    setParentStack(prev => [...prev, viewTaskId])
    setViewTaskId(subId)
  }

  function goBackToParent() {
    const parentId = parentStack[parentStack.length - 1]
    if (parentId) {
      setParentStack(prev => prev.slice(0, -1))
      setViewTaskId(parentId)
    }
  }

  const canDelete = detail ? (detail.createdBy === auth.userId || auth.role === 'admin') : false

  if (loadingDetail) {
    return (
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: '50%', minWidth: 400,
        background: C.lgBg, 
        borderLeft: `1px solid ${C.separator}`,
        boxShadow: '-8px 0 30px rgba(0,0,0,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
      }}>
        <Loader size={24} color={C.accent} />
      </div>
    )
  }

  if (!detail) return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: '50%', minWidth: 400,
      background: C.lgBg, 
      borderLeft: `1px solid ${C.separator}`,
      boxShadow: '-8px 0 30px rgba(0,0,0,0.08)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, gap: 12,
    }}>
      <AlertCircle size={32} color={C.danger} strokeWidth={1.5} />
      <span style={{ fontSize: 13, color: C.danger, fontWeight: 600 }}>{loadError || 'Task not found'}</span>
      <button onClick={onClose} style={{
        padding: '6px 14px', borderRadius: 8, border: 'none',
        background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}>Close</button>
    </div>
  )

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: '50%', minWidth: 400,
      background: C.lgBg, 
      borderLeft: `1px solid ${C.separator}`,
      boxShadow: '-8px 0 30px rgba(0,0,0,0.08)',
      display: 'flex', flexDirection: 'column', zIndex: 50,
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.separator}`, display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0 }}>
        {parentStack.length > 0 ? (
          <button onClick={goBackToParent} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, padding: 4, flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', gap: 2, fontSize: 11 }}
            title="Back to parent task"
          >
            <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
          </button>
        ) : (
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, flexShrink: 0, marginTop: 1 }}>
            <X size={16} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditTitle(detail.title); setEditingTitle(false) } }}
              autoFocus
              style={{
                width: '100%', fontSize: 15, fontWeight: 700, color: C.text,
                background: 'transparent', border: `1px solid ${C.accent}`, borderRadius: 6,
                padding: '4px 8px', outline: 'none', fontFamily: 'inherit',
              }}
            />
          ) : (
            <div
              onClick={() => { setEditTitle(detail.title); setEditingTitle(true) }}
              style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.3, cursor: 'pointer' }}
              title="Click to edit"
            >
              {detail.title}
              <Edit2 size={10} style={{ marginLeft: 6, opacity: 0.3, verticalAlign: 'middle' }} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {parentStack.length > 0 && (
              <span style={{ fontSize: 10, fontWeight: 600, color: C.accent, background: C.accent + '18', borderRadius: 4, padding: '1px 6px' }}>
                Subtask
              </span>
            )}
            {detail.project && (
              <span style={{ fontSize: 10, fontWeight: 600, color: detail.project.color, background: detail.project.color + '18', borderRadius: 4, padding: '1px 6px' }}>
                {detail.project.name}
              </span>
            )}
            <span style={{ fontSize: 10, color: C.textMuted }}>
              by {detail.creator?.alias ?? detail.creator?.username ?? '—'}
            </span>
          </div>
        </div>
        {canDelete && (
          <button onClick={() => setConfirmDelete(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 4, flexShrink: 0 }} title="Delete">
            <Trash2 size={14} />
          </button>
        )}
        <button
          onClick={() => {
            const link = `${config.apiBase}/tasks/${viewTaskId}`
            navigator.clipboard.writeText(link).then(() => {
              setCopiedLink(true)
              setTimeout(() => setCopiedLink(false), 2000)
            })
          }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedLink ? C.success : C.textMuted, padding: 4, flexShrink: 0 }}
          title={copiedLink ? 'Copied!' : 'Copy task link'}
        >
          {copiedLink ? <Check size={14} /> : <Link size={14} />}
        </button>
        {parentStack.length > 0 && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, flexShrink: 0 }} title="Close drawer">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{
          padding: '10px 16px', background: C.bgInput, borderBottom: `1px solid ${C.danger}33`,
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
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
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: '8px 12px', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              fontSize: 11, fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? C.accent : C.textMuted,
              background: 'transparent',
              borderBottom: activeTab === tab.key ? `2px solid ${C.accent}` : '2px solid transparent',
            }}
          >
            {tab.icon} {tab.label}
          </button>
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
                    }}>
                    {l}
                  </button>
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
                      padding: '4px 10px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: detail.priority === p ? PRIORITY_COLORS[p] : C.lgBg,
                      color: detail.priority === p ? '#fff' : C.textMuted,
                      boxShadow: detail.priority === p ? `0 2px 6px ${PRIORITY_COLORS[p]}44` : C.lgShadow,
                      transition: 'all 0.15s',
                    }}>
                    <Flag size={9} /> {l}
                  </button>
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
                  <textarea
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                    rows={5} autoFocus
                    style={{
                      width: '100%', resize: 'vertical', ...neu(true), padding: '8px 10px',
                      fontSize: 12, color: C.text, border: 'none', outline: 'none', fontFamily: 'inherit',
                      boxSizing: 'border-box', lineHeight: 1.6,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button onClick={saveDesc} disabled={savingField === 'description'} style={{
                      padding: '4px 12px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer'
                    }}>Save</button>
                    <button onClick={() => { setEditDesc(detail.description ?? ''); setEditingDesc(false) }} style={{
                      padding: '4px 12px', borderRadius: 6, border: `1px solid ${C.separator}`, background: C.lgBg, color: C.textMuted, fontSize: 11, cursor: 'pointer'
                    }}>Cancel</button>
                  </div>
                </div>
              ) : detail.description ? (
                <div onClick={(e) => {
                  const target = e.target as HTMLElement
                  if (target.tagName === 'A') {
                    e.preventDefault()
                    const href = target.getAttribute('href')
                    if (href) window.electronAPI.openExternal(href)
                  } else {
                    setEditingDesc(true)
                  }
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
                    const isImage = att.mimeType?.startsWith('image/')
                    return (
                      <div key={att.id} style={{ position: 'relative', ...neu(), borderRadius: 8, overflow: 'hidden', width: isImage ? 100 : undefined, maxWidth: 200 }}>
                        {isImage ? (
                          <img
                            src={`${config.apiBase}${att.url}`}
                            alt={att.name}
                            onClick={() => { setLightboxUrl(`${config.apiBase}${att.url}`); setLightboxName(att.name) }}
                            style={{ width: 100, height: 80, objectFit: 'cover', display: 'block', cursor: 'pointer' }}
                            onError={e => {
                              const el = e.currentTarget as HTMLImageElement
                              el.style.display = 'none'
                              // Show fallback file icon
                              const fallback = el.parentElement?.querySelector('.att-fallback') as HTMLElement
                              if (fallback) fallback.style.display = 'flex'
                            }}
                          />
                        ) : null}
                        {isImage && (
                          <button
                            className="att-fallback"
                            onClick={() => window.electronAPI.openExternal(`${config.apiBase}${att.url}`)}
                            style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: 100, height: 80, color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}
                          >
                            <Image size={24} />
                          </button>
                        )}
                        {!isImage && (
                          <button
                            onClick={() => window.electronAPI.openExternal(`${config.apiBase}${att.url}`)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', color: C.accent, fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}
                          >
                            <FileText size={14} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                          </button>
                        )}
                        {isImage && (
                          <div style={{ padding: '4px 6px', fontSize: 9, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</div>
                        )}
                        <button
                          onClick={() => deleteAttachment(att.id)}
                          style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, padding: 0 }}
                          title="Remove"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              <input ref={attachInputRef} type="file" style={{ display: 'none' }} accept="*/*"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(f); e.target.value = '' }}
              />
              <button
                onClick={() => attachInputRef.current?.click()}
                disabled={uploadingAttach}
                style={{ ...neu(), padding: '5px 10px', border: 'none', cursor: 'pointer', fontSize: 11, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 4, opacity: uploadingAttach ? 0.5 : 1 }}
              >
                {uploadingAttach ? <Loader size={11} className="spin" /> : <Plus size={11} />}
                {uploadingAttach ? 'Uploading…' : 'Add attachment'}
              </button>
            </div>

            {/* Meta grid: dates, hours, assignee, project */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Calendar size={10} /> Start Date
                </div>
                <input
                  type="date"
                  value={detail.startDate ? new Date(detail.startDate).toISOString().split('T')[0] : ''}
                  onChange={e => patchTask({ startDate: e.target.value || null }, 'startDate')}
                  disabled={savingField === 'startDate'}
                  style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Calendar size={10} /> Due Date
                </div>
                <input
                  type="date"
                  value={detail.dueDate ? new Date(detail.dueDate).toISOString().split('T')[0] : ''}
                  onChange={e => patchTask({ dueDate: e.target.value || null }, 'dueDate')}
                  disabled={savingField === 'dueDate'}
                  style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Clock size={10} /> Est. Hours
                </div>
                <input
                  type="number" min={0} step={0.5}
                  value={detail.estimatedHours ?? ''}
                  onChange={e => patchTask({ estimatedHours: e.target.value ? parseFloat(e.target.value) : null }, 'estimatedHours')}
                  placeholder="e.g. 4"
                  style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Assignee</div>
                <select
                  value={detail.assigneeId ?? ''}
                  onChange={e => patchTask({ assigneeId: e.target.value || null }, 'assignee')}
                  disabled={savingField === 'assignee'}
                  style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.alias ?? u.username}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Project</div>
                <select
                  value={detail.projectId ?? ''}
                  onChange={e => patchTask({ projectId: e.target.value || null, sectionId: null }, 'project')}
                  disabled={savingField === 'project'}
                  style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <option value="">No Project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {/* Section — only shown when a project is selected */}
              {detail.projectId && detailSections.length > 0 && (
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Layers size={10} /> Section
                  </div>
                  <select
                    value={detail.sectionId ?? ''}
                    onChange={e => patchTask({ sectionId: e.target.value || null }, 'section')}
                    disabled={savingField === 'section'}
                    style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
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
                  <div key={u.id} style={{
                    display: 'flex', alignItems: 'center', gap: 5, ...neu(), padding: '4px 8px', borderRadius: 8,
                  }}>
                    <Avatar url={u.avatarUrl} name={u.alias ?? u.username} size={18} />
                    <span style={{ fontSize: 11, color: C.text }}>{u.alias ?? u.username}</span>
                    <button
                      onClick={() => patchTask({ removeAssigneeIds: [u.id] })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 0, display: 'flex' }}
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {(detail.multiAssignees ?? []).length === 0 && (
                  <span style={{ fontSize: 11, color: C.textMuted, opacity: 0.5 }}>No additional assignees</span>
                )}
              </div>
              <select
                value=""
                onChange={e => { if (e.target.value) patchTask({ addAssigneeIds: [e.target.value] }) }}
                style={{ ...neu(true), padding: '6px 8px', fontSize: 11, color: C.text, border: 'none', outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <option value="">+ Add assignee…</option>
                {users
                  .filter(u => !(detail.multiAssignees ?? []).some(a => a.user.id === u.id) && u.id !== detail.assigneeId)
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
                      onClick={() => openSubtask(sub.id)}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSubtask(sub.id, sub.status) }}
                        style={{
                          width: 16, height: 16, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                          border: `2px solid ${subDone ? C.success : C.separator}`,
                          background: subDone ? C.success : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {subDone && <Check size={10} color="#fff" />}
                      </button>
                      <span style={{ flex: 1, fontSize: 12, color: C.text, textDecoration: subDone ? 'line-through' : 'none', opacity: subDone ? 0.5 : 1 }}>
                        {sub.title}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 600, color: TASK_STATUS_COLORS[sub.status] ?? C.textMuted,
                        background: (TASK_STATUS_COLORS[sub.status] ?? C.textMuted) + '18',
                        borderRadius: 8, padding: '1px 6px', flexShrink: 0,
                      }}>
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
                {(detail.subtasks ?? []).length === 0 && (
                  <div style={{ fontSize: 11, color: C.textMuted, opacity: 0.4, padding: '4px 0' }}>No subtasks yet</div>
                )}
              </div>
              {/* Add subtask */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={newSubtaskTitle}
                  onChange={e => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newSubtaskTitle.trim()) createSubtask() }}
                  placeholder="Add subtask…"
                  style={{ flex: 1, ...neu(true), padding: '6px 10px', fontSize: 11, color: C.text, border: 'none', outline: 'none', fontFamily: 'inherit' }}
                />
                <button
                  onClick={createSubtask}
                  disabled={addingSubtask || !newSubtaskTitle.trim()}
                  style={{ ...neu(), padding: '6px 10px', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 11, fontWeight: 600, opacity: !newSubtaskTitle.trim() ? 0.4 : 1 }}
                >
                  {addingSubtask ? '…' : <Plus size={12} />}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'comments' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Comment list */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              {comments.length === 0 && (
                <div style={{ textAlign: 'center', color: C.textMuted, opacity: 0.4, padding: 20, fontSize: 12 }}>No comments yet</div>
              )}
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
                          <div
                            onClick={(e) => {
                              const target = e.target as HTMLElement
                              if (target.tagName === 'A') { e.preventDefault(); const href = target.getAttribute('href'); if (href) window.electronAPI.openExternal(href) }
                            }}
                            style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginTop: 2 }}
                            dangerouslySetInnerHTML={{ __html: linkifyText(c.body) }}
                          />
                        )}
                        {/* OG preview for URLs in comment */}
                        {c.body && extractUrls(c.body).filter(u => !isImageUrl(u)).slice(0, 1).map(u => (
                          <OgPreview key={u} url={u} config={config} />
                        ))}
                        {c.attachmentName && c.attachmentUrl && (
                          isImage ? (
                            <img
                              src={`${config.apiBase}${c.attachmentUrl}`}
                              alt={c.attachmentName}
                              onClick={() => { setLightboxUrl(`${config.apiBase}${c.attachmentUrl}`); setLightboxName(c.attachmentName!) }}
                              style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8, marginTop: 6, cursor: 'pointer', objectFit: 'cover', display: 'block' }}
                            />
                          ) : (
                            <button
                              onClick={() => window.electronAPI.openExternal(`${config.apiBase}${c.attachmentUrl}`)}
                              style={{ fontSize: 11, color: C.accent, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                            >
                              <FileText size={11} /> {c.attachmentName}
                            </button>
                          )
                        )}
                        <button
                          onClick={() => { setReplyTo(c); commentTextareaRef.current?.focus() }}
                          style={{ fontSize: 10, color: C.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: 2, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}
                        >
                          <CornerDownRight size={9} /> Reply{(c.replies?.length ?? 0) > 0 ? ` (${c.replies!.length})` : ''}
                        </button>
                      </div>
                    </div>
                    {/* Thread replies */}
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
                                {r.body && (
                                  <div
                                    onClick={(e) => {
                                      const target = e.target as HTMLElement
                                      if (target.tagName === 'A') { e.preventDefault(); const href = target.getAttribute('href'); if (href) window.electronAPI.openExternal(href) }
                                    }}
                                    style={{ fontSize: 12, color: C.text, lineHeight: 1.5, marginTop: 1 }}
                                    dangerouslySetInnerHTML={{ __html: linkifyText(r.body) }}
                                  />
                                )}
                                {r.attachmentName && r.attachmentUrl && (
                                  rIsImage ? (
                                    <img
                                      src={`${config.apiBase}${r.attachmentUrl}`}
                                      alt={r.attachmentName}
                                      onClick={() => { setLightboxUrl(`${config.apiBase}${r.attachmentUrl}`); setLightboxName(r.attachmentName!) }}
                                      style={{ maxWidth: 160, maxHeight: 120, borderRadius: 6, marginTop: 4, cursor: 'pointer', objectFit: 'cover', display: 'block' }}
                                    />
                                  ) : (
                                    <button
                                      onClick={() => window.electronAPI.openExternal(`${config.apiBase}${r.attachmentUrl}`)}
                                      style={{ fontSize: 10, color: C.accent, display: 'flex', alignItems: 'center', gap: 3, marginTop: 3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                                    >
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

            {/* Reply indicator */}
            {replyTo && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                ...neu(), borderRadius: 8, marginBottom: 4, fontSize: 11, color: C.textMuted,
              }}>
                <CornerDownRight size={10} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Replying to <strong style={{ color: C.text }}>{replyTo.user.alias ?? replyTo.user.username}</strong>
                </span>
                <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 0 }}><X size={10} /></button>
              </div>
            )}

            {/* Markdown toolbar */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
              {[
                { label: 'B', title: 'Bold', wrap: ['**', '**'] as [string, string] },
                { label: 'I', title: 'Italic', wrap: ['*', '*'] as [string, string] },
                { label: 'S', title: 'Strikethrough', wrap: ['~~', '~~'] as [string, string] },
                { label: '<>', title: 'Code', wrap: ['`', '`'] as [string, string] },
              ].map(item => (
                <button key={item.label} title={item.title}
                  onMouseDown={e => { e.preventDefault(); insertMarkdown(item.wrap) }}
                  style={{
                    ...neu(), padding: '3px 7px', border: 'none', cursor: 'pointer',
                    fontSize: 10, fontWeight: 700, color: C.textMuted,
                  }}
                >{item.label}</button>
              ))}
              <button title="Bullet list"
                onMouseDown={e => { e.preventDefault(); setCommentText(prev => prev + (prev.endsWith('\n') || !prev ? '' : '\n') + '- ') }}
                style={{ ...neu(), padding: '3px 7px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: C.textMuted }}
              ><List size={10} /></button>
            </div>

            {/* Attachment preview */}
            {commentAttach && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                ...neu(), borderRadius: 8, marginBottom: 6,
              }}>
                <FileText size={12} color={C.accent} />
                <span style={{ flex: 1, fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{commentAttach.name}</span>
                <button onClick={() => setCommentAttach(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}><X size={12} /></button>
              </div>
            )}

            {/* Comment input */}
            <div style={{ display: 'flex', gap: 6 }}>
              <textarea
                ref={commentTextareaRef}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment() } }}
                placeholder="Add a comment… (Shift+Enter for newline)"
                rows={3}
                style={{
                  flex: 1, resize: 'none', ...neu(true), padding: '8px 10px',
                  fontSize: 12, color: C.text, border: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept="*/*"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (f.size > 15 * 1024 * 1024) { alert('File must be under 15MB'); return }
                    setCommentAttach(f)
                    e.target.value = ''
                  }}
                />
                <button onClick={() => fileInputRef.current?.click()} title="Attach file (max 15MB)" style={{
                  ...neu(), padding: 6, border: 'none', cursor: 'pointer', color: C.textMuted,
                }}><Paperclip size={13} /></button>
                <button onClick={addComment} disabled={(!commentText.trim() && !commentAttach) || addingComment} style={{
                  ...neu(), padding: 6, border: 'none', cursor: 'pointer', color: C.accent,
                  opacity: (!commentText.trim() && !commentAttach) ? 0.4 : 1,
                }}>{addingComment ? <Loader size={13} /> : <Send size={13} />}</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activities.length === 0 && (
              <div style={{ textAlign: 'center', color: C.textMuted, opacity: 0.4, padding: 20, fontSize: 12 }}>No activity yet</div>
            )}
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
                    <span style={{ fontSize: 12, color: C.text }}>
                      <span style={{ fontWeight: 700 }}>{actorName}</span>{' '}{label}
                    </span>
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{timeAgo(a.createdAt)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Lightbox overlay */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', zIndex: 100, cursor: 'zoom-out',
          }}
        >
          <img
            src={lightboxUrl}
            alt={lightboxName}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8, cursor: 'default' }}
          />
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#fff', fontSize: 13 }}>{lightboxName}</span>
            <button
              onClick={e => { e.stopPropagation(); window.electronAPI.openExternal(lightboxUrl!) }}
              style={{ color: C.accent, fontSize: 12, fontWeight: 600, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Download
            </button>
          </div>
          <button
            onClick={() => setLightboxUrl(null)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
          >
            <X size={24} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Create Task Modal ────────────────────────────────────────────────────────

function CreateTaskModal({ config, auth, projects, sections, selectedProjectId, onClose, onCreated }: {
  config: ApiConfig; auth: Auth
  projects: TaskProject[]
  sections: TaskSection[]
  selectedProjectId: string
  onClose: () => void
  onCreated: (task: Task) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('todo')
  const [priority, setPriority] = useState('medium')
  const [projectId, setProjectId] = useState(selectedProjectId)
  const [sectionId, setSectionId] = useState('')
  const [assigneeId, setAssigneeId] = useState(auth.userId)
  const [dueDate, setDueDate] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [estimatedHours, setEstimatedHours] = useState('')
  const [users, setUsers] = useState<UserInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [projectSections, setProjectSections] = useState<TaskSection[]>(sections)

  useEffect(() => {
    fetch(`${config.apiBase}/api/users`, { headers: { Authorization: `Bearer ${config.token}` } })
      .then(r => r.json()).then((d: { users: UserInfo[] }) => setUsers(d.users)).catch(() => {})
  }, [config])

  // Load sections when project changes
  useEffect(() => {
    if (projectId) {
      fetch(`${config.apiBase}/api/tasks/sections?projectId=${projectId}`, { headers: { Authorization: `Bearer ${config.token}` } })
        .then(r => r.json()).then((d: { sections: TaskSection[] }) => setProjectSections(d.sections)).catch(() => {})
    } else {
      setProjectSections([])
      setSectionId('')
    }
  }, [projectId, config])

  async function handleCreate() {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${config.apiBase}/api/tasks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          status, priority,
          projectId: projectId || null,
          sectionId: sectionId || null,
          assigneeId: assigneeId || null,
          dueDate: dueDate || null,
          startDate: startDate || null,
          estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      const d = await res.json() as { task: Task }
      onCreated(d.task)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create task') } finally { setSaving(false) }
  }

  const fieldStyle = {
    ...neu(true), padding: '7px 10px', fontSize: 12, color: C.text,
    border: 'none', outline: 'none', width: '100%', fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      WebkitAppRegion: 'no-drag',
    } as React.CSSProperties} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 480, maxHeight: '85vh', overflow: 'auto',
        ...neu(), padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>New Task</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}><X size={18} /></button>
        </div>

        {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Title *</div>
            <input value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void handleCreate()}
              placeholder="Task title…" autoFocus style={fieldStyle} />
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Description</div>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Optional description…" rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Status</div>
              <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
                {Object.entries(TASK_STATUS_LABELS).map(([s, l]) => <option key={s} value={s}>{l}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Priority</div>
              <select value={priority} onChange={e => setPriority(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
                {Object.entries(PRIORITY_LABELS).map(([p, l]) => <option key={p} value={p}>{l}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Project</div>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
                <option value="">No Project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {projectSections.length > 0 && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Section</div>
                <select value={sectionId} onChange={e => setSectionId(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
                  <option value="">No Section</option>
                  {projectSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Assignee</div>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.alias ?? u.username}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Est. Hours</div>
              <input type="number" min={0} step={0.5} value={estimatedHours}
                onChange={e => setEstimatedHours(e.target.value)} placeholder="e.g. 4" style={fieldStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Start Date</div>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={fieldStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Due Date</div>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={fieldStyle} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.separator}`, background: C.lgBg, color: C.textMuted, fontSize: 13, cursor: 'pointer'
          }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving || !title.trim()} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: C.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            opacity: saving || !title.trim() ? 0.5 : 1,
          }}>{saving ? 'Creating…' : 'Create Task'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Project Modal ─────────────────────────────────────────────────────

function CreateProjectModal({ config, onClose, onCreated }: {
  config: ApiConfig
  onClose: () => void
  onCreated: (proj: TaskProject) => void
}) {
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [color, setColor] = useState('#6c5ce7')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const PRESET_COLORS = ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#0984e3', '#d63031', '#e84393', '#00cec9', '#636e72', '#2d3436']

  async function handleCreate() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${config.apiBase}/api/tasks/projects`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          clientName: clientName.trim() || null,
          color,
          description: description.trim() || null,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      const d = await res.json() as { project: TaskProject }
      onCreated(d.project)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create project') } finally { setSaving(false) }
  }

  const fieldStyle = {
    ...neu(true), padding: '7px 10px', fontSize: 12, color: C.text,
    border: 'none', outline: 'none', width: '100%', fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      WebkitAppRegion: 'no-drag',
    } as React.CSSProperties} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 400, ...neu(), padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>New Project</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}><X size={18} /></button>
        </div>

        {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Client Name</div>
            <input value={clientName} onChange={e => setClientName(e.target.value)}
              placeholder="e.g. Acme Corp" style={fieldStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Project Name *</div>
            <input value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void handleCreate()}
              placeholder="e.g. Website Redesign" autoFocus style={fieldStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Description</div>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Optional…" rows={2} style={{ ...fieldStyle, resize: 'vertical' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>Color</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} style={{
                  width: 24, height: 24, borderRadius: '50%', border: color === c ? '2px solid #1e293b' : '2px solid transparent',
                  background: c, cursor: 'pointer', boxShadow: color === c ? `0 0 0 2px ${c}44` : 'none',
                }} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.separator}`, background: C.lgBg, color: C.textMuted, fontSize: 13, cursor: 'pointer'
          }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving || !name.trim()} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: C.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            opacity: saving || !name.trim() ? 0.5 : 1,
          }}>{saving ? 'Creating…' : 'Create Project'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Project Modal ───────────────────────────────────────────────────────

function EditProjectModal({ config, project, onClose, onUpdated, onDeleted }: {
  config: ApiConfig
  project: TaskProject
  onClose: () => void
  onUpdated: (proj: TaskProject) => void
  onDeleted: (id: string) => void
}) {
  const [name, setName] = useState(project.name)
  const [clientName, setClientName] = useState(project.clientName ?? '')
  const [color, setColor] = useState(project.color)
  const [description, setDescription] = useState(project.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const PRESET_COLORS = ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#0984e3', '#d63031', '#e84393', '#00cec9', '#636e72', '#2d3436']

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${config.apiBase}/api/tasks/projects/${project.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          clientName: clientName.trim() || null,
          color,
          description: description.trim() || null,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      const d = await res.json() as { project: TaskProject }
      onUpdated(d.project)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to update project') } finally { setSaving(false) }
  }

  async function handleDelete() {
    setDeleting(true); setError('')
    try {
      const res = await fetch(`${config.apiBase}/api/tasks/projects/${project.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.token}` },
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      onDeleted(project.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete project') } finally { setDeleting(false) }
  }

  const fieldStyle = {
    ...neu(true), padding: '7px 10px', fontSize: 12, color: C.text,
    border: 'none', outline: 'none', width: '100%', fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      WebkitAppRegion: 'no-drag',
    } as React.CSSProperties} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 400, ...neu(), padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Edit Project</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}><X size={18} /></button>
        </div>

        {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        {confirmDelete ? (
          <div style={{ padding: 16, background: C.bgInput, borderRadius: 4, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: C.danger, fontWeight: 600, marginBottom: 8 }}>
              Delete "{project.name}" and detach all its tasks?
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>
              Tasks will not be deleted, but will lose their project assignment.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={handleDelete} disabled={deleting} style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', background: C.danger, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: deleting ? 0.5 : 1,
              }}>{deleting ? 'Deleting…' : 'Delete Project'}</button>
              <button onClick={() => setConfirmDelete(false)} style={{
                padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.separator}`, background: C.lgBg, color: C.textMuted, fontSize: 12, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Client Name</div>
                <input value={clientName} onChange={e => setClientName(e.target.value)}
                  placeholder="e.g. Acme Corp" style={fieldStyle} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Project Name *</div>
                <input value={name} onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void handleSave()}
                  placeholder="e.g. Website Redesign" autoFocus style={fieldStyle} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 3 }}>Description</div>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Optional…" rows={2} style={{ ...fieldStyle, resize: 'vertical' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>Color</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setColor(c)} style={{
                      width: 24, height: 24, borderRadius: '50%', border: color === c ? '2px solid #1e293b' : '2px solid transparent',
                      background: c, cursor: 'pointer', boxShadow: color === c ? `0 0 0 2px ${c}44` : 'none',
                    }} />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
              <button onClick={() => setConfirmDelete(true)} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', background: C.bgInput, color: C.danger, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}><Trash2 size={13} /> Delete</button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onClose} style={{
                  padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.separator}`, background: C.lgBg, color: C.textMuted, fontSize: 13, cursor: 'pointer'
                }}>Cancel</button>
                <button onClick={handleSave} disabled={saving || !name.trim()} style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: C.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  opacity: saving || !name.trim() ? 0.5 : 1,
                }}>{saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Manage Sections Modal ────────────────────────────────────────────────────

function ManageSectionsModal({ config, projectId, projectName, sections: initialSections, onClose, onUpdated }: {
  config: ApiConfig
  projectId: string
  projectName: string
  sections: TaskSection[]
  onClose: () => void
  onUpdated: (sections: TaskSection[]) => void
}) {
  const [secs, setSecs] = useState<TaskSection[]>(initialSections)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function createSection() {
    if (!newName.trim()) return
    setCreating(true); setError('')
    try {
      const res = await fetch(`${config.apiBase}/api/tasks/sections`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), projectId }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      const d = await res.json() as { section: TaskSection }
      const updated = [...secs, d.section]
      setSecs(updated)
      onUpdated(updated)
      setNewName('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create section') } finally { setCreating(false) }
  }

  async function renameSection(id: string) {
    if (!editName.trim()) { setEditingId(null); return }
    setError('')
    try {
      const res = await fetch(`${config.apiBase}/api/tasks/sections/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      const d = await res.json() as { section: TaskSection }
      const updated = secs.map(s => s.id === id ? d.section : s)
      setSecs(updated)
      onUpdated(updated)
      setEditingId(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to rename section') }
  }

  async function deleteSection(id: string) {
    setDeletingId(id); setError('')
    try {
      const res = await fetch(`${config.apiBase}/api/tasks/sections/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.token}` },
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      const updated = secs.filter(s => s.id !== id)
      setSecs(updated)
      onUpdated(updated)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete section') } finally { setDeletingId(null) }
  }

  const fieldStyle = {
    ...neu(true), padding: '7px 10px', fontSize: 12, color: C.text,
    border: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const,
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      WebkitAppRegion: 'no-drag',
    } as React.CSSProperties} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 420, maxHeight: '80vh', ...neu(), padding: 24, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          <div>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Manage Sections</span>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{projectName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}><X size={18} /></button>
        </div>

        {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        {/* Section list */}
        <div style={{ flex: 1, overflow: 'auto', marginBottom: 12 }}>
          {secs.length === 0 && (
            <div style={{ textAlign: 'center', color: C.textMuted, opacity: 0.5, padding: 20, fontSize: 12 }}>No sections yet</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {secs.map(sec => (
              <div key={sec.id} style={{
                ...neu(), padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {editingId === sec.id ? (
                  <>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') renameSection(sec.id); if (e.key === 'Escape') setEditingId(null) }}
                      onBlur={() => renameSection(sec.id)}
                      autoFocus
                      style={{ ...fieldStyle, flex: 1 }}
                    />
                  </>
                ) : (
                  <>
                    <Layers size={12} color={C.textMuted} />
                    <span style={{ flex: 1, fontSize: 13, color: C.text, fontWeight: 500 }}>{sec.name}</span>
                    <button
                      onClick={() => { setEditingId(sec.id); setEditName(sec.name) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2 }}
                      title="Rename"
                    ><Edit2 size={12} /></button>
                    <button
                      onClick={() => deleteSection(sec.id)}
                      disabled={deletingId === sec.id}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 2, opacity: deletingId === sec.id ? 0.4 : 1 }}
                      title="Delete section"
                    ><Trash2 size={12} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Add new section */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) createSection() }}
            placeholder="New section name…"
            style={{ ...fieldStyle, flex: 1 }}
          />
          <button
            onClick={createSection}
            disabled={creating || !newName.trim()}
            style={{
              padding: '7px 14px', borderRadius: 8, border: 'none',
              background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              opacity: creating || !newName.trim() ? 0.5 : 1,
            }}
          >{creating ? '…' : <Plus size={14} />}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Activity Panel ───────────────────────────────────────────────────────────

interface ActivityScreenshot {
  id: string; url: string; capturedAt: string; displayIndex: number
  topApp: string | null; mouseActivePct: number | null; keyActivePct: number | null; activityPct: number | null
}
interface ActivityWindow {
  windowStart: string; mouseEvents: number; keyEvents: number
  activeSeconds: number; mouseActiveSeconds: number; keyActiveSeconds: number; totalSeconds: number
}
interface ActivityStats {
  activityPercent: number; mousePercent: number; keyPercent: number
  mouseEvents: number; keyEvents: number; totalTrackedMinutes: number
}
interface ManualTimeReq {
  id: string; startTime: string; endTime: string; reason: string; status: string; adminNote: string | null; createdAt: string
}
interface ActivityData {
  screenshots: ActivityScreenshot[]; activity: ActivityWindow[]
  topApps: { name: string; seconds: number }[]; topUrls: { name: string; seconds: number }[]
  timeLogs: { action: string; timestamp: string }[]; manualRequests: ManualTimeReq[]; stats: ActivityStats
}

interface TimelineSlot {
  slotTime: Date; screenshot: ActivityScreenshot | null; isBreak: boolean; isOffline: boolean
  activityPct: number | null; window: ActivityWindow | null
}

function buildActivityTimeline(screenshots: ActivityScreenshot[], timeLogs: { action: string; timestamp: string }[], activityWindows: ActivityWindow[]): TimelineSlot[] {
  const firstCheckIn = timeLogs.find(l => l.action === 'CHECK_IN')
  if (!firstCheckIn) return []
  const start = new Date(firstCheckIn.timestamp)
  const lastLog = timeLogs[timeLogs.length - 1]
  const isOpen = !lastLog || lastLog.action !== 'CLOCK_OUT'
  const lastClockOut = [...timeLogs].reverse().find(l => l.action === 'CLOCK_OUT')
  const end = isOpen ? new Date() : new Date(lastClockOut!.timestamp)

  // Build break ranges
  const breaks: { start: Date; end: Date | null }[] = []
  let bStart: Date | null = null
  for (const log of timeLogs) {
    const t = new Date(log.timestamp)
    if (log.action === 'BREAK') bStart = t
    else if (log.action === 'BACK' && bStart) { breaks.push({ start: bStart, end: t }); bStart = null }
    else if (log.action === 'CLOCK_OUT') bStart = t
    else if (log.action === 'CHECK_IN' && bStart) { breaks.push({ start: bStart, end: t }); bStart = null }
  }
  if (bStart) breaks.push({ start: bStart, end: null })

  // Round start down to 10-min boundary
  const roundedStart = new Date(start)
  roundedStart.setSeconds(0, 0)
  roundedStart.setMinutes(Math.floor(roundedStart.getMinutes() / 10) * 10)

  const slots: TimelineSlot[] = []
  for (let t = roundedStart.getTime(); t <= end.getTime(); t += 10 * 60_000) {
    const slotTime = new Date(t)
    const slotEnd = t + 10 * 60_000

    // Match screenshot
    const ss = screenshots.find(s => {
      const ct = new Date(s.capturedAt).getTime()
      return ct >= t && ct < slotEnd
    }) ?? null

    // Match activity window
    const win = activityWindows.find(w => {
      const wt = new Date(w.windowStart).getTime()
      return Math.abs(wt - t) < 5 * 60_000
    }) ?? null

    const isBreak = breaks.some(b => slotTime >= b.start && slotTime < (b.end ?? end))
    const isOffline = !ss && !isBreak && !win

    let actPct: number | null = null
    if (win) {
      actPct = win.totalSeconds > 0
        ? Math.round((((win.mouseActiveSeconds + win.keyActiveSeconds) / 2) / win.totalSeconds) * 100)
        : 0
    } else if (ss?.activityPct != null) {
      actPct = ss.activityPct
    }

    slots.push({ slotTime, screenshot: ss, isBreak, isOffline, activityPct: actPct, window: win })
  }
  return slots
}

function ActivityPanel({ config }: { config: ApiConfig }) {
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date(Date.now() + 7 * 3600_000)
    return now.toISOString().slice(0, 10)
  })
  const [data, setData] = useState<ActivityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [manualReqForm, setManualReqForm] = useState<{ startTime: string; endTime: string; reason: string } | null>(null)
  const [manualSubmitting, setManualSubmitting] = useState(false)
  const [appsExpanded, setAppsExpanded] = useState(false)
  const [urlsExpanded, setUrlsExpanded] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)

  const todayStr = (() => { const n = new Date(Date.now() + 7 * 3600_000); return n.toISOString().slice(0, 10) })()
  const isToday = selectedDate === todayStr

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${config.apiBase}/api/user/activity?date=${selectedDate}`, {
        headers: { Authorization: `Bearer ${config.token}` }
      })
      if (res.ok) {
        const json = await res.json() as ActivityData
        setData(json)
      }
    } catch { /* offline */ }
    finally { setLoading(false) }
  }, [config, selectedDate])

  useEffect(() => {
    if (DEMO_MODE) {
      const base = new Date()
      base.setHours(8, 0, 0, 0)
      const t = (h: number, m: number) => { const d = new Date(base); d.setHours(h, m, 0, 0); return d.toISOString() }
      const mkScreenshot = (idx: number, hour: number, min: number, app: string, actPct: number): ActivityScreenshot => ({
        id: `ss${idx}`, url: '', capturedAt: t(hour, min), displayIndex: idx,
        topApp: app, mouseActivePct: actPct + Math.floor(Math.random() * 10), keyActivePct: Math.max(0, actPct - 10), activityPct: actPct,
      })
      const mkWindow = (hour: number, min: number, mouse: number, key: number): ActivityWindow => ({
        windowStart: t(hour, min), mouseEvents: mouse, keyEvents: key,
        activeSeconds: 480, mouseActiveSeconds: Math.round(480 * mouse / 100), keyActiveSeconds: Math.round(480 * key / 100), totalSeconds: 600,
      })
      setData({
        screenshots: [
          mkScreenshot(0, 8, 10, 'VS Code', 85), mkScreenshot(1, 8, 20, 'VS Code', 78),
          mkScreenshot(2, 8, 30, 'Chrome', 65), mkScreenshot(3, 8, 40, 'VS Code', 90),
          mkScreenshot(4, 8, 50, 'Terminal', 72), mkScreenshot(5, 9, 0, 'VS Code', 88),
          mkScreenshot(6, 9, 10, 'Figma', 55), mkScreenshot(7, 9, 20, 'VS Code', 82),
          mkScreenshot(8, 9, 30, 'Chrome', 60), mkScreenshot(9, 9, 40, 'Slack', 45),
          mkScreenshot(10, 10, 0, 'VS Code', 92), mkScreenshot(11, 10, 10, 'VS Code', 87),
          mkScreenshot(12, 10, 40, 'VS Code', 80), mkScreenshot(13, 10, 50, 'Chrome', 58),
          mkScreenshot(14, 11, 0, 'VS Code', 91), mkScreenshot(15, 11, 10, 'Terminal', 75),
        ],
        activity: [
          mkWindow(8, 10, 80, 70), mkWindow(8, 20, 75, 65), mkWindow(8, 30, 60, 50),
          mkWindow(8, 40, 88, 82), mkWindow(8, 50, 70, 60), mkWindow(9, 0, 85, 78),
          mkWindow(9, 10, 50, 40), mkWindow(9, 20, 80, 72), mkWindow(9, 30, 55, 48),
          mkWindow(9, 40, 42, 35), mkWindow(10, 0, 90, 85), mkWindow(10, 10, 85, 80),
          mkWindow(10, 40, 78, 70), mkWindow(10, 50, 55, 45), mkWindow(11, 0, 88, 82),
          mkWindow(11, 10, 72, 65),
        ],
        topApps: [
          { name: 'VS Code', seconds: 12600 }, { name: 'Chrome', seconds: 3600 },
          { name: 'Terminal', seconds: 2400 }, { name: 'Figma', seconds: 1800 },
          { name: 'Slack', seconds: 1200 }, { name: 'Finder', seconds: 600 },
        ],
        topUrls: [
          { name: 'github.com', seconds: 2400 }, { name: 'stackoverflow.com', seconds: 1200 },
          { name: 'localhost:3000', seconds: 3600 }, { name: 'figma.com', seconds: 1800 },
        ],
        timeLogs: [
          { action: 'CHECK_IN', timestamp: t(8, 0) },
          { action: 'BREAK', timestamp: t(10, 20) },
          { action: 'BACK', timestamp: t(10, 35) },
        ],
        manualRequests: [],
        stats: { activityPercent: 74, mousePercent: 68, keyPercent: 62, mouseEvents: 14520, keyEvents: 8340, totalTrackedMinutes: 195 },
      })
      setLoading(false)
      return
    }
    loadData()
  }, [loadData])

  // Auto-scroll timeline to end
  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollLeft = timelineRef.current.scrollWidth
  }, [data])

  const timeline = data ? buildActivityTimeline(data.screenshots, data.timeLogs, data.activity) : []

  // Work/break time from logs
  const { workMs, breakMs } = (() => {
    if (!data) return { workMs: 0, breakMs: 0 }
    let wMs = 0, bMs = 0, lastIn: number | null = null, lastBreak: number | null = null
    for (const log of data.timeLogs) {
      const t = new Date(log.timestamp).getTime()
      if (log.action === 'CHECK_IN' || log.action === 'BACK') { if (lastBreak != null) bMs += t - lastBreak; lastIn = t; lastBreak = null }
      else if (log.action === 'BREAK') { if (lastIn != null) { wMs += t - lastIn; lastIn = null }; lastBreak = t }
      else if (log.action === 'CLOCK_OUT') { if (lastIn != null) wMs += t - lastIn; if (lastBreak != null) bMs += t - lastBreak; lastIn = null; lastBreak = null }
    }
    if (lastIn != null && isToday) wMs += Date.now() - lastIn
    if (lastBreak != null && isToday) bMs += Date.now() - lastBreak
    return { workMs: wMs, breakMs: bMs }
  })()

  function changeDate(delta: number) {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    const ds = d.toISOString().slice(0, 10)
    if (ds <= todayStr) setSelectedDate(ds)
  }

  function actColor(pct: number): string {
    if (pct > 60) return C.success
    if (pct > 30) return C.warning
    return C.danger
  }

  // Handle manual time request submit
  async function submitManualRequest() {
    if (!manualReqForm) return
    setManualSubmitting(true)
    try {
      const res = await fetch(`${config.apiBase}/api/bundy/manual-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
        body: JSON.stringify(manualReqForm),
      })
      if (res.ok) {
        setManualReqForm(null)
        loadData()
      } else {
        const json = await res.json().catch(() => ({})) as { error?: string }
        alert(json.error ?? 'Failed to submit request')
      }
    } catch { alert('Network error') }
    finally { setManualSubmitting(false) }
  }

  // Open manual time request with pre-filled slot times (break/offline ranges)
  function openManualRequest(slot: TimelineSlot) {
    const startTime = slot.slotTime.toISOString()
    const endTime = new Date(slot.slotTime.getTime() + 10 * 60_000).toISOString()
    setManualReqForm({ startTime, endTime, reason: '' })
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, WebkitAppRegion: 'no-drag' }}>
      {/* Header with date navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => changeDate(-1)} style={{
            background: 'none', border: `1px solid ${C.separator}`, borderRadius: 6, padding: '4px 8px',
            cursor: 'pointer', color: C.text, display: 'flex', alignItems: 'center',
          }}>
            <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <input
            type="date" value={selectedDate} max={todayStr}
            onChange={e => setSelectedDate(e.target.value)}
            style={{
              background: C.materialBg, border: `1px solid ${C.separator}`, borderRadius: 8, padding: '6px 10px',
              fontSize: 13, fontWeight: 600, color: C.text, outline: 'none',
            }}
          />
          <button onClick={() => changeDate(1)} disabled={isToday} style={{
            background: 'none', border: `1px solid ${C.separator}`, borderRadius: 6, padding: '4px 8px',
            cursor: isToday ? 'default' : 'pointer', color: isToday ? C.separator : C.text,
            display: 'flex', alignItems: 'center', opacity: isToday ? 0.4 : 1,
          }}>
            <ChevronRight size={14} />
          </button>
          {!isToday && (
            <button onClick={() => setSelectedDate(todayStr)} style={{
              background: C.accentLight, border: 'none', borderRadius: 6, padding: '4px 10px',
              fontSize: 11, fontWeight: 600, color: C.accent, cursor: 'pointer',
            }}>Today</button>
          )}
        </div>
        <button onClick={loadData} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}>
          <RefreshCw size={15} />
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: C.textMuted, padding: 40 }}><Loader size={24} /></div>
      ) : !data || (data.timeLogs.length === 0 && data.activity.length === 0) ? (
        <div style={{ ...card(), textAlign: 'center', color: C.textMuted, padding: 40 }}>
          No activity recorded for this date.
        </div>
      ) : (
        <>
          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'Active', value: `${data.stats.activityPercent}%`, color: C.accent, primary: true },
              { label: 'Tracked', value: `${Math.floor(data.stats.totalTrackedMinutes / 60)}h ${data.stats.totalTrackedMinutes % 60}m`, color: C.text, primary: false },
              { label: 'Mouse', value: `${data.stats.mousePercent}%`, color: C.text, primary: false },
              { label: 'Keys', value: `${data.stats.keyPercent}%`, color: C.text, primary: false },
            ].map(({ label, value, color, primary }) => (
              <div key={label} style={{ ...card(), textAlign: 'center', padding: '12px 8px' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: primary ? C.accent : color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Work/Break summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ ...card(), textAlign: 'center', padding: '24px 8px' }}>
              <div style={{ fontSize: 12, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Work Time</div>
              <div style={{ fontSize: 40, fontWeight: 700, color: C.success, fontVariantNumeric: 'tabular-nums' }}>{formatMs(workMs)}</div>
            </div>
            <div style={{ ...card(), textAlign: 'center', padding: '24px 8px' }}>
              <div style={{ fontSize: 12, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Break Time</div>
              <div style={{ fontSize: 40, fontWeight: 700, color: C.warning, fontVariantNumeric: 'tabular-nums' }}>{formatMs(breakMs)}</div>
            </div>
          </div>

          {/* Visual Timeline */}
          {timeline.length > 0 && (
            <div style={{ ...card() }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Timeline</span>
                <span style={{ fontSize: 11, color: C.textMuted }}>{timeline.length} slots</span>
              </div>
              <div ref={timelineRef} style={{
                display: 'flex', gap: 3, overflowX: 'auto', paddingBottom: 8,
                scrollbarWidth: 'thin',
              }}>
                {timeline.map((slot, i) => {
                  const timeLabel = slot.slotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  const pct = slot.activityPct

                  if (slot.isBreak) {
                    return (
                      <div key={i} onClick={() => isToday ? openManualRequest(slot) : undefined}
                        style={{
                          flexShrink: 0, width: 48, height: 64, borderRadius: 6,
                          background: `${C.warning}15`, border: `1px solid ${C.warning}40`,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          cursor: isToday ? 'pointer' : 'default',
                        }}>
                        <div style={{ fontSize: 12 }}>☕</div>
                        <div style={{ fontSize: 8, color: C.warning, fontWeight: 600, marginTop: 2 }}>{timeLabel}</div>
                      </div>
                    )
                  }

                  if (slot.isOffline) {
                    return (
                      <div key={i} onClick={() => isToday ? openManualRequest(slot) : undefined}
                        style={{
                          flexShrink: 0, width: 48, height: 64, borderRadius: 6,
                          background: C.bgInput, border: `1px dashed ${C.fillSecondary}`,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          cursor: isToday ? 'pointer' : 'default', opacity: 0.6,
                        }}>
                        <div style={{ fontSize: 10, color: C.textMuted }}>—</div>
                        <div style={{ fontSize: 8, color: C.textMuted, marginTop: 2 }}>{timeLabel}</div>
                      </div>
                    )
                  }

                  // Active slot with activity bar
                  return (
                    <div key={i} style={{
                      flexShrink: 0, width: 48, height: 64, borderRadius: 6,
                      border: `1px solid ${C.separator}`, background: C.materialBg,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                      overflow: 'hidden', position: 'relative',
                    }}>
                      {/* Activity fill bar from bottom */}
                      {pct != null && (
                        <div style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0,
                          height: `${Math.max(pct, 4)}%`,
                          background: actColor(pct),
                          opacity: 0.3, transition: 'height 0.3s',
                        }} />
                      )}
                      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 2px 4px' }}>
                        {pct != null && (
                          <div style={{ fontSize: 10, fontWeight: 700, color: actColor(pct) }}>{pct}%</div>
                        )}
                        <div style={{ fontSize: 8, color: C.textMuted, marginTop: 1 }}>{timeLabel}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Top Apps + Top URLs side by side */}
          {(data.topApps.length > 0 || data.topUrls.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {data.topApps.length > 0 && (
                <div style={{ ...card() }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>Top Apps</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(appsExpanded ? data.topApps : data.topApps.slice(0, 5)).map((app, i) => {
                      const pct = Math.round((app.seconds / data.topApps[0].seconds) * 100)
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{app.name}</span>
                            <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{Math.round(app.seconds / 60)}m</span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: '#282828', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: C.accent }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {data.topApps.length > 5 && (
                    <button onClick={() => setAppsExpanded(v => !v)} style={{ marginTop: 10, background: 'none', border: 'none', color: C.accent, fontSize: 11, cursor: 'pointer', padding: 0 }}>
                      {appsExpanded ? 'Show less' : `Show ${data.topApps.length - 5} more`}
                    </button>
                  )}
                </div>
              )}

              {data.topUrls.length > 0 && (
                <div style={{ ...card() }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>Top URLs</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(urlsExpanded ? data.topUrls : data.topUrls.slice(0, 5)).map((url, i) => {
                      const pct = Math.round((url.seconds / data.topUrls[0].seconds) * 100)
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{url.name}</span>
                            <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{Math.round(url.seconds / 60)}m</span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: '#282828', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: C.success }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {data.topUrls.length > 5 && (
                    <button onClick={() => setUrlsExpanded(v => !v)} style={{ marginTop: 10, background: 'none', border: 'none', color: C.accent, fontSize: 11, cursor: 'pointer', padding: 0 }}>
                      {urlsExpanded ? 'Show less' : `Show ${data.topUrls.length - 5} more`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Manual Time Requests */}
          {data.manualRequests.length > 0 && (
            <div style={{ ...card() }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>Manual Time Requests</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.manualRequests.map(req => (
                  <div key={req.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    borderRadius: 8, background: req.status === 'approved' ? `${C.success}10` : req.status === 'rejected' ? `${C.danger}10` : `${C.warning}10`,
                    border: `1px solid ${req.status === 'approved' ? C.success : req.status === 'rejected' ? C.danger : C.warning}30`,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                        {formatTime(req.startTime)} – {formatTime(req.endTime)}
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{req.reason}</div>
                    </div>
                    <div style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      color: req.status === 'approved' ? C.success : req.status === 'rejected' ? C.danger : C.warning,
                    }}>
                      {req.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Manual Time Request Modal */}
      {manualReqForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onClick={() => setManualReqForm(null)}>
          <div style={{ ...card(), width: 340, maxWidth: '90%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 16 }}>Request Manual Time</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Start Time</label>
                <input type="datetime-local" value={manualReqForm.startTime.slice(0, 16)}
                  onChange={e => setManualReqForm(f => f ? { ...f, startTime: new Date(e.target.value).toISOString() } : f)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.separator}`, fontSize: 13, background: C.bgInput, color: C.text }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>End Time</label>
                <input type="datetime-local" value={manualReqForm.endTime.slice(0, 16)}
                  onChange={e => setManualReqForm(f => f ? { ...f, endTime: new Date(e.target.value).toISOString() } : f)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.separator}`, fontSize: 13, background: C.bgInput, color: C.text }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Reason</label>
                <textarea value={manualReqForm.reason} placeholder="Why do you need this time logged?"
                  onChange={e => setManualReqForm(f => f ? { ...f, reason: e.target.value } : f)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.separator}`, fontSize: 13, background: C.bgInput, color: C.text, minHeight: 60, resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setManualReqForm(null)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${C.separator}`,
                  background: 'transparent', color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>Cancel</button>
                <button onClick={submitManualRequest} disabled={manualSubmitting || !manualReqForm.reason.trim()} style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                  background: C.accent, color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: manualSubmitting || !manualReqForm.reason.trim() ? 'default' : 'pointer',
                  opacity: manualSubmitting || !manualReqForm.reason.trim() ? 0.5 : 1,
                }}>{manualSubmitting ? '...' : 'Submit Request'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({ auth, config, onLogout }: { auth: Auth; config: ApiConfig; onLogout: () => void }) {
  const [perms, setPerms] = useState<{ screen: string; accessibility: boolean } | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const [updateState, setUpdateState] = useState<{ version: string | null; percent: number | null; downloaded: boolean } | null>(null)
  // Profile edit state
  const [profile, setProfile] = useState<{ alias: string; email: string; phone: string; userStatus: string; avatarUrl: string | null } | null>(null)
  const [editAlias, setEditAlias] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const avatarFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (DEMO_MODE) {
      setPerms({ screen: 'granted', accessibility: true })
      setVersion('2.3.1')
      setUpdateState(null)
      setProfile({ alias: 'John Doe', email: 'john.doe@company.com', phone: '+1 (555) 123-4567', userStatus: 'Working on dashboard redesign', avatarUrl: null })
      setEditAlias('John Doe')
      setEditEmail('john.doe@company.com')
      setEditPhone('+1 (555) 123-4567')
      setEditStatus('Working on dashboard redesign')
      return
    }
    window.electronAPI.checkPermissions().then(setPerms).catch(() => {})
    window.electronAPI.getVersion().then(setVersion).catch(() => {})
    window.electronAPI.getUpdateState().then(setUpdateState).catch(() => {})
    // Live update event listeners
    const unsubAvail = window.electronAPI.onUpdateAvailable((info) => {
      setUpdateState(prev => ({ version: info.version, percent: prev?.percent ?? null, downloaded: false }))
    })
    const unsubProgress = window.electronAPI.onDownloadProgress((info) => {
      setUpdateState(prev => ({ version: prev?.version ?? null, percent: info.percent, downloaded: false }))
    })
    const unsubDownloaded = window.electronAPI.onUpdateDownloaded(() => {
      setUpdateState(prev => ({ version: prev?.version ?? null, percent: 100, downloaded: true }))
    })
    // Load profile
    fetch(`${config.apiBase}/api/user/profile`, {
      headers: { Authorization: `Bearer ${config.token}` }
    }).then(r => r.json()).then((d: { user: typeof profile }) => {
      if (d.user) {
        setProfile(d.user)
        setEditAlias(d.user?.alias ?? '')
        setEditEmail(d.user?.email ?? '')
        setEditPhone(d.user?.phone ?? '')
        setEditStatus(d.user?.userStatus ?? '')
      }
    }).catch(() => {})
    return () => { unsubAvail(); unsubProgress(); unsubDownloaded() }
  }, [config])

  async function checkPerms() {
    const p = await window.electronAPI.checkPermissions()
    setPerms(p)
  }

  async function saveProfile() {
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await fetch(`${config.apiBase}/api/user/profile`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: editAlias, email: editEmail, phone: editPhone, userStatus: editStatus }),
      })
      if (!res.ok) throw new Error('Failed')
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2000)
    } catch { setSaveMsg('Failed to save') } finally { setSaving(false) }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    setSaving(true)
    setSaveMsg('Uploading…')
    try {
      const res = await fetch(`${config.apiBase}/api/user/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}` },
        body: form,
      })
      const d = await res.json() as { user?: { avatarUrl: string } }
      if (d.user?.avatarUrl) {
        setProfile(p => p ? { ...p, avatarUrl: d.user!.avatarUrl } : p)
        setSaveMsg('Avatar updated!')
        setTimeout(() => setSaveMsg(''), 2000)
      } else {
        setSaveMsg('Upload failed')
      }
    } catch { setSaveMsg('Upload failed') } finally { setSaving(false) }
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>Settings</div>

      {/* Profile edit */}
      <div style={{ ...card() }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.textMuted, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.8 }}>Profile</div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar url={profile?.avatarUrl} name={profile?.alias ?? auth.username} size={60} />
            <button onClick={() => avatarFileRef.current?.click()}
              title="Change avatar"
              style={{
                position: 'absolute', bottom: 0, right: 0, width: 20, height: 20,
                borderRadius: '50%', background: C.accent, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <Edit2 size={10} color="#fff" />
            </button>
            <input ref={avatarFileRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{auth.username}</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>{auth.role}</div>
          </div>
          <button onClick={onLogout}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', ...neu(), border: 'none', cursor: 'pointer', color: C.danger, fontWeight: 600, fontSize: 13 }}>
            <LogOut size={15} /> Log Out
          </button>
        </div>

        {/* Editable fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Display Name', value: editAlias, set: setEditAlias, placeholder: 'Your display name' },
            { label: 'Email', value: editEmail, set: setEditEmail, placeholder: 'email@example.com' },
            { label: 'Phone', value: editPhone, set: setEditPhone, placeholder: '+1234567890' },
            { label: 'Status', value: editStatus, set: setEditStatus, placeholder: 'What are you working on?' },
          ].map(({ label, value, set, placeholder }) => (
            <div key={label}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 4 }}>{label}</div>
              <input
                value={value}
                onChange={e => set(e.target.value)}
                placeholder={placeholder}
                style={{ width: '100%', ...neu(true), padding: '8px 12px', fontSize: 13, color: C.text, border: 'none', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <button onClick={saveProfile} disabled={saving}
              style={{ padding: '8px 20px', ...neu(), border: 'none', background: C.accent, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', borderRadius: 8 }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            {saveMsg && <span style={{ fontSize: 12, color: saveMsg.includes('Failed') ? C.danger : C.success }}>{saveMsg}</span>}
          </div>
        </div>
      </div>

      {/* Permissions */}
      <div style={{ ...card() }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Permissions</div>
          <button onClick={checkPerms} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer' }}><RefreshCw size={13} /></button>
        </div>
        {!perms ? (
          <div style={{ color: C.textMuted, fontSize: 12 }}>Checking permissions…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PermRow label="Screen Recording" granted={perms.screen === 'granted'} onFix={() => window.electronAPI.openScreenRecordingSettings()} />
            <PermRow label="Accessibility" granted={perms.accessibility} onFix={() => window.electronAPI.openAccessibilitySettings()} />
          </div>
        )}
      </div>

      {/* Version / Updates */}
      <div style={{ ...card() }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>About</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Bundy Desktop</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>v{version ?? '…'}</div>
          </div>
          {updateState?.downloaded ? (
            <button onClick={() => window.electronAPI.installUpdate()}
              style={{ padding: '8px 14px', ...neu(), border: 'none', color: C.success, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              Restart to Update v{updateState.version}
            </button>
          ) : updateState?.version ? (
            <div style={{ fontSize: 12, color: C.accent }}>Downloading v{updateState.version}… {updateState.percent ?? 0}%</div>
          ) : (
            <button onClick={() => window.electronAPI.checkForUpdates()}
              style={{ padding: '8px 14px', ...neu(), border: 'none', color: C.textMuted, fontSize: 12, cursor: 'pointer' }}>
              Check for Updates
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function PermRow({ label, granted, onFix }: { label: string; granted: boolean; onFix: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: granted ? C.success : C.danger }} />
        <span style={{ fontSize: 13, color: C.text }}>{label}</span>
      </div>
      {!granted && (
        <button onClick={onFix} style={{ fontSize: 11, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          Open Settings →
        </button>
      )}
    </div>
  )
}

// ─── Main FullDashboard ───────────────────────────────────────────────────────

interface Props { auth: Auth; onLogout: () => void }

export default function FullDashboard({ auth, onLogout }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('home')
  const [isOnline, setIsOnline] = useState(true)
  const [incomingCall, setIncomingCall] = useState<IncomingCallPayload | null>(null)
  const [acceptedCall, setAcceptedCall] = useState<IncomingCallPayload | null>(null)
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const [messageBadge, setMessageBadge] = useState(0)
  const [messageMention, setMessageMention] = useState(false)
  const [updateBadge, setUpdateBadge] = useState(false)
  const apiConfig = useApiConfig()

  // Buffer ICE candidates and answer SDP that arrive before CallWidget mounts
  const iceBufferRef = useRef<RTCIceCandidateInit[]>([])
  const answerSdpRef = useRef<string | null>(null)

  useEffect(() => {
    if (DEMO_MODE) return
    const unsub = window.electronAPI.onOnlineState((state) => setIsOnline(state.isOnline))
    // Listen for update availability to show Settings badge
    const unsubUpdate = window.electronAPI.onUpdateAvailable(() => setUpdateBadge(true))
    const unsubDownloaded = window.electronAPI.onUpdateDownloaded(() => setUpdateBadge(true))
    // Check initial update state
    window.electronAPI.getUpdateState().then(state => {
      if (state && (state.version !== null || state.downloaded)) setUpdateBadge(true)
    }).catch(() => {})
    return () => { unsub(); unsubUpdate(); unsubDownloaded() }
  }, [])

  // Listen for incoming-call events dispatched by MessagesPanel SSE
  // (so we can show the overlay regardless of which tab is active)
  // Also buffer ICE candidates and answer SDP that arrive before the CallWidget mounts
  // Also listen for task link clicks from chat messages
  useEffect(() => {
    function onIncoming(e: Event) {
      const payload = (e as CustomEvent<IncomingCallPayload>).detail
      // Clear buffers when a new call arrives
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
    return () => {
      window.removeEventListener('bundy-incoming-call', onIncoming)
      window.removeEventListener('bundy-call-ice', onIce)
      window.removeEventListener('bundy-call-answer', onAnswer)
      window.removeEventListener('bundy-open-task', onOpenTask)
      window.removeEventListener('bundy-unread-update', onUnreadUpdate)
    }
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: `radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0, 0, 255, 0.25) 0%, transparent 60%), radial-gradient(ellipse 100% 30% at 50% 0%, rgba(100, 160, 255, 0.10) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 0% 100%, rgba(0, 0, 255, 0.1) 0%, transparent 60%), ${C.bgTertiary}`, WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <Sidebar tab={tab} setTab={(t) => { setTab(t); if (t === 'settings') setUpdateBadge(false) }} auth={auth} onLogout={onLogout} isOnline={isOnline} messageBadge={messageBadge} messageMention={messageMention} updateBadge={updateBadge} />

      {/* Incoming call overlay — visible on any tab */}
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
            // Notify the caller that we rejected
            fetch(`${apiConfig.apiBase}/api/calls`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${apiConfig.token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'end', to: incomingCall.from }),
            }).catch(() => {})
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
        {/* Titlebar drag strip above the content card */}
        <div style={{ height: 38, flexShrink: 0, WebkitAppRegion: 'drag' } as React.CSSProperties} />

        {/* Content card — rounded corners like Slack */}
        <div style={{
          flex: 1, overflow: 'hidden', position: 'relative',
          background: 'rgba(22, 22, 22, 0.5)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 10,
          border: `1px solid rgba(255, 255, 255, 0.08)`,
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
            <HomePanel auth={auth} config={apiConfig} onOpenTask={(taskId) => { setPendingTaskId(taskId); setTab('tasks') }} />
          </div>
        )}
        {/* MessagesPanel: always mounted (SSE stays alive), hidden via visibility when on other tabs */}
        {apiConfig && (
          <div style={{
            position: 'absolute',
            top: isOnline ? 0 : 36,
            left: 0, right: 0, bottom: 0,
            display: 'flex', flexDirection: 'column',
            visibility: tab === 'messages' ? 'visible' : 'hidden',
            pointerEvents: tab === 'messages' ? 'auto' : 'none',
          }}>
          <MessagesPanel config={apiConfig} auth={auth} acceptedCall={acceptedCall} iceBufferRef={iceBufferRef} answerSdpRef={answerSdpRef} isVisible={tab === 'messages'} />
          </div>
        )}
        {tab === 'tasks' && apiConfig && (
          <div style={{ position: 'absolute', top: isOnline ? 0 : 36, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <TasksPanel config={apiConfig} auth={auth} pendingTaskId={pendingTaskId} onPendingTaskHandled={() => setPendingTaskId(null)} />
          </div>
        )}
        {tab === 'activity' && apiConfig && (
          <div style={{ position: 'absolute', top: isOnline ? 0 : 36, left: 0, right: 0, bottom: 0, overflowY: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <ActivityPanel config={apiConfig} />
          </div>
        )}
        {tab === 'settings' && apiConfig && (
          <div style={{ position: 'absolute', top: isOnline ? 0 : 36, left: 0, right: 0, bottom: 0, overflowY: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <SettingsPanel auth={auth} config={apiConfig} onLogout={onLogout} />
          </div>
        )}
        {/* Loading state while apiConfig is fetching for data panels */}
        {(tab === 'tasks' || tab === 'activity' || tab === 'settings') && !apiConfig && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted }}>
            <Loader size={24} />
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
