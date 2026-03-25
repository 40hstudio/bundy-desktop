import { useState, useEffect, useCallback } from 'react'

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
  const [updateInfo, setUpdateInfo] = useState<{ version: string } | null>(null)
  const [updateReady, setUpdateReady] = useState(false)

  const applyStatus = useCallback((s: BundyStatus) => {
    setStatus(s)
    setBaseMs(s.elapsedMs)
    setSnapshotAt(Date.now())
  }, [])

  // Fetch status on mount
  useEffect(() => {
    window.electronAPI.getStatus().then(applyStatus).catch(() => {})
    window.electronAPI.checkPermissions().then(setPermissions).catch(() => {})
  }, [applyStatus])

  // Subscribe to pushed status updates from main process
  useEffect(() => {
    const unsub = window.electronAPI.onStatusUpdate(applyStatus)
    return unsub
  }, [applyStatus])

  // Subscribe to pushed permissions updates (main re-checks on every poll cycle)
  useEffect(() => {
    const unsub = window.electronAPI.onPermissionsUpdate(setPermissions)
    return unsub
  }, [])

  // Subscribe to auto-update events
  useEffect(() => {
    const unsubAvail = window.electronAPI.onUpdateAvailable((info) => setUpdateInfo(info))
    const unsubReady = window.electronAPI.onUpdateDownloaded(() => setUpdateReady(true))
    return () => { unsubAvail(); unsubReady() }
  }, [])

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setLoading(null)
    }
  }, [applyStatus])

  const missingScreen = permissions?.screen !== 'granted'
  const missingAccessibility = !permissions?.accessibility

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '16px',
        gap: '12px'
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
            {auth.role}
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
              onClick={() => { setReportContent(''); setReportError(''); setShowReportModal(true) }}
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
          style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text)' }}>
            {updateReady
              ? '✅ Update ready to install'
              : `⬆ v${updateInfo?.version} available`}
          </div>
          <button
            className="neu-raised"
            onClick={() => {
              if (updateReady) {
                window.electronAPI.installUpdate()
              } else {
                window.electronAPI.checkForUpdates()
              }
            }}
            style={{ fontSize: '10px', fontWeight: 600, padding: '4px 10px', border: 'none', cursor: 'pointer', color: 'var(--accent)', whiteSpace: 'nowrap' }}
          >
            {updateReady ? 'Restart & Install' : 'Downloading…'}
          </button>
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
              <span style={{ fontWeight: 700, fontSize: '13px' }}>🔴 Clock Out Report</span>
              <button
                onClick={() => setShowReportModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}
              >✕</button>
            </div>

            <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0 }}>
              Summarise what you worked on today.
            </p>

            <textarea
              value={reportContent}
              onChange={(e) => setReportContent(e.target.value)}
              placeholder="What did you work on today?&#10;&#10;- Task 1&#10;- Task 2"
              rows={6}
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
                boxSizing: 'border-box'
              }}
            />

            {reportError && (
              <div style={{ fontSize: '11px', color: 'var(--danger)' }}>{reportError}</div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="neu-raised"
                onClick={() => setShowReportModal(false)}
                style={{ flex: 1, padding: '8px', fontSize: '12px', border: 'none', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                className="neu-raised"
                onClick={async () => {
                  if (!reportContent.trim()) return
                  setReportSubmitting(true)
                  setReportError('')
                  try {
                    await window.electronAPI.submitReport(reportContent.trim())
                    setShowReportModal(false)
                    setReportContent('')
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
          </div>
        </div>
      )}
    </div>
  )
}
