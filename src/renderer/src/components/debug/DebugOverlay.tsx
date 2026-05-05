/**
 * Floating debug overlay (v1.5.2204) — top-left corner, monospace, dark.
 *
 * Toggle on with: `localStorage.bundyDebug = '1'` then reload.
 * Toggle off with: `localStorage.removeItem('bundyDebug')` then reload.
 *
 * Shows the timestamps of the three steps in the realtime chain so we
 * can diagnose where lag is coming from. Re-renders every 500ms so the
 * "ago" labels stay accurate without flooding state updates.
 */
import { useEffect, useState } from 'react'
import { useDebugStore } from '../../stores/debugStore'

function formatAgo(at: number, now: number): string {
  const ms = now - at
  if (ms < 0) return 'just now'
  if (ms < 1000) return `${ms}ms ago`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s ago`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s ago`
  return `${Math.floor(ms / 3_600_000)}h ago`
}

function colorForAge(ms: number): string {
  if (ms < 2_000) return '#22c55e'  // < 2s — fresh, green
  if (ms < 10_000) return '#eab308' // < 10s — getting old, yellow
  return '#ef4444'                  // older, red
}

export function DebugOverlay() {
  const enabled = useDebugStore((s) => s.enabled)
  const lastSSE = useDebugStore((s) => s.lastSSEEvent)
  const lastLoad = useDebugStore((s) => s.lastLoadProjectTasks)
  const lastRender = useDebugStore((s) => s.lastListRender)
  const sseCount = useDebugStore((s) => s.sseEventCount)
  const loadCount = useDebugStore((s) => s.loadCount)
  const renderCount = useDebugStore((s) => s.renderCount)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [enabled])

  if (!enabled) return null

  const sseAge = lastSSE ? now - lastSSE.at : Infinity
  const loadAge = lastLoad ? now - lastLoad.at : Infinity
  const renderAge = lastRender ? now - lastRender.at : Infinity

  return (
    <div style={{
      position: 'fixed', top: 8, left: 8, zIndex: 99998,
      padding: '8px 10px', borderRadius: 6,
      background: 'rgba(15, 15, 18, 0.92)',
      border: '1px solid rgba(255,255,255,0.08)',
      color: '#e5e7eb',
      fontFamily: '"SF Mono", Menlo, monospace', fontSize: 10, lineHeight: 1.5,
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      pointerEvents: 'auto', userSelect: 'text',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      minWidth: 240,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4, opacity: 0.7, letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 9 }}>
        bundy debug
      </div>
      <Row
        label="SSE event"
        line2={lastSSE ? lastSSE.event : '(none)'}
        ago={lastSSE ? formatAgo(lastSSE.at, now) : '—'}
        color={lastSSE ? colorForAge(sseAge) : '#6b7280'}
        count={sseCount}
      />
      <Row
        label="loadProjectTasks"
        line2={lastLoad ? `${lastLoad.resultCount} tasks · ${lastLoad.durationMs}ms` : '(not yet)'}
        ago={lastLoad ? formatAgo(lastLoad.at, now) : '—'}
        color={lastLoad ? colorForAge(loadAge) : '#6b7280'}
        count={loadCount}
      />
      <Row
        label="setProjectTasks"
        line2={lastRender ? `list now: ${lastRender.count}` : '(not yet)'}
        ago={lastRender ? formatAgo(lastRender.at, now) : '—'}
        color={lastRender ? colorForAge(renderAge) : '#6b7280'}
        count={renderCount}
      />
      <div style={{ marginTop: 4, fontSize: 9, opacity: 0.5 }}>
        green &lt;2s · yellow &lt;10s · red older
      </div>
    </div>
  )
}

function Row({ label, line2, ago, color, count }: {
  label: string; line2: string; ago: string; color: string; count: number
}) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '2px 0' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          <span style={{ fontWeight: 600 }}>{label}</span>
          <span style={{ opacity: 0.5 }}>×{count}</span>
        </div>
        <div style={{ opacity: 0.7, wordBreak: 'break-all' }}>{line2}</div>
        <div style={{ opacity: 0.5, fontSize: 9 }}>{ago}</div>
      </div>
    </div>
  )
}
