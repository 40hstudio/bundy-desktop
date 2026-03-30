import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Home, MessageSquare, CheckSquare, Activity, Settings,
  LogOut, Play, Pause, RotateCcw, Square, Plus, Trash2,
  Send, Hash, Users, Lock, ChevronRight, Circle, Clock,
  Check, AlertCircle, Loader, WifiOff, RefreshCw, Filter,
  Calendar, Flag, User as UserIcon, Layers
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
interface Conversation {
  id: string; type: 'channel' | 'group' | 'dm'
  name: string; avatar?: string | null
  lastMessage?: string; lastTime?: string
  unread?: number
}
interface ChatMessage {
  id: string; content: string; createdAt: string; editedAt: string | null
  sender: { id: string; username: string; alias: string | null; avatarUrl: string | null }
}
interface Task {
  id: string; title: string; description: string | null
  status: string; priority: string
  dueDate: string | null; estimatedHours: number | null
  project: { id: string; name: string; color: string } | null
  section: { id: string; name: string } | null
  assignee: { id: string; username: string; alias: string | null; avatarUrl: string | null } | null
  _count: { comments: number; subtasks: number }
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
            <div style={{ color: '#475569', fontSize: 11 }}>
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

  const PLAN_STATUSES = ['todo', 'in-progress', 'done', 'blocked']
  const PLAN_ICONS: Record<string, React.ReactNode> = {
    todo: <Circle size={13} />, 'in-progress': <Play size={13} />,
    done: <Check size={13} />, blocked: <AlertCircle size={13} />,
  }
  const PLAN_COLORS: Record<string, string> = {
    todo: C.textMuted, 'in-progress': C.accent, done: C.success, blocked: C.danger,
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

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
            {plan?.items?.filter(i => i.status === 'done').length ?? 0} / {plan?.items?.length ?? 0} done
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
              opacity: item.status === 'done' ? 0.6 : 1,
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
                  textDecoration: item.status === 'done' ? 'line-through' : 'none',
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

// ─── Messages Panel ───────────────────────────────────────────────────────────

function MessagesPanel({ config, auth }: { config: ApiConfig; auth: Auth }) {
  const [channels, setChannels] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

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
        members: Array<{ userId: string; user: { id: string; username: string; alias: string | null; avatarUrl: string | null } }>
        messages: Array<{ content: string; createdAt: string; sender: { username: string; alias: string | null } }>
      }> }
      const convs: Conversation[] = data.channels.map(ch => {
        let name = ch.name ?? ''
        let avatar: string | null = null
        if (ch.type === 'dm') {
          const other = ch.members.find(m => m.userId !== auth.userId)
          name = other?.user.alias ?? other?.user.username ?? 'DM'
          avatar = other?.user.avatarUrl ?? null
        } else if (ch.type === 'group') {
          name = ch.name ?? 'Group'
        } else {
          name = `#${ch.name ?? 'channel'}`
        }
        const last = ch.messages[0]
        return {
          id: ch.id, type: ch.type as Conversation['type'], name, avatar,
          lastMessage: last ? `${last.sender.alias ?? last.sender.username}: ${last.content}` : undefined,
          lastTime: last?.createdAt,
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
        }>
      }
      setMessages(data.messages.map(m => ({
        id: m.id, content: m.content, createdAt: m.createdAt, editedAt: m.editedAt,
        sender: m.sender,
      })))
    } catch { setMessages([]) } finally {
      setLoadingMsgs(false)
    }
  }, [apiFetch])

  useEffect(() => { loadChannels() }, [loadChannels])

  useEffect(() => {
    if (!selected) return
    loadMessages(selected)
    // Poll for new messages every 4s
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => loadMessages(selected), 4_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [selected, loadMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || !selected || sending) return
    setSending(true)
    try {
      await apiFetch(`/api/channels/${selected.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: input.trim() }),
      })
      setInput('')
      await loadMessages(selected)
      await loadChannels()
    } catch { /* offline */ } finally {
      setSending(false)
    }
  }

  const channelList = channels.filter(c => c.type === 'channel')
  const groupList = channels.filter(c => c.type === 'group')
  const dmList = channels.filter(c => c.type === 'dm')

  return (
    <div style={{ height: '100%', display: 'flex' }}>
      {/* Conversations sidebar */}
      <div style={{
        width: 240, height: '100%', borderRight: `1px solid ${C.border}`,
        background: C.contentBg, display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <div style={{ padding: '16px 16px 8px', fontWeight: 700, fontSize: 14, color: C.text }}>
          Messages
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {channelList.length > 0 && (
            <>
              <div style={{ padding: '6px 16px 4px', fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Channels
              </div>
              {channelList.map(c => <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} onClick={() => setSelected(c)} />)}
            </>
          )}
          {groupList.length > 0 && (
            <>
              <div style={{ padding: '10px 16px 4px', fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Groups
              </div>
              {groupList.map(c => <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} onClick={() => setSelected(c)} />)}
            </>
          )}
          {dmList.length > 0 && (
            <>
              <div style={{ padding: '10px 16px 4px', fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Direct Messages
              </div>
              {dmList.map(c => <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} onClick={() => setSelected(c)} />)}
            </>
          )}
        </div>
      </div>

      {/* Message thread */}
      {selected ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <div style={{
            padding: '14px 20px', borderBottom: `1px solid ${C.border}`,
            background: C.contentBg, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            {selected.type === 'channel' && <Hash size={16} color={C.textMuted} />}
            {selected.type === 'group' && <Users size={16} color={C.textMuted} />}
            {selected.type === 'dm' && (
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: C.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.accent }}>
                {selected.name[0]?.toUpperCase()}
              </div>
            )}
            <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{selected.name}</span>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {loadingMsgs && messages.length === 0 && (
              <div style={{ textAlign: 'center', color: C.textMuted, padding: 20 }}>
                <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            )}
            {messages.map((msg, i) => {
              const isMe = msg.sender.id === auth.userId
              const prevMsg = messages[i - 1]
              const showName = !isMe && prevMsg?.sender.id !== msg.sender.id
              const senderName = msg.sender.alias ?? msg.sender.username
              return (
                <div key={msg.id}>
                  {showName && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.accent, marginBottom: 2, marginLeft: 4, marginTop: i > 0 ? 8 : 0 }}>
                      {senderName}
                    </div>
                  )}
                  <div style={{
                    display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start',
                  }}>
                    <div style={{
                      maxWidth: '70%', padding: '8px 12px', borderRadius: 12,
                      background: isMe ? C.accent : C.contentBg,
                      boxShadow: isMe ? `0 2px 8px ${C.accent}44` : '2px 2px 6px #a3b1c6, -2px -2px 6px #ffffff',
                      color: isMe ? '#fff' : C.text, fontSize: 13, lineHeight: 1.5,
                      borderBottomRightRadius: isMe ? 4 : 12,
                      borderBottomLeftRadius: isMe ? 12 : 4,
                    }}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, background: C.contentBg, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && void send()}
                placeholder={`Message ${selected.name}…`}
                style={{
                  flex: 1, ...neu(true), padding: '10px 14px',
                  fontSize: 13, color: C.text, border: 'none', outline: 'none',
                }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || sending}
                style={{
                  ...neu(), padding: '10px 14px', border: 'none',
                  background: input.trim() ? C.accent : C.contentBg,
                  color: input.trim() ? '#fff' : C.textMuted,
                  cursor: input.trim() ? 'pointer' : 'default',
                  boxShadow: input.trim() ? `0 2px 8px ${C.accent}44` : undefined,
                }}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, flexDirection: 'column', gap: 12 }}>
          <MessageSquare size={40} strokeWidth={1} />
          <div>Select a conversation</div>
        </div>
      )}
    </div>
  )
}

function ConvRow({ conv, selected, onClick }: { conv: Conversation; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 16px', border: 'none', textAlign: 'left',
        background: selected ? C.accentLight : 'transparent',
        cursor: 'pointer', borderLeft: selected ? `3px solid ${C.accent}` : '3px solid transparent',
      }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: conv.type === 'channel' ? 8 : '50%',
        background: selected ? C.accent : '#dde3ea',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, color: selected ? '#fff' : C.textMuted,
        flexShrink: 0,
      }}>
        {conv.type === 'channel' ? '#' : (conv.name[0] ?? '?').toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: selected ? 600 : 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {conv.name}
        </div>
        {conv.lastMessage && (
          <div style={{ fontSize: 11, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conv.lastMessage}
          </div>
        )}
      </div>
    </button>
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
                  <TaskCard key={task.id} task={task} auth={auth} onDone={() => markDone(task.id)} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function TaskCard({ task, auth, onDone }: { task: Task; auth: Auth; onDone: () => void }) {
  const isDone = task.status === 'done' || task.status === 'cancelled'
  return (
    <div style={{
      ...neu(), padding: '12px 14px',
      display: 'flex', alignItems: 'flex-start', gap: 12,
      opacity: isDone ? 0.6 : 1,
    }}>
      <button
        onClick={() => !isDone && onDone()}
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
          <span style={{
            fontSize: 11, color: TASK_STATUS_COLORS[task.status] ?? C.textMuted,
            fontWeight: 600,
          }}>
            {TASK_STATUS_LABELS[task.status] ?? task.status}
          </span>
          {task.assignee && (
            <span style={{ fontSize: 11, color: C.textMuted }}>
              → {task.assignee.alias ?? task.assignee.username}
            </span>
          )}
          {task.dueDate && (
            <span style={{ fontSize: 11, color: new Date(task.dueDate) < new Date() ? C.danger : C.textMuted }}>
              📅 {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
          {task._count.comments > 0 && (
            <span style={{ fontSize: 11, color: C.textMuted }}>
              💬 {task._count.comments}
            </span>
          )}
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

  useEffect(() => {
    loadActivity()
  }, [config])

  async function loadActivity() {
    setLoading(true)
    try {
      const data = await fetch(`${config.apiBase}/api/bundy`, {
        headers: { Authorization: `Bearer ${config.token}` }
      }).then(r => r.json()) as { todayLogs: LogEntry[]; workMs?: number; breakMs?: number }
      setLogs(data.todayLogs ?? [])
      // Compute work/break ms from logs
      let workMs = 0, breakMs = 0, lastIn: number | null = null, lastBreak: number | null = null
      for (const log of (data.todayLogs ?? [])) {
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
    } catch { /* offline */ } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>Today's Activity</div>
        <button onClick={loadActivity} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}>
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ ...card(), flex: 1, textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Work Time</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.success, fontVariantNumeric: 'tabular-nums' }}>
            {formatMs(stats.workMs)}
          </div>
        </div>
        <div style={{ ...card(), flex: 1, textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Break Time</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.warning, fontVariantNumeric: 'tabular-nums' }}>
            {formatMs(stats.breakMs)}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div style={{ ...card() }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 16 }}>Timeline</div>
        {loading ? (
          <div style={{ textAlign: 'center', color: C.textMuted, padding: 20 }}><Loader size={20} /></div>
        ) : logs.length === 0 ? (
          <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>
            No activity recorded today.
          </div>
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

function SettingsPanel({ auth, onLogout }: { auth: Auth; onLogout: () => void }) {
  const [perms, setPerms] = useState<{ screen: string; accessibility: boolean } | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const [updateState, setUpdateState] = useState<{ version: string | null; percent: number | null; downloaded: boolean } | null>(null)

  useEffect(() => {
    window.electronAPI.checkPermissions().then(setPerms).catch(() => {})
    window.electronAPI.getVersion().then(setVersion).catch(() => {})
    window.electronAPI.getUpdateState().then(setUpdateState).catch(() => {})
  }, [])

  async function checkPerms() {
    const p = await window.electronAPI.checkPermissions()
    setPerms(p)
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>Settings</div>

      {/* User info */}
      <div style={{ ...card() }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.textMuted, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Account</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: `linear-gradient(135deg, ${C.accent}, #8b5cf6)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 18, fontWeight: 700,
          }}>
            {(auth.username[0] ?? '?').toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{auth.username}</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>{auth.role}</div>
          </div>
          <button
            onClick={onLogout}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', ...neu(), border: 'none', cursor: 'pointer',
              color: C.danger, fontWeight: 600, fontSize: 13,
            }}
          >
            <LogOut size={15} /> Log Out
          </button>
        </div>
      </div>

      {/* Permissions */}
      <div style={{ ...card() }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Permissions</div>
          <button onClick={checkPerms} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer' }}>
            <RefreshCw size={13} />
          </button>
        </div>
        {!perms ? (
          <div style={{ color: C.textMuted, fontSize: 12 }}>Checking permissions…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PermRow
              label="Screen Recording"
              granted={perms.screen === 'granted'}
              onFix={() => window.electronAPI.openScreenRecordingSettings()}
            />
            <PermRow
              label="Accessibility"
              granted={perms.accessibility}
              onFix={() => window.electronAPI.openAccessibilitySettings()}
            />
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
            <button
              onClick={() => window.electronAPI.installUpdate()}
              style={{ padding: '8px 14px', ...neu(), border: 'none', color: C.success, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
            >
              Restart to Update v{updateState.version}
            </button>
          ) : updateState?.version ? (
            <div style={{ fontSize: 12, color: C.accent }}>
              Downloading v{updateState.version}… {updateState.percent ?? 0}%
            </div>
          ) : (
            <button
              onClick={() => window.electronAPI.checkForUpdates()}
              style={{ padding: '8px 14px', ...neu(), border: 'none', color: C.textMuted, fontSize: 12, cursor: 'pointer' }}
            >
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
        <button
          onClick={onFix}
          style={{ fontSize: 11, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
        >
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
  const apiConfig = useApiConfig()

  useEffect(() => {
    const unsub = window.electronAPI.onOnlineState((state) => setIsOnline(state.isOnline))
    return unsub
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.contentBg }}>
      {/* Sidebar */}
      <Sidebar tab={tab} setTab={setTab} auth={auth} onLogout={onLogout} isOnline={isOnline} />

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Offline banner */}
        {!isOnline && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
            background: '#fef3c7', borderBottom: `1px solid #fcd34d`,
            padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
          }}>
            <WifiOff size={14} color={C.warning} />
            <span style={{ color: '#92400e', fontWeight: 500 }}>
              Server unreachable — changes will sync when reconnected
            </span>
          </div>
        )}

        {tab === 'home' && (
          <div style={{ height: '100%', paddingTop: isOnline ? 0 : 36 }}>
            <HomePanel auth={auth} />
          </div>
        )}
        {tab === 'messages' && apiConfig && (
          <div style={{ height: '100%', paddingTop: isOnline ? 0 : 36 }}>
            <MessagesPanel config={apiConfig} auth={auth} />
          </div>
        )}
        {tab === 'tasks' && apiConfig && (
          <div style={{ height: '100%', paddingTop: isOnline ? 0 : 36 }}>
            <TasksPanel config={apiConfig} auth={auth} />
          </div>
        )}
        {tab === 'activity' && apiConfig && (
          <div style={{ height: '100%', paddingTop: isOnline ? 0 : 36 }}>
            <ActivityPanel config={apiConfig} />
          </div>
        )}
        {tab === 'settings' && (
          <div style={{ height: '100%', paddingTop: isOnline ? 0 : 36 }}>
            <SettingsPanel auth={auth} onLogout={onLogout} />
          </div>
        )}
        {/* Loading state while apiConfig is fetching for data panels */}
        {(tab === 'messages' || tab === 'tasks' || tab === 'activity') && !apiConfig && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted }}>
            <Loader size={24} />
          </div>
        )}
      </div>
    </div>
  )
}
