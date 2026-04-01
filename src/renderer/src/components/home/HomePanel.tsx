import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  Check, Circle, Play, AlertCircle, ChevronRight, X, Loader,
} from 'lucide-react'
import { C, card, neu } from '../../theme'
import type { Auth, ApiConfig, BundyStatus, Task, PlanItem } from '../../types'
import { useStatusTicker } from '../../hooks/useStatusTicker'
import { formatMs, insertMarkdownAt } from '../../utils/format'
import { simpleMarkdown } from '../../utils/markdown'

const DEMO_MODE = false

const ACTION_COLORS: Record<string, string> = {
  'clock-in': '#43B581',
  'clock-out': '#f04747',
  'break-start': '#007acc',
  'break-end': '#007acc',
}

const TASK_STATUS_COLORS: Record<string, string> = {
  todo: C.textMuted, 'in-progress': C.accent, done: C.success, cancelled: C.danger,
}

const TASK_STATUS_ICONS: Record<string, React.ReactNode> = {
  todo: <Circle size={13} />,
  'in-progress': <Play size={13} />,
  done: <Check size={13} />,
  cancelled: <AlertCircle size={13} />,
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#f04747', high: '#007acc', medium: '#007acc', low: '#43B581',
}

export function HomePanel({
  auth: _auth,
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
    } catch { /* offline */ } finally { setLoadingTasks(false) }
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
    if (openTasks.length > 0) setClockOutStep('tasks')
    else if (planItems.length > 0) setClockOutStep('plan')
    else setClockOutStep('report')
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
    } catch { /* offline, queued */ } finally { setActioning(false) }
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
          <div style={{ fontSize: 11, color: C.textMuted }}>{todayTasks.length} {todayTasks.length === 1 ? 'task' : 'tasks'}</div>
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
                  padding: '10px 4px', display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer', borderTop: i > 0 ? `1px solid ${C.separator}` : 'none',
                  transition: 'background 0.12s', borderRadius: 4,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = '' }}
              >
                <div style={{ color: TASK_STATUS_COLORS[task.status] ?? C.textMuted, flexShrink: 0 }}>
                  {TASK_STATUS_ICONS[task.status] ?? <Circle size={14} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    {task.project && (
                      <span style={{ fontSize: 11, color: task.project.color || C.textMuted, fontWeight: 500 }}>{task.project.name}</span>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: PRIORITY_COLORS[task.priority] ?? C.textMuted }}>
                      {task.priority}
                    </span>
                  </div>
                </div>
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
        } as React.CSSProperties}
          onClick={() => { setShowReportModal(false); setShowPreview(false) }}>
          <div onClick={e => e.stopPropagation()} style={{
            ...neu(), width: 500, maxHeight: '80vh', overflowY: 'auto', padding: 24,
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
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
                <div style={{ fontSize: 12, color: C.textMuted }}>You have open tasks. Update their status before clocking out.</div>
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
                    const openTasks = todayTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')
                    if (openTasks.length > 0) setClockOutStep('tasks')
                    else { setShowReportModal(false); setShowPreview(false) }
                  }}
                    style={{ flex: 1, ...neu(), padding: '10px', border: 'none', cursor: 'pointer', fontSize: 13, color: C.textMuted }}>
                    {todayTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length > 0 ? '← Back' : 'Cancel'}
                  </button>
                  <button onClick={() => setClockOutStep('report')}
                    style={{ flex: 1, ...neu(), padding: '10px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.accent }}>Next →</button>
                </div>
              </>
            )}

            {/* ─── Step 2: Report Editor ─── */}
            {clockOutStep === 'report' && (
              <>
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
                        style={{ ...neu(), padding: '4px 8px', fontSize: 11, border: 'none', cursor: 'pointer', borderRadius: 6, fontFamily: 'SF Mono, Menlo, monospace', ...btnStyle }}>{label}</button>
                    ))}
                  </div>
                )}

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
                    placeholder={"What did you work on today?\n\n- Task 1\n- Task 2\n\n## Notes\nAny blockers?"}
                    rows={8}
                    style={{
                      width: '100%', borderRadius: 4, padding: 12, fontSize: 13, fontFamily: 'SF Mono, Menlo, monospace',
                      ...neu(true), border: 'none', outline: 'none', color: C.text,
                      resize: 'none', boxSizing: 'border-box', lineHeight: 1.6,
                    }}
                  />
                ) : (
                  <div style={{ width: '100%', minHeight: 160, borderRadius: 4, padding: 12, fontSize: 13, ...neu(true), color: C.text, boxSizing: 'border-box', lineHeight: 1.6, overflowY: 'auto' }}
                    dangerouslySetInnerHTML={{ __html: reportContent.trim() ? simpleMarkdown(reportContent) : '<span style="opacity:0.4">Nothing to preview yet…</span>' }}
                  />
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{reportContent.split(/\s+/).filter(Boolean).length} words</span>
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
                      } finally { setReportSubmitting(false) }
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
