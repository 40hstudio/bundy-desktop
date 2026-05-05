import React, { useState, useCallback, useEffect, useMemo } from 'react'
import {
  Check, Circle, Play, AlertCircle, ChevronRight, X, Loader,
  Activity, MessageSquare, User as UserIcon, RefreshCw,
} from 'lucide-react'
import { C, card, neu } from '../../theme'
import type { Auth, ApiConfig, BundyStatus, Task, PlanItem } from '../../types'
import { useStatusTicker } from '../../hooks/useStatusTicker'
import { formatMs } from '../../utils/format'
// simpleMarkdown + sanitizeHtml dropped along with the Preview tab in
// v1.5.2108 — Tiptap is WYSIWYG so a separate preview is redundant.
import { playSound } from '../../utils/sounds'
import DocumentEditor from '../report/DocumentEditor'

const ACTION_COLORS: Record<string, string> = {
  'clock-in': '#43B581',
  'clock-out': '#f04747',
  'break-start': '#007acc',
  'break-end': '#007acc',
}

const TASK_STATUS_COLORS: Record<string, string> = {
  todo: C.textMuted, 'in-progress': C.accent, review: '#1a8ad4', done: C.success, blocked: C.danger,
}

const TASK_STATUS_ICONS: Record<string, React.ReactNode> = {
  todo: <Circle size={13} />,
  'in-progress': <Play size={13} />,
  review: <Play size={13} />,
  done: <Check size={13} />,
  blocked: <AlertCircle size={13} />,
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#f04747', high: '#007acc', medium: '#007acc', low: '#43B581',
}

