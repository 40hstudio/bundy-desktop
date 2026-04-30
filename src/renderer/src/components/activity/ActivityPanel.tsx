import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronRight, RefreshCw, Loader } from 'lucide-react'
import { ApiConfig } from '../../types'
import { C, card } from '../../theme'
import { formatMs, formatTime } from '../../utils/format'

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

function buildActivityTimeline(
  screenshots: ActivityScreenshot[],
  timeLogs: { action: string; timestamp: string }[],
  activityWindows: ActivityWindow[],
  slotMinutes: number = 10,
): TimelineSlot[] {
  const firstCheckIn = timeLogs.find(l => l.action === 'CHECK_IN')
  if (!firstCheckIn) return []
  const start = new Date(firstCheckIn.timestamp)
  const lastLog = timeLogs[timeLogs.length - 1]
  const isOpen = !lastLog || lastLog.action !== 'CLOCK_OUT'
  const lastClockOut = [...timeLogs].reverse().find(l => l.action === 'CLOCK_OUT')
  const end = isOpen ? new Date() : new Date(lastClockOut!.timestamp)

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

  const slotMs = slotMinutes * 60_000
  const roundedStart = new Date(start)
  roundedStart.setSeconds(0, 0)
  // Align to whatever boundary fits the chosen slot size.
  roundedStart.setMinutes(Math.floor(roundedStart.getMinutes() / slotMinutes) * slotMinutes)

  // Activity windows are recorded at 10-min boundaries; for finer granularity
  // (1m, 5m) we apply the same window stats to every sub-slot inside it.
  const slots: TimelineSlot[] = []
  for (let t = roundedStart.getTime(); t <= end.getTime(); t += slotMs) {
    const slotTime = new Date(t)
    const slotEnd = t + slotMs

    const ss = screenshots.find(s => {
      const ct = new Date(s.capturedAt).getTime()
      return ct >= t && ct < slotEnd
    }) ?? null

    // Find the 10-min window covering this slot's start.
    const win = activityWindows.find(w => {
      const wt = new Date(w.windowStart).getTime()
      return t >= wt && t < wt + 10 * 60_000
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

export default function ActivityPanel({ config }: { config: ApiConfig }) {
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
  // Range view (P3.16). 'day' = existing per-day timeline; 'week'/'month'
  // show aggregate per-day stats from /api/user/activity-range.
  const [rangeView, setRangeView] = useState<'day' | 'week' | 'month'>('day')
  // Timeline zoom (P3.18). 10-min default mirrors the original behaviour;
  // smaller granularities slice the same data finer.
  const [timelineZoom, setTimelineZoom] = useState<1 | 5 | 10 | 30>(10)
  const [rangeData, setRangeData] = useState<Array<{
    date: string
    totalSeconds: number
    activeSeconds: number
    mouseActiveSeconds: number
    keyActiveSeconds: number
    topApps: Array<{ name: string; seconds: number }>
    topUrls: Array<{ name: string; seconds: number }>
  }> | null>(null)

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
    loadData()
  }, [loadData])

  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollLeft = timelineRef.current.scrollWidth
  }, [data])

  const timeline = data ? buildActivityTimeline(data.screenshots, data.timeLogs, data.activity, timelineZoom) : []

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

  // Client-side overlap check (P3.17). Catches the obvious cases (request
  // overlaps an existing CHECK_IN/BACK/BREAK/CLOCK_OUT log on the same day)
  // before round-tripping to the server. The server still has the
  // authoritative check.
  function findOverlap(startISO: string, endISO: string): string | null {
    if (!data?.timeLogs?.length) return null
    const start = new Date(startISO).getTime()
    const end = new Date(endISO).getTime()
    if (!(end > start)) return 'End must be after start'
    // Pair CHECK_IN/BACK with the next CLOCK_OUT/BREAK to form covered
    // intervals; flag overlap.
    const sorted = [...data.timeLogs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    let openAt: number | null = null
    for (const log of sorted) {
      const t = new Date(log.timestamp).getTime()
      if (log.action === 'CHECK_IN' || log.action === 'BACK') {
        openAt = t
      } else if ((log.action === 'CLOCK_OUT' || log.action === 'BREAK') && openAt !== null) {
        // [openAt, t] is a covered interval — does our new range overlap it?
        if (start < t && end > openAt) {
          return `Range overlaps an existing log block (${new Date(openAt).toLocaleTimeString()} – ${new Date(t).toLocaleTimeString()})`
        }
        openAt = null
      }
    }
    // If session is still open at the end of the day, the open block runs
    // until "now" — flag overlap with that too.
    if (openAt !== null) {
      const nowMs = Date.now()
      if (start < nowMs && end > openAt) {
        return `Range overlaps an open work block starting at ${new Date(openAt).toLocaleTimeString()}`
      }
    }
    return null
  }

  async function submitManualRequest() {
    if (!manualReqForm) return
    const overlap = findOverlap(manualReqForm.startTime, manualReqForm.endTime)
    if (overlap) {
      alert(overlap)
      return
    }
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

  function openManualRequest(slot: TimelineSlot) {
    const startTime = slot.slotTime.toISOString()
    const endTime = new Date(slot.slotTime.getTime() + 10 * 60_000).toISOString()
    setManualReqForm({ startTime, endTime, reason: '' })
  }

  // Load range view (week / month) — fetched lazily when tab changes.
  useEffect(() => {
    if (rangeView === 'day') return
    const days = rangeView === 'week' ? 7 : 30
    const today = new Date(Date.now() + 7 * 3600_000)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const to = fmt(today)
    const from = fmt(new Date(today.getTime() - (days - 1) * 86400000))
    let cancelled = false
    fetch(`${config.apiBase}/api/user/activity-range?from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${config.token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then((d: { days: typeof rangeData } | null) => { if (!cancelled && d) setRangeData(d.days) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [rangeView, config])

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Range view tabs (P3.16) */}
          <div style={{ display: 'flex', gap: 2, background: C.bgInput, borderRadius: 6, padding: 2 }}>
            {(['day', 'week', 'month'] as const).map(r => (
              <button key={r} onClick={() => setRangeView(r)}
                style={{
                  padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
                  background: rangeView === r ? 'rgba(0, 122, 204, 0.15)' : 'transparent',
                  color: rangeView === r ? C.accent : C.textMuted,
                }}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={loadData} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {rangeView !== 'day' ? (
        // Range aggregate view (P3.16). Shows per-day strip + week/month KPIs.
        rangeData === null ? (
          <div style={{ textAlign: 'center', color: C.textMuted, padding: 40 }}><Loader size={24} /></div>
        ) : rangeData.length === 0 ? (
          <div style={{ ...card(), textAlign: 'center', color: C.textMuted, padding: 40 }}>
            No activity recorded for this {rangeView}.
          </div>
        ) : (() => {
          const totalSec = rangeData.reduce((s, d) => s + d.totalSeconds, 0)
          const activeSec = rangeData.reduce((s, d) => s + d.activeSeconds, 0)
          const avgPct = totalSec > 0 ? (activeSec / totalSec) * 100 : 0
          // Top apps + URLs aggregated across the range.
          const appAgg: Record<string, number> = {}
          const urlAgg: Record<string, number> = {}
          for (const d of rangeData) {
            for (const a of d.topApps) appAgg[a.name] = (appAgg[a.name] ?? 0) + a.seconds
            for (const u of d.topUrls) urlAgg[u.name] = (urlAgg[u.name] ?? 0) + u.seconds
          }
          const topAppsRange = Object.entries(appAgg).map(([name, seconds]) => ({ name, seconds })).sort((a, b) => b.seconds - a.seconds).slice(0, 8)
          const topUrlsRange = Object.entries(urlAgg).map(([name, seconds]) => ({ name, seconds })).sort((a, b) => b.seconds - a.seconds).slice(0, 8)
          const maxApp = topAppsRange[0]?.seconds || 1
          const maxUrl = topUrlsRange[0]?.seconds || 1
          const fmtH = (sec: number) => {
            const h = Math.floor(sec / 3600)
            const m = Math.floor((sec % 3600) / 60)
            return h > 0 ? `${h}h ${m}m` : `${m}m`
          }
          return (
            <>
              {/* KPI cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div style={{ ...card(), padding: 14 }}>
                  <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Tracked</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginTop: 4 }}>{fmtH(totalSec)}</div>
                </div>
                <div style={{ ...card(), padding: 14 }}>
                  <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Active</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.success, marginTop: 4 }}>{fmtH(activeSec)}</div>
                </div>
                <div style={{ ...card(), padding: 14 }}>
                  <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Avg productivity</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: avgPct > 60 ? C.success : avgPct > 30 ? C.warning : C.danger, marginTop: 4 }}>{avgPct.toFixed(0)}%</div>
                </div>
              </div>
              {/* Per-day bar strip */}
              <div style={{ ...card(), padding: 14 }}>
                <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Per-day activity</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80 }}>
                  {rangeData.map(d => {
                    const pct = d.totalSeconds > 0 ? (d.activeSeconds / d.totalSeconds) * 100 : 0
                    const color = pct > 60 ? C.success : pct > 30 ? C.warning : C.danger
                    return (
                      <div key={d.date} title={`${d.date}: ${fmtH(d.activeSeconds)} active / ${fmtH(d.totalSeconds)} tracked`}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                          <div style={{ width: '100%', height: `${Math.max(2, (d.activeSeconds / Math.max(...rangeData.map(x => x.totalSeconds || 1))) * 100)}%`, background: color, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 8, color: C.textMuted }}>{d.date.slice(5)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              {/* Top apps + URLs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ ...card(), padding: 14 }}>
                  <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Top apps</div>
                  {topAppsRange.length === 0 ? <div style={{ fontSize: 11, color: C.textMuted }}>No data</div> : topAppsRange.map(a => (
                    <div key={a.name} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                        <span style={{ color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>{fmtH(a.seconds)}</span>
                      </div>
                      <div style={{ height: 4, background: C.bgInput, borderRadius: 2, overflow: 'hidden', marginTop: 2 }}>
                        <div style={{ width: `${(a.seconds / maxApp) * 100}%`, height: '100%', background: C.accent }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ ...card(), padding: 14 }}>
                  <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Top sites</div>
                  {topUrlsRange.length === 0 ? <div style={{ fontSize: 11, color: C.textMuted }}>No data</div> : topUrlsRange.map(u => (
                    <div key={u.name} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                        <span style={{ color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>{fmtH(u.seconds)}</span>
                      </div>
                      <div style={{ height: 4, background: C.bgInput, borderRadius: 2, overflow: 'hidden', marginTop: 2 }}>
                        <div style={{ width: `${(u.seconds / maxUrl) * 100}%`, height: '100%', background: C.success }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )
        })()
      ) : loading ? (
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Zoom picker (P3.18) */}
                  <div style={{ display: 'flex', gap: 2, background: C.bgInput, borderRadius: 6, padding: 2 }}>
                    {([1, 5, 10, 30] as const).map(z => (
                      <button key={z} onClick={() => setTimelineZoom(z)}
                        title={`${z}-minute slots`}
                        style={{
                          padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                          fontSize: 9, fontWeight: 600,
                          background: timelineZoom === z ? 'rgba(0, 122, 204, 0.15)' : 'transparent',
                          color: timelineZoom === z ? C.accent : C.textMuted,
                          fontFamily: 'inherit',
                        }}>{z}m</button>
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{timeline.length} slots</span>
                </div>
              </div>
              <div ref={timelineRef} style={{ display: 'flex', gap: 3, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'thin' }}>
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

                  return (
                    <div key={i} style={{
                      flexShrink: 0, width: 48, height: 64, borderRadius: 6,
                      border: `1px solid ${C.separator}`, background: C.materialBg,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                      overflow: 'hidden', position: 'relative',
                    }}>
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
