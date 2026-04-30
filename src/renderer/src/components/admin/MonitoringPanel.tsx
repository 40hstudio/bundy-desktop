import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Search, Loader, Monitor, Clock, ChevronRight, ChevronLeft, Camera,
  Activity, Globe, Smartphone, BarChart2, TrendingUp, Users, Eye,
  CheckCircle, XCircle, AlertCircle, Image, ArrowUpRight, ArrowDownRight,
  Minus, Zap, MousePointer2, Keyboard, Timer, X, ChevronDown,
  Edit2, Check, Plus, Trash2, RefreshCw,
} from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig } from '../../types'
import { AuthImage } from '../messages/Attachments'

// ─── Types ──────────────────────────────────────────────────────────────────

interface OverviewUser {
  id: string; username: string; alias: string | null; avatarUrl: string | null
  role: string; dailyWorkLimitHours: number
  status: 'Online' | 'On Break' | 'Offline'
  hoursWorked: number; weekHours: number; monthHours: number
  todayTrackedMinutes?: number; statusDuration: string | null
  checkInAt: string | null; clockOutAt: string | null
  lastAction: { action: string; timestamp: string; timestampWIB: string } | null
  todayLogs: { id: string; action: string; timestamp: string; timestampWIB: string }[]
  weekDays: { date: string; hours: number }[]
  monthDays: { date: string; hours: number }[]
}

interface SalaryBase {
  id: string; userId: string; monthlySalary: number; validFrom: string; validUntil: string
  appraisalPercent: number; note: string | null; isAutoAppraisal: boolean; sourceId: string | null
  user: { id: string; username: string; avatarUrl: string | null }
}

interface HolidayDate { id: string; date: string; description: string | null }

interface Screenshot {
  id: string; url: string; capturedAt: string; displayIndex: number | null
  topApp: string | null; mouseActivePct: number | null; keyActivePct: number | null; activityPct: number | null
}

interface ActivityWindow {
  id: string; windowStart: string; mouseEvents: number; keyEvents: number
  activeSeconds: number; totalSeconds: number
  mouseActiveSeconds: number | null; keyActiveSeconds: number | null
  topApps: string | null; topUrls: string | null
}

interface TimeLogEntry { id: string; action: string; timestamp: string }

interface UserActivity {
  screenshots: Screenshot[]; activity: ActivityWindow[]
  topApps: { name: string; seconds: number }[]; topUrls: { name: string; seconds: number }[]
  timeLogs: TimeLogEntry[]
  stats: { activityPercent: number; mousePercent: number; keyPercent: number; mouseEvents: number; keyEvents: number; totalTrackedMinutes: number }
}

interface ManualTimeRequest {
  id: string; userId: string; status: 'pending' | 'approved' | 'rejected'
  startTime: string; endTime: string; reason: string; adminNote: string | null
  createdAt: string; reviewedAt: string | null
  user: { id: string; username: string; alias: string | null; avatarUrl: string | null }
}

interface AnalyticsData {
  totalMs: number; prevTotalMs: number; activityPercent: number; prevActivityPercent: number
  dailyHours: { date: string; totalHours: number; activityPct: number | null; users: { userId: string; username: string; alias: string | null; hours: number }[] }[]
  topApps: { name: string; seconds: number }[]; topUrls: { name: string; seconds: number }[]
  userStats: { userId: string; username: string; alias: string | null; avatarUrl: string | null; totalMs: number; activityPercent: number }[]
  rankings: {
    mostTime: { userId: string; username: string; alias: string | null; avatarUrl: string | null; hours: number }[]
    leastTime: { userId: string; username: string; alias: string | null; avatarUrl: string | null; hours: number }[]
    mostIdle: { userId: string; username: string; alias: string | null; avatarUrl: string | null; idleMinutes: number }[]
  }
}

interface CurrentAppInfo { app: string | null; url: string | null }

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = { Online: C.success, 'On Break': C.warning, Offline: C.textMuted }
const ACTION_COLORS: Record<string, string> = { CHECK_IN: C.success, BREAK: C.warning, BACK: C.success, CLOCK_OUT: C.textMuted, NONE: C.textMuted }
const CHART_COLORS = ['#6c5ce7', '#0984e3', '#00b894', '#fd79a8', '#fdcb6e', '#e17055', '#74b9ff', '#55efc4', '#a29bfe', '#fab1a0']

function authHeaders(token: string) { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
function msToHM(ms: number) { const t = Math.round(ms / 60_000); const h = Math.floor(t / 60); const m = t % 60; if (h === 0) return `${m}m`; if (m === 0) return `${h}h`; return `${h}h ${m}m` }
function secToHM(s: number) { return msToHM(s * 1000) }
function hoursToHHMM(h: number) { const t = Math.round(h * 60); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }
function fmtIDR(n: number) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n) }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }) }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta', hour12: false }) }
function fmtDateTime(iso: string) { return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta', hour12: false }) }
function avatarColor(name: string) { const p = ['#6c5ce7', '#00b894', '#0984e3', '#e17055', '#fd79a8', '#00cec9', '#e84393', '#a29bfe', '#74b9ff', '#55efc4']; let h = 0; for (const c of name) h = ((h * 31) + c.charCodeAt(0)) >>> 0; return p[h % p.length] }
function diffLabel(cur: number, prev: number) {
  if (prev === 0) return { text: cur > 0 ? '+∞' : '—', positive: cur > 0 }
  const pct = Math.round(((cur - prev) / prev) * 100)
  return { text: `${pct >= 0 ? '+' : ''}${pct}%`, positive: pct >= 0 }
}
function calcSalaryFromDays(days: { date: string; hours: number }[], hourly: number, holidays: HolidayDate[]): number {
  const hSet = new Set(holidays.map(h => h.date.slice(0, 10)))
  let total = 0
  for (const { date, hours } of days) {
    if (hours <= 0) continue
    const dow = new Date(date + 'T00:00:00').getDay()
    const isSpecial = dow === 0 || dow === 6 || hSet.has(date.slice(0, 10))
    if (isSpecial) { total += Math.min(hours, 8) * 2 * hourly + Math.max(0, hours - 8) * 3 * hourly }
    else { total += Math.min(hours, 8) * hourly + Math.min(Math.max(0, hours - 8), 4) * 2 * hourly + Math.max(0, hours - 12) * 3 * hourly }
  }
  return total
}
function todayStr() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) }

// ─── Subview enum ───────────────────────────────────────────────────────────
type SubView = 'dashboard' | 'user-detail'

// ═════════════════════════════════════════════════════════════════════════════
// MAIN MONITORING PANEL
// ═════════════════════════════════════════════════════════════════════════════

