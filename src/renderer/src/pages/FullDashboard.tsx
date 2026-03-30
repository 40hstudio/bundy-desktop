import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Home, MessageSquare, CheckSquare, Activity, Settings,
  LogOut, Play, Pause, RotateCcw, Square, Plus, Trash2,
  Send, Hash, Users, Lock, ChevronRight, Circle, Clock,
  Check, AlertCircle, Loader, WifiOff, RefreshCw, Filter,
  Calendar, Flag, User as UserIcon, Layers, Settings2,
  UserPlus, AtSign, Paperclip, Video, Phone, VideoOff,
  MicOff, PhoneOff, Edit2, MessageCircle, X, ChevronLeft,
  Bold, Italic, List, ExternalLink, FileText, PhoneIncoming,
  Mic, Maximize2, Minimize2, Move
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Auth { userId: string; username: string; role: string }
interface ApiConfig { apiBase: string; token: string }
interface BundyStatus {
  isClockedIn: boolean; onBreak: boolean; isTracking: boolean
  elapsedMs: number; username: string; role: string
}
interface PlanItem {
  id: string; details: string; status: string; outcome: string | null
  project: { id: string; name: string }
}
interface DailyPlan { id: string; date: string; items: PlanItem[] }
interface UserInfo {
  id: string; username: string; alias: string | null; avatarUrl: string | null; role?: string
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
}
interface ChatMessage {
  id: string; content: string; createdAt: string; editedAt: string | null
  sender: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  reads?: { userId: string }[]
}
interface Task {
  id: string; title: string; description: string | null
  status: string; priority: string
  dueDate: string | null; estimatedHours: number | null
  project: { id: string; name: string; color: string } | null
  section: { id: string; name: string } | null
  assignee: { id: string; username: string; alias: string | null; avatarUrl: string | null } | null
  multiAssignees?: { user: UserInfo }[]
  comments?: TaskComment[]
  subtasks?: Task[]
  _count: { comments: number; subtasks: number }
}
interface TaskComment {
  id: string; body: string; createdAt: string; attachmentUrl: string | null; attachmentName: string | null
  user: { id: string; username: string; alias: string | null; avatarUrl: string | null }
}
interface LogEntry { id: string; action: string; timestamp: string }

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  sidebarBg: '#0f172a',
  sidebarHover: '#1e293b',
  sidebarActive: '#1e293b',
  sidebarBorder: '#1e3a5f',
  sidebarText: '#94a3b8',
  sidebarTextActive: '#f1f5f9',
  contentBg: '#e0e5ec',
  cardBg: '#e8edf5',
  white: '#fff',
  text: '#1e293b',
  textMuted: '#64748b',
  border: '#cbd5e1',
  accent: '#6366f1',
  accentLight: 'rgba(99,102,241,0.12)',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  shadowLight: '#ffffff',
  shadowDark: '#a3b1c6',
}

function neu(inset = false) {
  return inset
    ? { boxShadow: 'inset 3px 3px 6px #a3b1c6, inset -3px -3px 6px #ffffff', borderRadius: 10, background: C.contentBg }
    : { boxShadow: '4px 4px 10px #a3b1c6, -4px -4px 10px #ffffff', borderRadius: 12, background: C.contentBg }
}

