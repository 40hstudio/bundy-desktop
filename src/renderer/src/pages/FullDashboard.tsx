import { useState, useEffect, useCallback, useRef } from 'react'
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
  Copy, Link, CornerDownRight, Image
} from 'lucide-react'

// Electron-specific CSS property for window dragging
declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Auth { userId: string; username: string; role: string }
interface ApiConfig { apiBase: string; token: string }
interface BundyStatus {
  isClockedIn: boolean; onBreak: boolean; isTracking: boolean
  elapsedMs: number; username: string; role: string
}
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
  return { ...neu(), padding: 16 }
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
      WebkitAppRegion: 'drag',
    }}>
      {/* Titlebar area for traffic lights */}
      <div style={{ height: 52, flexShrink: 0 }} />

      {/* Logo / App name */}
      <div style={{ padding: '0 20px 20px', WebkitAppRegion: 'no-drag' }}>
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
      <div style={{ flex: 1, padding: '0 8px', WebkitAppRegion: 'no-drag' }}>
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
      <div style={{ padding: '8px', borderTop: `1px solid #1e293b`, WebkitAppRegion: 'no-drag' }}>
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

const ACTION_COLORS: Record<string, string> = {
  'clock-in': '#22c55e', 'clock-out': '#ef4444',
  'break-start': '#f59e0b', 'break-end': '#6366f1',
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
  const [clockOutStep, setClockOutStep] = useState<'plan' | 'report'>('plan')
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportContent, setReportContent] = useState('')
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
    setClockOutStep(planItems.length > 0 ? 'plan' : 'report')
    setShowReportModal(true)
  }

  async function doAction(action: string) {
    if (action === 'clock-out') { openClockOutModal(); return }
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
    urgent: '#ef4444', high: '#f59e0b', medium: '#6366f1', low: '#22c55e',
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

      {/* Today's Tasks */}
      <div style={{ ...card() }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Today's Tasks</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>
            {todayTasks.length} {todayTasks.length === 1 ? 'task' : 'tasks'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loadingTasks ? (
            <div style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
              <Loader size={16} />
            </div>
          ) : todayTasks.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
              No tasks due today. Manage tasks in the Tasks tab.
            </div>
          ) : (
            todayTasks.map(task => (
              <div key={task.id} onClick={() => onOpenTask?.(task.id)} style={{
                ...neu(), padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
                cursor: 'pointer',
              }}>
                {/* Status icon */}
                <div style={{
                  color: TASK_STATUS_COLORS[task.status] ?? C.textMuted, flexShrink: 0,
                }}>
                  {TASK_STATUS_ICONS[task.status] ?? <Circle size={13} />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, color: C.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {task.parentTaskId && <CornerDownRight size={10} color={C.textMuted} style={{ flexShrink: 0 }} />}
                    {task.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    {task.project && (
                      <span style={{
                        fontSize: 10, color: task.project.color || C.textMuted,
                        background: (task.project.color || C.accent) + '18',
                        padding: '1px 6px', borderRadius: 4,
                      }}>
                        {task.project.name}
                      </span>
                    )}
                    <span style={{
                      fontSize: 10,
                      color: PRIORITY_COLORS[task.priority] ?? C.textMuted,
                      fontWeight: 600, textTransform: 'uppercase',
                    }}>
                      {task.priority}
                    </span>
                  </div>
                </div>

                {/* Mark done button */}
                <button
                  onClick={() => markTaskDone(task.id)}
                  title="Mark as done"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: C.success, padding: 2, flexShrink: 0,
                  }}
                >
                  <Check size={15} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Clock-out Report Modal */}
      {showReportModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
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
                {clockOutStep === 'plan' ? '📋 Confirm Plan Status' : '🔴 Clock Out Report'}
              </span>
              <button
                onClick={() => { setShowReportModal(false); setShowPreview(false) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4 }}
              ><X size={16} /></button>
            </div>

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
                      <div key={item.id} style={{ ...neu(true), padding: 12, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                  <button onClick={() => { setShowReportModal(false); setShowPreview(false) }}
                    style={{ flex: 1, ...neu(), padding: '10px', border: 'none', cursor: 'pointer', fontSize: 13, color: C.textMuted }}>
                    Cancel
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
                <div style={{ ...neu(true), display: 'flex', borderRadius: 10, padding: 3, gap: 3 }}>
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
                      width: '100%', borderRadius: 10, padding: 12, fontSize: 13, fontFamily: 'SF Mono, Menlo, monospace',
                      ...neu(true), border: 'none', outline: 'none', color: C.text,
                      resize: 'none', boxSizing: 'border-box', lineHeight: 1.6,
                    }}
                  />
                ) : (
                  <div style={{
                    width: '100%', minHeight: 160, borderRadius: 10, padding: 12, fontSize: 13,
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
                  <button onClick={() => { planItems.length > 0 ? setClockOutStep('plan') : (setShowReportModal(false), setShowPreview(false)) }}
                    style={{ flex: 1, ...neu(), padding: '10px', border: 'none', cursor: 'pointer', fontSize: 13, color: C.textMuted }}>
                    {planItems.length > 0 ? '← Back' : 'Cancel'}
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

  // SSE for real-time messages + typing + read (with auto-reconnect)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
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
              } else if (ev === 'channel-message-edit') {
                setMessages(prev => prev.map(m =>
                  m.id === payload.messageId
                    ? { ...m, content: payload.content, editedAt: payload.editedAt }
                    : m
                ))
              } else if (ev === 'channel-message-delete') {
                setMessages(prev => prev.filter(m => m.id !== payload.messageId))
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
          <div style={{ display: 'flex', gap: 2 }}>
            <button onClick={() => { setShowSearch(!showSearch); if (showSearch) { setSearchQuery(''); setSearchResults([]) } }} title="Search messages"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: showSearch ? C.accent : C.textMuted, padding: 4 }}>
              <Search size={15} />
            </button>
            <button onClick={() => setShowNewConv(true)} title="New Conversation"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, padding: 4 }}>
              <Edit2 size={15} />
            </button>
          </div>
        </div>
        {showSearch && (
          <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
            <input
              value={searchQuery}
              onChange={e => handleSearchInput(e.target.value)}
              placeholder="Search messages…"
              autoFocus
              style={{
                width: '100%', padding: '6px 10px', fontSize: 12,
                border: `1px solid ${C.border}`, borderRadius: 8,
                outline: 'none', background: '#fff', color: C.text,
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
                    borderBottom: `1px solid ${C.border}`,
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
            </>
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
              const isEditing = editingMsgId === msg.id
              const isHovered = hoveredMsgId === msg.id
              return (
                <div key={msg.id} style={{ marginTop: showHeader ? 10 : 0 }}
                  onMouseEnter={() => setHoveredMsgId(msg.id)}
                  onMouseLeave={() => setHoveredMsgId(null)}
                >
                  {showHeader && !isMe && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Avatar url={msg.sender.avatarUrl} name={senderName} size={24} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>{senderName}</span>
                      <span style={{ fontSize: 10, color: C.textMuted }}>{formatTime(msg.createdAt)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', paddingLeft: isMe ? 0 : 32, position: 'relative' }}>
                    <div style={{ maxWidth: '72%' }}>
                      {isEditing ? (
                        <div style={{
                          padding: '6px 10px', borderRadius: 12,
                          background: '#fff', border: `2px solid ${C.accent}`,
                        }}>
                          <textarea
                            value={editingContent}
                            onChange={e => setEditingContent(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditMessage() }
                              if (e.key === 'Escape') { setEditingMsgId(null); setEditingContent('') }
                            }}
                            autoFocus
                            style={{
                              width: '100%', minHeight: 36, fontSize: 13, color: C.text,
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
                    {/* Hover action buttons */}
                    {isHovered && !isEditing && isMe && (
                      <div style={{
                        position: 'absolute', top: -6, [isMe ? 'left' : 'right']: isMe ? undefined : -60,
                        ...(isMe ? { right: 'calc(72% + 4px)' } : {}),
                        display: 'flex', gap: 2, background: C.contentBg,
                        borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                        border: `1px solid ${C.border}`, padding: 2,
                      }}>
                        {!isAttachment && (
                          <button onClick={() => { setEditingMsgId(msg.id); setEditingContent(msg.content) }}
                            title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', color: C.textMuted, borderRadius: 4 }}>
                            <Edit2 size={12} />
                          </button>
                        )}
                        <button onClick={() => handleDeleteMessage(msg.id)}
                          title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', color: C.danger, borderRadius: 4 }}>
                          <Trash2 size={12} />
                        </button>
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
              ...neu(),
              padding: '4px 8px', borderRadius: 6, border: 'none',
              background: 'transparent', color: C.textMuted, cursor: 'pointer',
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
  const iceRestartTimer = useRef<NodeJS.Timeout | null>(null)

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
    return () => { ctrl.abort(); cleanup(false); if (timeout) clearTimeout(timeout); if (durationTimer.current) clearInterval(durationTimer.current); if (iceRestartTimer.current) clearTimeout(iceRestartTimer.current) }
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
  const iceRestartTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())

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
  todo: 'To Do', 'in-progress': 'In Progress', review: 'Review', done: 'Done', blocked: 'Blocked'
}
const TASK_STATUS_COLORS: Record<string, string> = {
  todo: C.textMuted, 'in-progress': C.accent, review: '#8b5cf6', done: C.success, blocked: C.danger
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
  urgent: '#ef4444', high: '#f59e0b', medium: '#6366f1', low: '#22c55e', none: '#9ca3af'
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

  useEffect(() => { load() }, [load])

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
        padding: '10px 20px', borderBottom: `1px solid ${C.border}`,
        background: C.contentBg, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap',
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
              background: C.contentBg, borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
              border: `1px solid ${C.border}`, minWidth: 200, padding: 6, maxHeight: 300, overflow: 'auto',
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
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 4 }}>
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

        <div style={{ width: 1, height: 20, background: C.border }} />

        {/* Status filters */}
        {(['all', 'mine', 'todo', 'in-progress', 'overdue'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '4px 10px', borderRadius: 16, border: 'none',
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
        <div style={{ display: 'flex', background: C.cardBg, borderRadius: 8, padding: 2 }}>
          <button onClick={() => setViewMode('list')} style={{
            padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: viewMode === 'list' ? C.contentBg : 'transparent',
            color: viewMode === 'list' ? C.accent : C.textMuted,
            boxShadow: viewMode === 'list' ? '1px 1px 3px #a3b1c6, -1px -1px 3px #ffffff' : 'none',
          }}>
            <LayoutList size={14} />
          </button>
          <button onClick={() => setViewMode('board')} style={{
            padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: viewMode === 'board' ? C.contentBg : 'transparent',
            color: viewMode === 'board' ? C.accent : C.textMuted,
            boxShadow: viewMode === 'board' ? '1px 1px 3px #a3b1c6, -1px -1px 3px #ffffff' : 'none',
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
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.accent, background: C.accentLight, borderRadius: 10, padding: '1px 6px' }}>
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
                      border: `2px ${isOver ? 'solid' : 'dashed'} ${isOver ? C.accent : C.border}`,
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
        borderRadius: 10, padding: canDropSection ? 4 : 0,
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tasks.map(task => (
            <TaskListRow
              key={task.id} task={task} auth={auth} onOpen={() => onOpen(task.id)}
              draggable={canDropSection}
              onDragStart={() => onDragStartTask?.(task.id)}
              onDragEnd={() => onDragEndTask?.()}
              isDragging={draggingId === task.id}
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

function TaskListRow({ task, auth: _auth, onOpen, draggable: canDrag, onDragStart, onDragEnd, isDragging }: {
  task: Task; auth: Auth; onOpen: () => void
  draggable?: boolean; onDragStart?: () => void; onDragEnd?: () => void; isDragging?: boolean
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
        ...neu(), padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 12, cursor: canDrag ? 'grab' : 'pointer',
        opacity: isDragging ? 0.4 : isDone ? 0.6 : 1,
        borderLeft: `3px solid ${PRIORITY_COLORS[task.priority] ?? C.border}`,
        transition: 'opacity 0.15s',
      }}
    >
      {/* Status dot */}
      <span style={{
        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
        background: TASK_STATUS_COLORS[task.status] ?? C.textMuted,
      }} />

      {/* Title */}
      <span style={{
        flex: 1, fontSize: 13, fontWeight: 500, color: C.text, minWidth: 0,
        textDecoration: isDone ? 'line-through' : 'none',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {task.title}
      </span>

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

      {/* Status badge */}
      <span style={{
        fontSize: 10, fontWeight: 600, color: TASK_STATUS_COLORS[task.status] ?? C.textMuted,
        background: (TASK_STATUS_COLORS[task.status] ?? C.textMuted) + '18',
        borderRadius: 10, padding: '2px 8px', flexShrink: 0,
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
        background: C.contentBg, borderLeft: `1px solid ${C.border}`,
        boxShadow: '-8px 0 30px rgba(0,0,0,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
      }}>
        <Loader size={24} color={C.accent} />
      </div>
    )
  }

  if (!detail) return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: '50%', minWidth: 400,
      background: C.contentBg, borderLeft: `1px solid ${C.border}`,
      boxShadow: '-8px 0 30px rgba(0,0,0,0.12)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, gap: 12,
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
      background: C.contentBg, borderLeft: `1px solid ${C.border}`,
      boxShadow: '-8px 0 30px rgba(0,0,0,0.12)',
      display: 'flex', flexDirection: 'column', zIndex: 10,
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0 }}>
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
          padding: '10px 16px', background: '#fef2f2', borderBottom: `1px solid ${C.danger}33`,
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: C.danger, flex: 1 }}>Delete this task permanently?</span>
          <button onClick={deleteTask} disabled={deleting} style={{
            padding: '4px 12px', borderRadius: 6, border: 'none', background: C.danger, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: deleting ? 0.5 : 1
          }}>{deleting ? 'Deleting…' : 'Delete'}</button>
          <button onClick={() => setConfirmDelete(false)} style={{
            padding: '4px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.contentBg, color: C.textMuted, fontSize: 12, cursor: 'pointer'
          }}>Cancel</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
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
                      background: detail.status === s ? TASK_STATUS_COLORS[s] : C.contentBg,
                      color: detail.status === s ? '#fff' : C.textMuted,
                      boxShadow: detail.status === s ? `0 2px 6px ${TASK_STATUS_COLORS[s]}44` : '2px 2px 4px #a3b1c6, -2px -2px 4px #ffffff',
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
                      background: detail.priority === p ? PRIORITY_COLORS[p] : C.contentBg,
                      color: detail.priority === p ? '#fff' : C.textMuted,
                      boxShadow: detail.priority === p ? `0 2px 6px ${PRIORITY_COLORS[p]}44` : '2px 2px 4px #a3b1c6, -2px -2px 4px #ffffff',
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
                      padding: '4px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.contentBg, color: C.textMuted, fontSize: 11, cursor: 'pointer'
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
                  style={{ fontSize: 13, color: C.text, lineHeight: 1.6, cursor: 'pointer', minHeight: 40, padding: '8px 10px', ...neu(true), borderRadius: 10 }}
                  dangerouslySetInnerHTML={{ __html: linkifyText(detail.description) }}
                />
              ) : (
                <div onClick={() => setEditingDesc(true)}
                  style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, whiteSpace: 'pre-wrap', cursor: 'pointer', minHeight: 40, padding: '8px 10px', ...neu(true), borderRadius: 10 }}>
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
                    display: 'flex', alignItems: 'center', gap: 5, ...neu(), padding: '4px 8px', borderRadius: 16,
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
                          border: `2px solid ${subDone ? C.success : C.border}`,
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
                      <div style={{ marginLeft: 38, marginTop: 6, borderLeft: `2px solid ${C.border}`, paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
      background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      WebkitAppRegion: 'no-drag',
    } as React.CSSProperties} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 480, maxHeight: '85vh', overflow: 'auto',
        background: C.contentBg, borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: 24,
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
            padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.contentBg, color: C.textMuted, fontSize: 13, cursor: 'pointer'
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
      background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      WebkitAppRegion: 'no-drag',
    } as React.CSSProperties} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 400, background: C.contentBg, borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: 24,
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
            padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.contentBg, color: C.textMuted, fontSize: 13, cursor: 'pointer'
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
      background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      WebkitAppRegion: 'no-drag',
    } as React.CSSProperties} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 400, background: C.contentBg, borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Edit Project</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}><X size={18} /></button>
        </div>

        {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        {confirmDelete ? (
          <div style={{ padding: 16, background: '#fef2f2', borderRadius: 10, textAlign: 'center' }}>
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
                padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.contentBg, color: C.textMuted, fontSize: 12, cursor: 'pointer',
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
                padding: '8px 16px', borderRadius: 8, border: 'none', background: '#fef2f2', color: C.danger, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}><Trash2 size={13} /> Delete</button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onClose} style={{
                  padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.contentBg, color: C.textMuted, fontSize: 13, cursor: 'pointer'
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
      background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      WebkitAppRegion: 'no-drag',
    } as React.CSSProperties} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 420, maxHeight: '80vh', background: C.contentBg, borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: 24, display: 'flex', flexDirection: 'column',
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

  useEffect(() => { loadData() }, [loadData])

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
      if (log.action === 'CHECK_IN' || log.action === 'BACK') { lastIn = t; lastBreak = null }
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
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px',
            cursor: 'pointer', color: C.text, display: 'flex', alignItems: 'center',
          }}>
            <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <input
            type="date" value={selectedDate} max={todayStr}
            onChange={e => setSelectedDate(e.target.value)}
            style={{
              background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px',
              fontSize: 13, fontWeight: 600, color: C.text, outline: 'none',
            }}
          />
          <button onClick={() => changeDate(1)} disabled={isToday} style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px',
            cursor: isToday ? 'default' : 'pointer', color: isToday ? C.border : C.text,
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
            <div style={{ ...card(), textAlign: 'center', padding: '12px 8px' }}>
              <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Work Time</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.success, fontVariantNumeric: 'tabular-nums' }}>{formatMs(workMs)}</div>
            </div>
            <div style={{ ...card(), textAlign: 'center', padding: '12px 8px' }}>
              <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Break Time</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.warning, fontVariantNumeric: 'tabular-nums' }}>{formatMs(breakMs)}</div>
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
                          background: '#f1f5f9', border: '1px dashed #cbd5e1',
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
                      border: `1px solid ${C.border}`, background: C.cardBg,
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

          {/* Top Apps */}
          {data.topApps.length > 0 && (
            <div style={{ ...card() }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>Top Apps</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.topApps.map((app, i) => {
                  const pct = Math.round((app.seconds / data.topApps[0].seconds) * 100)
                  return (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{app.name}</span>
                        <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{Math.round(app.seconds / 60)}m</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: '#e2e8f0', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: C.accent }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Top URLs */}
          {data.topUrls.length > 0 && (
            <div style={{ ...card() }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>Top URLs</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.topUrls.map((url, i) => {
                  const pct = Math.round((url.seconds / data.topUrls[0].seconds) * 100)
                  return (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{url.name}</span>
                        <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{Math.round(url.seconds / 60)}m</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: '#e2e8f0', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: C.success }} />
                      </div>
                    </div>
                  )
                })}
              </div>
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
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onClick={() => setManualReqForm(null)}>
          <div style={{ ...card(), width: 340, maxWidth: '90%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 16 }}>Request Manual Time</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Start Time</label>
                <input type="datetime-local" value={manualReqForm.startTime.slice(0, 16)}
                  onChange={e => setManualReqForm(f => f ? { ...f, startTime: new Date(e.target.value).toISOString() } : f)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.white, color: C.text }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>End Time</label>
                <input type="datetime-local" value={manualReqForm.endTime.slice(0, 16)}
                  onChange={e => setManualReqForm(f => f ? { ...f, endTime: new Date(e.target.value).toISOString() } : f)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.white, color: C.text }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Reason</label>
                <textarea value={manualReqForm.reason} placeholder="Why do you need this time logged?"
                  onChange={e => setManualReqForm(f => f ? { ...f, reason: e.target.value } : f)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.white, color: C.text, minHeight: 60, resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setManualReqForm(null)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${C.border}`,
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
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
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
    window.addEventListener('bundy-incoming-call', onIncoming)
    window.addEventListener('bundy-call-ice', onIce)
    window.addEventListener('bundy-call-answer', onAnswer)
    window.addEventListener('bundy-open-task', onOpenTask)
    return () => {
      window.removeEventListener('bundy-incoming-call', onIncoming)
      window.removeEventListener('bundy-call-ice', onIce)
      window.removeEventListener('bundy-call-answer', onAnswer)
      window.removeEventListener('bundy-open-task', onOpenTask)
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
          <MessagesPanel config={apiConfig} auth={auth} acceptedCall={acceptedCall} iceBufferRef={iceBufferRef} answerSdpRef={answerSdpRef} />
          </div>
        )}
        {tab === 'tasks' && apiConfig && (
          <div style={{ position: 'absolute', top: isOnline ? 0 : 36, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <TasksPanel config={apiConfig} auth={auth} pendingTaskId={pendingTaskId} onPendingTaskHandled={() => setPendingTaskId(null)} />
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