export default function MonitoringPanel({ config }: { config: ApiConfig }) {
  const [view, setView] = useState<SubView>('dashboard')
  const [overview, setOverview] = useState<OverviewUser[]>([])
  const [bases, setBases] = useState<SalaryBase[]>([])
  const [holidays, setHolidays] = useState<HolidayDate[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [manualRequests, setManualRequests] = useState<ManualTimeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [analyticsRange, setAnalyticsRange] = useState<'today' | 'week' | 'month'>('week')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [currentApps, setCurrentApps] = useState<Record<string, CurrentAppInfo>>({})

  const fetchAll = useCallback(async () => {
    const headers = { Authorization: `Bearer ${config.token}` }
    const [ovRes, bRes, hRes, mrRes] = await Promise.all([
      fetch(`${config.apiBase}/api/admin/overview`, { headers }),
      fetch(`${config.apiBase}/api/admin/salary/bases`, { headers }),
      fetch(`${config.apiBase}/api/admin/salary/holidays`, { headers }),
      fetch(`${config.apiBase}/api/admin/manual-requests`, { headers }),
    ])
    if (ovRes.ok) { const d = await ovRes.json() as { users: OverviewUser[] }; setOverview(d.users) }
    if (bRes.ok) { const d = await bRes.json() as { bases: SalaryBase[] }; setBases(d.bases) }
    if (hRes.ok) { const d = await hRes.json() as { holidays: HolidayDate[] }; setHolidays(d.holidays) }
    if (mrRes.ok) { const d = await mrRes.json() as { requests: ManualTimeRequest[] }; setManualRequests(d.requests) }
    setLoading(false)
  }, [config])

  useEffect(() => { void fetchAll() }, [fetchAll])

  // Auto-refresh overview every 30s
  useEffect(() => {
    const iv = setInterval(async () => {
      const res = await fetch(`${config.apiBase}/api/admin/overview`, { headers: { Authorization: `Bearer ${config.token}` } })
      if (res.ok) { const d = await res.json() as { users: OverviewUser[] }; setOverview(d.users) }
    }, 30_000)
    return () => clearInterval(iv)
  }, [config])

  // Real-time current app for ALL online users — one consolidated query
  // every 2s instead of one query per user. See P3.13.
  useEffect(() => {
    const online = overview.filter(u => u.status !== 'Offline')
    if (online.length === 0) return
    const headers = { Authorization: `Bearer ${config.token}` }
    const fetchApps = async () => {
      try {
        const res = await fetch(`${config.apiBase}/api/admin/online-users`, { headers })
        if (!res.ok) return
        const data = await res.json() as { users: Array<{ userId: string; app: string | null; url: string | null }> }
        const results: Record<string, CurrentAppInfo> = {}
        for (const u of data.users) {
          results[u.userId] = { app: u.app, url: u.url } as CurrentAppInfo
        }
        setCurrentApps(results)
      } catch { /* ignore */ }
    }
    void fetchApps()
    const iv = setInterval(fetchApps, 2_000)
    return () => clearInterval(iv)
  }, [config, overview.map(u => u.id + u.status).join()])

  // Fetch analytics
  useEffect(() => {
    fetch(`${config.apiBase}/api/admin/analytics?range=${analyticsRange}`, { headers: { Authorization: `Bearer ${config.token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setAnalytics(d as AnalyticsData) })
      .catch(() => {})
  }, [analyticsRange, config])

  const pendingRequests = manualRequests.filter(r => r.status === 'pending')

  if (loading) return <CenterLoader />

  if (view === 'user-detail' && selectedUserId) {
    const user = overview.find(u => u.id === selectedUserId)
    if (!user) { setView('dashboard'); return null }
    return (
      <UserDetailView
        config={config}
        user={user}
        bases={bases.filter(b => b.userId === user.id)}
        holidays={holidays}
        currentApp={currentApps[user.id] ?? null}
        onBack={() => setView('dashboard')}
      />
    )
  }

  const onlineCount = overview.filter(u => u.status === 'Online').length
  const breakCount = overview.filter(u => u.status === 'On Break').length
  const offlineCount = overview.filter(u => u.status === 'Offline').length

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        padding: '16px 24px 12px', flexShrink: 0,
        borderBottom: `1px solid ${C.separator}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: onlineCount > 0 ? C.success : C.textMuted, boxShadow: onlineCount > 0 ? `0 0 8px ${C.success}` : 'none' }} />
          <span style={{ color: C.white, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>Monitoring</span>
          <span style={{ fontSize: 11, color: C.textMuted, padding: '2px 8px', background: C.bgInput, borderRadius: 6 }}>{overview.length} members</span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {pendingRequests.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: C.warning, background: 'rgba(204, 167, 0, 0.12)', padding: '3px 10px', borderRadius: 6 }}>
              <AlertCircle size={12} /> {pendingRequests.length} pending
            </span>
          )}
          <StatPill label="Online" value={onlineCount} color={C.success} />
          <StatPill label="Break" value={breakCount} color={C.warning} />
          <StatPill label="Offline" value={offlineCount} color={C.textMuted} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {/* ── Live Team Grid ── */}
        <SectionHeader icon={<Users size={14} />} title="Live Team" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginBottom: 28 }}>
          {overview.map(m => {
            const sc = STATUS_COLORS[m.status] ?? C.textMuted
            const todayH = m.hoursWorked
            const ca = currentApps[m.id]
            const userBase = bases.find(b => {
              const today = todayStr()
              return b.userId === m.id && today >= b.validFrom.slice(0, 10) && today <= b.validUntil.slice(0, 10)
            })
            const todayCost = userBase ? todayH * (userBase.monthlySalary / 160) : null
            return (
              <button key={m.id} onClick={() => { setSelectedUserId(m.id); setView('user-detail') }}
                style={{
                  background: C.bgInput, borderRadius: 10, padding: 12, border: `1px solid transparent`,
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s ease',
                  position: 'relative', overflow: 'hidden',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = C.bgActive }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = C.bgInput }}
              >

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <AvatarCircle name={m.alias ?? m.username} url={m.avatarUrl} size={32} />
                    <span style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: sc, border: `2px solid ${C.bgInput}`, boxShadow: m.status === 'Online' ? `0 0 6px ${sc}` : 'none' }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: C.white, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.alias ?? m.username}</div>
                    <div style={{ color: sc, fontSize: 10, fontWeight: 500 }}>{m.status}{m.statusDuration && m.status !== 'Offline' ? ` · ${m.statusDuration}` : ''}</div>
                  </div>
                  <ChevronRight size={12} color={C.textMuted} style={{ opacity: 0.4, flexShrink: 0 }} />
                </div>

                {/* Current app - real time */}
                {ca?.app && m.status !== 'Offline' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, padding: '3px 6px', background: 'rgba(0, 122, 204, 0.08)', borderRadius: 4 }}>
                    <Monitor size={9} color={C.accent} />
                    <span style={{ color: C.accent, fontSize: 9, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ca.app}</span>
                    {ca.url && <span style={{ color: C.textMuted, fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {ca.url}</span>}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
                  <div>
                    <div style={{ color: C.textMuted, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Today</div>
                    <div style={{ color: C.white, fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{hoursToHHMM(todayH)}</div>
                  </div>
                  {todayCost !== null && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: C.textMuted, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Cost</div>
                      <div style={{ color: C.success, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtIDR(todayCost)}</div>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: m.dailyWorkLimitHours > 0 ? `${Math.min(100, (todayH / m.dailyWorkLimitHours) * 100)}%` : '0%',
                    background: `linear-gradient(90deg, ${sc}, ${sc}88)`, transition: 'width 0.3s',
                  }} />
                </div>
                <div style={{ color: C.textMuted, fontSize: 8, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {hoursToHHMM(todayH)} / {hoursToHHMM(m.dailyWorkLimitHours)}
                </div>
              </button>
            )
          })}
        </div>

        {/* ── Manual Time Requests ── */}
        {pendingRequests.length > 0 && (
          <>
            <SectionHeader icon={<AlertCircle size={14} />} title="Pending Time Requests" count={pendingRequests.length} accentColor={C.warning} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 28 }}>
              {pendingRequests.map(req => (
                <ManualRequestCard key={req.id} req={req} config={config} onAction={fetchAll} />
              ))}
            </div>
          </>
        )}

        {/* ── Analytics ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <SectionHeader icon={<BarChart2 size={14} />} title="Analytics" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* CSV export — covers the same range as the analytics tabs (P3.15) */}
            <button
              onClick={() => {
                const today = new Date()
                const fmt = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
                let from = fmt(today), to = fmt(today)
                if (analyticsRange === 'week') {
                  const start = new Date(today.getTime() - 6 * 86400000)
                  from = fmt(start); to = fmt(today)
                } else if (analyticsRange === 'month') {
                  const start = new Date(today.getTime() - 29 * 86400000)
                  from = fmt(start); to = fmt(today)
                }
                const url = `${config.apiBase}/api/admin/activity/export?from=${from}&to=${to}`
                fetch(url, { headers: { Authorization: `Bearer ${config.token}` } })
                  .then(r => r.blob())
                  .then(blob => {
                    const dl = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = dl
                    a.download = `activity-${from}_to_${to}.csv`
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                    URL.revokeObjectURL(dl)
                  })
                  .catch(() => {})
              }}
              title="Export current range as CSV"
              style={{
                padding: '4px 10px', borderRadius: 4, border: `1px solid ${C.separator}`,
                background: 'transparent', color: C.textMuted, cursor: 'pointer',
                fontSize: 10, fontWeight: 600, letterSpacing: 0.3, fontFamily: 'inherit',
              }}
            >Export CSV</button>
            <div style={{ display: 'flex', gap: 2, background: C.bgInput, borderRadius: 6, padding: 2 }}>
              {(['today', 'week', 'month'] as const).map(r => (
                <button key={r} onClick={() => setAnalyticsRange(r)}
                  style={{
                    padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
                    fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
                    background: analyticsRange === r ? 'rgba(0, 122, 204, 0.15)' : 'transparent',
                    color: analyticsRange === r ? C.accent : C.textMuted,
                    transition: 'all 0.1s',
                  }}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {analytics ? (
          <>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {(() => {
                let totalEarned = 0
                for (const day of analytics.dailyHours) {
                  for (const u of day.users) {
                    const b = bases.find(sb => sb.userId === u.userId && day.date >= sb.validFrom.slice(0, 10) && day.date <= sb.validUntil.slice(0, 10))
                    if (b) totalEarned += calcSalaryFromDays([{ date: day.date, hours: u.hours }], b.monthlySalary / 160, holidays)
                  }
                }
                const td = diffLabel(analytics.totalMs, analytics.prevTotalMs)
                const ad = diffLabel(analytics.activityPercent, analytics.prevActivityPercent)
                return [
                  { label: 'Total Time', value: msToHM(analytics.totalMs), diff: td, icon: <Timer size={12} /> },
                  { label: 'Avg Activity', value: analytics.activityPercent > 0 ? `${analytics.activityPercent}%` : '—', diff: ad, icon: <Zap size={12} /> },
                  { label: 'Spend', value: fmtIDR(totalEarned), diff: null, icon: <TrendingUp size={12} /> },
                ].map(({ label, value, diff, icon }) => (
                  <div key={label} style={{ background: C.bgInput, borderRadius: 10, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, ${C.accent}44, transparent)` }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                      <span style={{ color: C.textMuted }}>{icon}</span>
                      <span style={{ color: C.textMuted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{label}</span>
                    </div>
                    <div style={{ color: C.white, fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                    {diff && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 4 }}>
                        {diff.positive ? <ArrowUpRight size={10} color={C.success} /> : <ArrowDownRight size={10} color={C.danger} />}
                        <span style={{ color: diff.positive ? C.success : C.danger, fontSize: 10, fontWeight: 600 }}>{diff.text}</span>
                        <span style={{ color: C.textMuted, fontSize: 9 }}>vs prev</span>
                      </div>
                    )}
                  </div>
                ))
              })()}
            </div>

            {/* Rankings */}
            {(analytics.rankings.mostTime.length > 0 || analytics.rankings.leastTime.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                {[
                  { label: 'Most Time', entries: analytics.rankings.mostTime.map(u => ({ name: u.alias ?? u.username, value: msToHM(u.hours * 3_600_000) })), color: C.success },
                  { label: 'Least Time', entries: analytics.rankings.leastTime.map(u => ({ name: u.alias ?? u.username, value: msToHM(u.hours * 3_600_000) })), color: C.warning },
                  { label: 'Most Idle', entries: analytics.rankings.mostIdle.map(u => ({ name: u.alias ?? u.username, value: msToHM(u.idleMinutes * 60_000) })), color: C.danger },
                ].map(({ label, entries, color }) => (
                  <div key={label} style={{ background: C.bgInput, borderRadius: 10, padding: 12 }}>
                    <div style={{ color, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>{label}</div>
                    {entries.length === 0 ? <div style={{ color: C.textMuted, fontSize: 10 }}>—</div> : entries.map((e, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 4, marginBottom: 3 }}>
                        <span style={{ color: C.text, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 14, height: 14, borderRadius: 3, background: avatarColor(e.name), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 7, fontWeight: 700, flexShrink: 0 }}>{e.name.charAt(0).toUpperCase()}</span>
                          {e.name}
                        </span>
                        <span style={{ color: C.accent, fontSize: 10, fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{e.value}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Top Apps & URLs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Top Apps', icon: <Smartphone size={12} />, items: analytics.topApps },
                { label: 'Top Websites', icon: <Globe size={12} />, items: analytics.topUrls },
              ].map(({ label, icon, items }) => (
                <div key={label} style={{ background: C.bgInput, borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                    <span style={{ color: C.textMuted }}>{icon}</span>
                    <span style={{ color: C.textMuted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{label}</span>
                  </div>
                  {items.length === 0 ? <div style={{ color: C.textMuted, fontSize: 10, textAlign: 'center', padding: 8 }}>No data</div> : (
                    items.slice(0, 6).map((item, i) => {
                      const total = items.reduce((s, d) => s + d.seconds, 0)
                      const pct = total > 0 ? Math.round((item.seconds / total) * 100) : 0
                      return (
                        <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span style={{ color: C.text, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                              <span style={{ color: C.textMuted, fontSize: 9, flexShrink: 0, marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>{secToHM(item.seconds)}</span>
                            </div>
                            <div style={{ height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: 1, background: CHART_COLORS[i % CHART_COLORS.length], width: `${pct}%`, opacity: 0.7 }} />
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              ))}
            </div>


          </>
        ) : <CenterLoader />}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// USER DETAIL VIEW
// ═════════════════════════════════════════════════════════════════════════════

function UserDetailView({ config, user, bases, holidays, currentApp, onBack }: {
  config: ApiConfig; user: OverviewUser; bases: SalaryBase[]; holidays: HolidayDate[]
  currentApp: CurrentAppInfo | null; onBack: () => void
}) {
  const [date, setDate] = useState(todayStr())
  const [activityData, setActivityData] = useState<UserActivity | null>(null)
  const [loadingActivity, setLoadingActivity] = useState(true)
  const [tab, setTab] = useState<'overview' | 'screenshots' | 'timeline' | 'apps' | 'salary'>('overview')
  const [lightbox, setLightbox] = useState<number | null>(null) // index into screenshots
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [liveApp, setLiveApp] = useState<CurrentAppInfo | null>(currentApp)

  const allScreenshots = activityData?.screenshots ?? []
  const openLightbox = useCallback((s: Screenshot) => {
    const idx = allScreenshots.findIndex(ss => ss.id === s.id)
    setLightbox(idx >= 0 ? idx : null)
  }, [allScreenshots])

  // Fetch activity for selected date
  const fetchActivity = useCallback(async () => {
    setLoadingActivity(true)
    try {
      const res = await fetch(`${config.apiBase}/api/admin/activity?userId=${user.id}&date=${date}`, {
        headers: { Authorization: `Bearer ${config.token}` },
      })
      if (res.ok) setActivityData(await res.json() as UserActivity)
    } catch { /* */ }
    setLoadingActivity(false)
  }, [config, user.id, date])

  useEffect(() => { void fetchActivity() }, [fetchActivity])

  // Real-time current app polling
  useEffect(() => {
    if (user.status === 'Offline') return
    const poll = async () => {
      try {
        const res = await fetch(`${config.apiBase}/api/user/current-activity?userId=${user.id}`, {
          headers: { Authorization: `Bearer ${config.token}` },
        })
        if (res.ok) setLiveApp(await res.json() as CurrentAppInfo)
      } catch { /* */ }
    }
    void poll()
    const iv = setInterval(poll, 10_000)
    return () => clearInterval(iv)
  }, [config, user.id, user.status])

  const sc = STATUS_COLORS[user.status] ?? C.textMuted
  const tabs: { key: typeof tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <Activity size={13} /> },
    { key: 'screenshots', label: 'Screenshots', icon: <Camera size={13} /> },
    { key: 'timeline', label: 'Time Log', icon: <Clock size={13} /> },
    { key: 'apps', label: 'Apps & URLs', icon: <Globe size={13} /> },
    { key: 'salary', label: 'Salary', icon: <TrendingUp size={13} /> },
  ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', flexShrink: 0, borderBottom: `1px solid ${C.separator}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={onBack} style={{ background: C.bgInput, border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: C.textMuted, fontSize: 11, fontWeight: 600, transition: 'all 0.1s' }}
            onMouseEnter={e => e.currentTarget.style.background = C.bgActive}
            onMouseLeave={e => e.currentTarget.style.background = C.bgInput}
          >
            <ChevronLeft size={14} /> Back
          </button>
          <div style={{ flex: 1 }} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ background: C.bgInput, border: `1px solid ${C.separator}`, borderRadius: 6, padding: '5px 10px', color: C.text, fontSize: 11, outline: 'none' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative' }}>
            <AvatarCircle name={user.alias ?? user.username} url={user.avatarUrl} size={44} />
            <span style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: '50%', background: sc, border: `2px solid ${C.bgPrimary}`, boxShadow: user.status === 'Online' ? `0 0 8px ${sc}` : 'none' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: C.white, fontSize: 16, fontWeight: 700 }}>{user.alias ?? user.username}</span>
              <span style={{ color: sc, fontSize: 11, fontWeight: 600, padding: '2px 8px', background: `${sc}18`, borderRadius: 4 }}>{user.status}</span>
            </div>
            {/* Real-time app */}
            {liveApp?.app && user.status !== 'Offline' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <Monitor size={11} color={C.accent} />
                <span style={{ color: C.accent, fontSize: 11, fontWeight: 500 }}>{liveApp.app}</span>
                {liveApp.url && <span style={{ color: C.textMuted, fontSize: 11 }}>— {liveApp.url}</span>}
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.success, marginLeft: 2, animation: 'pulse 2s infinite' }} />
              </div>
            )}
          </div>
          {/* Quick stats */}
          <div style={{ display: 'flex', gap: 16 }}>
            <QuickStat label="Today" value={hoursToHHMM(user.hoursWorked)} />
            <QuickStat label="Week" value={hoursToHHMM(user.weekHours)} />
            <QuickStat label="Month" value={hoursToHHMM(user.monthHours)} />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginTop: 14 }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 600,
                background: tab === t.key ? 'rgba(0, 122, 204, 0.12)' : 'transparent',
                color: tab === t.key ? C.accent : C.textMuted,
                transition: 'all 0.1s',
              }}
              onMouseEnter={e => { if (tab !== t.key) e.currentTarget.style.background = C.bgHover }}
              onMouseLeave={e => { if (tab !== t.key) e.currentTarget.style.background = 'transparent' }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {loadingActivity ? <CenterLoader /> : !activityData ? (
          <div style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', padding: 40 }}>No activity data for {fmtDate(date)}</div>
        ) : (
          <>
            {tab === 'overview' && <OverviewTab data={activityData} user={user} config={config} onScreenshotClick={openLightbox} />}
            {tab === 'screenshots' && <ScreenshotsTab data={activityData} config={config} onScreenshotClick={openLightbox} />}
            {tab === 'timeline' && <TimelineTab data={activityData} user={user} config={config} date={date} onRefresh={fetchActivity} />}
            {tab === 'apps' && <AppsTab data={activityData} config={config} userId={user.id} />}
            {tab === 'salary' && <SalaryTab user={user} bases={bases} holidays={holidays} />}
          </>
        )}
      </div>

      {/* Lightbox with navigation */}
      {lightbox !== null && allScreenshots[lightbox] && (() => {
        const shot = allScreenshots[lightbox]
        const hasPrev = lightbox > 0
        const hasNext = lightbox < allScreenshots.length - 1
        return (
          <div onClick={() => setLightbox(null)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out',
          }}
            onKeyDown={e => {
              if (e.key === 'ArrowLeft' && hasPrev) { e.stopPropagation(); setLightbox(lightbox - 1) }
              if (e.key === 'ArrowRight' && hasNext) { e.stopPropagation(); setLightbox(lightbox + 1) }
              if (e.key === 'Escape') setLightbox(null)
            }}
            tabIndex={0}
            ref={el => el?.focus()}
          >
            {/* Close button */}
            <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
              <X size={16} color="#fff" />
            </button>

            {/* Counter */}
            <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontVariantNumeric: 'tabular-nums', zIndex: 1 }}>
              {lightbox + 1} / {allScreenshots.length}
            </div>

            {/* Previous button */}
            {hasPrev && (
              <button onClick={e => { e.stopPropagation(); setLightbox(lightbox - 1) }}
                style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
              >
                <ChevronLeft size={20} color="#fff" />
              </button>
            )}

            {/* Next button */}
            {hasNext && (
              <button onClick={e => { e.stopPropagation(); setLightbox(lightbox + 1) }}
                style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
              >
                <ChevronRight size={20} color="#fff" />
              </button>
            )}

            {/* Image */}
            <div onClick={e => e.stopPropagation()} style={{ maxWidth: '85vw', maxHeight: '88vh', cursor: 'default' }}>
              <AuthImage src={`${config.apiBase}${shot.url}`} config={config} style={{ maxWidth: '85vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8 }} />
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10, alignItems: 'center' }}>
                <span style={{ color: '#fff', fontSize: 11 }}>{fmtTime(shot.capturedAt)}</span>
                {shot.topApp && <span style={{ color: C.accent, fontSize: 11 }}>{shot.topApp}</span>}
                {shot.activityPct != null && <span style={{ color: C.success, fontSize: 11 }}>Activity: {shot.activityPct}%</span>}
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(shot.id) }}
                  title="Delete screenshot"
                  style={{
                    background: 'rgba(240,71,71,0.2)', border: `1px solid ${C.danger}55`, borderRadius: 6,
                    padding: '4px 10px', cursor: 'pointer', color: C.danger,
                    fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >Delete</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Confirm-delete modal — admin-only screenshot removal (P0.4) */}
      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: C.bgPrimary, border: `1px solid ${C.separator}`, borderRadius: 10,
            padding: 20, width: 360, color: C.text,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Delete this screenshot?</div>
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, marginBottom: 16 }}>
              The image is removed from disk and the row is soft-deleted. This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                style={{
                  padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.separator}`,
                  background: 'transparent', color: C.text, fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >Cancel</button>
              <button
                onClick={async () => {
                  if (!confirmDelete) return
                  setDeleting(true)
                  try {
                    await fetch(`${config.apiBase}/api/admin/screenshots/${confirmDelete}`, {
                      method: 'DELETE',
                      headers: { Authorization: `Bearer ${config.token}` },
                    })
                    setConfirmDelete(null)
                    setLightbox(null)
                    // refresh activity (will skip the soft-deleted row)
                    setActivityData(prev => prev ? { ...prev, screenshots: prev.screenshots.filter(s => s.id !== confirmDelete) } : prev)
                  } catch { /* surface via toast or noop — server will retry next load */ }
                  finally { setDeleting(false) }
                }}
                disabled={deleting}
                style={{
                  padding: '7px 14px', borderRadius: 6, border: 'none',
                  background: C.danger, color: '#fff', fontSize: 12, fontWeight: 600,
                  cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.6 : 1,
                  fontFamily: 'inherit',
                }}
              >{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB — Quick summary with activity timeline + recent screenshots
// ═════════════════════════════════════════════════════════════════════════════

function OverviewTab({ data, user, config, onScreenshotClick }: {
  data: UserActivity; user: OverviewUser; config: ApiConfig; onScreenshotClick: (s: Screenshot) => void
}) {
  return (
    <>
      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'Tracked', value: `${Math.floor(data.stats.totalTrackedMinutes / 60)}h ${data.stats.totalTrackedMinutes % 60}m`, icon: <Timer size={12} />, color: C.accent },
          { label: 'Activity', value: `${data.stats.activityPercent}%`, icon: <Zap size={12} />, color: data.stats.activityPercent >= 50 ? C.success : C.warning },
          { label: 'Mouse', value: `${data.stats.mousePercent}%`, icon: <MousePointer2 size={12} />, color: C.accent },
          { label: 'Keyboard', value: `${data.stats.keyPercent}%`, icon: <Keyboard size={12} />, color: C.accent },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{ background: C.bgInput, borderRadius: 8, padding: '12px 14px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, ${color}44, transparent)` }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <span style={{ color }}>{icon}</span>
              <span style={{ color: C.textMuted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>{label}</span>
            </div>
            <div style={{ color: C.white, fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Activity heatmap timeline */}
      <SectionHeader icon={<Activity size={14} />} title="Activity Timeline" />
      <ActivityHeatmap windows={data.activity} />

      {/* Recent screenshots */}
      {data.screenshots.length > 0 && (
        <>
          <SectionHeader icon={<Camera size={14} />} title={`Screenshots (${data.screenshots.length})`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 20 }}>
            {data.screenshots.slice(-8).map(s => (
              <ScreenshotCard key={s.id} shot={s} config={config} onClick={() => onScreenshotClick(s)} />
            ))}
          </div>
        </>
      )}

      {/* Time log summary */}
      <SectionHeader icon={<Clock size={14} />} title="Time Log" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 }}>
        {data.timeLogs.length === 0 ? <div style={{ color: C.textMuted, fontSize: 11, padding: 12 }}>No time logs</div> :
          data.timeLogs.map((log, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: ACTION_COLORS[log.action] ?? C.textMuted }} />
              <span style={{ color: C.text, fontSize: 12, fontVariantNumeric: 'tabular-nums', width: 44, flexShrink: 0 }}>{fmtTime(log.timestamp)}</span>
              <span style={{ color: ACTION_COLORS[log.action] ?? C.textMuted, fontSize: 11, fontWeight: 600 }}>{log.action.replace('_', ' ')}</span>
            </div>
          ))
        }
      </div>
    </>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS TAB — Full screenshot gallery with activity overlay
// ═════════════════════════════════════════════════════════════════════════════

function ScreenshotsTab({ data, config, onScreenshotClick }: {
  data: UserActivity; config: ApiConfig; onScreenshotClick: (s: Screenshot) => void
}) {
  if (data.screenshots.length === 0) {
    return <EmptyState icon={<Camera size={36} strokeWidth={1} />} text="No screenshots captured" />
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
      {data.screenshots.map(s => (
        <ScreenshotCard key={s.id} shot={s} config={config} onClick={() => onScreenshotClick(s)} large />
      ))}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// TIMELINE TAB — Time log viewer + modifier + manual time request approver
// ═════════════════════════════════════════════════════════════════════════════

function TimelineTab({ data, user, config, date, onRefresh }: {
  data: UserActivity; user: OverviewUser; config: ApiConfig; date: string; onRefresh: () => void
}) {
  const [addingLog, setAddingLog] = useState(false)
  const [newAction, setNewAction] = useState('CHECK_IN')
  const [newTime, setNewTime] = useState('09:00')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAction, setEditAction] = useState('')
  const [editTime, setEditTime] = useState('')
  const [manualRequests, setManualRequests] = useState<ManualTimeRequest[]>([])
  const [loadingReqs, setLoadingReqs] = useState(true)

  // Fetch manual time requests for this user
  useEffect(() => {
    fetch(`${config.apiBase}/api/admin/manual-requests`, {
      headers: { Authorization: `Bearer ${config.token}` },
    }).then(r => r.ok ? r.json() : { requests: [] })
      .then(d => setManualRequests((d as { requests: ManualTimeRequest[] }).requests.filter(r => r.userId === user.id)))
      .catch(() => {})
      .finally(() => setLoadingReqs(false))
  }, [config, user.id])

  async function addTimeLog() {
    setSaving(true)
    const timestamp = new Date(`${date}T${newTime}:00+07:00`).toISOString()
    await fetch(`${config.apiBase}/api/admin/manual-timelog`, {
      method: 'POST', headers: authHeaders(config.token),
      body: JSON.stringify({ userId: user.id, action: newAction, timestamp }),
    })
    setSaving(false); setAddingLog(false)
    onRefresh()
  }

  async function updateTimeLog(logId: string) {
    setSaving(true)
    const timestamp = new Date(`${date}T${editTime}:00+07:00`).toISOString()
    await fetch(`${config.apiBase}/api/admin/manual-timelog`, {
      method: 'PATCH', headers: authHeaders(config.token),
      body: JSON.stringify({ id: logId, action: editAction, timestamp }),
    })
    setSaving(false); setEditingId(null)
    onRefresh()
  }

  async function deleteTimeLog(logId: string) {
    setSaving(true)
    await fetch(`${config.apiBase}/api/admin/manual-timelog?id=${logId}`, {
      method: 'DELETE', headers: authHeaders(config.token),
    })
    setSaving(false)
    onRefresh()
  }

  function startEdit(log: TimeLogEntry) {
    setEditingId(log.id)
    setEditAction(log.action)
    // Extract HH:MM from timestamp in WIB
    setEditTime(fmtTime(log.timestamp))
  }

  async function handleRequest(reqId: string, action: 'approved' | 'rejected') {
    await fetch(`${config.apiBase}/api/admin/manual-requests`, {
      method: 'PATCH', headers: authHeaders(config.token),
      body: JSON.stringify({ id: reqId, action }),
    })
    setManualRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: action } : r))
    onRefresh()
  }

  // Build timeline entries from logs + activity windows
  const timeline = useMemo(() => {
    const entries: { time: string; type: 'log' | 'activity'; log?: TimeLogEntry; window?: ActivityWindow }[] = []
    for (const log of data.timeLogs) entries.push({ time: log.timestamp, type: 'log', log })
    for (const win of data.activity) entries.push({ time: win.windowStart, type: 'activity', window: win })
    entries.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    return entries
  }, [data])

  const pendingReqs = manualRequests.filter(r => r.status === 'pending')
  const reviewedReqs = manualRequests.filter(r => r.status !== 'pending')

  return (
    <>
      {/* Pending requests */}
      {pendingReqs.length > 0 && (
        <>
          <SectionHeader icon={<AlertCircle size={14} />} title="Pending Time Requests" count={pendingReqs.length} accentColor={C.warning} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {pendingReqs.map(req => (
              <div key={req.id} style={{ background: C.bgInput, borderRadius: 10, padding: 14, border: `1px solid rgba(204, 167, 0, 0.2)` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ color: C.white, fontSize: 12, fontWeight: 600 }}>
                      {fmtDateTime(req.startTime)} → {fmtTime(req.endTime)}
                    </div>
                    <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>{req.reason}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => void handleRequest(req.id, 'approved')}
                      style={{ background: 'rgba(67, 181, 129, 0.12)', border: `1px solid ${C.success}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', color: C.success, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={12} /> Approve
                    </button>
                    <button onClick={() => void handleRequest(req.id, 'rejected')}
                      style={{ background: 'rgba(240, 71, 71, 0.12)', border: `1px solid ${C.danger}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', color: C.danger, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add time log */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <SectionHeader icon={<Clock size={14} />} title="Time Log" />
        <button onClick={() => setAddingLog(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.separator}`, background: 'transparent', cursor: 'pointer', color: C.textMuted, fontSize: 10, fontWeight: 600, transition: 'all 0.1s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.separator; e.currentTarget.style.color = C.textMuted }}
        >
          <Plus size={12} /> Add Entry
        </button>
      </div>

      {addingLog && (
        <div style={{ background: C.bgInput, borderRadius: 10, padding: 14, marginBottom: 12, border: `1px solid ${C.accent}44`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <select value={newAction} onChange={e => setNewAction(e.target.value)}
            style={{ background: C.bgTertiary, border: `1px solid ${C.separator}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 11, outline: 'none' }}>
            {['CHECK_IN', 'BREAK', 'BACK', 'CLOCK_OUT'].map(a => <option key={a} value={a}>{a.replace('_', ' ')}</option>)}
          </select>
          <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
            style={{ background: C.bgTertiary, border: `1px solid ${C.separator}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 11, outline: 'none' }} />
          <button onClick={() => void addTimeLog()} disabled={saving}
            style={{ background: C.accentLight, border: `1px solid ${C.accent}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer', color: C.accent, fontSize: 11, fontWeight: 600 }}>
            {saving ? 'Saving...' : 'Add'}
          </button>
          <button onClick={() => setAddingLog(false)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={14} color={C.textMuted} />
          </button>
        </div>
      )}

      {/* Timeline */}
      <div style={{ position: 'relative', paddingLeft: 20 }}>
        {/* Vertical line */}
        <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 1, background: C.separator }} />
        {timeline.length === 0 ? <div style={{ color: C.textMuted, fontSize: 11, padding: 12 }}>No entries</div> :
          timeline.map((entry, i) => (
            <div key={i} style={{ position: 'relative', marginBottom: 8, paddingBottom: 4 }}>
              {/* Dot */}
              <div style={{
                position: 'absolute', left: -16, top: 4, width: 8, height: 8, borderRadius: '50%',
                background: entry.type === 'log' ? (ACTION_COLORS[entry.log!.action] ?? C.textMuted) : 'rgba(0, 122, 204, 0.5)',
                border: `2px solid ${C.bgPrimary}`,
              }} />
              {entry.type === 'log' && entry.log ? (
                editingId === entry.log.id ? (
                  /* Inline edit form */
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                    <select value={editAction} onChange={e => setEditAction(e.target.value)}
                      style={{ background: C.bgTertiary, border: `1px solid ${C.separator}`, borderRadius: 4, padding: '4px 6px', color: C.text, fontSize: 10, outline: 'none' }}>
                      {['CHECK_IN', 'BREAK', 'BACK', 'CLOCK_OUT'].map(a => <option key={a} value={a}>{a.replace('_', ' ')}</option>)}
                    </select>
                    <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)}
                      style={{ background: C.bgTertiary, border: `1px solid ${C.separator}`, borderRadius: 4, padding: '4px 6px', color: C.text, fontSize: 10, outline: 'none', width: 72 }} />
                    <button onClick={() => void updateTimeLog(entry.log!.id)} disabled={saving}
                      style={{ background: 'rgba(67, 181, 129, 0.12)', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', color: C.success, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Check size={10} /> {saving ? '...' : 'Save'}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 3 }}>
                      <X size={12} color={C.textMuted} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', group: 'true' }}>
                    <span style={{ color: C.text, fontSize: 11, fontVariantNumeric: 'tabular-nums', width: 40, flexShrink: 0, fontWeight: 600 }}>{fmtTime(entry.time)}</span>
                    <span style={{
                      color: ACTION_COLORS[entry.log.action] ?? C.textMuted, fontSize: 10, fontWeight: 600,
                      padding: '2px 8px', borderRadius: 4,
                      background: `${ACTION_COLORS[entry.log.action] ?? C.textMuted}15`,
                    }}>
                      {entry.log.action.replace('_', ' ')}
                    </span>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => startEdit(entry.log!)} title="Edit"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 3, opacity: 0.4, transition: 'opacity 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
                    >
                      <Edit2 size={11} color={C.accent} />
                    </button>
                    <button onClick={() => { if (confirm('Remove this time log entry?')) void deleteTimeLog(entry.log!.id) }} title="Delete"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 3, opacity: 0.4, transition: 'opacity 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
                    >
                      <Trash2 size={11} color={C.danger} />
                    </button>
                  </div>
                )
              ) : entry.window ? (
                <ActivityWindowRow window={entry.window} />
              ) : null}
            </div>
          ))
        }
      </div>

      {/* Reviewed requests history */}
      {reviewedReqs.length > 0 && (
        <>
          <SectionHeader icon={<CheckCircle size={14} />} title="Reviewed Requests" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {reviewedReqs.slice(0, 10).map(req => (
              <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: C.bgInput, borderRadius: 8, opacity: 0.7 }}>
                {req.status === 'approved' ? <CheckCircle size={13} color={C.success} /> : <XCircle size={13} color={C.danger} />}
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.text, fontSize: 11 }}>{fmtDateTime(req.startTime)} → {fmtTime(req.endTime)}</div>
                  <div style={{ color: C.textMuted, fontSize: 10 }}>{req.reason}</div>
                </div>
                <span style={{ color: req.status === 'approved' ? C.success : C.danger, fontSize: 10, fontWeight: 600 }}>{req.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// APPS & URLS TAB — Detailed app and URL usage breakdown
// ═════════════════════════════════════════════════════════════════════════════

function AppsTab({ data, config, userId }: { data: UserActivity; config: ApiConfig; userId: string }) {
  const [liveApp, setLiveApp] = useState<CurrentAppInfo | null>(null)

  // Real-time current app polling (same as DM app status)
  useEffect(() => {
    const headers = { Authorization: `Bearer ${config.token}` }
    const poll = async () => {
      try {
        const res = await fetch(`${config.apiBase}/api/user/current-activity?userId=${userId}`, { headers })
        if (res.ok) setLiveApp(await res.json() as CurrentAppInfo)
      } catch { /* */ }
    }
    void poll()
    const iv = setInterval(poll, 10_000)
    return () => clearInterval(iv)
  }, [config, userId])

  // Aggregate from all activity windows
  const appMap: Record<string, number> = {}
  const urlMap: Record<string, number> = {}
  for (const win of data.activity) {
    if (win.topApps) {
      try {
        const apps = JSON.parse(win.topApps) as Record<string, number>
        for (const [k, v] of Object.entries(apps)) appMap[k] = (appMap[k] ?? 0) + v
      } catch { /* */ }
    }
    if (win.topUrls) {
      try {
        const urls = JSON.parse(win.topUrls) as Record<string, number>
        for (const [k, v] of Object.entries(urls)) urlMap[k] = (urlMap[k] ?? 0) + v
      } catch { /* */ }
    }
  }

  const sortedApps = Object.entries(appMap).sort(([, a], [, b]) => b - a)
  const sortedUrls = Object.entries(urlMap).sort(([, a], [, b]) => b - a)
  const totalAppSec = sortedApps.reduce((s, [, v]) => s + v, 0)
  const totalUrlSec = sortedUrls.reduce((s, [, v]) => s + v, 0)

  return (
    <>
      {/* Real-time current app */}
      {liveApp?.app && (
        <div style={{ background: C.bgInput, borderRadius: 10, padding: '14px 16px', marginBottom: 16, border: `1px solid ${C.accent}22`, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${C.accent}, ${C.success})` }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Monitor size={14} color={C.accent} />
              <span style={{ color: C.textMuted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Currently Using</span>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.success, boxShadow: `0 0 6px ${C.success}`, animation: 'pulse 2s infinite' }} />
            </div>
            <div style={{ flex: 1 }} />
            <span style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{liveApp.app}</span>
            {liveApp.url && <span style={{ color: C.textMuted, fontSize: 11 }}>— {liveApp.url}</span>}
          </div>
        </div>
      )}

      {/* App usage */}
      <SectionHeader icon={<Smartphone size={14} />} title={`Applications (${sortedApps.length})`} />
      {sortedApps.length === 0 ? <div style={{ color: C.textMuted, fontSize: 11, padding: 12 }}>No app data</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 24 }}>
          {sortedApps.map(([name, seconds], i) => {
            const pct = totalAppSec > 0 ? Math.round((seconds / totalAppSec) * 100) : 0
            return (
              <div key={name} style={{ background: C.bgInput, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: C.white, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <span style={{ color: C.accent, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{secToHM(seconds)}</span>
                      <span style={{ color: C.textMuted, fontSize: 10, fontVariantNumeric: 'tabular-nums', width: 28, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], width: `${pct}%`, opacity: 0.6, transition: 'width 0.3s' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* URL usage */}
      <SectionHeader icon={<Globe size={14} />} title={`Websites (${sortedUrls.length})`} />
      {sortedUrls.length === 0 ? <div style={{ color: C.textMuted, fontSize: 11, padding: 12 }}>No URL data</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 24 }}>
          {sortedUrls.map(([name, seconds], i) => {
            const pct = totalUrlSec > 0 ? Math.round((seconds / totalUrlSec) * 100) : 0
            return (
              <div key={name} style={{ background: C.bgInput, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Globe size={10} color={CHART_COLORS[i % CHART_COLORS.length]} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: C.white, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <span style={{ color: C.accent, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{secToHM(seconds)}</span>
                      <span style={{ color: C.textMuted, fontSize: 10, fontVariantNumeric: 'tabular-nums', width: 28, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], width: `${pct}%`, opacity: 0.6, transition: 'width 0.3s' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Per-window breakdown */}
      <SectionHeader icon={<Activity size={14} />} title="Activity Windows" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {data.activity.map(win => <ActivityWindowRow key={win.id} window={win} expanded />)}
      </div>
    </>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SALARY TAB — User salary overview and calculation
// ═════════════════════════════════════════════════════════════════════════════

function SalaryTab({ user, bases, holidays }: { user: OverviewUser; bases: SalaryBase[]; holidays: HolidayDate[] }) {
  const currentBase = bases.find(b => {
    const today = todayStr()
    return today >= b.validFrom.slice(0, 10) && today <= b.validUntil.slice(0, 10)
  })

  // Calculate this month's earnings
  const monthDays = user.monthDays ?? []
  let monthEarned = 0
  for (const day of monthDays) {
    const applicable = bases.find(b => day.date.slice(0, 10) >= b.validFrom.slice(0, 10) && day.date.slice(0, 10) <= b.validUntil.slice(0, 10))
    if (applicable) monthEarned += calcSalaryFromDays([day], applicable.monthlySalary / 160, holidays)
  }

  const basePct = currentBase ? Math.min(100, Math.round((monthEarned / currentBase.monthlySalary) * 100)) : 0

  return (
    <>
      {/* Current salary card */}
      {currentBase ? (
        <div style={{ background: C.bgInput, borderRadius: 12, padding: 20, marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${C.accent}, ${C.success})` }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ color: C.textMuted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Current Base Salary</div>
              <div style={{ color: C.white, fontSize: 22, fontWeight: 700 }}>{fmtIDR(currentBase.monthlySalary)}</div>
              <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>
                Hourly: {fmtIDR(currentBase.monthlySalary / 160)} · Valid {fmtDate(currentBase.validFrom)} → {fmtDate(currentBase.validUntil)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: C.textMuted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Month Earned</div>
              <div style={{ color: monthEarned > currentBase.monthlySalary ? C.warning : C.success, fontSize: 22, fontWeight: 700 }}>{fmtIDR(monthEarned)}</div>
              <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>{basePct}% of base</div>
            </div>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, basePct)}%`, background: `linear-gradient(90deg, ${C.accent}, ${basePct > 100 ? C.warning : C.success})`, transition: 'width 0.3s' }} />
          </div>
        </div>
      ) : (
        <div style={{ background: C.bgInput, borderRadius: 12, padding: 20, marginBottom: 20, textAlign: 'center' }}>
          <div style={{ color: C.textMuted, fontSize: 12 }}>No active salary base</div>
        </div>
      )}

      {/* Salary history */}
      <SectionHeader icon={<TrendingUp size={14} />} title="Salary History" />
      {bases.length === 0 ? <div style={{ color: C.textMuted, fontSize: 11, padding: 12 }}>No salary records</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {bases.map(b => {
            const isCurrent = (() => { const today = todayStr(); return today >= b.validFrom.slice(0, 10) && today <= b.validUntil.slice(0, 10) })()
            return (
              <div key={b.id} style={{
                background: C.bgInput, borderRadius: 8, padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 12,
                opacity: b.isAutoAppraisal ? 0.7 : 1,
                border: isCurrent ? `1px solid ${C.accent}33` : '1px solid transparent',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ color: C.white, fontSize: 13, fontWeight: 700 }}>{fmtIDR(b.monthlySalary)}</span>
                    {b.isAutoAppraisal && <span style={{ fontSize: 9, color: C.accent, background: C.accentLight, padding: '1px 6px', borderRadius: 3 }}>Auto</span>}
                    {isCurrent && <span style={{ fontSize: 9, color: C.success, background: 'rgba(67, 181, 129, 0.12)', padding: '1px 6px', borderRadius: 3, fontWeight: 700 }}>Active</span>}
                    {b.appraisalPercent > 0 && <span style={{ fontSize: 9, color: C.textMuted }}>+{b.appraisalPercent}%</span>}
                  </div>
                  <div style={{ color: C.textMuted, fontSize: 10 }}>
                    {fmtDate(b.validFrom)} → {fmtDate(b.validUntil)}
                    {b.note && <span> · {b.note}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: C.textMuted, fontSize: 9 }}>Hourly</div>
                  <div style={{ color: C.accent, fontSize: 12, fontWeight: 600 }}>{fmtIDR(b.monthlySalary / 160)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Monthly breakdown */}
      {monthDays.length > 0 && (
        <>
          <SectionHeader icon={<BarChart2 size={14} />} title="Daily Earnings (This Month)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {monthDays.slice(0, 15).map(day => {
              const applicable = bases.find(b => day.date.slice(0, 10) >= b.validFrom.slice(0, 10) && day.date.slice(0, 10) <= b.validUntil.slice(0, 10))
              const earned = applicable ? calcSalaryFromDays([day], applicable.monthlySalary / 160, holidays) : 0
              const dow = new Date(day.date + 'T00:00:00').getDay()
              const isWeekend = dow === 0 || dow === 6
              return (
                <div key={day.date} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', background: C.bgInput, borderRadius: 6 }}>
                  <span style={{ color: isWeekend ? C.warning : C.textMuted, fontSize: 10, fontVariantNumeric: 'tabular-nums', width: 70, flexShrink: 0 }}>
                    {new Date(day.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
                  </span>
                  <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, (day.hours / 10) * 100)}%`, background: isWeekend ? C.warning : C.accent, opacity: 0.6 }} />
                  </div>
                  <span style={{ color: C.text, fontSize: 10, fontVariantNumeric: 'tabular-nums', width: 40, textAlign: 'right', flexShrink: 0 }}>{hoursToHHMM(day.hours)}</span>
                  <span style={{ color: C.success, fontSize: 10, fontWeight: 600, fontVariantNumeric: 'tabular-nums', width: 70, textAlign: 'right', flexShrink: 0 }}>{fmtIDR(earned)}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

function ActivityHeatmap({ windows }: { windows: ActivityWindow[] }) {
  // Build 24-hour grid with 10-min slots
  const slots: { hour: number; slot: number; pct: number | null }[] = []
  for (let h = 0; h < 24; h++) {
    for (let s = 0; s < 6; s++) {
      const slotTime = `${String(h).padStart(2, '0')}:${String(s * 10).padStart(2, '0')}`
      const win = windows.find(w => {
        const wt = new Date(w.windowStart)
        const wTime = `${String(wt.getHours()).padStart(2, '0')}:${String(wt.getMinutes()).padStart(2, '0')}`
        // Handle timezone: try Jakarta time
        const wtJk = new Date(wt.getTime())
        const jkTime = wtJk.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' })
        return jkTime === slotTime || wTime === slotTime
      })
      if (win) {
        const mouseActive = win.mouseActiveSeconds ?? 0
        const keyActive = win.keyActiveSeconds ?? 0
        const pct = win.totalSeconds > 0 ? Math.round(((mouseActive + keyActive) / 2 / win.totalSeconds) * 100) : 0
        slots.push({ hour: h, slot: s, pct })
      } else {
        slots.push({ hour: h, slot: s, pct: null })
      }
    }
  }

  // Only show hours that have data or are between 6-22
  const activeHours = new Set(slots.filter(s => s.pct !== null).map(s => s.hour))
  const startHour = Math.max(0, Math.min(...activeHours, 6) - 1)
  const endHour = Math.min(23, Math.max(...activeHours, 18) + 1)
  const visibleSlots = slots.filter(s => s.hour >= startHour && s.hour <= endHour)

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {visibleSlots.map((s, i) => {
          const isHourStart = s.slot === 0
          return (
            <div key={i} style={{ position: 'relative' }}>
              {isHourStart && (
                <div style={{ position: 'absolute', top: -14, left: 0, fontSize: 8, color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                  {String(s.hour).padStart(2, '0')}
                </div>
              )}
              <div
                title={s.pct !== null ? `${String(s.hour).padStart(2, '0')}:${String(s.slot * 10).padStart(2, '0')} — ${s.pct}% activity` : ''}
                style={{
                  width: 10, height: 22, borderRadius: 2, marginTop: 4,
                  background: s.pct === null ? 'rgba(255,255,255,0.02)' :
                    s.pct >= 70 ? C.success :
                    s.pct >= 40 ? C.accent :
                    s.pct >= 15 ? C.warning :
                    'rgba(240, 71, 71, 0.5)',
                  opacity: s.pct === null ? 1 : Math.max(0.3, s.pct / 100),
                  transition: 'opacity 0.2s',
                }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'flex-end' }}>
        {[
          { label: 'High', color: C.success },
          { label: 'Medium', color: C.accent },
          { label: 'Low', color: C.warning },
          { label: 'Idle', color: 'rgba(240, 71, 71, 0.5)' },
          { label: 'None', color: 'rgba(255,255,255,0.04)' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
            <span style={{ color: C.textMuted, fontSize: 8 }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ActivityWindowRow({ window: win, expanded }: { window: ActivityWindow; expanded?: boolean }) {
  const mouseActive = win.mouseActiveSeconds ?? 0
  const keyActive = win.keyActiveSeconds ?? 0
  const actPct = win.totalSeconds > 0 ? Math.round(((mouseActive + keyActive) / 2 / win.totalSeconds) * 100) : 0

  let apps: Record<string, number> = {}
  let urls: Record<string, number> = {}
  if (win.topApps) try { apps = JSON.parse(win.topApps) } catch { /* */ }
  if (win.topUrls) try { urls = JSON.parse(win.topUrls) } catch { /* */ }
  const topApp = Object.entries(apps).sort(([, a], [, b]) => b - a)[0]
  const topUrl = Object.entries(urls).sort(([, a], [, b]) => b - a)[0]

  return (
    <div style={{ background: C.bgInput, borderRadius: 8, padding: '8px 12px', marginBottom: expanded ? 6 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: C.text, fontSize: 11, fontVariantNumeric: 'tabular-nums', width: 40, flexShrink: 0, fontWeight: 600 }}>{fmtTime(win.windowStart)}</span>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Activity bar */}
          <div style={{ width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ height: '100%', borderRadius: 2, width: `${actPct}%`, background: actPct >= 50 ? C.success : C.warning }} />
          </div>
          <span style={{ color: actPct >= 50 ? C.success : C.warning, fontSize: 10, fontWeight: 600, fontVariantNumeric: 'tabular-nums', width: 28, flexShrink: 0 }}>{actPct}%</span>
          {topApp && <span style={{ color: C.accent, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topApp[0]}</span>}
          {topUrl && <span style={{ color: C.textMuted, fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {topUrl[0]}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <span style={{ color: C.textMuted, fontSize: 9 }} title="Mouse events">🖱 {win.mouseEvents}</span>
          <span style={{ color: C.textMuted, fontSize: 9 }} title="Key events">⌨ {win.keyEvents}</span>
        </div>
      </div>
      {expanded && Object.keys(apps).length > 1 && (
        <div style={{ marginTop: 6, paddingLeft: 48, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {Object.entries(apps).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name, sec]) => (
            <span key={name} style={{ fontSize: 9, background: C.bgTertiary, color: C.textSecondary, padding: '2px 6px', borderRadius: 3 }}>{name} ({secToHM(sec)})</span>
          ))}
        </div>
      )}
    </div>
  )
}

function ScreenshotCard({ shot, config, onClick, large }: {
  shot: Screenshot; config: ApiConfig; onClick: () => void; large?: boolean
}) {
  return (
    <button onClick={onClick} style={{
      background: C.bgInput, borderRadius: 8, overflow: 'hidden', border: 'none', cursor: 'pointer',
      textAlign: 'left', transition: 'all 0.15s', position: 'relative',
    }}
      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
    >
      <div style={{ width: '100%', height: large ? 160 : 110, overflow: 'hidden', position: 'relative' }}>
        <AuthImage src={`${config.apiBase}${shot.url}`} config={config}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        {/* Top overlay */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '4px 6px', background: 'linear-gradient(180deg, rgba(0,0,0,0.6), transparent)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#fff', fontSize: 9, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtTime(shot.capturedAt)}</span>
          {shot.activityPct != null && (
            <span style={{ color: shot.activityPct >= 50 ? '#43B581' : '#cca700', fontSize: 9, fontWeight: 600 }}>{shot.activityPct}%</span>
          )}
        </div>
      </div>
      <div style={{ padding: '6px 8px' }}>
        {shot.topApp && <div style={{ color: C.accent, fontSize: 10, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shot.topApp}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          {shot.mouseActivePct != null && <span style={{ color: C.textMuted, fontSize: 8 }}>🖱 {shot.mouseActivePct}%</span>}
          {shot.keyActivePct != null && <span style={{ color: C.textMuted, fontSize: 8 }}>⌨ {shot.keyActivePct}%</span>}
        </div>
      </div>
    </button>
  )
}

function ManualRequestCard({ req, config, onAction }: { req: ManualTimeRequest; config: ApiConfig; onAction: () => void }) {
  const [processing, setProcessing] = useState<'approved' | 'rejected' | null>(null)

  async function handle(action: 'approved' | 'rejected') {
    setProcessing(action)
    await fetch(`${config.apiBase}/api/admin/manual-requests`, {
      method: 'PATCH', headers: authHeaders(config.token),
      body: JSON.stringify({ id: req.id, action }),
    })
    setProcessing(null)
    onAction()
  }

  return (
    <div style={{
      background: C.bgInput, borderRadius: 10, padding: '12px 16px',
      border: `1px solid rgba(204, 167, 0, 0.15)`, display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <AvatarCircle name={req.user.alias ?? req.user.username} url={req.user.avatarUrl} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.white, fontSize: 12, fontWeight: 600 }}>{req.user.alias ?? req.user.username}</div>
        <div style={{ color: C.text, fontSize: 11, marginTop: 1 }}>
          {fmtDateTime(req.startTime)} → {fmtTime(req.endTime)}
        </div>
        <div style={{ color: C.textMuted, fontSize: 10, marginTop: 1 }}>{req.reason}</div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button onClick={() => void handle('approved')} disabled={processing !== null}
          style={{ background: 'rgba(67, 181, 129, 0.1)', border: `1px solid ${C.success}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: C.success, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
          {processing === 'approved' ? <Loader size={10} /> : <CheckCircle size={10} />} Approve
        </button>
        <button onClick={() => void handle('rejected')} disabled={processing !== null}
          style={{ background: 'rgba(240, 71, 71, 0.1)', border: `1px solid ${C.danger}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: C.danger, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
          {processing === 'rejected' ? <Loader size={10} /> : <XCircle size={10} />} Reject
        </button>
      </div>
    </div>
  )
}

function SectionHeader({ icon, title, count, accentColor }: { icon: React.ReactNode; title: string; count?: number; accentColor?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, marginTop: 4 }}>
      <span style={{ color: accentColor ?? C.accent }}>{icon}</span>
      <span style={{ color: C.white, fontSize: 12, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</span>
      {count !== undefined && <span style={{ color: accentColor ?? C.accent, fontSize: 10, fontWeight: 700, background: `${accentColor ?? C.accent}18`, padding: '1px 6px', borderRadius: 4 }}>{count}</span>}
    </div>
  )
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span style={{ color: C.textMuted, fontSize: 10 }}>{label}</span>
      <span style={{ color, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ color: C.textMuted, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
      <div style={{ color: C.white, fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function AvatarCircle({ name, url, size }: { name: string; url: string | null; size: number }) {
  if (url) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: avatarColor(name) }}>
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
      </div>
    )
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: avatarColor(name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.4, fontWeight: 700, flexShrink: 0 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: C.textMuted, padding: 40 }}>
      {icon}
      <span style={{ fontSize: 13 }}>{text}</span>
    </div>
  )
}

function CenterLoader() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <Loader size={20} color={C.textMuted} />
    </div>
  )
}