function card() {
  return { background: C.contentBg, ...neu(), padding: 16 }
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useApiConfig() {
  const [config, setConfig] = useState<ApiConfig | null>(null)
  useEffect(() => {
    window.electronAPI.getApiConfig().then(setConfig).catch(() => {})
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

// ─── Sidebar ──────────────────────────────────────────────────────────────────

type Tab = 'home' | 'messages' | 'tasks' | 'activity' | 'settings'
interface NavItem { id: Tab; icon: React.ReactNode; label: string }

const NAV: NavItem[] = [
  { id: 'home', icon: <Home size={18} />, label: 'Home' },
  { id: 'messages', icon: <MessageSquare size={18} />, label: 'Messages' },
  { id: 'tasks', icon: <CheckSquare size={18} />, label: 'Tasks' },
  { id: 'activity', icon: <Activity size={18} />, label: 'Activity' },
]

function Sidebar({ tab, setTab, auth, onLogout, isOnline }: {
  tab: Tab; setTab: (t: Tab) => void
  auth: Auth; onLogout: () => void; isOnline: boolean
}) {
  return (
    <nav style={{
      width: 200, minHeight: '100vh', background: C.sidebarBg,
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      WebkitAppRegion: 'drag' as React.CSSProperties['WebkitAppRegion'],
    }}>
      {/* Titlebar area for traffic lights */}
      <div style={{ height: 52, flexShrink: 0 }} />

      {/* Logo / App name */}
      <div style={{ padding: '0 20px 20px', WebkitAppRegion: 'no-drag' as React.CSSProperties['WebkitAppRegion'] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16
          }}>🕐</div>
          <div>
            <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 15 }}>Bundy</div>
            <div style={{ fontSize: 11, color: isOnline ? C.success : '#475569' }}>
              {isOnline ? '● Online' : '○ Offline'}
            </div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, padding: '0 8px', WebkitAppRegion: 'no-drag' as React.CSSProperties['WebkitAppRegion'] }}>
        {NAV.map(item => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, border: 'none',
                background: active ? C.sidebarActive : 'transparent',
                color: active ? C.sidebarTextActive : C.sidebarText,
                fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer',
                marginBottom: 2, transition: 'all 0.15s',
                borderLeft: active ? `3px solid ${C.accent}` : '3px solid transparent',
              }}
            >
              {item.icon}
              {item.label}
            </button>
          )
        })}
      </div>

      {/* Bottom section */}
      <div style={{ padding: '8px', borderTop: `1px solid #1e293b`, WebkitAppRegion: 'no-drag' as React.CSSProperties['WebkitAppRegion'] }}>
        <button
          onClick={() => setTab('settings')}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 8, border: 'none',
            background: tab === 'settings' ? C.sidebarActive : 'transparent',
            color: tab === 'settings' ? C.sidebarTextActive : C.sidebarText,
            fontSize: 13, cursor: 'pointer', marginBottom: 4,
          }}
        >
          <Settings size={18} /> Settings
        </button>

        {/* User info */}
        <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: `linear-gradient(135deg, ${C.accent}, #8b5cf6)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0
          }}>
            {(auth.username[0] ?? '?').toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {auth.username}
            </div>
            <div style={{ color: '#475569', fontSize: 10 }}>{auth.role}</div>
          </div>
          <button
            onClick={onLogout}
            title="Logout"
            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 4 }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </nav>
  )
}

// ─── Home Panel ───────────────────────────────────────────────────────────────

const ACTION_LABEL: Record<string, string> = {
  'clock-in': 'Clock In', 'clock-out': 'Clock Out',
  'break-start': 'Take Break', 'break-end': 'Resume',
}
const ACTION_COLORS: Record<string, string> = {
  'clock-in': '#22c55e', 'clock-out': '#ef4444',
  'break-start': '#f59e0b', 'break-end': '#6366f1',
}

function HomePanel({ auth }: { auth: Auth }) {
  const [status, setStatus] = useState<BundyStatus | null>(null)
  const [plan, setPlan] = useState<DailyPlan | null>(null)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [newItemProject, setNewItemProject] = useState('')
  const [newItemDetails, setNewItemDetails] = useState('')
  const [addingItem, setAddingItem] = useState(false)
  const [actioning, setActioning] = useState(false)
  const [snapshotAt] = useState(Date.now())

  const displayMs = useStatusTicker(
    status?.elapsedMs ?? 0,
    status?.isTracking ?? false,
    snapshotAt
  )

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        window.electronAPI.getStatus(),
        window.electronAPI.ensureDailyPlan(),
      ])
      setStatus(s)
      setPlan(p)
    } catch { /* offline */ }
  }, [])

  useEffect(() => {
    load()
    const projs = window.electronAPI.getProjects().then(setProjects).catch(() => {})
    const unsub = window.electronAPI.onStatusUpdate((s) => setStatus(s))
    const unsubPlan = window.electronAPI.onPlanUpdate((p) => setPlan(p))
    return () => { unsub(); unsubPlan(); void projs }
  }, [load])

  async function doAction(action: string) {
    setActioning(true)
    try {
      await window.electronAPI.doAction(action)
      const s = await window.electronAPI.getStatus()
      setStatus(s)
    } catch { /* offline, queued */ } finally {
      setActioning(false)
    }
  }

  async function addItem() {
    if (!newItemDetails.trim()) return
    setAddingItem(true)
    try {
      await window.electronAPI.addPlanItem(newItemProject || 'General', newItemDetails.trim())
      const p = await window.electronAPI.ensureDailyPlan()
      setPlan(p)
      setNewItemDetails('')
      setNewItemProject('')
    } catch { /* offline */ } finally {
      setAddingItem(false)
    }
  }

  async function setItemStatus(itemId: string, newStatus: string) {
    try {
      await window.electronAPI.updatePlanItem(itemId, newStatus)
      const p = await window.electronAPI.ensureDailyPlan()
      setPlan(p)
    } catch { /* offline */ }
  }

  async function removeItem(itemId: string) {
    try {
      await window.electronAPI.deletePlanItem(itemId)
      const p = await window.electronAPI.ensureDailyPlan()
      setPlan(p)
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

  const PLAN_STATUSES = ['planned', 'in-progress', 'completed', 'blocked']
  const PLAN_ICONS: Record<string, React.ReactNode> = {
    planned: <Circle size={13} />, 'in-progress': <Play size={13} />,
    completed: <Check size={13} />, blocked: <AlertCircle size={13} />,
  }
  const PLAN_COLORS: Record<string, string> = {
    planned: C.textMuted, 'in-progress': C.accent, completed: C.success, blocked: C.danger,
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Timer Card */}
      <div style={{ ...card(), textAlign: 'center', padding: '28px 24px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: C.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>
          Today's Work Time
        </div>
        <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: -2, color: C.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {formatMs(displayMs)}
        </div>
        <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6,
          background: C.accentLight, borderRadius: 20, padding: '4px 12px',
          color: statusColor, fontSize: 12, fontWeight: 600 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
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
                flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
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

      {/* Daily Plan */}
      <div style={{ ...card() }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Today's Plan</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>
            {plan?.items?.filter(i => i.status === 'completed').length ?? 0} / {plan?.items?.length ?? 0} done
          </div>
        </div>

        {/* Add form */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <select
            value={newItemProject}
            onChange={e => setNewItemProject(e.target.value)}
            style={{
              ...neu(true), padding: '8px 10px', fontSize: 12, color: C.text,
              border: 'none', outline: 'none', width: 110, flexShrink: 0, cursor: 'pointer',
            }}
          >
            <option value="">Project…</option>
            {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
          <input
            value={newItemDetails}
            onChange={e => setNewItemDetails(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void addItem()}
            placeholder="Add a task…"
            style={{
              flex: 1, ...neu(true), padding: '8px 12px',
              fontSize: 12, color: C.text, border: 'none', outline: 'none',
            }}
          />
          <button
            onClick={addItem}
            disabled={addingItem || !newItemDetails.trim()}
            style={{
              ...neu(), padding: '8px 12px', border: 'none', color: C.accent,
              cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: addingItem ? 0.5 : 1,
            }}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Items list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(!plan?.items || plan.items.length === 0) && (
            <div style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
              No tasks yet. Add one above.
            </div>
          )}
          {plan?.items?.map(item => (
            <div key={item.id} style={{
              ...neu(), padding: '10px 12px',
              display: 'flex', alignItems: 'center', gap: 10,
              opacity: item.status === 'completed' ? 0.6 : 1,
            }}>
              {/* Status cycle button */}
              <button
                onClick={() => {
                  const idx = PLAN_STATUSES.indexOf(item.status)
                  setItemStatus(item.id, PLAN_STATUSES[(idx + 1) % PLAN_STATUSES.length])
                }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: PLAN_COLORS[item.status] ?? C.textMuted, padding: 0, flexShrink: 0,
                }}
              >
                {PLAN_ICONS[item.status] ?? <Circle size={13} />}
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, color: C.text,
                  textDecoration: item.status === 'completed' ? 'line-through' : 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.details}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted }}>{item.project?.name ?? 'General'}</div>
              </div>

              <button
                onClick={() => removeItem(item.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2 }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Avatar helper ────────────────────────────────────────────────────────────

function Avatar({ url, name, size = 30, radius = '50%' }: { url?: string | null; name: string; size?: number; radius?: string }) {
  const [err, setErr] = useState(false)
  if (url && !err) {
    return (
      <img
        src={url} alt={name}
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
function NewConvModal({ config, auth, onClose, onCreated }: {
  config: ApiConfig; auth: Auth
  onClose: () => void; onCreated: (id: string) => void
}) {
  const [mode, setMode] = useState<'dm' | 'group' | 'channel'>('dm')
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
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: C.contentBg, borderRadius: 14, padding: 20, width: 360,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
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
                background: mode === m ? C.accent : C.contentBg,
                color: mode === m ? '#fff' : C.textMuted,
                boxShadow: mode === m ? `0 2px 6px ${C.accent}44` : '2px 2px 4px #a3b1c6, -2px -2px 4px #fff',
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
            marginTop: 12, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
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
        ogClientCache.set(url, data)
        setOg(data)
      })
      .catch(() => { ogClientCache.set(url, null); setOg(null) })
  }, [url, config])

  if (!og) return null

  return (
    <div
      onClick={() => window.electronAPI.openExternal(url)}
      style={{
        marginTop: 6, borderRadius: 8, border: `1px solid ${C.border}`,
        overflow: 'hidden', background: '#f8faff', cursor: 'pointer',
        transition: 'opacity 0.15s',
      }}
    >
      {og.image && (
        <img
          src={og.image} alt={og.title ?? ''}
          style={{ width: '100%', maxHeight: expanded ? 'none' : 140, objectFit: 'cover', display: 'block' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          onClick={e => { e.stopPropagation(); setExpanded(!expanded) }}
        />
      )}
      <div style={{ padding: '7px 10px' }}>
        {og.siteName && <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{og.siteName}</div>}
        {og.title && <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{og.title}</div>}
        {og.description && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{og.description}</div>}
        <div style={{ fontSize: 10, color: C.accent, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <ExternalLink size={9} />{new URL(url).hostname}
        </div>
      </div>
    </div>
  )
}

// ─── Message content renderer ─────────────────────────────────────────────────

// Parses text with [label](url) markdown links and bare https:// URLs.
// isMe controls link colour so it's readable on both blue and white bubbles.
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
    if (isImageUrl(url)) {
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

// Inline image attachment (when message content matches attachment pattern)
function InlineAttachment({ content, isMe }: { content: string; isMe: boolean; config?: ApiConfig }) {
  // Match [📎 filename](url) — allow any characters in filename including _ and spaces
  const match = content.match(/^\[📎\s([^\]]+?)\]\((https?:\/\/\S+?)\)\s*$/)
  if (!match) return null
  const [, filename, url] = match
  const cleanUrl = url.trim()
  const [expanded, setExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)

  if (isImageUrl(cleanUrl)) {
    if (imgError) {
      // Fallback to download card when image fails
      return (
        <div
          onClick={() => window.electronAPI.openExternal(cleanUrl)}
          style={{
            marginTop: 4, display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 8,
            background: isMe ? 'rgba(255,255,255,0.15)' : '#f0f4ff',
            border: `1px solid ${isMe ? 'rgba(255,255,255,0.3)' : C.border}`,
            cursor: 'pointer',
          }}
        >
          <FileText size={18} color={isMe ? 'rgba(255,255,255,0.9)' : C.accent} />
          <span style={{ fontSize: 12, fontWeight: 600, color: isMe ? '#fff' : C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</span>
          <ExternalLink size={12} color={isMe ? 'rgba(255,255,255,0.7)' : C.textMuted} />
        </div>
      )
    }
    return (
      <div style={{ marginTop: 4 }}>
        {!imgLoaded && !imgError && (
          <div style={{ width: '100%', height: 100, borderRadius: 8, background: isMe ? 'rgba(255,255,255,0.1)' : '#e8edf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader size={18} color={isMe ? 'rgba(255,255,255,0.5)' : C.textMuted} />
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
            maxWidth: '100%', maxHeight: expanded ? 400 : 180,
            objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in',
            display: imgLoaded ? 'block' : 'none',
          }}
        />
        {expanded && imgLoaded && (
          <button
            onClick={() => window.electronAPI.openExternal(cleanUrl)}
            style={{ marginTop: 4, fontSize: 10, color: isMe ? 'rgba(255,255,255,0.8)' : C.accent, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
          >
            <ExternalLink size={10} /> Open full size
          </button>
        )}
      </div>
    )
  }
  if (isVideoUrl(cleanUrl)) {
    return (
      <video controls src={cleanUrl} style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, marginTop: 4, display: 'block' }} />
    )
  }
  // Generic file card
  return (
    <div
      onClick={() => window.electronAPI.openExternal(cleanUrl)}
      style={{
        marginTop: 4, display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderRadius: 8,
        background: isMe ? 'rgba(255,255,255,0.15)' : '#f0f4ff',
        border: `1px solid ${isMe ? 'rgba(255,255,255,0.3)' : C.border}`,
        cursor: 'pointer',
      }}
    >
      <FileText size={18} color={isMe ? 'rgba(255,255,255,0.9)' : C.accent} />
      <span style={{ fontSize: 12, fontWeight: 600, color: isMe ? '#fff' : C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</span>
      <ExternalLink size={12} color={isMe ? 'rgba(255,255,255,0.7)' : C.textMuted} />
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
    const audio = new Audio('ringtone.mp3')
    audio.loop = true
    audio.volume = 0.6
    audio.play().catch(() => {})
    return () => { audio.pause(); audio.src = '' }
  }, [])

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: C.contentBg, borderRadius: 16, padding: '16px 20px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', gap: 14, minWidth: 280,
      border: `1px solid ${C.border}`,
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
    } catch { /* ignore */ } finally { setBusy(false) }
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
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  const nonMembers = allUsers.filter(u => !members.some(m => m.userId === u.id))

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: C.contentBg, borderRadius: 14, padding: 20, width: 340,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)', maxHeight: '80vh', overflow: 'auto',
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
                    background: 'transparent', border: `1px solid ${C.border}`, cursor: 'pointer',
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
      </div>
    </div>
  )
}

function MessagesPanel({ config, auth, acceptedCall, iceBufferRef, answerSdpRef }: {
  config: ApiConfig; auth: Auth
  /** Set when user accepts an incoming call from IncomingCallOverlay */
  acceptedCall?: IncomingCallPayload | null
  /** Pre-buffered ICE candidates from FullDashboard */
  iceBufferRef: React.MutableRefObject<RTCIceCandidateInit[]>
  /** Pre-buffered answer SDP from FullDashboard */
  answerSdpRef: React.MutableRefObject<string | null>
}) {
  const [channels, setChannels] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [showNewConv, setShowNewConv] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  // Per-channel typing: Map<channelId, string[]>
  const [typingMap, setTypingMap] = useState<Record<string, string[]>>({})
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
    window.addEventListener('bundy-active-conferences', onActiveConfs)
    window.addEventListener('bundy-conference-joined', onConfJoined)
    window.addEventListener('bundy-conference-left', onConfLeft)
    window.addEventListener('bundy-conference-ended', onConfEnded)
    return () => {
      window.removeEventListener('bundy-active-conferences', onActiveConfs)
      window.removeEventListener('bundy-conference-joined', onConfJoined)
      window.removeEventListener('bundy-conference-left', onConfLeft)
      window.removeEventListener('bundy-conference-ended', onConfEnded)
    }
  }, [])

  const messagesEndRef = useRef<HTMLDivElement>(null)
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
        id: string; type: string; name: string | null
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
          members: ch.members,
          lastMessage: last ? `${last.sender.alias ?? last.sender.username}: ${last.content}` : undefined,
          lastTime: last?.createdAt,
          unread: ch.unread ?? 0,
        }
      })
      setChannels(convs)
    } catch { /* offline */ }
  }, [apiFetch, auth.userId])

  const loadMessages = useCallback(async (conv: Conversation) => {
    setLoadingMsgs(true)
    try {
      const data = await apiFetch(`/api/channels/${conv.id}/messages`) as {
        messages: Array<{
          id: string; content: string; createdAt: string; editedAt: string | null
          sender: { id: string; username: string; alias: string | null; avatarUrl: string | null }
          reads: { userId: string }[]
        }>
      }
      setMessages(data.messages.map(m => ({
        id: m.id, content: m.content, createdAt: m.createdAt, editedAt: m.editedAt,
        sender: m.sender, reads: m.reads,
      })))
      // Clear unread for this channel immediately
      setChannels(prev => prev.map(c => c.id === conv.id ? { ...c, unread: 0 } : c))
      // Mark as read on server
      fetch(`${config.apiBase}/api/channels/${conv.id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}` },
      }).catch(() => {})
    } catch { setMessages([]) } finally {
      setLoadingMsgs(false)
    }
  }, [apiFetch, config])

  // SSE for real-time messages + typing + read
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  useEffect(() => {
    const ctrl = new AbortController()
    let buf = ''
    fetch(`${config.apiBase}/api/bundy/stream`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: ctrl.signal,
    }).then(async res => {
      if (!res.body) return
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
              const isCurrentChannel = selectedRef.current?.id === channelId
              if (isCurrentChannel) {
                setMessages(prev => {
                  if (prev.some(m => m.id === payload.id)) return prev
                  return [...prev, {
                    id: payload.id, content: payload.content,
                    createdAt: payload.createdAt, editedAt: payload.editedAt ?? null,
                    sender: {
                      id: payload.senderId,
                      username: payload.senderName,
                      alias: payload.senderAlias ?? payload.senderName,
                      avatarUrl: payload.senderAvatar ?? null,
                    },
                    reads: [],
                  }]
                })
                // Mark as read since we're viewing it
                fetch(`${config.apiBase}/api/channels/${channelId}/read`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${config.token}` },
                }).catch(() => {})
              } else if (payload.senderId !== auth.userId) {
                // Not our own message in another channel — increment unread + notify
                setChannels(prev => prev.map(c =>
                  c.id === channelId ? { ...c, unread: (c.unread ?? 0) + 1 } : c
                ))
                // Desktop notification
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                  void new Notification(`New message`, {
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
            } else if (ev === 'call-invite') {
              // Incoming call — dispatch a custom window event so IncomingCallOverlay
              // (rendered outside MessagesPanel) can show regardless of active tab.
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
            } else if (ev === 'active-conferences') {
              window.dispatchEvent(new CustomEvent('bundy-active-conferences', { detail: payload }))
            }
          } catch { /* ignore parse errors */ }
        }
      }
    }).catch(() => {})
    return () => ctrl.abort()
  }, [config, auth.userId, loadChannels])

  // Request notification permission once
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => { loadChannels() }, [loadChannels])

  useEffect(() => {
    if (!selected) return
    loadMessages(selected)
  }, [selected, loadMessages])

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

  const channelList = channels.filter(c => c.type === 'channel')
  const groupList = channels.filter(c => c.type === 'group')
  const dmList = channels.filter(c => c.type === 'dm')

  // Render markdown-like content with selectable text
  // renderContent is replaced by module-level renderMessageContent + OG previews per bubble

  const selectedTyping = selected ? (typingMap[selected.id] ?? []) : []

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {showNewConv && <NewConvModal config={config} auth={auth} onClose={() => setShowNewConv(false)} onCreated={handleCreated} />}
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
        width: 240, borderRight: `1px solid ${C.border}`,
        background: C.contentBg, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Messages</span>
          <button onClick={() => setShowNewConv(true)} title="New Conversation"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, padding: 4 }}>
            <Edit2 size={15} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {channelList.length > 0 && (
            <>
              <div style={{ padding: '6px 16px 4px', fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Channels</div>
              {channelList.map(c => <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} auth={auth} typingUsers={typingMap[c.id] ?? []} hasActiveCall={!!activeConferences[c.id]} onClick={() => setSelected(c)} />)}
            </>
          )}
          {groupList.length > 0 && (
            <>
              <div style={{ padding: '10px 16px 4px', fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Groups</div>
              {groupList.map(c => <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} auth={auth} typingUsers={typingMap[c.id] ?? []} hasActiveCall={!!activeConferences[c.id]} onClick={() => setSelected(c)} />)}
            </>
          )}
          {dmList.length > 0 && (
            <>
              <div style={{ padding: '10px 16px 4px', fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Direct Messages</div>
              {dmList.map(c => <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} auth={auth} typingUsers={typingMap[c.id] ?? []} onClick={() => setSelected(c)} />)}
            </>
          )}
          {channels.length === 0 && (
            <div style={{ padding: '20px 16px', color: C.textMuted, fontSize: 12, textAlign: 'center' }}>
              No conversations yet.<br />
              <button onClick={() => setShowNewConv(true)} style={{ marginTop: 8, background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>+ Start one</button>
            </div>
          )}
        </div>
      </div>

      {/* Message thread */}
      {selected ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            padding: '10px 16px', borderBottom: `1px solid ${C.border}`,
            background: C.contentBg, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            {selected.type === 'channel' && <Hash size={16} color={C.textMuted} />}
            {selected.type === 'group' && <Users size={16} color={C.textMuted} />}
            {selected.type === 'dm' && <Avatar url={selected.avatar} name={selected.name} size={28} />}
            <span style={{ fontWeight: 700, fontSize: 14, color: C.text, flex: 1 }}>{selected.name}</span>
            {/* Call buttons for DMs */}
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
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4 }}>
                    <Phone size={16} />
                  </button>
                  <button onClick={() => setActiveCall({ targetUser, callType: 'video' })} title="Video call"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4 }}>
                    <Video size={16} />
                  </button>
                </>
              )
            })()}
            {/* Conference call button for channels/groups */}
            {selected.type !== 'dm' && (() => {
              const conf = activeConferences[selected.id]
              const inThisConf = myConference?.channelId === selected.id
              if (inThisConf) return null // already in this conference, no button needed
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
                    style={{ background: '#22c55e', border: 'none', cursor: 'pointer', color: '#fff', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
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
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4 }}>
                  <Phone size={16} />
                </button>
              )
            })()}
            {selected.type !== 'dm' && (
              <button onClick={() => setShowSettings(true)} title="Manage members"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4 }}>
                <Settings2 size={16} />
              </button>
            )}
          </div>

          {/* Call in progress banner */}
          {selected.type !== 'dm' && activeConferences[selected.id] && myConference?.channelId !== selected.id && (() => {
            const conf = activeConferences[selected.id]
            return (
              <div style={{
                padding: '8px 16px', background: 'linear-gradient(90deg, #22c55e22, #22c55e11)',
                borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
              }}>
                <Phone size={14} color="#22c55e" />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>Call in progress</span>
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
                  background: '#22c55e', border: 'none', cursor: 'pointer', color: '#fff',
                  padding: '4px 14px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                }}>
                  Join
                </button>
              </div>
            )
          })()}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {loadingMsgs && messages.length === 0 && (
              <div style={{ textAlign: 'center', color: C.textMuted, padding: 20 }}>
                <Loader size={18} />
              </div>
            )}
            {messages.map((msg, i) => {
              const isMe = msg.sender.id === auth.userId
              const showHeader = messages[i - 1]?.sender.id !== msg.sender.id
              const senderName = msg.sender.alias ?? msg.sender.username
              const isRead = msg.reads?.some(r => r.userId !== auth.userId)
              const isAttachment = /^\[📎\s[^\]]+?\]\(https?:\/\/\S+?\)\s*$/.test(msg.content)
              const plainUrls = isAttachment ? [] : extractUrls(msg.content).filter(u => !isImageUrl(u))
              return (
                <div key={msg.id} style={{ marginTop: showHeader ? 10 : 0 }}>
                  {showHeader && !isMe && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Avatar url={msg.sender.avatarUrl} name={senderName} size={24} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>{senderName}</span>
                      <span style={{ fontSize: 10, color: C.textMuted }}>{formatTime(msg.createdAt)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', paddingLeft: isMe ? 0 : 32 }}>
                    <div style={{ maxWidth: '72%' }}>
                      {isAttachment ? (
                        <InlineAttachment content={msg.content} isMe={isMe} config={config} />
                      ) : (
                        <div style={{
                          padding: '8px 12px', borderRadius: 12,
                          background: isMe ? C.accent : '#fff',
                          boxShadow: isMe ? `0 2px 8px ${C.accent}44` : '2px 2px 6px #a3b1c6, -2px -2px 6px #ffffff',
                          color: isMe ? '#fff' : C.text, fontSize: 13,
                          borderBottomRightRadius: isMe ? 4 : 12,
                          borderBottomLeftRadius: isMe ? 12 : 4,
                          wordBreak: 'break-word', overflowWrap: 'break-word',
                          userSelect: 'text', WebkitUserSelect: 'text',
                        }}>
                          {renderMessageContent(msg.content, isMe)}
                        </div>
                      )}
                      {plainUrls.map((url, ui) => (
                        <OgPreview key={ui} url={url} config={config} />
                      ))}
                      {isMe && (
                        <div style={{ textAlign: 'right', fontSize: 10, color: C.textMuted, marginTop: 2, userSelect: 'none' }}>
                          {formatTime(msg.createdAt)}
                          {isRead ? ' · Read' : ' · Sent'}
                          {msg.editedAt && ' · Edited'}
                        </div>
                      )}
                    </div>
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
          <button onClick={() => setShowNewConv(true)}
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

function ConvRow({ conv, selected, typingUsers, hasActiveCall, onClick }: { conv: Conversation; selected: boolean; auth?: Auth; typingUsers: string[]; hasActiveCall?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 16px', border: 'none', textAlign: 'left',
        background: selected ? C.accentLight : 'transparent',
        cursor: 'pointer', borderLeft: selected ? `3px solid ${C.accent}` : '3px solid transparent',
      }}
    >
      {conv.type === 'dm' ? (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar url={conv.avatar} name={conv.name} size={28} />
          {typingUsers.length > 0 && (
            <span style={{
              position: 'absolute', bottom: -2, right: -2, width: 10, height: 10,
              borderRadius: '50%', background: C.accent, border: `2px solid ${C.contentBg}`,
            }} />
          )}
        </div>
      ) : (
        <div style={{
          width: 28, height: 28, borderRadius: conv.type === 'channel' ? 6 : '50%',
          background: selected ? C.accent : '#dde3ea',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: selected ? '#fff' : C.textMuted, flexShrink: 0,
        }}>
          {conv.type === 'channel' ? '#' : (conv.name[0] ?? '?').toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: selected || (conv.unread ?? 0) > 0 ? 600 : 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {conv.name}
        </div>
        {typingUsers.length > 0 ? (
          <div style={{ fontSize: 11, color: C.accent, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            typing…
          </div>
        ) : conv.lastMessage ? (
          <div style={{ fontSize: 11, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conv.lastMessage}
          </div>
        ) : null}
      </div>
      {hasActiveCall && (
        <Phone size={13} color="#22c55e" style={{ flexShrink: 0, animation: 'pulse 2s infinite' }} />
      )}
      {(conv.unread ?? 0) > 0 && !selected && (
        <div style={{
          minWidth: 18, height: 18, borderRadius: 9, background: C.accent,
          color: '#fff', fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
          flexShrink: 0,
        }}>
          {conv.unread}
        </div>
      )}
    </button>
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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !channelId) return
    setUploading(true)
    try {
      // Upload file to server so it persists cross-process
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${config.apiBase}/api/channels/${channelId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}` },
        body: form,
      })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      const { url, filename } = await res.json() as { url: string; filename: string }
      // Send a message with a clickable attachment link
      const content = `[📎 ${filename}](${config.apiBase}${url})`
      await fetch(`${config.apiBase}/api/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
    } catch { /* ignore upload errors */ } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
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
    <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${C.border}`, background: C.contentBg, flexShrink: 0, position: 'relative' }}>
      {/* @mention dropdown */}
      {mentionResults.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 16, right: 16,
          background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', overflow: 'hidden', zIndex: 50,
        }}>
          {mentionResults.map(u => (
            <button key={u.id} onClick={() => insertMention(u)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}>
              <Avatar url={u.avatarUrl} name={u.alias ?? u.username} size={24} />
              <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{u.alias ?? u.username}</span>
              <span style={{ fontSize: 11, color: C.textMuted }}>@{u.username}</span>
            </button>
          ))}
        </div>
      )}

      {/* Formatting toolbar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {[
          { icon: <Bold size={13} />, action: () => wrapSelection('**', '**'), title: 'Bold' },
          { icon: <Italic size={13} />, action: () => wrapSelection('*', '*'), title: 'Italic' },
          { icon: <List size={13} />, action: () => insertPrefix('• '), title: 'Bullet list' },
          { icon: <AtSign size={13} />, action: () => { setInput(input + '@'); setTimeout(() => textareaRef.current?.focus(), 0) }, title: 'Mention' },
          { icon: <Paperclip size={13} />, action: () => fileRef.current?.click(), title: 'Attach file' },
        ].map((btn, i) => (
          <button key={i} onClick={btn.action} title={btn.title}
            style={{
              padding: '4px 8px', borderRadius: 6, border: 'none',
              background: 'transparent', color: C.textMuted, cursor: 'pointer',
              ...neu(),
            }}>
            {btn.icon}
          </button>
        ))}
      </div>

      <input ref={fileRef} type="file" hidden onChange={handleFile} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          style={{
            flex: 1, resize: 'none', ...neu(true), padding: '10px 14px',
            fontSize: 13, color: C.text, border: 'none', outline: 'none',
            lineHeight: 1.5, minHeight: 38, maxHeight: 120, overflow: 'auto',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={sendFn}
          disabled={!input.trim() || sending || uploading}
          style={{
            ...neu(), padding: '10px 14px', border: 'none', flexShrink: 0,
            background: input.trim() ? C.accent : C.contentBg,
            color: input.trim() ? '#fff' : C.textMuted,
            cursor: input.trim() ? 'pointer' : 'default',
            boxShadow: input.trim() ? `0 2px 8px ${C.accent}44` : undefined,
          }}
        >
          {sending ? <Loader size={16} /> : <Send size={16} />}
        </button>
      </div>
    </div>
  )
}

// ─── Call UI ─────────────────────────────────────────────────────────────────

// ─── CallControls (shared between CallWidget + ConferenceWidget) ────────────

function CallControls({ muted, onToggleMute, videoOff, onToggleVideo, videoActive, windowMode, onSetWindowMode, onHangup, participantCount, callDuration }: {
  muted: boolean; onToggleMute: () => void
  videoOff: boolean; onToggleVideo: () => void
  videoActive: boolean
  windowMode: 'mini' | 'normal' | 'fullscreen'
  onSetWindowMode: (m: 'mini' | 'normal' | 'fullscreen') => void
  onHangup: () => void
  participantCount?: number
  callDuration?: number
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
        <span style={{ color: '#94a3b8', fontSize: 12, fontVariantNumeric: 'tabular-nums', marginRight: 4 }}>
          {formatDuration(callDuration)}
        </span>
      )}
      {participantCount !== undefined && participantCount > 0 && (
        <span style={{ color: '#94a3b8', fontSize: 11, marginRight: 4 }}>
          <Users size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} />{participantCount}
        </span>
      )}
      <button onClick={onToggleMute} style={btnStyle(muted)} title={muted ? 'Unmute' : 'Mute'}>
        {muted ? <MicOff size={iconSize} /> : <Mic size={iconSize} />}
      </button>
      <button onClick={onToggleVideo} style={btnStyle(videoOff && videoActive)} title={videoActive ? (videoOff ? 'Turn on camera' : 'Turn off camera') : 'Start video'}>
        {videoActive && !videoOff ? <Video size={iconSize} /> : <VideoOff size={iconSize} />}
      </button>
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

function CallWidget({ config, auth, targetUser, callType, onEnd, offerSdp, bufferedIce }: {
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

  // Track remote video availability (when peer adds/removes video)
  const [remoteHasVideo, setRemoteHasVideo] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    listenForSignals(ctrl)
    if (isReceiver) {
      answerCall()
    } else {
      startCall()
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
    return () => { ctrl.abort(); cleanup(false); if (timeout) clearTimeout(timeout); if (durationTimer.current) clearInterval(durationTimer.current) }
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
  }, [windowMode])

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
      if (state === 'connected') { setStatus('connected'); statusRef.current = 'connected' }
    }
    peerConn.oniceconnectionstatechange = () => {
      const state = peerConn.iceConnectionState
      console.log('[CallWidget] iceConnectionState:', state)
      if (state === 'connected' || state === 'completed') { setStatus('connected'); statusRef.current = 'connected' }
      else if (state === 'disconnected') {
        setTimeout(async () => {
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

  const handleDragStart = (e: React.MouseEvent) => {
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    setIsDragging(true)
  }

  const showVideo = videoActive || remoteHasVideo

  // ─── Mini mode ──────────────────────────────────────────────────────
  if (windowMode === 'mini') {
    return (
      <div style={{
        position: 'fixed', left: position.x, top: position.y, zIndex: 9998,
        width: 300, height: showVideo ? 220 : 100,
        background: '#1a1a2e', borderRadius: 12,
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
          <span style={{ color: '#94a3b8', fontSize: 10 }}>
            {status === 'calling' ? 'Calling…' : status === 'connected' ? '' : 'Ended'}
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
                <span style={{ color: '#94a3b8', fontSize: 10 }}>
                  {status === 'calling' ? 'Calling…' : 'Connected'}
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
            <span style={{ color: '#94a3b8', fontSize: 12 }}>
              {status === 'calling' ? 'Calling…' : 'Connected'}
            </span>
          </div>
        )}
        <div style={{ padding: '6px 10px', display: 'flex', justifyContent: 'center', flexShrink: 0, background: 'rgba(0,0,0,0.3)' }}>
          <CallControls muted={muted} onToggleMute={toggleMute} videoOff={videoOff} onToggleVideo={toggleVideo}
            videoActive={videoActive} windowMode="mini" onSetWindowMode={setWindowMode}
            onHangup={hangup} callDuration={status === 'connected' ? callDuration : undefined} />
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
                <div style={{ color: '#94a3b8', fontSize: 13 }}>Calling…</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <Avatar url={targetUser.avatar} name={targetUser.name} size={80} />
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, marginTop: 12 }}>{targetUser.name}</div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>
            {status === 'calling' ? 'Calling…' : status === 'connected' ? 'Connected' : 'Call ended'}
          </div>
          <video ref={localVideo} autoPlay playsInline muted style={{ display: 'none' }} />
        </div>
      )}
      {/* Controls */}
      <div style={{
        ...(isFs ? { position: 'absolute' as const, bottom: 30, left: '50%', transform: 'translateX(-50%)', opacity: showControls ? 1 : 0, transition: 'opacity 0.3s' } : {}),
        padding: '10px 20px', borderRadius: 16, background: isFs ? 'rgba(0,0,0,0.6)' : 'transparent',
      }}>
        <CallControls muted={muted} onToggleMute={toggleMute} videoOff={videoOff} onToggleVideo={toggleVideo}
          videoActive={videoActive} windowMode={windowMode} onSetWindowMode={setWindowMode}
          onHangup={hangup} callDuration={status === 'connected' ? callDuration : undefined} />
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
      let remoteStream = e.streams[0]
      if (!remoteStream) {
        if (!peerData.stream) peerData.stream = new MediaStream()
        peerData.stream.addTrack(e.track)
        remoteStream = peerData.stream
      } else {
        peerData.stream = remoteStream
      }
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
        setTimeout(async () => {
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
        }, 5000)
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

    window.addEventListener('bundy-conference-offer', onConfOffer)
    window.addEventListener('bundy-conference-answer', onConfAnswer)
    window.addEventListener('bundy-conference-ice', onConfIce)
    window.addEventListener('bundy-conference-joined', onConfJoined)
    window.addEventListener('bundy-conference-left', onConfLeft)
    window.addEventListener('bundy-conference-ended', onConfEnded)
    ctrl.signal.addEventListener('abort', () => {
      window.removeEventListener('bundy-conference-offer', onConfOffer)
      window.removeEventListener('bundy-conference-answer', onConfAnswer)
      window.removeEventListener('bundy-conference-ice', onConfIce)
      window.removeEventListener('bundy-conference-joined', onConfJoined)
      window.removeEventListener('bundy-conference-left', onConfLeft)
      window.removeEventListener('bundy-conference-ended', onConfEnded)
    })
  }

  function cleanupAll(sendLeave: boolean) {
    for (const [, peer] of peersRef.current) { peer.pc.close() }
    peersRef.current.clear()
    for (const [, audioEl] of audioElementsRef.current) { audioEl.pause(); audioEl.srcObject = null }
    audioElementsRef.current.clear()
    localStream.current?.getTracks().forEach(t => t.stop())
    if (sendLeave) {
      fetch(`${config.apiBase}/api/calls`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'conference-leave', channelId }),
      }).catch(() => {})
    }
  }

  function toggleMute() {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = muted })
    setMuted(!muted)
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

  const handleDragStart = (e: React.MouseEvent) => {
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    setIsDragging(true)
  }

  const peerList = Array.from(peers.entries())
  const totalParticipants = peerList.length + 1 // +1 for self
  const gridCols = totalParticipants <= 2 ? 1 : totalParticipants <= 4 ? 2 : 3

  function renderParticipantTile(id: string, stream: MediaStream | null, name: string, avatar: string | null, isSelf: boolean) {
    return (
      <div key={id} style={{
        background: '#0f0f23', borderRadius: 10, overflow: 'hidden', position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0,
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
        <span style={{ position: 'absolute', bottom: 4, left: 6, color: '#fff', fontSize: 10, textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
          {isSelf ? 'You' : name}
        </span>
      </div>
    )
  }

  // ─── Mini mode ──────────────────────────────────────────────────────
  if (windowMode === 'mini') {
    return (
      <div style={{
        position: 'fixed', left: position.x, top: position.y, zIndex: 9998,
        width: 300, height: 200, background: '#1a1a2e', borderRadius: 12,
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <div onMouseDown={handleDragStart} onDoubleClick={() => setWindowMode('normal')} style={{
          padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6,
          cursor: isDragging ? 'grabbing' : 'grab', background: 'rgba(255,255,255,0.05)', flexShrink: 0,
        }}>
          <Move size={10} color="#94a3b8" />
          <Hash size={10} color="#94a3b8" />
          <span style={{ color: '#fff', fontSize: 10, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channelName}</span>
          <span style={{ color: '#94a3b8', fontSize: 10 }}><Users size={10} style={{ verticalAlign: 'middle' }} /> {totalParticipants}</span>
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${Math.min(gridCols, 2)}, 1fr)`, gap: 2, padding: 2, minHeight: 0 }}>
          {renderParticipantTile(auth.userId, localStream.current, 'You', null, true)}
          {peerList.slice(0, 3).map(([id, p]) => renderParticipantTile(id, p.stream, p.name, p.avatar, false))}
        </div>
        <div style={{ padding: '4px 8px', display: 'flex', justifyContent: 'center', flexShrink: 0, background: 'rgba(0,0,0,0.3)' }}>
          <CallControls muted={muted} onToggleMute={toggleMute} videoOff={videoOff} onToggleVideo={toggleVideo}
            videoActive={videoActive} windowMode="mini" onSetWindowMode={setWindowMode}
            onHangup={handleLeave} participantCount={totalParticipants} callDuration={callDuration} />
        </div>
        <video ref={localVideo} autoPlay playsInline muted style={{ display: 'none' }} />
      </div>
    )
  }

  // ─── Normal / fullscreen mode ───────────────────────────────────────
  const isFs = windowMode === 'fullscreen'
  return (
    <div style={{
      position: 'fixed', inset: 0, background: isFs ? '#000' : 'rgba(0,0,0,0.85)', zIndex: 9998,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Hash size={16} color="#94a3b8" />
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{channelName}</span>
        <span style={{ color: '#94a3b8', fontSize: 12 }}><Users size={12} style={{ verticalAlign: 'middle' }} /> {totalParticipants}</span>
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
        <div style={{ padding: '10px 24px', borderRadius: 16, background: isFs ? 'rgba(0,0,0,0.6)' : 'transparent' }}>
          <CallControls muted={muted} onToggleMute={toggleMute} videoOff={videoOff} onToggleVideo={toggleVideo}
            videoActive={videoActive} windowMode={windowMode} onSetWindowMode={setWindowMode}
            onHangup={handleLeave} participantCount={totalParticipants} callDuration={callDuration} />
        </div>
      </div>
      <video ref={localVideo} autoPlay playsInline muted style={{ display: 'none' }} />
    </div>
  )
}

// ─── Tasks Panel ──────────────────────────────────────────────────────────────

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'To Do', 'in-progress': 'In Progress', done: 'Done', cancelled: 'Cancelled'
}
const TASK_STATUS_COLORS: Record<string, string> = {
  todo: C.textMuted, 'in-progress': C.accent, done: C.success, cancelled: '#9ca3af'
}
const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444', high: '#f59e0b', medium: '#6366f1', low: '#22c55e'
}

function TasksPanel({ config, auth }: { config: ApiConfig; auth: Auth }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'mine' | 'todo' | 'in-progress'>('mine')
  const [projects, setProjects] = useState<{ id: string; name: string; color: string }[]>([])
  const [detailTask, setDetailTask] = useState<Task | null>(null)

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
      const [taskData, projData] = await Promise.all([
        apiFetch(`/api/tasks?${params.toString()}`) as Promise<{ tasks: Task[] }>,
        apiFetch('/api/tasks/projects') as Promise<{ projects: { id: string; name: string; color: string }[] }>,
      ])
      setTasks(taskData.tasks)
      setProjects(projData.projects)
    } catch { /* offline */ } finally {
      setLoading(false)
    }
  }, [apiFetch, filter])

  useEffect(() => { load() }, [load])

  async function markDone(taskId: string) {
    try {
      await apiFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done' }),
      })
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'done' } : t))
    } catch { /* offline */ }
  }

  const grouped = tasks.reduce<Record<string, Task[]>>((acc, t) => {
    const key = t.project?.name ?? 'No Project'
    ;(acc[key] ??= []).push(t)
    return acc
  }, {})

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Toolbar */}
      <div style={{
        padding: '14px 24px', borderBottom: `1px solid ${C.border}`,
        background: C.contentBg, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: C.text, marginRight: 8 }}>Tasks</span>
        {(['all', 'mine', 'todo', 'in-progress'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 12px', borderRadius: 20, border: 'none',
              background: filter === f ? C.accent : C.contentBg,
              color: filter === f ? '#fff' : C.textMuted,
              fontSize: 12, fontWeight: filter === f ? 600 : 400, cursor: 'pointer',
              boxShadow: filter === f ? `0 2px 6px ${C.accent}44` : '2px 2px 4px #a3b1c6, -2px -2px 4px #ffffff',
            }}
          >
            {f === 'in-progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button
          onClick={load}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Task list */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: C.textMuted, padding: 40 }}>
            <Loader size={24} />
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.textMuted, padding: 40 }}>
            <CheckSquare size={40} strokeWidth={1} />
            <div style={{ marginTop: 12 }}>No tasks found</div>
          </div>
        ) : (
          Object.entries(grouped).map(([projName, projTasks]) => (
            <div key={projName} style={{ marginBottom: 24 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '0 4px',
              }}>
                <Layers size={13} color={C.textMuted} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {projName}
                </span>
                <span style={{ fontSize: 11, color: C.textMuted }}>({projTasks.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {projTasks.map(task => (
                  <TaskCard key={task.id} task={task} auth={auth} onDone={() => markDone(task.id)} onOpen={() => setDetailTask(task)} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Task detail panel */}
      {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          config={config}
          auth={auth}
          onClose={() => setDetailTask(null)}
          onUpdated={(updated) => {
            setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))
            setDetailTask(updated)
          }}
        />
      )}
    </div>
  )
}

function TaskCard({ task, auth, onDone, onOpen }: { task: Task; auth: Auth; onDone: () => void; onOpen: () => void }) {
  const isDone = task.status === 'done' || task.status === 'cancelled'
  return (
    <div
      onClick={onOpen}
      style={{
        ...neu(), padding: '12px 14px',
        display: 'flex', alignItems: 'flex-start', gap: 12,
        opacity: isDone ? 0.6 : 1, cursor: 'pointer',
      }}
    >
      <button
        onClick={e => { e.stopPropagation(); if (!isDone) onDone() }}
        style={{
          width: 18, height: 18, borderRadius: 4, border: `2px solid ${isDone ? C.success : C.border}`,
          background: isDone ? C.success : 'transparent',
          cursor: isDone ? 'default' : 'pointer', flexShrink: 0, marginTop: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {isDone && <Check size={12} color="#fff" />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 13, fontWeight: 600, color: C.text,
            textDecoration: isDone ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {task.title}
          </span>
          {task.priority !== 'medium' && (
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: PRIORITY_COLORS[task.priority] ?? C.textMuted,
            }} title={task.priority} />
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: TASK_STATUS_COLORS[task.status] ?? C.textMuted, fontWeight: 600 }}>
            {TASK_STATUS_LABELS[task.status] ?? task.status}
          </span>
          {task.assignee && <span style={{ fontSize: 11, color: C.textMuted }}>→ {task.assignee.alias ?? task.assignee.username}</span>}
          {task.dueDate && (
            <span style={{ fontSize: 11, color: new Date(task.dueDate) < new Date() ? C.danger : C.textMuted }}>
              📅 {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
          {task._count.comments > 0 && <span style={{ fontSize: 11, color: C.textMuted }}>💬 {task._count.comments}</span>}
        </div>
      </div>
    </div>
  )
}

function TaskDetailPanel({ task, config, auth, onClose, onUpdated }: {
  task: Task; config: ApiConfig; auth: Auth
  onClose: () => void
  onUpdated: (t: Task) => void
}) {
  const [detail, setDetail] = useState<Task>(task)
  const [comments, setComments] = useState<TaskComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)

  const apiFetch = useCallback(async (path: string, opts?: RequestInit) => {
    const res = await fetch(`${config.apiBase}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }, [config])

  useEffect(() => {
    apiFetch(`/api/tasks/${task.id}`)
      .then((d: { task: Task }) => {
        setDetail(d.task)
        setComments(d.task.comments ?? [])
      })
      .catch(() => {})
  }, [task.id, apiFetch])

  async function setStatus(status: string) {
    setSavingStatus(true)
    try {
      const d = await apiFetch(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }) as { task: Task }
      setDetail(d.task)
      onUpdated(d.task)
    } catch { /* ignore */ } finally { setSavingStatus(false) }
  }

  async function addComment() {
    if (!commentText.trim()) return
    setAddingComment(true)
    try {
      const d = await apiFetch(`/api/tasks/${task.id}/comments`, { method: 'POST', body: JSON.stringify({ body: commentText.trim() }) }) as { comment: TaskComment }
      setComments(prev => [...prev, d.comment])
      setCommentText('')
    } catch { /* ignore */ } finally { setAddingComment(false) }
  }

  const isDone = detail.status === 'done' || detail.status === 'cancelled'

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: '45%', minWidth: 340,
      background: C.contentBg, borderLeft: `1px solid ${C.border}`,
      boxShadow: '-8px 0 24px rgba(0,0,0,0.1)',
      display: 'flex', flexDirection: 'column', zIndex: 10,
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, flexShrink: 0, marginTop: 2 }}>
          <X size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{detail.title}</div>
          {detail.project && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{detail.project.name}</div>}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Status + Priority */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Status</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(TASK_STATUS_LABELS).map(([s, l]) => (
                <button key={s} onClick={() => setStatus(s)} disabled={savingStatus}
                  style={{
                    padding: '4px 10px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    background: detail.status === s ? TASK_STATUS_COLORS[s] : C.contentBg,
                    color: detail.status === s ? '#fff' : C.textMuted,
                    boxShadow: detail.status === s ? `0 2px 6px ${TASK_STATUS_COLORS[s]}44` : '2px 2px 4px #a3b1c6, -2px -2px 4px #ffffff',
                  }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Description */}
        {detail.description && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Description</div>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{detail.description}</div>
          </div>
        )}

        {/* Assignee */}
        {detail.assignee && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Assignee</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar url={detail.assignee.avatarUrl} name={detail.assignee.alias ?? detail.assignee.username} size={26} />
              <span style={{ fontSize: 13, color: C.text }}>{detail.assignee.alias ?? detail.assignee.username}</span>
            </div>
          </div>
        )}

        {/* Due date */}
        {detail.dueDate && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Due Date</div>
            <div style={{ fontSize: 13, color: new Date(detail.dueDate) < new Date() && !isDone ? C.danger : C.text }}>
              {new Date(detail.dueDate).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
          </div>
        )}

        {/* Subtasks */}
        {(detail.subtasks?.length ?? 0) > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Subtasks ({detail.subtasks!.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {detail.subtasks!.map(sub => (
                <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', ...neu(), borderRadius: 8 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${sub.status === 'done' ? C.success : C.border}`, background: sub.status === 'done' ? C.success : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {sub.status === 'done' && <Check size={10} color="#fff" />}
                  </div>
                  <span style={{ fontSize: 12, color: C.text, textDecoration: sub.status === 'done' ? 'line-through' : 'none' }}>{sub.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comments */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
            Comments ({comments.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {comments.map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                <Avatar url={c.user.avatarUrl} name={c.user.alias ?? c.user.username} size={26} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{c.user.alias ?? c.user.username}</span>
                    <span style={{ fontSize: 10, color: C.textMuted }}>{timeAgo(c.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, marginTop: 2, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                  {c.attachmentName && <a href={`${config.apiBase}${c.attachmentUrl}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.accent }}>📎 {c.attachmentName}</a>}
                </div>
              </div>
            ))}
          </div>
          {/* Add comment */}
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && e.metaKey && void addComment()}
              placeholder="Add a comment… (⌘+Enter)"
              rows={2}
              style={{
                flex: 1, resize: 'none', ...neu(true), padding: '8px 10px',
                fontSize: 12, color: C.text, border: 'none', outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button onClick={addComment} disabled={!commentText.trim() || addingComment}
              style={{ ...neu(), padding: '8px 12px', border: 'none', color: C.accent, cursor: 'pointer', flexShrink: 0 }}>
              {addingComment ? <Loader size={14} /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Activity Panel ───────────────────────────────────────────────────────────

const ACTION_COLORS_ACT: Record<string, string> = {
  CHECK_IN: C.success, CLOCK_OUT: C.danger,
  BREAK: C.warning, BACK: C.accent,
}
const ACTION_ICONS_ACT: Record<string, React.ReactNode> = {
  CHECK_IN: <Play size={13} />, CLOCK_OUT: <Square size={13} />,
  BREAK: <Pause size={13} />, BACK: <RotateCcw size={13} />,
}
const ACTION_LABELS_ACT: Record<string, string> = {
  CHECK_IN: 'Clocked In', CLOCK_OUT: 'Clocked Out',
  BREAK: 'Break Started', BACK: 'Resumed',
}

function ActivityPanel({ config }: { config: ApiConfig }) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ workMs: 0, breakMs: 0 })
  const [screenshotCount, setScreenshotCount] = useState(0)
  const [activityWindows, setActivityWindows] = useState<{ windowStart: string; activeSeconds: number; totalSeconds: number }[]>([])

  useEffect(() => { loadActivity() }, [config])

  async function loadActivity() {
    setLoading(true)
    try {
      const [bundyData, actData, ssData] = await Promise.all([
        fetch(`${config.apiBase}/api/bundy`, { headers: { Authorization: `Bearer ${config.token}` } }).then(r => r.json()) as Promise<{ todayLogs: LogEntry[] }>,
        fetch(`${config.apiBase}/api/user/activity-today`, { headers: { Authorization: `Bearer ${config.token}` } }).then(r => r.json()) as Promise<{ summaries: { windowStart: string; activeSeconds: number; totalSeconds: number }[] }>,
        fetch(`${config.apiBase}/api/user/screenshots-today`, { headers: { Authorization: `Bearer ${config.token}` } }).then(r => r.json()).catch(() => ({ screenshots: [] })) as Promise<{ screenshots: unknown[] }>,
      ])
      setLogs(bundyData.todayLogs ?? [])
      setActivityWindows(actData.summaries ?? [])
      setScreenshotCount((ssData.screenshots ?? []).length)

      let workMs = 0, breakMs = 0, lastIn: number | null = null, lastBreak: number | null = null
      for (const log of (bundyData.todayLogs ?? [])) {
        const t = new Date(log.timestamp).getTime()
        if (log.action === 'CHECK_IN' || log.action === 'BACK') { lastIn = t; lastBreak = null }
        else if (log.action === 'BREAK') {
          if (lastIn != null) { workMs += t - lastIn; lastIn = null }
          lastBreak = t
        } else if (log.action === 'CLOCK_OUT') {
          if (lastIn != null) workMs += t - lastIn
          if (lastBreak != null) breakMs += t - lastBreak
          lastIn = null; lastBreak = null
        }
      }
      if (lastIn != null) workMs += Date.now() - lastIn
      if (lastBreak != null) breakMs += Date.now() - lastBreak
      setStats({ workMs, breakMs })
    } catch { /* offline */ } finally { setLoading(false) }
  }

  // Compute total active seconds
  const totalActiveSeconds = activityWindows.reduce((s, w) => s + w.activeSeconds, 0)
  const totalTrackedSeconds = activityWindows.reduce((s, w) => s + w.totalSeconds, 0)
  const activePercent = totalTrackedSeconds > 0 ? Math.round((totalActiveSeconds / totalTrackedSeconds) * 100) : 0

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>Today's Activity</div>
        <button onClick={loadActivity} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}>
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div style={{ ...card(), textAlign: 'center', padding: '14px 10px' }}>
          <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Work Time</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.success, fontVariantNumeric: 'tabular-nums' }}>{formatMs(stats.workMs)}</div>
        </div>
        <div style={{ ...card(), textAlign: 'center', padding: '14px 10px' }}>
          <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Break Time</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.warning, fontVariantNumeric: 'tabular-nums' }}>{formatMs(stats.breakMs)}</div>
        </div>
        <div style={{ ...card(), textAlign: 'center', padding: '14px 10px' }}>
          <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Screenshots</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.accent }}>{screenshotCount}</div>
        </div>
      </div>

      {/* Activity rate */}
      {totalTrackedSeconds > 0 && (
        <div style={{ ...card() }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Active Rate</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>{activePercent}%</span>
          </div>
          <div style={{ height: 8, background: '#dde3ea', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${activePercent}%`, background: C.accent, borderRadius: 4, transition: 'width 0.5s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>Active: {Math.round(totalActiveSeconds / 60)} min</span>
            <span style={{ fontSize: 11, color: C.textMuted }}>Total tracked: {Math.round(totalTrackedSeconds / 60)} min</span>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div style={{ ...card() }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 16 }}>Timeline</div>
        {loading ? (
          <div style={{ textAlign: 'center', color: C.textMuted, padding: 20 }}><Loader size={20} /></div>
        ) : logs.length === 0 ? (
          <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>No activity recorded today.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[...logs].reverse().map((log, i) => (
              <div key={log.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 10,
                background: i === 0 ? C.accentLight : 'transparent',
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  background: `${ACTION_COLORS_ACT[log.action] ?? C.textMuted}22`,
                  color: ACTION_COLORS_ACT[log.action] ?? C.textMuted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {ACTION_ICONS_ACT[log.action] ?? <Circle size={13} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                    {ACTION_LABELS_ACT[log.action] ?? log.action}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                  {formatTime(log.timestamp)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
    window.electronAPI.checkPermissions().then(setPerms).catch(() => {})
    window.electronAPI.getVersion().then(setVersion).catch(() => {})
    window.electronAPI.getUpdateState().then(setUpdateState).catch(() => {})
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
    try {
      const res = await fetch(`${config.apiBase}/api/user/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}` },
        body: form,
      })
      const d = await res.json() as { user?: { avatarUrl: string } }
      if (d.user?.avatarUrl) setProfile(p => p ? { ...p, avatarUrl: d.user!.avatarUrl } : p)
    } catch { /* ignore */ }
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
  const apiConfig = useApiConfig()

  // Buffer ICE candidates and answer SDP that arrive before CallWidget mounts
  const iceBufferRef = useRef<RTCIceCandidateInit[]>([])
  const answerSdpRef = useRef<string | null>(null)

  useEffect(() => {
    const unsub = window.electronAPI.onOnlineState((state) => setIsOnline(state.isOnline))
    return unsub
  }, [])

  // Listen for incoming-call events dispatched by MessagesPanel SSE
  // (so we can show the overlay regardless of which tab is active)
  // Also buffer ICE candidates and answer SDP that arrive before the CallWidget mounts
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
    window.addEventListener('bundy-incoming-call', onIncoming)
    window.addEventListener('bundy-call-ice', onIce)
    window.addEventListener('bundy-call-answer', onAnswer)
    return () => {
      window.removeEventListener('bundy-incoming-call', onIncoming)
      window.removeEventListener('bundy-call-ice', onIce)
      window.removeEventListener('bundy-call-answer', onAnswer)
    }
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.contentBg }}>
      <Sidebar tab={tab} setTab={setTab} auth={auth} onLogout={onLogout} isOnline={isOnline} />

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

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {!isOnline && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
            background: '#fef3c7', borderBottom: `1px solid #fcd34d`,
            padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
          }}>
            <WifiOff size={14} color={C.warning} />
            <span style={{ color: '#92400e', fontWeight: 500 }}>Server unreachable — changes will sync when reconnected</span>
          </div>
        )}

        {tab === 'home' && (
          <div style={{ position: 'absolute', top: isOnline ? 0 : 36, left: 0, right: 0, bottom: 0, overflowY: 'auto' }}>
            <HomePanel auth={auth} />
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
          <MessagesPanel config={apiConfig} auth={auth} acceptedCall={acceptedCall} iceBufferRef={iceBufferRef} answerSdpRef={answerSdpRef} />
          </div>
        )}
        {tab === 'tasks' && apiConfig && (
          <div style={{ position: 'absolute', top: isOnline ? 0 : 36, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column' }}>
            <TasksPanel config={apiConfig} auth={auth} />
          </div>
        )}
        {tab === 'activity' && apiConfig && (
          <div style={{ position: 'absolute', top: isOnline ? 0 : 36, left: 0, right: 0, bottom: 0, overflowY: 'auto' }}>
            <ActivityPanel config={apiConfig} />
          </div>
        )}
        {tab === 'settings' && apiConfig && (
          <div style={{ position: 'absolute', top: isOnline ? 0 : 36, left: 0, right: 0, bottom: 0, overflowY: 'auto' }}>
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
  )
}