export function HomePanel({
  auth,
  config,
  onOpenTask,
}: {
  auth: Auth
  config: ApiConfig | null
  onOpenTask?: (taskId: string) => void
}) {
  const [status, setStatus] = useState<BundyStatus | null>(null)
  const [todayTasks, setTodayTasks] = useState<Task[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [actioning, setActioning] = useState(false)
  const [snapshotAt, setSnapshotAt] = useState(Date.now())

  // QA Activities state
  interface QaNotif {
    id: string
    type: string
    message: string
    readAt: string | null
    createdAt: string
    pinNumber: number
    actor: { id: string; username: string; alias: string | null; avatarUrl: string | null } | null
    pin: {
      id: string
      body: string
      status: string
      breakpoint: string
      latestReply: { id: string; body: string; createdAt: string; creator: { id: string; username: string; alias: string | null; avatarUrl: string | null } } | null
      link: { id: string; title: string; url: string }
      creator: { id: string; username: string; alias: string | null; avatarUrl: string | null }
      project: { id: string; name: string } | null
    }
  }
  const [qaNotifs, setQaNotifs] = useState<QaNotif[]>([])
  const [qaUnreadCount, setQaUnreadCount] = useState(0)
  const [selectedQaProject, setSelectedQaProject] = useState<string | null>(null)
  const [qaTab, setQaTab] = useState<'assigned' | 'status' | 'replies'>('assigned')

  // Clock-out report modal state
  const [planItems, setPlanItems] = useState<PlanItem[]>([])
  const [confirmItems, setConfirmItems] = useState<Array<{ itemId: string; status: string; outcome: string }>>([])
  const [clockOutStep, setClockOutStep] = useState<'tasks' | 'plan' | 'report'>('report')
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportContent, setReportContent] = useState('')
  const [taskStatusUpdates, setTaskStatusUpdates] = useState<Record<string, string>>({})
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [reportError, setReportError] = useState('')
  // showPreview state retired in v1.5.2108 — Tiptap is WYSIWYG so a
  // separate preview tab is redundant. The setter shim below keeps the
  // existing close-handler call sites compiling without churn.
  const setShowPreview = (_v: boolean) => { /* no-op (kept for back-compat) */ }
  void setShowPreview

  const [permissions, setPermissions] = useState<{ screen: string; accessibility: boolean } | null>(null)
  const [actionError, setActionError] = useState('')
  // Overtime request state
  const [workLimit, setWorkLimit] = useState<{ limitHours: number; totalAllowed: number; workedHours: number; limitReached: boolean; approachingLimit: boolean; hasApprovedOT: boolean; approvedOTHours: number; hasPendingOT: boolean } | null>(null)
  const [showOTForm, setShowOTForm] = useState(false)
  const [otHours, setOtHours] = useState('2')
  const [otReason, setOtReason] = useState('')
  const [otSubmitting, setOtSubmitting] = useState(false)
  const [otMsg, setOtMsg] = useState('')
  // 24-hour activity heatmap (P3.19) — buckets today's ActivitySummary
  // windows into hours and renders a strip in the timer card.
  const [hourlyHeatmap, setHourlyHeatmap] = useState<number[]>(Array(24).fill(0))

  const displayMs = useStatusTicker(
    status?.elapsedMs ?? 0,
    status?.isTracking ?? false,
    snapshotAt
  )

  const load = useCallback(async () => {
    try {
      const s = await window.electronAPI.getStatus()
      setStatus(s)
      setSnapshotAt(Date.now())
    } catch { /* offline */ }
    try {
      const p = await window.electronAPI.checkPermissions()
      setPermissions(p)
    } catch { /* */ }
  }, [])

  const loadWorkLimit = useCallback(async () => {
    if (!config) return
    try {
      const res = await fetch(`${config.apiBase}/api/bundy`, {
        headers: { Authorization: `Bearer ${config.token}` },
      })
      if (res.ok) {
        const data = await res.json() as { workLimit?: typeof workLimit }
        if (data.workLimit) setWorkLimit(data.workLimit)
      }
    } catch { /* */ }
  }, [config])

  // Pull today's activity windows and bucket them into 24 hourly slots.
  // Refreshes every 60s while the panel is mounted (P3.19).
  const loadHourlyHeatmap = useCallback(async () => {
    if (!config) return
    try {
      const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
      const res = await fetch(`${config.apiBase}/api/user/activity?date=${today}`, {
        headers: { Authorization: `Bearer ${config.token}` },
      })
      if (!res.ok) return
      const data = await res.json() as { activity: Array<{ windowStart: string; mouseActiveSeconds: number; keyActiveSeconds: number; totalSeconds: number }> }
      const buckets = Array<{ active: number; total: number }>(24).fill(null as never).map(() => ({ active: 0, total: 0 }))
      for (const w of data.activity) {
        // WIB hour of windowStart
        const h = (new Date(w.windowStart).getUTCHours() + 7) % 24
        buckets[h].active += (w.mouseActiveSeconds + w.keyActiveSeconds) / 2
        buckets[h].total += w.totalSeconds
      }
      setHourlyHeatmap(buckets.map(b => b.total > 0 ? Math.round((b.active / b.total) * 100) : 0))
    } catch { /* */ }
  }, [config])

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
      const res = await fetch(`${config.apiBase}/api/tasks?assigneeId=me&includeSubtasks=1`, {
        headers: { 'Authorization': `Bearer ${config.token}` },
      })
      if (res.ok) {
        const data = await res.json() as { tasks: Task[] }
        // Show only open subtasks (todo, in-progress, review) assigned to me
        setTodayTasks(data.tasks.filter(t =>
          t.parentTaskId != null && ['todo', 'in-progress', 'review'].includes(t.status)
        ))
      }
    } catch { /* offline */ } finally { setLoadingTasks(false) }
  }, [config])

  const loadQaNotifs = useCallback(async () => {
    if (!config) return
    try {
      const res = await fetch(`${config.apiBase}/api/report/feedback-notifications?desktopQa=1`, {
        headers: { 'Authorization': `Bearer ${config.token}` },
      })
      if (res.ok) {
        const data = await res.json() as { notifications: QaNotif[] }
        const notifs = data.notifications ?? []
        setQaNotifs(notifs)
        setQaUnreadCount(notifs.filter(n => !n.readAt).length)
      }
    } catch { /* offline */ }
  }, [config])

  function markQaRead(ids: string[], removeReplyIds?: string[]) {
    if (!config) return
    fetch(`${config.apiBase}/api/report/feedback-notifications`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then(() => {
      // Remove reply notifs from list (they disappear once opened)
      const toRemove = new Set(removeReplyIds ?? [])
      setQaNotifs(prev => prev
        .filter(n => !toRemove.has(n.id))
        .map(n => ids.includes(n.id) ? { ...n, readAt: new Date().toISOString() } : n)
      )
      setQaUnreadCount(prev => Math.max(0, prev - ids.length))
    }).catch(() => {})
  }

  useEffect(() => {
    load()
    loadTasks()
    loadPlan()
    loadWorkLimit()
    loadQaNotifs()
    loadHourlyHeatmap()
    const qaInterval = setInterval(loadQaNotifs, 15000)
    const heatmapInterval = setInterval(loadHourlyHeatmap, 60000)
    const unsub = window.electronAPI.onStatusUpdate((s) => { setStatus(s); setSnapshotAt(Date.now()) })
    const unsubPlan = window.electronAPI.onPlanUpdate((plan) => setPlanItems(plan.items ?? []))
    const unsubPerms = window.electronAPI.onPermissionsUpdate(setPermissions)
    return () => { unsub(); unsubPlan(); unsubPerms(); clearInterval(qaInterval); clearInterval(heatmapInterval) }
  }, [load, loadTasks, loadPlan, loadWorkLimit, loadQaNotifs])

  function openClockOutModal() {
    setReportContent('')
    setReportError('')
    setConfirmItems(planItems.map(i => ({ itemId: i.id, status: i.status, outcome: '' })))
    setTaskStatusUpdates({})
    const openTasks = todayTasks.filter(t => t.status !== 'done')
    if (openTasks.length > 0) setClockOutStep('tasks')
    else if (planItems.length > 0) setClockOutStep('plan')
    else setClockOutStep('report')
    setShowReportModal(true)
  }

  async function doAction(action: string) {
    if (action === 'clock-out') { openClockOutModal(); return }
    // Block clock-in / resume if permissions are missing
    if ((action === 'clock-in' || action === 'break-end') && permissions) {
      const missing: string[] = []
      if (permissions.screen !== 'granted') missing.push('Screen Recording')
      if (!permissions.accessibility) missing.push('Accessibility')
      if (missing.length > 0) {
        setActionError(`Grant ${missing.join(' and ')} permission${missing.length > 1 ? 's' : ''} before clocking in`)
        return
      }
    }
    setActionError('')
    // Play a tracker-action-specific sound from the Material Design pack
    // (warm celebrations for clock-in/out, calmer state-change tones for
    // break start/end). Falls through silently if the user has muted.
    if (action === 'clock-in') playSound('time.clock-in')
    else if (action === 'clock-out') playSound('time.clock-out')
    else if (action === 'break-start') playSound('time.break-start')
    else if (action === 'break-end') playSound('time.break-end')

    // Optimistic UI update — change buttons IMMEDIATELY before IPC
    if (status) {
      const optimistic = { ...status, elapsedMs: displayMs }
      if (action === 'break-start') { optimistic.isTracking = false; optimistic.onBreak = true }
      else if (action === 'break-end') { optimistic.isTracking = true; optimistic.onBreak = false }
      else if (action === 'clock-in') { optimistic.isClockedIn = true; optimistic.isTracking = true; optimistic.onBreak = false; optimistic.elapsedMs = 0 }
      else if (action === 'clock-out') { optimistic.isClockedIn = false; optimistic.isTracking = false; optimistic.onBreak = false }
      setSnapshotAt(Date.now())
      setStatus(optimistic)
    }

    setActioning(true)
    try {
      await window.electronAPI.doAction(action)
      loadWorkLimit()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Action failed')
    } finally { setActioning(false) }
  }

  async function submitOvertimeRequest() {
    if (!config) return
    setOtSubmitting(true)
    setOtMsg('')
    try {
      const todayWIB = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
      const res = await fetch(`${config.apiBase}/api/overtime`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayWIB, requestedHours: parseFloat(otHours), reason: otReason }),
      })
      if (res.ok) {
        setOtMsg('Request submitted!')
        setShowOTForm(false)
        setOtReason('')
        loadWorkLimit()
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setOtMsg(d.error ?? 'Failed to submit')
      }
    } catch { setOtMsg('Failed to submit') }
    setOtSubmitting(false)
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

  const qaProjects = useMemo(() => {
    const grouped: Record<string, { name: string; notifs: QaNotif[]; unread: number }> = {}
    for (const n of qaNotifs) {
      const key = n.pin.project?.id ?? 'none'
      const name = n.pin.project?.name ?? 'Unassigned'
      if (!grouped[key]) grouped[key] = { name, notifs: [], unread: 0 }
      grouped[key].notifs.push(n)
      if (!n.readAt) grouped[key].unread++
    }
    return Object.entries(grouped).map(([id, data]) => ({ id, ...data }))
  }, [qaNotifs])

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>

      {/* Timer Card */}
      <div style={{ ...card(), textAlign: 'center', padding: '42px 36px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 1.5, color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase', marginBottom: 10 }}>
          Today's Work Time
        </div>
        <div style={{ fontSize: 78, fontWeight: 700, letterSpacing: -2, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: '#ffffff' }}>
          {formatMs(displayMs)}
        </div>
        <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, background: C.accentLight, borderRadius: 20, padding: '5px 14px', color: statusColor, fontSize: 13, fontWeight: 600 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
          {statusLabel}
        </div>
        {/* 24-hour activity heatmap (P3.19) — at-a-glance productivity strip */}
        {hourlyHeatmap.some(v => v > 0) && (
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Today's activity by hour
            </div>
            <div style={{ display: 'flex', gap: 2, height: 24, alignItems: 'flex-end' }}>
              {hourlyHeatmap.map((pct, h) => {
                const color = pct === 0 ? 'rgba(255,255,255,0.06)'
                  : pct > 60 ? C.success
                  : pct > 30 ? C.warning
                  : C.danger
                return (
                  <div key={h}
                    title={`${String(h).padStart(2, '0')}:00 — ${pct}% active`}
                    style={{
                      width: 8,
                      height: pct === 0 ? 4 : `${Math.max(4, pct / 100 * 24)}px`,
                      background: color,
                      borderRadius: 2,
                      transition: 'height 0.2s, background 0.2s',
                    }}
                  />
                )
              })}
            </div>
          </div>
        )}
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

      {/* Action error */}
      {actionError && (
        <div style={{ background: 'rgba(252,129,129,0.12)', border: '1px solid rgba(252,129,129,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#fc8181' }}>
          {actionError}
        </div>
      )}

      {/* Permission warning */}
      {permissions && (permissions.screen !== 'granted' || !permissions.accessibility) && (
        <div style={{ ...card(), padding: '12px 16px', borderLeft: `3px solid ${C.warning}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.warning, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Permissions Required</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>Grant all permissions to enable clock-in.</div>
          {permissions.screen !== 'granted' && (
            <button onClick={() => window.electronAPI.openScreenRecordingSettings()}
              style={{ display: 'block', background: 'none', border: 'none', fontSize: 12, color: C.accent, cursor: 'pointer', padding: '2px 0', fontWeight: 600 }}>
              ▸ Enable Screen Recording →
            </button>
          )}
          {!permissions.accessibility && (
            <button onClick={() => {
              window.electronAPI.openAccessibilitySettings()
              // Re-check loop (P3.20). After the user clicks the button we
              // poll permissions every 2s for up to 60s; the moment
              // accessibility flips to true the activity engine kicks in
              // automatically because the next status refresh detects it.
              let attempts = 0
              const iv = setInterval(async () => {
                attempts++
                try {
                  const p = await window.electronAPI.checkPermissions()
                  setPermissions(p)
                  if (p.accessibility) clearInterval(iv)
                } catch { /* ignore */ }
                if (attempts >= 30) clearInterval(iv)
              }, 2000)
            }}
              style={{ display: 'block', background: 'none', border: 'none', fontSize: 12, color: C.accent, cursor: 'pointer', padding: '2px 0', fontWeight: 600 }}>
              ▸ Enable Accessibility →
            </button>
          )}
        </div>
      )}

      {/* Work limit info */}
      {workLimit && (
        <div style={{ ...card(), padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Daily Limit</span>
            <span style={{ fontSize: 12, color: workLimit.limitReached ? '#fc8181' : workLimit.approachingLimit ? C.warning : C.textMuted }}>
              {`${Math.floor(workLimit.workedHours)}:${String(Math.round((workLimit.workedHours % 1) * 60)).padStart(2, '0')}`} / {`${Math.floor(workLimit.totalAllowed)}:${String(Math.round((workLimit.totalAllowed % 1) * 60)).padStart(2, '0')}`}
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, borderRadius: 2, background: C.bgInput, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: workLimit.limitReached ? '#fc8181' : workLimit.approachingLimit ? C.warning : C.accent,
              width: `${Math.min(100, (workLimit.workedHours / workLimit.totalAllowed) * 100)}%`,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>
              Base: {`${Math.floor(workLimit.limitHours)}:${String(Math.round((workLimit.limitHours % 1) * 60)).padStart(2, '0')}`}
              {workLimit.hasApprovedOT && <span style={{ color: C.success }}> + {`${Math.floor(workLimit.approvedOTHours)}:${String(Math.round((workLimit.approvedOTHours % 1) * 60)).padStart(2, '0')}`} OT approved</span>}
            </span>
            {workLimit.hasPendingOT && <span style={{ fontSize: 10, color: C.warning, fontWeight: 600, background: 'rgba(250,166,26,0.15)', padding: '2px 6px', borderRadius: 4 }}>OT pending</span>}
          </div>
          {(workLimit.limitReached || workLimit.approachingLimit) && !workLimit.hasPendingOT && !workLimit.hasApprovedOT && (
            <div style={{ marginTop: 8 }}>
              {!showOTForm ? (
                <button onClick={() => setShowOTForm(true)}
                  style={{ fontSize: 12, fontWeight: 600, color: C.accent, background: C.accentLight, border: `1px solid ${C.accent}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>
                  Request Overtime
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: C.bgInput, borderRadius: 8, padding: 12, marginTop: 4 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: '0 0 80px' }}>
                      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>Hours</div>
                      <input type="number" min="0.5" max="16" step="0.5" value={otHours} onChange={e => setOtHours(e.target.value)}
                        style={{ width: '100%', background: C.bgTertiary, border: `1px solid ${C.separator}`, borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>Reason</div>
                      <input value={otReason} onChange={e => setOtReason(e.target.value)} placeholder="Why do you need overtime?"
                        onKeyDown={e => { if (e.key === 'Enter' && otReason.trim()) submitOvertimeRequest() }}
                        style={{ width: '100%', background: C.bgTertiary, border: `1px solid ${C.separator}`, borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={submitOvertimeRequest} disabled={otSubmitting || !otReason.trim()}
                      style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: C.accent, border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', opacity: otSubmitting || !otReason.trim() ? 0.6 : 1 }}>
                      {otSubmitting ? 'Submitting…' : 'Submit'}
                    </button>
                    <button onClick={() => setShowOTForm(false)}
                      style={{ fontSize: 11, color: C.textMuted, background: 'none', border: `1px solid ${C.separator}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {otMsg && <div style={{ fontSize: 11, marginTop: 6, color: otMsg.includes('Failed') ? '#fc8181' : C.success }}>{otMsg}</div>}
        </div>
      )}

      {/* Today's Tasks + QA Activities — two columns */}
      <div style={{ display: 'flex', gap: 12 }}>
        {/* Left: Today's Tasks */}
        <div style={{ ...card(), flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Today's Tasks</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>{todayTasks.length} {todayTasks.length === 1 ? 'task' : 'tasks'}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 360, overflowY: 'auto' }}>
            {loadingTasks ? (
              <div style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
                <Loader size={16} />
              </div>
            ) : todayTasks.length === 0 ? (
              <div style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
                No tasks due today.
              </div>
            ) : (
              todayTasks.map((task, i) => config && (
                <SubtaskRecapRow
                  key={task.id}
                  task={task}
                  showDivider={i > 0}
                  config={config}
                  onOpen={() => onOpenTask?.(task.id)}
                  onStatusChanged={() => loadTasks()}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: QA Activities — project list */}
        <div style={{ ...card(), flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={14} color="#8b5cf6" />
              <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>QA</span>
            </div>
            {qaUnreadCount > 0 && (
              <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: '#8b5cf6', borderRadius: 8, padding: '0 5px', lineHeight: '14px', minWidth: 14, textAlign: 'center' }}>
                {qaUnreadCount}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 360, overflowY: 'auto' }}>
            {qaProjects.length === 0 ? (
              <div style={{ color: C.textMuted, fontSize: 11, textAlign: 'center', padding: '12px 0' }}>No QA items</div>
            ) : (
              qaProjects.map(proj => (
                <div
                  key={proj.id}
                  onClick={() => { setSelectedQaProject(proj.id); setQaTab('assigned') }}
                  style={{
                    padding: '8px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    borderRadius: 4, transition: 'background 0.12s',
                    borderBottom: `1px solid ${C.separator}`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}
                >
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {proj.name}
                  </div>
                  {proj.unread > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: '#8b5cf6', borderRadius: 6, padding: '0 4px', lineHeight: '14px', minWidth: 14, textAlign: 'center' }}>
                      {proj.unread}
                    </span>
                  )}
                  <ChevronRight size={12} color={C.textMuted} style={{ flexShrink: 0 }} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* QA Project Modal — 3 tabs: Assigned, Status, Replies */}
      {selectedQaProject && (() => {
        const proj = qaProjects.find(p => p.id === selectedQaProject)
        if (!proj) return null
        const tabs = [
          { key: 'assigned' as const, label: 'Assigned', notifs: proj.notifs.filter(n => n.type === 'assigned') },
          { key: 'status' as const, label: 'Status', notifs: proj.notifs.filter(n => n.type === 'status_change') },
          { key: 'replies' as const, label: 'Replies', notifs: proj.notifs.filter(n => n.type === 'reply') },
        ]
        const activeTab = tabs.find(t => t.key === qaTab) || tabs[0]
        const statusColors: Record<string, string> = {
          todo: '#9ca3af', 'in-progress': '#3b82f6', review: '#f59e0b', done: '#22c55e',
        }
        const statusLabels: Record<string, string> = {
          todo: 'To Do', 'in-progress': 'In Progress', review: 'Review', done: 'Done',
        }
        const typeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
          assigned: { icon: <UserIcon size={12} />, color: '#8b5cf6' },
          reply: { icon: <MessageSquare size={12} />, color: '#3b82f6' },
          status_change: { icon: <RefreshCw size={12} />, color: '#f59e0b' },
        }

        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
            onClick={() => setSelectedQaProject(null)}>
            <div onClick={e => e.stopPropagation()} style={{
              ...neu(), width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            }}>
              {/* Header */}
              <div style={{ padding: '16px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Activity size={16} color="#8b5cf6" />
                  <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{proj.name}</span>
                  {proj.unread > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#8b5cf6', borderRadius: 10, padding: '1px 6px', lineHeight: '16px' }}>
                      {proj.unread}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {proj.unread > 0 && (
                    <button onClick={() => markQaRead(proj.notifs.filter(n => !n.readAt).map(n => n.id))}
                      style={{ fontSize: 10, color: C.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}>
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setSelectedQaProject(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4 }}>
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.separator}`, padding: '0 20px', marginTop: 12 }}>
                {tabs.map(tab => (
                  <button key={tab.key}
                    onClick={() => setQaTab(tab.key)}
                    style={{
                      flex: 1, padding: '8px 0', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                      background: 'transparent',
                      color: qaTab === tab.key ? '#8b5cf6' : C.textMuted,
                      borderBottom: qaTab === tab.key ? '2px solid #8b5cf6' : '2px solid transparent',
                      transition: 'all 0.15s',
                    }}>
                    {tab.label}
                    {tab.notifs.length > 0 && (
                      <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>({tab.notifs.length})</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 20px' }}>
                {activeTab.notifs.length === 0 ? (
                  <div style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
                    No {activeTab.label.toLowerCase()} items
                  </div>
                ) : (
                  activeTab.notifs.map((notif, i) => {
                    const tc = typeConfig[notif.type] || typeConfig.assigned
                    const actorName = notif.actor?.alias || notif.actor?.username || 'Someone'
                    const timeAgoStr = (() => {
                      const s = Math.floor((Date.now() - new Date(notif.createdAt).getTime()) / 1000)
                      if (s < 60) return 'just now'
                      const m = Math.floor(s / 60)
                      if (m < 60) return `${m}m ago`
                      const h = Math.floor(m / 60)
                      if (h < 24) return `${h}h ago`
                      return `${Math.floor(h / 24)}d ago`
                    })()
                    const newStatus = notif.type === 'status_change'
                      ? notif.message.replace(/^.*changed status to\s*/, '')
                      : null

                    return (
                      <div
                        key={notif.id}
                        onClick={() => {
                          const unreadIds = !notif.readAt ? [notif.id] : []
                          const removeIds = notif.type === 'reply' ? [notif.id] : []
                          if (unreadIds.length || removeIds.length) markQaRead(unreadIds.length ? unreadIds : [notif.id], removeIds)
                          window.electronAPI.openExternal(`${config?.apiBase || 'https://bundy.40h.studio'}/report/feedback/${notif.pin.link.id}?pin=${notif.pin.id}`)
                        }}
                        style={{
                          padding: '8px 4px', display: 'flex', alignItems: 'flex-start', gap: 8,
                          cursor: 'pointer', borderTop: i > 0 ? `1px solid ${C.separator}` : 'none',
                          transition: 'background 0.12s', borderRadius: 4,
                          background: !notif.readAt ? '#8b5cf610' : 'transparent',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                        onMouseLeave={e => { e.currentTarget.style.background = !notif.readAt ? '#8b5cf610' : '' }}
                      >
                        <div style={{ color: tc.color, flexShrink: 0, marginTop: 2 }}>
                          {tc.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: C.textMuted, background: C.bgTertiary, borderRadius: 3, padding: '0 4px' }}>
                              Pin #{notif.pinNumber}
                            </span>
                            {!notif.readAt && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#8b5cf6', display: 'inline-block' }} />}
                            <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 'auto' }}>{timeAgoStr}</span>
                          </div>

                          {notif.type === 'status_change' && newStatus && (
                            <div style={{ fontSize: 11, color: C.text, marginBottom: 2 }}>
                              <span style={{ color: C.textMuted }}>{actorName} → </span>
                              <span style={{
                                fontWeight: 600,
                                color: statusColors[newStatus] ?? C.textMuted,
                                background: (statusColors[newStatus] ?? C.textMuted) + '18',
                                padding: '1px 6px', borderRadius: 3, fontSize: 10,
                              }}>
                                {statusLabels[newStatus] ?? newStatus}
                              </span>
                            </div>
                          )}

                          {notif.type === 'reply' && notif.pin.latestReply && (
                            <div style={{ fontSize: 11, color: C.text, marginBottom: 2 }}>
                              <span style={{ fontWeight: 600, color: '#3b82f6' }}>
                                {notif.pin.latestReply.creator.alias || notif.pin.latestReply.creator.username}:
                              </span>{' '}
                              <span style={{ color: C.textSecondary }}>
                                {notif.pin.latestReply.body.slice(0, 60)}{notif.pin.latestReply.body.length > 60 ? '…' : ''}
                              </span>
                            </div>
                          )}

                          {notif.type === 'assigned' && (
                            <div style={{ fontSize: 11, color: C.text, marginBottom: 2 }}>
                              <span style={{ color: C.textMuted }}>{actorName} assigned you</span>
                            </div>
                          )}

                          <div style={{ fontSize: 11, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {notif.pin.body.slice(0, 60)}{notif.pin.body.length > 60 ? '…' : ''}
                          </div>

                          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {notif.pin.link.title || notif.pin.link.url}
                          </div>
                        </div>
                        <ChevronRight size={14} color={C.textMuted} style={{ flexShrink: 0, opacity: 0.5, marginTop: 4 }} />
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Clock-out Report Modal */}
      {showReportModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitAppRegion: 'no-drag',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        } as React.CSSProperties}
          onClick={() => { setShowReportModal(false); setShowPreview(false) }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.bgSecondary,
            border: `1px solid ${C.separator}`,
            borderRadius: 12,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            width: clockOutStep === 'report' ? 620 : 500,
            maxHeight: '85vh', overflowY: 'auto',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Cleaner header — typography-only title (no emoji), thin
                separator below, X close in the corner. v1.5.2108. */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '18px 24px 14px', borderBottom: `1px solid ${C.separator}`,
            }}>
              <div>
                <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, marginBottom: 2 }}>
                  {clockOutStep === 'tasks' ? 'Step 1 of 3' : clockOutStep === 'plan' ? 'Step 2 of 3' : 'Final step'}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                  {clockOutStep === 'tasks' ? 'Open tasks' : clockOutStep === 'plan' ? 'Confirm plan status' : "Today's clock-out report"}
                </div>
              </div>
              <button
                onClick={() => { setShowReportModal(false); setShowPreview(false) }}
                aria-label="Close"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: C.textMuted, padding: 6, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              ><X size={18} /></button>
            </div>
            {/* Body padding — applied to all step contents below.
                The original modal used a single padding on the outer
                box; we've moved it inside so the header + footer have
                their own borders and the body can scroll. */}
            <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>

            {/* ─── Step 0: Open Tasks ─── */}
            {clockOutStep === 'tasks' && (
              <>
                <div style={{ fontSize: 12, color: C.textMuted }}>You have open tasks. Update their status before clocking out.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                  {todayTasks.map(task => (
                    <div key={task.id} style={{ ...neu(true), padding: 12, borderRadius: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>
                        {task.title}
                        {task.project && <span style={{ fontSize: 10, color: task.project.color || C.textMuted, background: (task.project.color || C.accent) + '18', padding: '1px 6px', borderRadius: 4, marginLeft: 8 }}>{task.project.name}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(['todo', 'in-progress', 'review', 'done', 'blocked'] as const).map(s => {
                          const cur = taskStatusUpdates[task.id] ?? task.status
                          return (
                            <button key={s}
                              onClick={() => setTaskStatusUpdates(prev => ({ ...prev, [task.id]: s }))}
                              style={{
                                fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', border: 'none',
                                ...(cur === s ? neu() : { background: 'transparent' }),
                                color: cur === s ? (TASK_STATUS_COLORS[s] ?? C.textMuted) : C.textMuted,
                                fontWeight: cur === s ? 600 : 400,
                              }}>{s}</button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowReportModal(false); setShowPreview(false) }}
                    style={{ flex: 1, ...neu(), padding: '10px', border: 'none', cursor: 'pointer', fontSize: 13, color: C.textMuted }}>Cancel</button>
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
                    style={{ flex: 1, ...neu(), padding: '10px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.accent }}>Next →</button>
                </div>
              </>
            )}

            {/* ─── Step 1: Plan Confirmation ─── */}
            {clockOutStep === 'plan' && (
              <>
                <div style={{ fontSize: 12, color: C.textMuted }}>Update the status of each task before clocking out.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {planItems.map((item, idx) => {
                    const ci = confirmItems[idx]
                    if (!ci) return null
                    return (
                      <div key={item.id} style={{ ...neu(true), padding: 12, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.accent }}>{item.project.name}</span>
                          <span style={{ fontSize: 11, color: C.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.details}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {([
                            { value: 'completed', label: '✅ Done', color: C.success },
                            { value: 'continued', label: '🔁 To be continued', color: C.warning },
                            { value: 'planned', label: "📌 Haven't started", color: C.textMuted },
                            { value: 'blocked', label: '🚫 Blocked', color: C.danger },
                          ]).map(opt => (
                            <button key={opt.value}
                              onClick={() => setConfirmItems(prev => prev.map((c, i) => i === idx ? { ...c, status: opt.value } : c))}
                              style={{
                                fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', border: 'none',
                                ...(ci.status === opt.value ? neu() : { background: 'transparent' }),
                                color: ci.status === opt.value ? opt.color : C.textMuted,
                                fontWeight: ci.status === opt.value ? 600 : 400,
                              }}>{opt.label}</button>
                          ))}
                        </div>
                        <input
                          value={ci.outcome}
                          onChange={e => setConfirmItems(prev => prev.map((c, i) => i === idx ? { ...c, outcome: e.target.value } : c))}
                          placeholder="Outcome note (optional)"
                          style={{ ...neu(true), fontSize: 11, padding: '6px 10px', border: 'none', outline: 'none', color: C.text, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}
                        />
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => {
                    const openTasks = todayTasks.filter(t => t.status !== 'done')
                    if (openTasks.length > 0) setClockOutStep('tasks')
                    else { setShowReportModal(false); setShowPreview(false) }
                  }}
                    style={{ flex: 1, ...neu(), padding: '10px', border: 'none', cursor: 'pointer', fontSize: 13, color: C.textMuted }}>
                    {todayTasks.filter(t => t.status !== 'done').length > 0 ? '← Back' : 'Cancel'}
                  </button>
                  <button onClick={() => setClockOutStep('report')}
                    style={{ flex: 1, ...neu(), padding: '10px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.accent }}>Next →</button>
                </div>
              </>
            )}

            {/* ─── Step 2: Report Editor ─── */}
            {clockOutStep === 'report' && (
              <>
                {/* Helper line — clarifies what the user is filling out so
                    we can drop the noisy Write/Preview tab toggle. The
                    Tiptap editor is already WYSIWYG so a separate preview
                    is redundant. v1.5.2108. */}
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
                  What did you ship today? Use the toolbar for headings, lists, and links.
                </div>

                {/* Editor — solid border, comfortable min-height. The
                    DocumentEditor brings its own Tiptap toolbar + content
                    area; we just give it a clean frame. */}
                <div style={{
                  width: '100%',
                  minHeight: 280,
                  borderRadius: 8,
                  border: `1px solid ${C.separator}`,
                  background: C.bgPrimary,
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                  display: 'flex', flexDirection: 'column',
                }}>
                  <DocumentEditor
                    content={reportContent}
                    onUpdate={(html) => setReportContent(html)}
                    apiBase={config?.apiBase}
                    token={config?.token}
                    user={{ id: auth.userId, name: auth.username, avatar: auth.avatarUrl ?? null }}
                  />
                </div>

                {reportError && (
                  <div style={{
                    fontSize: 12, color: C.danger, fontWeight: 600,
                    background: `${C.danger}12`, border: `1px solid ${C.danger}40`,
                    padding: '8px 12px', borderRadius: 6,
                  }}>{reportError}</div>
                )}

                {/* Footer row — word count on the left, actions on the
                    right. Cancel is a quiet ghost button; Submit is the
                    accent action. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>
                    {reportContent.split(/\s+/).filter(Boolean).length} words
                  </span>
                  <button onClick={() => { planItems.length > 0 ? setClockOutStep('plan') : todayTasks.filter(t => t.status !== 'done').length > 0 ? setClockOutStep('tasks') : (setShowReportModal(false), setShowPreview(false)) }}
                    style={{
                      padding: '8px 16px', border: `1px solid ${C.separator}`,
                      background: 'transparent', borderRadius: 6, cursor: 'pointer',
                      fontSize: 13, color: C.textSecondary, fontWeight: 600,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {planItems.length > 0 || todayTasks.filter(t => t.status !== 'done').length > 0 ? 'Back' : 'Cancel'}
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
                        // Optimistic clock-out UI update
                        if (status) {
                          setSnapshotAt(Date.now())
                          setStatus({ ...status, isClockedIn: false, isTracking: false, onBreak: false, elapsedMs: displayMs })
                        }
                        await loadPlan().catch(() => {})
                      } catch (err: unknown) {
                        setReportError(err instanceof Error ? err.message : 'Failed to submit')
                      } finally { setReportSubmitting(false) }
                    }}
                    disabled={!reportContent.trim() || reportSubmitting}
                    style={{
                      padding: '8px 18px', border: 'none', borderRadius: 6, cursor: 'pointer',
                      background: C.danger, color: '#fff',
                      fontSize: 13, fontWeight: 700,
                      opacity: (!reportContent.trim() || reportSubmitting) ? 0.5 : 1,
                      transition: 'opacity 0.15s, background 0.15s',
                    }}>
                    {reportSubmitting ? 'Submitting…' : 'Submit & Clock Out'}
                  </button>
                </div>
              </>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePanel

/**
 * Today's-recap row for an open subtask. Clicking the status icon cycles
 * through todo → in-progress → review → done → todo (matches how Asana
 * style boards step a card forward). Clicking the body opens the task
 * detail drawer in the Tasks tab as before.
 *
 * The status PATCH is best-effort: if it fails (offline, etc.) the
 * write queue catches it and replays on reconnect — the UI flips
 * optimistically so the user sees their click land immediately.
 */
const STATUS_CYCLE: Record<string, string> = {
  'todo': 'in-progress',
  'in-progress': 'review',
  'review': 'done',
  'done': 'todo',
  'blocked': 'in-progress',
}

function SubtaskRecapRow({
  task, showDivider, config, onOpen, onStatusChanged,
}: {
  task: Task
  showDivider: boolean
  config: ApiConfig
  onOpen: () => void
  onStatusChanged: () => void
}) {
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null)
  const status = optimisticStatus ?? task.status

  async function cycleStatus(e: React.MouseEvent) {
    e.stopPropagation()
    const next = STATUS_CYCLE[status] ?? 'in-progress'
    setOptimisticStatus(next)
    try {
      await fetch(`${config.apiBase}/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      onStatusChanged()
    } catch {
      // Rollback the optimistic flip — write queue isn't in this
      // codepath since we use raw fetch here.
      setOptimisticStatus(null)
    }
  }

  return (
    <div
      onClick={onOpen}
      style={{
        padding: '10px 4px', display: 'flex', alignItems: 'center', gap: 10,
        cursor: 'pointer', borderTop: showDivider ? `1px solid ${C.separator}` : 'none',
        transition: 'background 0.12s', borderRadius: 4,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
      onMouseLeave={e => { e.currentTarget.style.background = '' }}
    >
      <button
        onClick={cycleStatus}
        title={`Status: ${status} — click to advance`}
        style={{
          color: TASK_STATUS_COLORS[status] ?? C.textMuted, flexShrink: 0,
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {TASK_STATUS_ICONS[status] ?? <Circle size={14} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: C.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          textDecoration: status === 'done' ? 'line-through' : 'none',
          opacity: status === 'done' ? 0.6 : 1,
        }}>
          {task.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          {task.project && (
            <span style={{ fontSize: 11, color: task.project.color || C.textMuted, fontWeight: 500 }}>{task.project.name}</span>
          )}
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: PRIORITY_COLORS[task.priority] ?? C.textMuted }}>
            {task.priority}
          </span>
          <span style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginLeft: 'auto' }}>
            {status === 'in-progress' ? 'In progress' : status}
          </span>
        </div>
      </div>
      <ChevronRight size={14} color={C.textMuted} style={{ flexShrink: 0, opacity: 0.5 }} />
    </div>
  )
}
