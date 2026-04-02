import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronRight, RefreshCw, Loader } from 'lucide-react'
import { ApiConfig } from '../../types'
import { C, card } from '../../theme'
import { formatMs, formatTime } from '../../utils/format'
import { apiFetch } from '../../utils/api'

const DEMO_MODE = __DEMO_MODE__

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
  activityWindows: ActivityWindow[]
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

  const roundedStart = new Date(start)
  roundedStart.setSeconds(0, 0)
  roundedStart.setMinutes(Math.floor(roundedStart.getMinutes() / 10) * 10)

  const slots: TimelineSlot[] = []
  for (let t = roundedStart.getTime(); t <= end.getTime(); t += 10 * 60_000) {
    const slotTime = new Date(t)
    const slotEnd = t + 10 * 60_000

    const ss = screenshots.find(s => {
      const ct = new Date(s.capturedAt).getTime()
      return ct >= t && ct < slotEnd
    }) ?? null

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

  const todayStr = (() => { const n = new Date(Date.now() + 7 * 3600_000); return n.toISOString().slice(0, 10) })()
  const isToday = selectedDate === todayStr

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/user/activity?date=${selectedDate}`)
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

  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollLeft = timelineRef.current.scrollWidth
  }, [data])

  const timeline = data ? buildActivityTimeline(data.screenshots, data.timeLogs, data.activity) : []

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

  async function submitManualRequest() {
    if (!manualReqForm) return
    setManualSubmitting(true)
    try {
      const res = await apiFetch('/api/bundy/manual-request', {
        method: 'POST',
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
