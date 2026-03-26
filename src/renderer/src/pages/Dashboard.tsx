import { useState, useEffect, useCallback, useRef } from 'react'

interface Auth {
  userId: string
  username: string
  role: string
}

interface BundyStatus {
  isClockedIn: boolean
  onBreak: boolean
  /** Total accumulated working milliseconds today. */
  elapsedMs: number
  username: string
  role: string
}

interface Permissions {
  screen: string
  accessibility: boolean
}

interface Props {
  auth: Auth
  onLogout: () => void
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1_000)
  const h = Math.floor(s / 3_600)
  const m = Math.floor((s % 3_600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function insertMarkdown(
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

function simpleMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--accent,#6366f1);text-decoration:underline">$1</a>')
    .replace(/\n/g, '<br>')
}

export default function Dashboard({ auth, onLogout }: Props): JSX.Element {
  const [status, setStatus] = useState<BundyStatus | null>(null)
  const [permissions, setPermissions] = useState<Permissions | null>(null)
  // baseMs = elapsedMs snapshot from last status fetch; snapshotAt = when we got it
  const [baseMs, setBaseMs] = useState(0)
  const [snapshotAt, setSnapshotAt] = useState(0)
  const [tick, setTick] = useState(0)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string>('')
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportContent, setReportContent] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [reportError, setReportError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const reportTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [updateInfo, setUpdateInfo] = useState<{ version: string } | null>(null)
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [restartCountdown, setRestartCountdown] = useState<number | null>(null)
  const [appVersion, setAppVersion] = useState<string>('')
  const [showCrashModal, setShowCrashModal] = useState(false)
  const [crashNote, setCrashNote] = useState('')
  const [crashSubmitting, setCrashSubmitting] = useState(false)
  const [crashSent, setCrashSent] = useState(false)

  // ─── Daily Plan state ──────────────────────────────────────────────────────
  interface PlanItem {
    id: string
    project: { id: string; name: string }
    details: string
    status: string
    outcome: string | null
  }
  const [planItems, setPlanItems] = useState<PlanItem[]>([])
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [newProjectName, setNewProjectName] = useState('')
  const [newDetails, setNewDetails] = useState('')
  const [addingItem, setAddingItem] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  // Clock-out confirmation: one status + outcome per item
  const [confirmItems, setConfirmItems] = useState<Array<{ itemId: string; status: string; outcome: string }>>([])
  const [clockOutStep, setClockOutStep] = useState<'plan' | 'report'>('plan')

  const applyStatus = useCallback((s: BundyStatus) => {
    setStatus(s)
    setBaseMs(s.elapsedMs)
    setSnapshotAt(Date.now())
  }, [])

  const loadPlan = useCallback(async () => {
    try {
      const plan = await window.electronAPI.getDailyPlan()
      setPlanItems(plan?.items ?? [])
    } catch { /* non-fatal */ }
  }, [])

  const loadProjects = useCallback(async () => {
    try {
      const p = await window.electronAPI.getProjects()
      setProjects(p)
    } catch { /* non-fatal */ }
  }, [])

  // Fetch status on mount
  useEffect(() => {
    window.electronAPI.getStatus().then(applyStatus).catch(() => {})
    window.electronAPI.checkPermissions().then(setPermissions).catch(() => {})
    window.electronAPI.getVersion().then(setAppVersion).catch(() => {})
    loadPlan()
    loadProjects()
  }, [applyStatus, loadPlan, loadProjects])

  // Subscribe to pushed status updates from main process
  useEffect(() => {
    const unsub = window.electronAPI.onStatusUpdate(applyStatus)
    return unsub
  }, [applyStatus])

  // Subscribe to plan updates pushed from main process (triggered by SSE)
  useEffect(() => {
    const unsub = window.electronAPI.onPlanUpdate((plan) => setPlanItems(plan.items ?? []))
    return unsub
  }, [])

  // Subscribe to pushed permissions updates (main re-checks on every poll cycle)
  useEffect(() => {
    const unsub = window.electronAPI.onPermissionsUpdate(setPermissions)
    return unsub
  }, [])

  // Subscribe to auto-update events
  useEffect(() => {
    const unsubAvail = window.electronAPI.onUpdateAvailable((info) => setUpdateInfo(info))
    const unsubProgress = window.electronAPI.onDownloadProgress(({ percent }) => setDownloadPercent(percent))
    const unsubReady = window.electronAPI.onUpdateDownloaded(() => {
      setDownloadPercent(100)
      setUpdateReady(true)
      setRestartCountdown(5)
    })
    // Pull current cached state — handles case where update events fired before this component mounted
    window.electronAPI.getUpdateState().then(({ version, percent, downloaded }) => {
      if (downloaded) {
        setDownloadPercent(100)
        setUpdateReady(true)
        setRestartCountdown(5)
      } else if (version) {
        setUpdateInfo({ version })
        if (percent !== null) setDownloadPercent(percent)
      }
    }).catch(() => {})
    return () => { unsubAvail(); unsubProgress(); unsubReady() }
  }, [])

  // Tick the restart countdown down to 0
  useEffect(() => {
    if (restartCountdown === null || restartCountdown <= 0) return
    const t = setTimeout(() => setRestartCountdown(n => (n !== null ? n - 1 : null)), 1_000)
    return () => clearTimeout(t)
  }, [restartCountdown])

  // Also poll permissions every 3s while any permission is missing so the
  // warning badge dismisses immediately after the user grants access
  useEffect(() => {
    if (!permissions) return
    const missingAny = permissions.screen !== 'granted' || !permissions.accessibility
    if (!missingAny) return
    const id = setInterval(() => {
      window.electronAPI.checkPermissions().then(setPermissions).catch(() => {})
    }, 3_000)
    return () => clearInterval(id)
  }, [permissions])

  // Tick every second while actively working
  useEffect(() => {
    if (!status?.isClockedIn) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [status?.isClockedIn])

  // Live elapsed = snapshot + time since snapshot (only while working, not on break)
  const liveMs = status?.isClockedIn && !status.onBreak
    ? baseMs + (Date.now() - snapshotAt)
    : baseMs

  // suppress unused var warning — tick drives re-render
  void tick

  const doAction = useCallback(async (action: string) => {
    setLoading(action)
    setError('')
    try {
      await window.electronAPI.doAction(action)
      const next = await window.electronAPI.getStatus()
      applyStatus(next)
      // After check-in, ensure today's plan exists and reload
      if (action === 'clock-in') {
        await window.electronAPI.ensureDailyPlan()
        await loadPlan()
        await loadProjects()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setLoading(null)
    }
  }, [applyStatus, loadPlan, loadProjects])

  const missingScreen = permissions?.screen !== 'granted'
  const missingAccessibility = !permissions?.accessibility

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '16px',
        gap: '12px',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: '14px' }}>{auth.username}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            {auth.role}{appVersion ? <span style={{ marginLeft: '6px', opacity: 0.5, textTransform: 'none', fontWeight: 400 }}>v{appVersion}</span> : null}
          </div>
        </div>
        <button
          onClick={onLogout}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '10px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px 8px'
          }}
        >
          Sign out
        </button>
      </div>

      {/* Timer */}
      <div
        className="neu-inset"
        style={{ padding: '16px', textAlign: 'center' }}
      >
        <div
          style={{
            fontSize: '32px',
            fontWeight: 700,
            fontFamily: 'SF Mono, Menlo, monospace',
            letterSpacing: '2px',
            color: status?.isClockedIn ? 'var(--success)' : 'var(--text-muted)'
          }}
        >
          {status?.isClockedIn || (status?.elapsedMs ?? 0) > 0
            ? formatMs(liveMs)
            : '--:--:--'}
        </div>
        <div
          style={{
            fontSize: '10px',
            marginTop: '4px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}
        >
          {status?.onBreak
            ? 'On break'
            : status?.isClockedIn
              ? 'Working'
              : 'Not clocked in'}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {!status?.isClockedIn ? (
          <button
            className="neu-raised"
            onClick={() => doAction('clock-in')}
            disabled={!!loading}
            style={{
              gridColumn: '1 / -1',
              padding: '10px',
              fontWeight: 600,
              color: 'var(--success)',
              border: 'none'
            }}
          >
            {loading === 'clock-in' ? '…' : 'Clock In'}
          </button>
        ) : (
          <>
            <button
              className="neu-raised"
              onClick={() => {
                setReportContent('')
                setReportError('')
                // Initialize confirm items from current plan items
                setConfirmItems(planItems.map(i => ({ itemId: i.id, status: i.status, outcome: '' })))
                setClockOutStep(planItems.length > 0 ? 'plan' : 'report')
                setShowReportModal(true)
              }}
              disabled={!!loading}
              style={{ padding: '10px', fontWeight: 600, color: 'var(--danger)', border: 'none' }}
            >
              Clock Out
            </button>

            {status.onBreak ? (
              <button
                className="neu-raised"
                onClick={() => doAction('break-end')}
                disabled={!!loading}
                style={{
                  padding: '10px',
                  fontWeight: 600,
                  color: 'var(--success)',
                  border: 'none'
                }}
              >
                {loading === 'break-end' ? '…' : 'Back'}
              </button>
            ) : (
              <button
                className="neu-raised"
                onClick={() => doAction('break-start')}
                disabled={!!loading}
                style={{
                  padding: '10px',
                  fontWeight: 600,
                  color: 'var(--warning)',
                  border: 'none'
                }}
              >
                {loading === 'break-start' ? '…' : 'Break'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--danger)',
            textAlign: 'center',
            padding: '4px'
          }}
        >
          {error}
        </div>
      )}

      {/* Daily Plan Section */}
      {status?.isClockedIn && (
        <div
          className="neu-inset"
          style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 0', minHeight: 0 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)' }}>📋 Daily Plan</span>
            <button
              onClick={() => { setShowAddForm(!showAddForm); setNewProjectName(''); setNewDetails('') }}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '16px',
                cursor: 'pointer',
                color: 'var(--accent)',
                padding: '0 4px',
                lineHeight: 1
              }}
            >
              {showAddForm ? '−' : '+'}
            </button>
          </div>

          {/* Add new plan item form */}
          {showAddForm && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input
                list="project-list"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                placeholder="Project name"
                style={{
                  fontSize: '11px',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border, #ccc)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  boxSizing: 'border-box',
                  width: '100%'
                }}
              />
              <datalist id="project-list">
                {projects.map(p => <option key={p.id} value={p.name} />)}
              </datalist>
              <input
                value={newDetails}
                onChange={e => setNewDetails(e.target.value)}
                placeholder="What will you work on?"
                onKeyDown={async e => {
                  if (e.key === 'Enter' && newProjectName.trim() && newDetails.trim() && !addingItem) {
                    setAddingItem(true)
                    try {
                      await window.electronAPI.addPlanItem(newProjectName.trim(), newDetails.trim())
                      await loadPlan()
                      await loadProjects()
                      setNewProjectName('')
                      setNewDetails('')
                    } catch { /* ignore */ }
                    setAddingItem(false)
                  }
                }}
                style={{
                  fontSize: '11px',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border, #ccc)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  boxSizing: 'border-box',
                  width: '100%'
                }}
              />
              <button
                className="neu-raised"
                disabled={!newProjectName.trim() || !newDetails.trim() || addingItem}
                onClick={async () => {
                  setAddingItem(true)
                  try {
                    await window.electronAPI.addPlanItem(newProjectName.trim(), newDetails.trim())
                    await loadPlan()
                    await loadProjects()
                    setNewProjectName('')
                    setNewDetails('')
                  } catch { /* ignore */ }
                  setAddingItem(false)
                }}
                style={{ fontSize: '11px', fontWeight: 600, padding: '6px', border: 'none', cursor: 'pointer', color: 'var(--accent)' }}
              >
                {addingItem ? '…' : 'Add'}
              </button>
            </div>
          )}

          {/* Plan items list */}
          <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {planItems.length === 0 ? (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', padding: '4px' }}>
              No plan items yet. Tap + to add.
            </div>
          ) : (
            planItems.map(item => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  padding: '6px 0',
                  borderBottom: '1px solid rgba(128,128,128,0.1)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <span style={{ fontSize: '11px', flexShrink: 0 }}>
                    {item.status === 'completed' ? '✅' : item.status === 'continued' ? '🔁' : item.status === 'in-progress' ? '🔄' : item.status === 'ready-qa' ? '🧪' : item.status === 'ready-client' ? '📤' : item.status === 'blocked' ? '🚫' : '📌'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.project.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text)', wordBreak: 'break-word' }}>
                      {item.details}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await window.electronAPI.deletePlanItem(item.id)
                        await loadPlan()
                      } catch { /* ignore */ }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '10px',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      padding: '0 2px',
                      flexShrink: 0,
                      opacity: 0.5
                    }}
                  >✕</button>
                </div>
                {/* Status selector */}
                <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', paddingLeft: '20px' }}>
                  {([
                    { value: 'planned', label: '📌 To Do', color: 'var(--text-muted)' },
                    { value: 'in-progress', label: '🔄 In Progress', color: 'var(--warning)' },
                    { value: 'ready-qa', label: '🧪 QA', color: '#8b5cf6' },
                    { value: 'ready-client', label: '📤 Client', color: '#0ea5e9' },
                    { value: 'blocked', label: '🚫 Blocked', color: 'var(--danger)' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      className={item.status === opt.value ? 'neu-raised' : ''}
                      onClick={async () => {
                        try {
                          await window.electronAPI.updatePlanItem(item.id, opt.value)
                          await loadPlan()
                        } catch { /* ignore */ }
                      }}
                      style={{
                        fontSize: '9px',
                        padding: '2px 6px',
                        border: item.status === opt.value ? 'none' : '1px solid transparent',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        background: item.status === opt.value ? undefined : 'transparent',
                        color: item.status === opt.value ? opt.color : 'var(--text-muted)',
                        fontWeight: item.status === opt.value ? 600 : 400,
                        opacity: item.status === opt.value ? 1 : 0.7
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
          </div>
        </div>
      )}

      {/* Permission warnings */}
      {(missingScreen || missingAccessibility) && (
        <div
          className="neu-inset"
          style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--warning)' }}>
            PERMISSIONS NEEDED
          </div>
          {missingScreen && (
            <button
              onClick={() => window.electronAPI.openScreenRecordingSettings()}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '11px',
                color: 'var(--accent)',
                cursor: 'pointer',
                textAlign: 'left',
                padding: 0
              }}
            >
              ▸ Enable Screen Recording →
            </button>
          )}
          {missingAccessibility && (
            <button
              onClick={() => window.electronAPI.openAccessibilitySettings()}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '11px',
                color: 'var(--accent)',
                cursor: 'pointer',
                textAlign: 'left',
                padding: 0
              }}
            >
              ▸ Enable Accessibility →
            </button>
          )}
        </div>
      )}

      {/* Update notification banner */}
      {(updateInfo || updateReady) && (
        <div
          className="neu-inset"
          style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '11px', color: 'var(--text)', fontWeight: 600 }}>
              {updateReady
                ? '✅ v' + updateInfo?.version + ' ready — restarting in ' + (restartCountdown ?? 0) + 's'
                : '⬆ v' + updateInfo?.version + ' available'}
            </div>
            {updateReady ? (
              <button
                className="neu-raised"
                onClick={() => window.electronAPI.installUpdate()}
                style={{ fontSize: '10px', fontWeight: 600, padding: '4px 10px', border: 'none', cursor: 'pointer', color: 'var(--accent)', whiteSpace: 'nowrap' }}
              >
                Restart Now
              </button>
            ) : (
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                {downloadPercent !== null ? `${downloadPercent}%` : 'Starting…'}
              </span>
            )}
          </div>
          {!updateReady && (
            <div style={{ height: '4px', borderRadius: '2px', background: 'var(--neo-inset, rgba(0,0,0,0.12))', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${downloadPercent ?? 0}%`,
                  borderRadius: '2px',
                  background: 'var(--accent)',
                  transition: 'width 0.4s ease'
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Report Issue link */}
      <div style={{ textAlign: 'center', marginTop: 'auto' }}>
        <button
          onClick={() => { setCrashNote(''); setCrashSent(false); setShowCrashModal(true) }}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '10px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            opacity: 0.6,
            textDecoration: 'underline'
          }}
        >
          Report an issue
        </button>
      </div>

      {/* Report Issue Modal */}
      {showCrashModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px'
          }}
        >
          <div
            className="neu-raised"
            style={{
              width: '100%',
              maxWidth: '340px',
              borderRadius: '16px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              background: 'var(--bg)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '13px' }}>🐛 Report an Issue</span>
              <button
                onClick={() => setShowCrashModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}
              >✕</button>
            </div>

            {crashSent ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>✅</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Report sent. Thank you!</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Describe what happened or what went wrong. App version and system info will be included automatically.
                </div>
                <textarea
                  value={crashNote}
                  onChange={(e) => setCrashNote(e.target.value)}
                  placeholder="What happened? What were you doing when the issue occurred?"
                  rows={5}
                  style={{
                    width: '100%',
                    borderRadius: '10px',
                    padding: '10px',
                    fontSize: '12px',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    border: '1px solid var(--border, #ccc)',
                    resize: 'none',
                    boxSizing: 'border-box',
                    lineHeight: '1.5'
                  }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="neu-raised"
                    onClick={() => setShowCrashModal(false)}
                    style={{ flex: 1, padding: '8px', fontSize: '12px', border: 'none', cursor: 'pointer' }}
                  >Cancel</button>
                  <button
                    className="neu-raised"
                    onClick={async () => {
                      if (!crashNote.trim()) return
                      setCrashSubmitting(true)
                      try {
                        await window.electronAPI.sendCrashReport(crashNote.trim())
                        setCrashSent(true)
                      } catch { /* ignore */ }
                      setCrashSubmitting(false)
                    }}
                    disabled={!crashNote.trim() || crashSubmitting}
                    style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--accent)', border: 'none', cursor: 'pointer' }}
                  >{crashSubmitting ? '…' : 'Send Report'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Clock-Out Report Modal */}
      {showReportModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px'
          }}
        >
          <div
            className="neu-raised"
            style={{
              width: '100%',
              maxWidth: '380px',
              borderRadius: '16px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              background: 'var(--bg)',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '13px' }}>
                {clockOutStep === 'plan' ? '📋 Confirm Plan Status' : '🔴 Clock Out Report'}
              </span>
              <button
                onClick={() => { setShowReportModal(false); setShowPreview(false) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}
              >✕</button>
            </div>

            {/* ─── Step 1: Plan Confirmation ─── */}
            {clockOutStep === 'plan' && (
              <>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Update the status of each task before clocking out.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {planItems.map((item, idx) => {
                    const ci = confirmItems[idx]
                    if (!ci) return null
                    return (
                      <div
                        key={item.id}
                        className="neu-inset"
                        style={{ padding: '8px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}
                      >
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)' }}>{item.project.name}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.details}
                          </span>
                        </div>
                        {/* Status selector */}
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {([
                            { value: 'completed', label: '✅ Done', color: 'var(--success)' },
                            { value: 'continued', label: '🔁 To be continued', color: 'var(--warning)' },
                            { value: 'planned', label: '📌 Haven\'t started', color: 'var(--text-muted)' },
                            { value: 'blocked', label: '🚫 Blocked', color: 'var(--danger)' },
                          ] as const).map(opt => (
                            <button
                              key={opt.value}
                              className={ci.status === opt.value ? 'neu-raised' : ''}
                              onClick={() => {
                                setConfirmItems(prev => prev.map((c, i) => i === idx ? { ...c, status: opt.value } : c))
                              }}
                              style={{
                                fontSize: '10px',
                                padding: '3px 8px',
                                border: ci.status === opt.value ? 'none' : '1px solid transparent',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                background: ci.status === opt.value ? undefined : 'transparent',
                                color: ci.status === opt.value ? opt.color : 'var(--text-muted)',
                                fontWeight: ci.status === opt.value ? 600 : 400
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        {/* Outcome note (optional) */}
                        <input
                          value={ci.outcome}
                          onChange={(e) => {
                            setConfirmItems(prev => prev.map((c, i) => i === idx ? { ...c, outcome: e.target.value } : c))
                          }}
                          placeholder="Outcome note (optional)"
                          style={{
                            fontSize: '10px',
                            padding: '5px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border, #ccc)',
                            background: 'var(--bg)',
                            color: 'var(--text)',
                            boxSizing: 'border-box',
                            width: '100%'
                          }}
                        />
                      </div>
                    )
                  })}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="neu-raised"
                    onClick={() => { setShowReportModal(false); setShowPreview(false) }}
                    style={{ flex: 1, padding: '8px', fontSize: '12px', border: 'none', cursor: 'pointer' }}
                  >Cancel</button>
                  <button
                    className="neu-raised"
                    onClick={() => setClockOutStep('report')}
                    style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--accent)', border: 'none', cursor: 'pointer' }}
                  >Next →</button>
                </div>
              </>
            )}

            {/* ─── Step 2: Report Editor ─── */}
            {clockOutStep === 'report' && (
              <>
                {/* Write / Preview tabs */}
                <div
                  className="neu-inset"
                  style={{ display: 'flex', borderRadius: '8px', padding: '2px', gap: '2px' }}
                >
                  {(['Write', 'Preview'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setShowPreview(tab === 'Preview')}
                      className={!showPreview === (tab === 'Write') ? 'neu-raised' : ''}
                      style={{
                        flex: 1,
                        padding: '5px',
                        fontSize: '11px',
                        fontWeight: 600,
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: 'transparent',
                        color: (!showPreview === (tab === 'Write')) ? 'var(--text)' : 'var(--text-muted)'
                      }}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Formatting toolbar (Write mode) */}
                {!showPreview && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {([
                      { label: 'B',    prefix: '**',    suffix: '**',      title: 'Bold',            style: { fontWeight: 700 } },
                      { label: 'I',    prefix: '_',     suffix: '_',       title: 'Italic',          style: { fontStyle: 'italic' as const } },
                      { label: '~~',   prefix: '~~',    suffix: '~~',      title: 'Strikethrough',   style: { textDecoration: 'line-through' as const } },
                      { label: 'H1',   prefix: '# ',    suffix: '',        title: 'Heading 1',       style: {} },
                      { label: 'H2',   prefix: '## ',   suffix: '',        title: 'Heading 2',       style: {} },
                      { label: 'H3',   prefix: '### ',  suffix: '',        title: 'Heading 3',       style: {} },
                      { label: '❝',    prefix: '> ',    suffix: '',        title: 'Blockquote',      style: {} },
                      { label: '•',    prefix: '\n- ',  suffix: '',        title: 'Bullet list',     style: {} },
                      { label: '1.',   prefix: '\n1. ', suffix: '',        title: 'Numbered list',   style: {} },
                      { label: '`c`',  prefix: '`',     suffix: '`',       title: 'Inline code',     style: { fontFamily: 'monospace' } },
                      { label: '—',    prefix: '\n---\n', suffix: '',     title: 'Horizontal rule', style: {} },
                    ]).map(({ label, prefix, suffix, title, style: btnStyle }) => (
                      <button
                        key={title}
                        title={title}
                        className="neu-raised"
                        onClick={() => {
                          if (reportTextareaRef.current) {
                            insertMarkdown(reportTextareaRef.current, setReportContent, prefix, suffix)
                          }
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          border: 'none',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          fontFamily: 'SF Mono, Menlo, monospace',
                          ...btnStyle
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Editor */}
                {!showPreview ? (
                  <textarea
                    ref={reportTextareaRef}
                    value={reportContent}
                    onChange={(e) => setReportContent(e.target.value)}
                    onKeyDown={(e) => {
                      const ta = e.currentTarget
                      if (e.key === 'Tab') {
                        e.preventDefault()
                        insertMarkdown(ta, setReportContent, '  ', '')
                        return
                      }
                      const mod = e.ctrlKey || e.metaKey
                      if (mod && e.key === 'b') {
                        e.preventDefault()
                        insertMarkdown(ta, setReportContent, '**', '**')
                      } else if (mod && e.key === 'i') {
                        e.preventDefault()
                        insertMarkdown(ta, setReportContent, '_', '_')
                      }
                    }}
                    placeholder="What did you work on today?&#10;&#10;- Task 1&#10;- Task 2&#10;&#10;## Notes&#10;Any blockers?"
                    rows={8}
                    style={{
                      width: '100%',
                      borderRadius: '10px',
                      padding: '10px',
                      fontSize: '12px',
                      fontFamily: 'SF Mono, Menlo, monospace',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      border: '1px solid var(--border, #ccc)',
                      resize: 'none',
                      boxSizing: 'border-box',
                      lineHeight: '1.5'
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      minHeight: '160px',
                      borderRadius: '10px',
                      padding: '10px',
                      fontSize: '12px',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      border: '1px solid var(--border, #ccc)',
                      boxSizing: 'border-box',
                      lineHeight: '1.5',
                      overflowY: 'auto'
                    }}
                    dangerouslySetInnerHTML={{
                      __html: reportContent.trim()
                        ? simpleMarkdown(reportContent)
                        : '<span style="opacity:0.4">Nothing to preview yet…</span>'
                    }}
                  />
                )}

                {/* Footer stats */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {reportContent.split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>

                {reportError && (
                  <div style={{ fontSize: '11px', color: 'var(--danger)' }}>{reportError}</div>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="neu-raised"
                    onClick={() => {
                      if (planItems.length > 0) {
                        setClockOutStep('plan')
                      } else {
                        setShowReportModal(false)
                        setShowPreview(false)
                      }
                    }}
                    style={{ flex: 1, padding: '8px', fontSize: '12px', border: 'none', cursor: 'pointer' }}
                  >
                    {planItems.length > 0 ? '← Back' : 'Cancel'}
                  </button>
                  <button
                    className="neu-raised"
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
                            ...(ci.outcome.trim() ? { outcome: ci.outcome.trim() } : {})
                          }))
                        )
                        setShowReportModal(false)
                        setShowPreview(false)
                        setReportContent('')
                        await loadPlan()
                        const next = await window.electronAPI.getStatus()
                        applyStatus(next)
                      } catch (err: unknown) {
                        setReportError(err instanceof Error ? err.message : 'Failed to submit')
                      } finally {
                        setReportSubmitting(false)
                      }
                    }}
                    disabled={!reportContent.trim() || reportSubmitting}
                    style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--danger)', border: 'none', cursor: 'pointer' }}
                  >
                    {reportSubmitting ? '…' : 'Submit & Clock Out'}
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
