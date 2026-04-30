import { useState, useEffect, useCallback } from 'react'
import {
  Users, Shield, ShieldCheck, Search, ChevronRight, Loader,
  Monitor, Clock, Mail, Phone, Calendar, Edit2, Check, X,
  RefreshCw, DollarSign, Calculator, CalendarDays, Eye,
  Trash2, TrendingUp, BarChart2, AlertTriangle, Plus,
} from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig, Auth } from '../../types'
import { Avatar } from '../shared/Avatar'
import MonitoringPanel from './MonitoringPanel'
import TimeTrackingPanel from './TimeTrackingPanel'

// ─── Types ──────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string
  username: string
  alias: string | null
  avatarUrl: string | null
  email: string | null
  phone: string | null
  role: string
  userStatus: string | null
  dailyWorkLimitHours: number
  createdAt: string
  desktopOnline: boolean
  deviceName: string | null
  tokenExpiresAt: string | null
  currentAction: string
  currentApp: string | null
  runningApps: string[]
}

interface SalaryBase {
  id: string
  userId: string
  monthlySalary: number
  validFrom: string
  validUntil: string
  appraisalPercent: number
  note: string | null
  isAutoAppraisal: boolean
  sourceId: string | null
  user: { id: string; username: string; avatarUrl: string | null }
}

interface HolidayDate {
  id: string
  date: string
  description: string | null
}

interface SalaryReleasePeriod {
  id: string
  label: string
  releaseDate: string
  year: number
}

interface OverviewUser {
  id: string
  username: string
  alias: string | null
  avatarUrl: string | null
  role: string
  dailyWorkLimitHours: number
  status: 'Online' | 'On Break' | 'Offline'
  hoursWorked: number
  weekHours: number
  monthHours: number
  todayTrackedMinutes?: number
  statusDuration: string | null
  weekDays: { date: string; hours: number }[]
  monthDays: { date: string; hours: number }[]
}

interface AnalyticsData {
  totalMs: number
  prevTotalMs: number
  activityPercent: number
  prevActivityPercent: number
  dailyHours: {
    date: string; totalHours: number; activityPct: number | null
    users: { userId: string; username: string; alias: string | null; hours: number }[]
  }[]
  topApps: { name: string; seconds: number }[]
  topUrls: { name: string; seconds: number }[]
  userStats: { userId: string; username: string; alias: string | null; avatarUrl: string | null; totalMs: number; activityPercent: number }[]
  rankings: {
    mostTime: { userId: string; username: string; alias: string | null; avatarUrl: string | null; hours: number }[]
    leastTime: { userId: string; username: string; alias: string | null; avatarUrl: string | null; hours: number }[]
    mostIdle: { userId: string; username: string; alias: string | null; avatarUrl: string | null; idleMinutes: number }[]
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface Props { config: ApiConfig; auth: Auth }

const ACTION_LABELS: Record<string, string> = {
  NONE: 'Not clocked in', CHECK_IN: 'Working', BREAK: 'On break', BACK: 'Working', CLOCK_OUT: 'Clocked out',
}
const ACTION_COLORS: Record<string, string> = {
  NONE: C.textMuted, CHECK_IN: C.success, BREAK: C.warning, BACK: C.success, CLOCK_OUT: C.textMuted,
}
const STATUS_COLORS: Record<string, string> = { Online: C.success, 'On Break': C.warning, Offline: C.textMuted }
const CHART_COLORS = ['#6c5ce7', '#0984e3', '#00b894', '#fd79a8', '#fdcb6e', '#e17055', '#74b9ff', '#55efc4']

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Jakarta', hour12: false,
  })
}
function fmtIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}
function hoursToHHMM(h: number) {
  const t = Math.round(h * 60); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
function msToHM(ms: number) {
  const t = Math.round(ms / 60_000); const h = Math.floor(t / 60); const m = t % 60
  if (h === 0) return `${m}m`; if (m === 0) return `${h}h`; return `${h}h ${m}m`
}
function secToHM(s: number) { return msToHM(s * 1000) }
function diffLabel(cur: number, prev: number) {
  if (prev === 0) return { text: cur > 0 ? '↑ new' : '—', positive: cur > 0 }
  const pct = Math.round(((cur - prev) / prev) * 100)
  return { text: `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}%`, positive: pct >= 0 }
}
function avatarColor(name: string) {
  const p = ['#6c5ce7', '#00b894', '#0984e3', '#e17055', '#fd79a8', '#00cec9', '#e84393', '#a29bfe', '#74b9ff', '#55efc4']
  let h = 0; for (const c of name) h = ((h * 31) + c.charCodeAt(0)) >>> 0; return p[h % p.length]
}
function formatSalaryInput(raw: string) {
  const d = raw.replace(/\D/g, ''); if (!d) return ''; return parseInt(d, 10).toLocaleString('id-ID')
}

function calcDayBreakdown(
  date: string, hours: number, hourly: number, holidays: HolidayDate[],
): { normalHrs: number; normalPay: number; ot1Hrs: number; ot1Pay: number; ot2Hrs: number; ot2Pay: number; total: number; isSpecial: boolean } {
  if (hours <= 0) return { normalHrs: 0, normalPay: 0, ot1Hrs: 0, ot1Pay: 0, ot2Hrs: 0, ot2Pay: 0, total: 0, isSpecial: false }
  const holidaySet = new Set(holidays.map(h => h.date.slice(0, 10)))
  const dow = new Date(date + 'T00:00:00').getDay()
  const isSpecial = dow === 0 || dow === 6 || holidaySet.has(date.slice(0, 10))
  if (isSpecial) {
    const normalHrs = Math.min(hours, 8); const ot2Hrs = Math.max(0, hours - 8)
    return { normalHrs, normalPay: normalHrs * 2 * hourly, ot1Hrs: 0, ot1Pay: 0, ot2Hrs, ot2Pay: ot2Hrs * 3 * hourly, total: normalHrs * 2 * hourly + ot2Hrs * 3 * hourly, isSpecial }
  } else {
    const normalHrs = Math.min(hours, 8); const ot1Hrs = Math.min(Math.max(0, hours - 8), 4); const ot2Hrs = Math.max(0, hours - 12)
    return { normalHrs, normalPay: normalHrs * hourly, ot1Hrs, ot1Pay: ot1Hrs * 2 * hourly, ot2Hrs, ot2Pay: ot2Hrs * 3 * hourly, total: normalHrs * hourly + ot1Hrs * 2 * hourly + ot2Hrs * 3 * hourly, isSpecial }
  }
}

const INDONESIA_HOLIDAYS_2026 = [
  { date: '2026-01-01', description: 'Tahun Baru Masehi 2026' },
  { date: '2026-01-16', description: 'Isra Mikraj Nabi Muhammad SAW 1447 H' },
  { date: '2026-02-17', description: 'Tahun Baru Imlek 2577' },
  { date: '2026-03-16', description: 'Nyepi - Tahun Baru Saka 1948' },
  { date: '2026-03-19', description: 'Idul Fitri 1447 H (Hari ke-1)' },
  { date: '2026-03-20', description: 'Idul Fitri 1447 H (Hari ke-2)' },
  { date: '2026-04-03', description: 'Wafat Isa Al-Masih (Good Friday)' },
  { date: '2026-05-01', description: 'Hari Buruh Nasional' },
  { date: '2026-05-14', description: 'Kenaikan Isa Al-Masih' },
  { date: '2026-05-23', description: 'Hari Raya Waisak 2570 BE' },
  { date: '2026-05-27', description: 'Idul Adha 1447 H' },
  { date: '2026-06-01', description: 'Hari Lahir Pancasila' },
  { date: '2026-06-16', description: 'Tahun Baru Islam 1448 H' },
  { date: '2026-08-17', description: 'Hari Kemerdekaan RI ke-81' },
  { date: '2026-08-25', description: 'Maulid Nabi Muhammad SAW 1448 H' },
  { date: '2026-12-25', description: 'Hari Raya Natal' },
]

function calcSalaryFromDays(
  days: { date: string; hours: number }[],
  hourly: number,
  holidays: HolidayDate[],
): number {
  const hSet = new Set(holidays.map(h => h.date.slice(0, 10)))
  let total = 0
  for (const { date, hours } of days) {
    if (hours <= 0) continue
    const dow = new Date(date + 'T00:00:00').getDay()
    const isSpecial = dow === 0 || dow === 6 || hSet.has(date.slice(0, 10))
    if (isSpecial) {
      total += Math.min(hours, 8) * 2 * hourly + Math.max(0, hours - 8) * 3 * hourly
    } else {
      total += Math.min(hours, 8) * hourly
        + Math.min(Math.max(0, hours - 8), 4) * 2 * hourly
        + Math.max(0, hours - 12) * 3 * hourly
    }
  }
  return total
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AdminPanel({ config, auth }: Props): JSX.Element {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [menu, setMenu] = useState<'members' | 'salary' | 'salary-calc' | 'calendar' | 'monitoring' | 'time-tracking'>('members')
  const [renewingUserId, setRenewingUserId] = useState<string | null>(null)
  const [renewResult, setRenewResult] = useState<{ userId: string; token: string; dmSent: boolean } | null>(null)

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${config.apiBase}/api/admin/users`, {
        headers: { Authorization: `Bearer ${config.token}` },
      })
      if (res.ok) {
        const data = await res.json() as { users: AdminUser[] }
        setUsers(data.users)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [config])

  useEffect(() => { void fetchUsers() }, [fetchUsers])
  useEffect(() => {
    const iv = setInterval(() => void fetchUsers(), 30_000)
    return () => clearInterval(iv)
  }, [fetchUsers])

  const filtered = users.filter(u => {
    const q = searchQuery.toLowerCase()
    return !q || u.username.toLowerCase().includes(q) || (u.alias?.toLowerCase().includes(q) ?? false)
  })
  const selectedUser = users.find(u => u.id === selectedUserId) ?? null

  async function updateUser(userId: string, field: string, value: string | number) {
    setSaving(true)
    try {
      const res = await fetch(`${config.apiBase}/api/admin/users/${userId}`, {
        method: 'PATCH', headers: authHeaders(config.token), body: JSON.stringify({ [field]: value }),
      })
      if (res.ok) await fetchUsers()
    } catch { /* ignore */ }
    setSaving(false); setEditingField(null)
  }

  async function renewToken(userId: string) {
    setRenewingUserId(userId); setRenewResult(null)
    try {
      const res = await fetch(`${config.apiBase}/api/admin/users/${userId}/renew-token`, {
        method: 'POST', headers: { Authorization: `Bearer ${config.token}` },
      })
      if (res.ok) {
        const data = await res.json() as { token: string; dmSent: boolean }
        setRenewResult({ userId, token: data.token, dmSent: data.dmSent })
        await fetchUsers()
      }
    } catch { /* ignore */ }
    setRenewingUserId(null)
  }

  async function deleteUser(userId: string) {
    try {
      const res = await fetch(`${config.apiBase}/api/admin/users/${userId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${config.token}` },
      })
      if (res.ok) {
        setSelectedUserId(null)
        await fetchUsers()
      }
    } catch { /* ignore */ }
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── Menu sidebar ── */}
      <div style={{
        width: 200, minWidth: 200, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: `1px solid ${C.separator}`,
      }}>
        <div style={{ padding: '16px 16px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={18} color={C.accent} />
          <span style={{ color: C.text, fontSize: 15, fontWeight: 700 }}>Admin</span>
        </div>
        <div style={{ padding: '0 8px' }}>
          <AdminMenuItem icon={<Users size={16} />} label="Members" count={users.length} active={menu === 'members'} onClick={() => setMenu('members')} />
          <AdminMenuItem icon={<DollarSign size={16} />} label="Member Salary" active={menu === 'salary'} onClick={() => setMenu('salary')} />
          <AdminMenuItem icon={<Calculator size={16} />} label="Salary Calculation" active={menu === 'salary-calc'} onClick={() => setMenu('salary-calc')} />
          <AdminMenuItem icon={<CalendarDays size={16} />} label="Calendar" active={menu === 'calendar'} onClick={() => setMenu('calendar')} />
          <AdminMenuItem icon={<Eye size={16} />} label="Monitoring" active={menu === 'monitoring'} onClick={() => setMenu('monitoring')} />
          <AdminMenuItem icon={<Clock size={16} />} label="Time Tracking" active={menu === 'time-tracking'} onClick={() => setMenu('time-tracking')} />
        </div>
      </div>

      {/* ── Member list (only for members tab) ── */}
      {menu === 'members' && (
        <div style={{
          width: 260, minWidth: 260, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${C.separator}`,
        }}>
          <div style={{ padding: '16px 16px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: C.text, fontSize: 14, fontWeight: 600, flex: 1 }}>Members</span>
            <span style={{ color: C.textMuted, fontSize: 12 }}>{users.length}</span>
          </div>
          <div style={{ padding: '0 12px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bgInput, borderRadius: 8, padding: '8px 10px' }}>
              <Search size={14} color={C.textMuted} />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search members..."
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 13 }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Loader size={20} color={C.textMuted} /></div>
            ) : (
              filtered.map(u => <UserRow key={u.id} user={u} selected={u.id === selectedUserId} onClick={() => setSelectedUserId(u.id)} />)
            )}
          </div>
        </div>
      )}

      {/* ── Content panel ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {menu === 'members' && selectedUser ? (
          <UserDetail user={selectedUser} isSelf={selectedUser.id === auth.userId}
            config={config}
            editingField={editingField} editValue={editValue} saving={saving}
            onStartEdit={(f, v) => { setEditingField(f); setEditValue(v) }}
            onCancelEdit={() => setEditingField(null)}
            onSaveEdit={(f, v) => void updateUser(selectedUser.id, f, v)}
            setEditValue={setEditValue}
            renewingUserId={renewingUserId} renewResult={renewResult}
            onRenewToken={(id) => void renewToken(id)}
            onDeleteUser={(id) => deleteUser(id)} />
        ) : menu === 'members' ? (
          <EmptyState icon={<Users size={40} strokeWidth={1} />} text="Select a member to view details" />
        ) : menu === 'salary' ? (
          <SalaryPanel config={config} users={users} />
        ) : menu === 'salary-calc' ? (
          <SalaryCalcPanel config={config} />
        ) : menu === 'calendar' ? (
          <CalendarPanel config={config} />
        ) : menu === 'monitoring' ? (
          <MonitoringPanel config={config} />
        ) : menu === 'time-tracking' ? (
          <TimeTrackingPanel config={config} users={users} />
        ) : null}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SALARY PANEL
// ═════════════════════════════════════════════════════════════════════════════

function SalaryPanel({ config, users }: { config: ApiConfig; users: AdminUser[] }) {
  const [bases, setBases] = useState<SalaryBase[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ userId: '', monthlySalary: '', validFrom: '', validUntil: '', appraisalPercent: '5', note: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ monthlySalary: '', appraisalPercent: '', validFrom: '', validUntil: '', note: '' })
  const [editMode, setEditMode] = useState<'salary' | 'percent'>('salary')
  const [savingEdit, setSavingEdit] = useState(false)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [filterUser, setFilterUser] = useState('')

  const fetchBases = useCallback(async () => {
    try {
      const res = await fetch(`${config.apiBase}/api/admin/salary/bases`, { headers: { Authorization: `Bearer ${config.token}` } })
      if (res.ok) { const d = await res.json() as { bases: SalaryBase[] }; setBases(d.bases) }
    } catch { /* */ }
    setLoading(false)
  }, [config])

  useEffect(() => { void fetchBases() }, [fetchBases])

  async function submitBase() {
    if (!form.userId || !form.monthlySalary || !form.validFrom || !form.validUntil) return
    await fetch(`${config.apiBase}/api/admin/salary/bases`, {
      method: 'POST', headers: authHeaders(config.token),
      body: JSON.stringify({
        userId: form.userId, monthlySalary: parseFloat(form.monthlySalary),
        validFrom: form.validFrom, validUntil: form.validUntil,
        appraisalPercent: parseFloat(form.appraisalPercent || '5'),
        note: form.note || undefined,
      }),
    })
    setFormOpen(false); setForm({ userId: '', monthlySalary: '', validFrom: '', validUntil: '', appraisalPercent: '5', note: '' })
    await fetchBases()
  }

  async function deleteBase(id: string) {
    await fetch(`${config.apiBase}/api/admin/salary/bases/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${config.token}` },
    })
    await fetchBases()
  }

  async function saveEdit(id: string) {
    setSavingEdit(true)
    const payload: Record<string, unknown> = {
      validFrom: editForm.validFrom, validUntil: editForm.validUntil,
      note: editForm.note || null,
    }
    if (editMode === 'salary') {
      const raw = editForm.monthlySalary.replace(/\D/g, '')
      if (!raw) { setSavingEdit(false); return }
      payload.monthlySalary = parseFloat(raw)
    } else {
      payload.appraisalPercent = parseFloat(editForm.appraisalPercent || '0')
    }
    await fetch(`${config.apiBase}/api/admin/salary/bases/${id}`, {
      method: 'PATCH', headers: authHeaders(config.token),
      body: JSON.stringify(payload),
    })
    setEditingId(null); setSavingEdit(false)
    await fetchBases()
  }

  // Group by user and find "current" base (covering today)
  const grouped = new Map<string, SalaryBase[]>()
  for (const b of bases) {
    const arr = grouped.get(b.userId) ?? []
    arr.push(b)
    grouped.set(b.userId, arr)
  }
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

  // Filter
  const filteredEntries = [...grouped.entries()].filter(([, userBases]) => {
    if (!filterUser) return true
    const u = userBases[0]?.user
    const name = u ? (u.username ?? '') : ''
    return name.toLowerCase().includes(filterUser.toLowerCase())
  })

  // Summary stats
  const totalActive = filteredEntries.reduce((s, [, ub]) => {
    const current = ub.find(b => todayStr >= b.validFrom.slice(0, 10) && todayStr <= b.validUntil.slice(0, 10))
    return s + (current?.monthlySalary ?? 0)
  }, 0)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ color: C.white, fontSize: 18, fontWeight: 700 }}>Member Salary</div>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
            {grouped.size} member{grouped.size !== 1 ? 's' : ''} · Active monthly: <span style={{ color: C.accent, fontWeight: 600 }}>{fmtIDR(totalActive)}</span>
          </div>
        </div>
        <button onClick={() => setFormOpen(!formOpen)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: formOpen ? C.bgHover : C.accentLight, border: `1px solid ${formOpen ? C.separator : C.accent}`,
            borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
            color: formOpen ? C.textMuted : C.accent, fontSize: 12, fontWeight: 600,
          }}>
          {formOpen ? <X size={13} /> : <DollarSign size={13} />}
          {formOpen ? 'Cancel' : 'Add Salary'}
        </button>
      </div>

      {/* Add Form */}
      {formOpen && (
        <div style={{
          background: C.bgInput, borderRadius: 10, padding: 16, marginBottom: 20,
          border: `1px solid ${C.accent}30`,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <LabeledSelect label="Member" value={form.userId} onChange={v => setForm(f => ({ ...f, userId: v }))}
              options={users.map(u => ({ value: u.id, label: u.alias || u.username }))} />
            <LabeledInput label="Monthly Salary (IDR)" value={formatSalaryInput(form.monthlySalary)}
              onChange={v => setForm(f => ({ ...f, monthlySalary: v.replace(/\D/g, '') }))} placeholder="e.g. 5,000,000" />
            <LabeledInput label="Appraisal %" value={form.appraisalPercent}
              onChange={v => setForm(f => ({ ...f, appraisalPercent: v }))} placeholder="5" />
            <LabeledInput label="Valid From" type="date" value={form.validFrom}
              onChange={v => setForm(f => ({ ...f, validFrom: v }))} />
            <LabeledInput label="Valid Until" type="date" value={form.validUntil}
              onChange={v => setForm(f => ({ ...f, validUntil: v }))} />
            <LabeledInput label="Note (optional)" value={form.note}
              onChange={v => setForm(f => ({ ...f, note: v }))} placeholder="Reason or context" />
          </div>
          {form.monthlySalary && (() => {
            const base = parseFloat(form.monthlySalary); const pct = parseFloat(form.appraisalPercent || '5')
            return (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: C.textMuted }}>
                <span>Hourly rate: <b style={{ color: C.accent }}>{fmtIDR(base / 160)}</b></span>
                <span>·</span>
                <span>Will generate 8 quarterly appraisals at +{pct}% each</span>
              </div>
            )
          })()}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <Btn label="Cancel" secondary onClick={() => setFormOpen(false)} />
            <Btn label="Save + Generate Chain" onClick={() => void submitBase()} />
          </div>
        </div>
      )}

      {/* Search */}
      {grouped.size > 3 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bgInput, borderRadius: 8, padding: '8px 10px' }}>
            <Search size={14} color={C.textMuted} />
            <input value={filterUser} onChange={e => setFilterUser(e.target.value)} placeholder="Filter by name..."
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 13 }} />
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? <CenterLoader /> : grouped.size === 0 ? (
        <EmptyState icon={<DollarSign size={40} strokeWidth={1} />} text="No salary data yet" />
      ) : filteredEntries.length === 0 ? (
        <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: 40 }}>No matches</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredEntries.map(([userId, userBases]) => {
            const u = userBases[0]?.user
            const name = u ? u.username : userId
            const currentBase = userBases.find(b => todayStr >= b.validFrom.slice(0, 10) && todayStr <= b.validUntil.slice(0, 10))
            const manualBases = userBases.filter(b => !b.isAutoAppraisal)
            const autoBases = userBases.filter(b => b.isAutoAppraisal)
            const expanded = expandedUser === userId

            return (
              <div key={userId} style={{ background: C.bgInput, borderRadius: 12, overflow: 'hidden' }}>
                {/* User header row — always visible */}
                <button
                  onClick={() => setExpandedUser(expanded ? null : userId)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}>
                  {u && <Avatar url={u.avatarUrl} name={name} size={36} radius="8px" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.white, fontSize: 14, fontWeight: 600 }}>{name}</div>
                    <div style={{ color: C.textMuted, fontSize: 11, marginTop: 1 }}>
                      {currentBase
                        ? <><span style={{ color: C.success }}>{fmtIDR(currentBase.monthlySalary)}</span> · {fmtIDR(currentBase.monthlySalary / 160)}/hr</>
                        : <span style={{ color: C.warning }}>No active base</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: C.textMuted }}>{manualBases.length} base · {autoBases.length} auto</div>
                    </div>
                    <ChevronRight size={14} color={C.textMuted} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }} />
                  </div>
                </button>

                {/* Expanded entries */}
                {expanded && (
                  <div style={{ borderTop: `1px solid ${C.separator}`, padding: '4px 0' }}>
                    {/* Manual entries first */}
                    {userBases.map(b => {
                      const isEditing = editingId === b.id
                      const isCurrent = todayStr >= b.validFrom.slice(0, 10) && todayStr <= b.validUntil.slice(0, 10)
                      const isPast = todayStr > b.validUntil.slice(0, 10)

                      if (isEditing) {
                        return (
                          <div key={b.id} style={{ padding: '10px 16px', background: `${C.accent}08` }}>
                            {/* Mode toggle */}
                            <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
                              {(['salary', 'percent'] as const).map(mode => (
                                <button key={mode} onClick={() => setEditMode(mode)} style={{
                                  padding: '3px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                                  background: editMode === mode ? C.accentLight : 'transparent',
                                  color: editMode === mode ? C.accent : C.textMuted, fontSize: 10, fontWeight: 600,
                                }}>{mode === 'salary' ? 'Edit Salary' : 'Edit %'}</button>
                              ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              {editMode === 'salary' ? (
                                <LabeledInput label="Monthly Salary" value={formatSalaryInput(editForm.monthlySalary)}
                                  onChange={v => setEditForm(f => ({ ...f, monthlySalary: v.replace(/\D/g, '') }))} />
                              ) : (
                                <LabeledInput label="Appraisal %" value={editForm.appraisalPercent}
                                  onChange={v => setEditForm(f => ({ ...f, appraisalPercent: v }))} />
                              )}
                              <LabeledInput label="Valid From" type="date" value={editForm.validFrom}
                                onChange={v => setEditForm(f => ({ ...f, validFrom: v }))} />
                              <LabeledInput label="Valid Until" type="date" value={editForm.validUntil}
                                onChange={v => setEditForm(f => ({ ...f, validUntil: v }))} />
                            </div>
                            <LabeledInput label="Note" value={editForm.note}
                              onChange={v => setEditForm(f => ({ ...f, note: v }))} />
                            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                              <Btn label="Cancel" secondary onClick={() => setEditingId(null)} />
                              <Btn label={savingEdit ? 'Saving...' : 'Save'} onClick={() => void saveEdit(b.id)} />
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div key={b.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                          opacity: isPast ? 0.5 : b.isAutoAppraisal ? 0.7 : 1,
                          borderLeft: isCurrent ? `3px solid ${C.success}` : '3px solid transparent',
                        }}>
                          {/* Left indicator */}
                          <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: isCurrent ? C.success : isPast ? C.textMuted : C.accent }} />

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{fmtIDR(b.monthlySalary)}</span>
                              {b.isAutoAppraisal && <span style={{ fontSize: 9, color: C.accent, background: C.accentLight, padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>AUTO</span>}
                              {isCurrent && <span style={{ fontSize: 9, color: C.success, background: 'rgba(67,181,129,0.15)', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>CURRENT</span>}
                              {b.appraisalPercent > 0 && <span style={{ fontSize: 10, color: C.textMuted }}>+{b.appraisalPercent}%</span>}
                            </div>
                            <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>
                              {fmtDate(b.validFrom)} → {fmtDate(b.validUntil)}
                              <span style={{ marginLeft: 8, color: C.textMuted }}>{fmtIDR(b.monthlySalary / 160)}/hr</span>
                              {b.note && <span style={{ marginLeft: 8, fontStyle: 'italic' }}>{b.note}</span>}
                            </div>
                          </div>

                          {/* Actions */}
                          <button onClick={(e) => {
                            e.stopPropagation()
                            setEditingId(b.id)
                            setEditForm({
                              monthlySalary: String(b.monthlySalary),
                              appraisalPercent: String(b.appraisalPercent),
                              validFrom: b.validFrom.slice(0, 10),
                              validUntil: b.validUntil.slice(0, 10),
                              note: b.note ?? '',
                            })
                          }} style={iconBtnStyle}><Edit2 size={12} color={C.textMuted} /></button>
                          <button onClick={(e) => { e.stopPropagation(); void deleteBase(b.id) }} style={iconBtnStyle}><Trash2 size={12} color={C.danger} /></button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SALARY CALCULATION PANEL
// ═════════════════════════════════════════════════════════════════════════════

function SalaryCalcPanel({ config }: { config: ApiConfig }) {
  const [overview, setOverview] = useState<OverviewUser[]>([])
  const [bases, setBases] = useState<SalaryBase[]>([])
  const [holidays, setHolidays] = useState<HolidayDate[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'earned' | 'hours' | 'name'>('earned')
  const [breakdownModal, setBreakdownModal] = useState<{
    username: string; days: { date: string; hours: number }[]; hourly: number
  } | null>(null)
  const [payrollRange, setPayrollRange] = useState(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    return { start: today.slice(0, 8) + '01', end: today }
  })

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`${config.apiBase}/api/admin/overview`, { headers: { Authorization: `Bearer ${config.token}` } }).then(r => r.ok ? r.json() : { users: [] }),
      fetch(`${config.apiBase}/api/admin/salary/bases`, { headers: { Authorization: `Bearer ${config.token}` } }).then(r => r.ok ? r.json() : { bases: [] }),
      fetch(`${config.apiBase}/api/admin/salary/holidays`, { headers: { Authorization: `Bearer ${config.token}` } }).then(r => r.ok ? r.json() : { holidays: [] }),
    ]).then(([ov, b, h]) => {
      setOverview((ov as { users: OverviewUser[] }).users ?? [])
      setBases((b as { bases: SalaryBase[] }).bases ?? [])
      setHolidays((h as { holidays: HolidayDate[] }).holidays ?? [])
      setLoading(false)
    })
  }, [config])

  if (loading) return <CenterLoader />

  const rows = overview.map(m => {
    const userBases = bases.filter(b => b.userId === m.id)
    if (userBases.length === 0) return null
    const filteredDays = (m.monthDays ?? []).filter(d => d.date.slice(0, 10) >= payrollRange.start && d.date.slice(0, 10) <= payrollRange.end)
    const daysByBase = new Map<string, { base: SalaryBase; days: { date: string; hours: number }[] }>()
    for (const day of filteredDays) {
      const applicable = userBases.find(b => day.date.slice(0, 10) >= b.validFrom.slice(0, 10) && day.date.slice(0, 10) <= b.validUntil.slice(0, 10))
      if (!applicable) continue
      if (!daysByBase.has(applicable.id)) daysByBase.set(applicable.id, { base: applicable, days: [] })
      daysByBase.get(applicable.id)!.days.push(day)
    }
    if (daysByBase.size === 0) return null
    let earned = 0
    for (const { base: b, days } of daysByBase.values()) earned += calcSalaryFromDays(days, b.monthlySalary / 160, holidays)
    const base = userBases.find(b => payrollRange.end >= b.validFrom.slice(0, 10) && payrollRange.end <= b.validUntil.slice(0, 10))
      ?? userBases.sort((a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime())[0]
    const monthHours = [...daysByBase.values()].reduce((s, { days }) => s + days.reduce((ss, d) => ss + d.hours, 0), 0)
    return { m, base, earned, monthHours, filteredDays }
  }).filter(Boolean) as { m: OverviewUser; base: SalaryBase; earned: number; monthHours: number; filteredDays: { date: string; hours: number }[] }[]

  // Sort
  const sorted = [...rows].sort((a, b) => {
    if (sortBy === 'earned') return b.earned - a.earned
    if (sortBy === 'hours') return b.monthHours - a.monthHours
    return (a.m.alias ?? a.m.username).localeCompare(b.m.alias ?? b.m.username)
  })

  const totalEarned = rows.reduce((s, r) => s + r.earned, 0)
  const totalBase = rows.reduce((s, r) => s + r.base.monthlySalary, 0)
  const totalHours = rows.reduce((s, r) => s + r.monthHours, 0)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ color: C.white, fontSize: 18, fontWeight: 700 }}>Salary Calculation</div>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
            Payroll with Indonesian OT rules · {rows.length} member{rows.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="date" value={payrollRange.start} max={payrollRange.end}
            onChange={e => setPayrollRange(p => ({ ...p, start: e.target.value }))}
            style={dateInputStyle} />
          <span style={{ color: C.textMuted, fontSize: 12 }}>→</span>
          <input type="date" value={payrollRange.end} min={payrollRange.start}
            onChange={e => setPayrollRange(p => ({ ...p, end: e.target.value }))}
            style={dateInputStyle} />
        </div>
      </div>

      {/* Summary cards */}
      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
          <div style={{ background: C.bgInput, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Payroll</div>
            <div style={{ color: C.accent, fontSize: 17, fontWeight: 700, marginTop: 4 }}>{fmtIDR(totalEarned)}</div>
            <div style={{ color: C.textMuted, fontSize: 10, marginTop: 2 }}>of {fmtIDR(totalBase)} base</div>
          </div>
          <div style={{ background: C.bgInput, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Hours</div>
            <div style={{ color: C.white, fontSize: 17, fontWeight: 700, marginTop: 4 }}>{hoursToHHMM(totalHours)}</div>
            <div style={{ color: C.textMuted, fontSize: 10, marginTop: 2 }}>across {rows.length} members</div>
          </div>
          <div style={{ background: C.bgInput, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Avg / Member</div>
            <div style={{ color: C.white, fontSize: 17, fontWeight: 700, marginTop: 4 }}>{fmtIDR(totalEarned / (rows.length || 1))}</div>
            <div style={{ color: C.textMuted, fontSize: 10, marginTop: 2 }}>{hoursToHHMM(totalHours / (rows.length || 1))}/person</div>
          </div>
        </div>
      )}

      {/* Sort tabs */}
      {rows.length > 1 && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
          {(['earned', 'hours', 'name'] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)} style={{
              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: sortBy === s ? C.accentLight : 'transparent',
              color: sortBy === s ? C.accent : C.textMuted, fontSize: 11, fontWeight: 600,
            }}>{s === 'earned' ? 'By Earned' : s === 'hours' ? 'By Hours' : 'By Name'}</button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={<Calculator size={40} strokeWidth={1} />} text="No salary data for this period" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map(({ m, base, earned, monthHours, filteredDays }) => {
            const pct = Math.min(100, Math.round((earned / base.monthlySalary) * 100))
            const over = earned > base.monthlySalary
            return (
              <div key={m.id} onClick={() => setBreakdownModal({
                username: m.alias ?? m.username,
                days: filteredDays.filter(d => d.hours > 0).sort((a, b) => a.date.localeCompare(b.date)),
                hourly: base.monthlySalary / 160,
              })} style={{ background: C.bgInput, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = C.bgActive}
                onMouseLeave={e => e.currentTarget.style.background = C.bgInput}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar url={m.avatarUrl} name={m.alias ?? m.username} size={32} radius="8px" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{m.alias ?? m.username}</span>
                      <span style={{ color: C.textMuted, fontSize: 10 }}>{hoursToHHMM(monthHours)}</span>
                    </div>
                    {/* Progress bar inline */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.bgTertiary, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, pct)}%`, background: over ? C.warning : C.success, transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ color: C.textMuted, fontSize: 10, flexShrink: 0, width: 32, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 8 }}>
                    <div style={{ color: over ? C.warning : C.success, fontSize: 14, fontWeight: 700 }}>{fmtIDR(earned)}</div>
                    <div style={{ color: C.textMuted, fontSize: 10 }}>{fmtIDR(base.monthlySalary)}/mo</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* OT Breakdown Modal */}
      {breakdownModal && (
        <div onClick={() => setBreakdownModal(null)} style={{
          position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 440, maxHeight: '80vh', background: C.bgSecondary, borderRadius: 14,
            border: `1px solid ${C.separator}`, boxShadow: C.shadowModal,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.separator}` }}>
              <span style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>📊 {breakdownModal.username} — OT Breakdown</span>
              <button onClick={() => setBreakdownModal(null)} style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
              {breakdownModal.days.length === 0 ? (
                <div style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', padding: 24 }}>No logs in this period.</div>
              ) : breakdownModal.days.map(({ date, hours }) => {
                const bd = calcDayBreakdown(date, hours, breakdownModal.hourly, holidays)
                const label = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
                const barTotal = bd.normalHrs + bd.ot1Hrs + bd.ot2Hrs
                const normalPct = barTotal > 0 ? (bd.normalHrs / barTotal) * 100 : 0
                const ot1Pct = barTotal > 0 ? (bd.ot1Hrs / barTotal) * 100 : 0
                const ot2Pct = barTotal > 0 ? (bd.ot2Hrs / barTotal) * 100 : 0
                return (
                  <div key={date} style={{ background: C.bgInput, borderRadius: 10, padding: '10px 12px', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <span style={{ color: C.white, fontSize: 12, fontWeight: 600 }}>{label}{bd.isSpecial ? ' 🏖️' : ''}</span>
                        <span style={{ color: C.textMuted, fontSize: 10, marginLeft: 8 }}>{hoursToHHMM(hours)}</span>
                      </div>
                      <span style={{ color: C.accent, fontSize: 12, fontWeight: 700 }}>{fmtIDR(bd.total)}</span>
                    </div>
                    {/* Proportional bar */}
                    {barTotal > 0 && (
                      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 6, background: C.bgTertiary }}>
                        {normalPct > 0 && <div style={{ width: `${normalPct}%`, background: '#43b581', transition: 'width 0.3s' }} title={`Normal ${hoursToHHMM(bd.normalHrs)}`} />}
                        {ot1Pct > 0 && <div style={{ width: `${ot1Pct}%`, background: '#faa61a', transition: 'width 0.3s' }} title={`OT1 ${hoursToHHMM(bd.ot1Hrs)}`} />}
                        {ot2Pct > 0 && <div style={{ width: `${ot2Pct}%`, background: '#f04747', transition: 'width 0.3s' }} title={`OT2 ${hoursToHHMM(bd.ot2Hrs)}`} />}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                      {bd.normalHrs > 0 && <span style={{ color: '#43b581', fontSize: 9 }}>● Normal {hoursToHHMM(bd.normalHrs)} {bd.isSpecial ? '×2' : '×1'} = {fmtIDR(bd.normalPay)}</span>}
                      {bd.ot1Hrs > 0 && <span style={{ color: '#faa61a', fontSize: 9 }}>● OT1 {hoursToHHMM(bd.ot1Hrs)} ×2 = {fmtIDR(bd.ot1Pay)}</span>}
                      {bd.ot2Hrs > 0 && <span style={{ color: '#f04747', fontSize: 9 }}>● OT2 {hoursToHHMM(bd.ot2Hrs)} ×3 = {fmtIDR(bd.ot2Pay)}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.separator}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: C.textMuted, fontSize: 12 }}>Total</span>
              <span style={{ color: C.accent, fontSize: 14, fontWeight: 700 }}>
                {fmtIDR(breakdownModal.days.reduce((s, d) => s + calcDayBreakdown(d.date, d.hours, breakdownModal.hourly, holidays).total, 0))}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// CALENDAR PANEL
// ═════════════════════════════════════════════════════════════════════════════

function CalendarPanel({ config }: { config: ApiConfig }) {
  const [holidays, setHolidays] = useState<HolidayDate[]>([])
  const [releases, setReleases] = useState<SalaryReleasePeriod[]>([])
  const [releasesYear, setReleasesYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [holidayForm, setHolidayForm] = useState({ date: '', description: '' })
  const [holidayFormOpen, setHolidayFormOpen] = useState(false)
  const [releaseForm, setReleaseForm] = useState({ label: '', releaseDate: '', year: String(new Date().getFullYear()) })
  const [releaseFormOpen, setReleaseFormOpen] = useState(false)
  const [generatingHolidays, setGeneratingHolidays] = useState(false)
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }
  })

  const fetchData = useCallback(async (year?: number) => {
    setLoading(true)
    const y = year ?? releasesYear
    const [hRes, rRes] = await Promise.all([
      fetch(`${config.apiBase}/api/admin/salary/holidays`, { headers: { Authorization: `Bearer ${config.token}` } }),
      fetch(`${config.apiBase}/api/admin/salary/releases?year=${y}`, { headers: { Authorization: `Bearer ${config.token}` } }),
    ])
    if (hRes.ok) { const d = await hRes.json() as { holidays: HolidayDate[] }; setHolidays(d.holidays) }
    if (rRes.ok) { const d = await rRes.json() as { releases: SalaryReleasePeriod[] }; setReleases(d.releases) }
    setLoading(false)
  }, [config, releasesYear])

  useEffect(() => { void fetchData() }, [fetchData])

  async function addHoliday() {
    if (!holidayForm.date) return
    await fetch(`${config.apiBase}/api/admin/salary/holidays`, {
      method: 'POST', headers: authHeaders(config.token),
      body: JSON.stringify({ date: holidayForm.date, description: holidayForm.description || undefined }),
    })
    setHolidayFormOpen(false); setHolidayForm({ date: '', description: '' }); await fetchData()
  }

  async function deleteHoliday(id: string) {
    await fetch(`${config.apiBase}/api/admin/salary/holidays/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${config.token}` },
    })
    await fetchData()
  }

  async function generateIndonesianHolidays() {
    setGeneratingHolidays(true)
    try {
      const res = await fetch(`${config.apiBase}/api/admin/salary/holidays`, {
        method: 'POST', headers: authHeaders(config.token),
        body: JSON.stringify({ bulk: INDONESIA_HOLIDAYS_2026 }),
      })
      if (res.ok) {
        const data = await res.json() as { added: number; skipped: number }
        window.alert(`Added: ${data.added}, Skipped (already existed): ${data.skipped}`)
      }
    } catch { /* ignore */ }
    setGeneratingHolidays(false)
    await fetchData()
  }

  async function addRelease() {
    if (!releaseForm.label || !releaseForm.releaseDate) return
    await fetch(`${config.apiBase}/api/admin/salary/releases`, {
      method: 'POST', headers: authHeaders(config.token),
      body: JSON.stringify({ label: releaseForm.label, releaseDate: releaseForm.releaseDate, year: parseInt(releaseForm.year, 10) }),
    })
    setReleaseFormOpen(false); setReleaseForm({ label: '', releaseDate: '', year: String(releasesYear) }); await fetchData()
  }

  async function deleteRelease(id: string) {
    await fetch(`${config.apiBase}/api/admin/salary/releases/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${config.token}` },
    })
    await fetchData()
  }

  if (loading) return <CenterLoader />

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={16} color={C.accent} />
            <span style={{ color: C.white, fontSize: 16, fontWeight: 700 }}>Holidays</span>
            <span style={{ color: C.textMuted, fontSize: 12 }}>({holidays.length})</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Btn label={generatingHolidays ? 'Generating...' : '🇮🇩 Generate 2026'} secondary onClick={() => void generateIndonesianHolidays()} />
            <Btn label="+ Add Holiday" onClick={() => setHolidayFormOpen(true)} />
          </div>
        </div>

        {holidayFormOpen && (
          <div style={{ background: C.bgInput, borderRadius: 12, padding: 16, marginBottom: 12, border: `1px solid ${C.separator}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <LabeledInput label="Date" type="date" value={holidayForm.date} onChange={v => setHolidayForm(f => ({ ...f, date: v }))} />
              <LabeledInput label="Description" value={holidayForm.description} onChange={v => setHolidayForm(f => ({ ...f, description: v }))} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Btn label="Cancel" secondary onClick={() => setHolidayFormOpen(false)} />
              <Btn label="Add" onClick={() => void addHoliday()} />
            </div>
          </div>
        )}

        {holidays.length === 0 ? (
          <div style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', padding: 20 }}>No holidays. Weekends are treated as holidays automatically.</div>
        ) : (() => {
          // Build calendar grid
          const first = new Date(calMonth.year, calMonth.month, 1)
          const startDay = first.getDay() // 0=Sun
          const daysInMonth = new Date(calMonth.year, calMonth.month + 1, 0).getDate()
          const holidayMap = new Map<string, HolidayDate>()
          for (const h of holidays) holidayMap.set(h.date.slice(0, 10), h)
          const todayStr2 = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
          const monthLabel = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          const cells: (number | null)[] = []
          for (let i = 0; i < startDay; i++) cells.push(null)
          for (let d = 1; d <= daysInMonth; d++) cells.push(d)
          while (cells.length % 7 !== 0) cells.push(null)

          return (
            <div>
              {/* Month nav */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 10 }}>
                <button onClick={() => setCalMonth(p => { const m = p.month - 1; return m < 0 ? { year: p.year - 1, month: 11 } : { ...p, month: m } })}
                  style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 16, cursor: 'pointer', padding: '2px 8px' }}>‹</button>
                <span style={{ color: C.white, fontSize: 13, fontWeight: 600, minWidth: 140, textAlign: 'center' }}>{monthLabel}</span>
                <button onClick={() => setCalMonth(p => { const m = p.month + 1; return m > 11 ? { year: p.year + 1, month: 0 } : { ...p, month: m } })}
                  style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 16, cursor: 'pointer', padding: '2px 8px' }}>›</button>
              </div>
              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                  <div key={d} style={{ textAlign: 'center', color: C.textMuted, fontSize: 9, fontWeight: 600, padding: '4px 0' }}>{d}</div>
                ))}
                {cells.map((day, i) => {
                  if (day === null) return <div key={`e${i}`} />
                  const dateStr = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const hol = holidayMap.get(dateStr)
                  const isToday = dateStr === todayStr2
                  const isWeekend = i % 7 === 0 || i % 7 === 6
                  return (
                    <div key={dateStr} title={hol?.description ?? ''} style={{
                      textAlign: 'center', padding: '6px 2px', borderRadius: 6, fontSize: 11, fontWeight: 500, position: 'relative',
                      background: hol ? 'rgba(247,99,99,0.15)' : isToday ? C.accentLight : 'transparent',
                      color: hol ? '#f04747' : isWeekend ? C.textMuted : C.text,
                      border: isToday ? `1px solid ${C.accent}` : '1px solid transparent',
                    }}>
                      {day}
                      {hol && <div style={{ width: 4, height: 4, borderRadius: 2, background: '#f04747', margin: '2px auto 0' }} />}
                    </div>
                  )
                })}
              </div>
              {/* Legend / list of holidays this month */}
              {(() => {
                const monthPrefix = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}`
                const monthHols = holidays.filter(h => h.date.slice(0, 7) === monthPrefix)
                if (monthHols.length === 0) return null
                return (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {monthHols.map(h => (
                      <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 6, background: 'rgba(247,99,99,0.06)' }}>
                        <div>
                          <span style={{ color: '#f04747', fontSize: 10, fontWeight: 600 }}>{new Date(h.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                          {h.description && <span style={{ color: C.textMuted, fontSize: 10, marginLeft: 6 }}>{h.description}</span>}
                        </div>
                        <button onClick={() => void deleteHoliday(h.id)} style={{ ...iconBtnStyle, padding: 2 }}><Trash2 size={11} color={C.danger} /></button>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )
        })()}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} color={C.accent} />
            <span style={{ color: C.white, fontSize: 16, fontWeight: 700 }}>Salary Releases</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={releasesYear} onChange={e => { const y = parseInt(e.target.value, 10); setReleasesYear(y); void fetchData(y) }}
              style={{ ...dateInputStyle, padding: '6px 10px' }}>
              {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <Btn label="+ Add Date" onClick={() => setReleaseFormOpen(true)} />
          </div>
        </div>

        {releaseFormOpen && (
          <div style={{ background: C.bgInput, borderRadius: 12, padding: 16, marginBottom: 12, border: `1px solid ${C.separator}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <LabeledInput label="Label" value={releaseForm.label} onChange={v => setReleaseForm(f => ({ ...f, label: v }))} placeholder="e.g. March 2026 Payroll" />
              <LabeledInput label="Release Date" type="date" value={releaseForm.releaseDate} onChange={v => setReleaseForm(f => ({ ...f, releaseDate: v }))} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Btn label="Cancel" secondary onClick={() => setReleaseFormOpen(false)} />
              <Btn label="Add" onClick={() => void addRelease()} />
            </div>
          </div>
        )}

        {releases.length === 0 ? (
          <div style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', padding: 20 }}>No salary release dates for {releasesYear}.</div>
        ) : (
          <div style={{ background: C.bgInput, borderRadius: 10, overflow: 'hidden' }}>
            {releases.map((r, i) => {
              const isPast = new Date(r.releaseDate) < new Date()
              const upcoming = releases.filter(x => new Date(x.releaseDate) >= new Date())
              const isNext = !isPast && upcoming.indexOf(r) === 0
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderBottom: i < releases.length - 1 ? `1px solid ${C.separator}` : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isNext && <span style={{ fontSize: 10, fontWeight: 700, color: C.accent, background: C.accentLight, padding: '2px 8px', borderRadius: 10 }}>Next</span>}
                    {isPast && <span style={{ fontSize: 10, color: C.textMuted }}>Past</span>}
                    <div>
                      <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                      <div style={{ color: C.textMuted, fontSize: 11 }}>{fmtDate(r.releaseDate)}</div>
                    </div>
                  </div>
                  <button onClick={() => void deleteRelease(r.id)} style={{ ...iconBtnStyle }}><Trash2 size={13} color={C.danger} /></button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
// ═════════════════════════════════════════════════════════════════════════════
// SHARED SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

function AdminMenuItem({ icon, label, count, active, onClick }: {
  icon: React.ReactNode; label: string; count?: number; active: boolean; onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderRadius: 8, border: 'none',
        background: active ? 'rgba(0, 0, 255, 0.12)' : hovered ? C.bgHover : 'transparent',
        color: active ? C.white : hovered ? C.text : C.textMuted,
        cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s ease',
        fontSize: 13, fontWeight: active ? 600 : 500,
      }}>
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {count !== undefined && <span style={{ fontSize: 11, color: C.textMuted }}>{count}</span>}
    </button>
  )
}

function UserRow({ user, selected, onClick }: { user: AdminUser; selected: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const displayName = user.alias || user.username
  const actionColor = ACTION_COLORS[user.currentAction] ?? C.textMuted

  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 10px', borderRadius: 8, border: 'none',
        background: selected ? 'rgba(0, 0, 255, 0.12)' : hovered ? C.bgHover : 'transparent',
        cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s ease',
      }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Avatar url={user.avatarUrl} name={displayName} size={36} radius="8px" />
        <span style={{
          position: 'absolute', bottom: -2, right: -2,
          width: 10, height: 10, borderRadius: '50%',
          background: user.desktopOnline ? C.success : C.textMuted,
          border: `2px solid ${selected ? 'rgba(0,0,255,0.12)' : C.bgTertiary}`,
        }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: selected ? C.white : C.text,
          fontSize: 13, fontWeight: selected ? 600 : 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {displayName}
          {user.role === 'admin' && <ShieldCheck size={12} color={C.accent} style={{ marginLeft: 4, verticalAlign: 'middle' }} />}
        </div>
        <div style={{ color: actionColor, fontSize: 11, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {ACTION_LABELS[user.currentAction] ?? user.currentAction}
        </div>
        {user.currentApp && user.desktopOnline && (
          <div style={{
            color: C.textSecondary, fontSize: 10, marginTop: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Monitor size={10} color={C.textMuted} />
            {user.currentApp}
          </div>
        )}
      </div>
      <ChevronRight size={14} color={C.textMuted} style={{ flexShrink: 0, opacity: selected ? 1 : 0.5 }} />
    </button>
  )
}

function UserDetail({ user, isSelf, config, editingField, editValue, saving, onStartEdit, onCancelEdit, onSaveEdit, setEditValue, renewingUserId, renewResult, onRenewToken, onDeleteUser }: {
  user: AdminUser; isSelf: boolean; config: ApiConfig
  editingField: string | null; editValue: string; saving: boolean
  onStartEdit: (field: string, value: string) => void; onCancelEdit: () => void
  onSaveEdit: (field: string, value: string | number) => void; setEditValue: (v: string) => void
  renewingUserId: string | null; renewResult: { userId: string; token: string; dmSent: boolean } | null
  onRenewToken: (userId: string) => void
  onDeleteUser: (userId: string) => Promise<void>
}) {
  const displayName = user.alias || user.username
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [overtimeRequests, setOvertimeRequests] = useState<Array<{
    id: string; date: string; requestedHours: number; reason: string
    status: string; approvedHours: number | null; adminNote: string | null
    reviewedAt: string | null
  }>>([])
  const [otLoading, setOtLoading] = useState(false)
  const [otAction, setOtAction] = useState<string | null>(null)
  const [grantForm, setGrantForm] = useState(false)
  const [grantHours, setGrantHours] = useState('2')
  const [grantNote, setGrantNote] = useState('')
  const [granting, setGranting] = useState(false)

  // Fetch overtime requests for this user
  useEffect(() => {
    let cancelled = false
    async function load() {
      setOtLoading(true)
      try {
        const res = await fetch(`${config.apiBase}/api/admin/overtime?userId=${user.id}`, {
          headers: { Authorization: `Bearer ${config.token}` },
        })
        if (res.ok && !cancelled) {
          const data = await res.json() as { requests: typeof overtimeRequests }
          setOvertimeRequests(data.requests)
        }
      } catch { /* */ }
      if (!cancelled) setOtLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [user.id, config])

  async function handleOTAction(reqId: string, action: 'approved' | 'rejected') {
    setOtAction(reqId)
    try {
      const res = await fetch(`${config.apiBase}/api/admin/overtime`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reqId, action }),

      })
      if (res.ok) {
        setOvertimeRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: action, reviewedAt: new Date().toISOString() } : r))
      }
    } catch { /* */ }
    setOtAction(null)
  }

  async function grantAdditionalTime() {
    const hours = parseFloat(grantHours)
    if (!hours || hours < 0.5 || hours > 16) return
    setGranting(true)
    try {
      const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
      // Create an overtime request on behalf of the user and auto-approve it
      const createRes = await fetch(`${config.apiBase}/api/admin/overtime`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          date: todayDate,
          requestedHours: hours,
          reason: grantNote || 'Granted by admin',
          approvedHours: hours,
          adminNote: grantNote || 'Admin-granted additional time',
        }),
      })
      if (createRes.ok) {
        const data = await createRes.json() as { request: { id: string } }
        // Refresh OT list
        setOvertimeRequests(prev => [...prev, {
          id: data.request.id,
          date: todayDate,
          requestedHours: hours,
          reason: grantNote || 'Granted by admin',
          status: 'approved',
          approvedHours: hours,
          adminNote: grantNote || 'Admin-granted additional time',
          reviewedAt: new Date().toISOString(),
        }])
        setGrantForm(false)
        setGrantHours('2')
        setGrantNote('')
      }
    } catch { /* */ }
    setGranting(false)
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Avatar url={user.avatarUrl} name={displayName} size={64} radius="12px" />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: C.white, fontSize: 22, fontWeight: 700 }}>{displayName}</span>
            {user.role === 'admin' && (
              <span style={{ background: C.accentLight, color: C.accent, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6 }}>Admin</span>
            )}
          </div>
          <div style={{ color: C.textMuted, fontSize: 13, marginTop: 2 }}>@{user.username}</div>
        </div>
      </div>

      <Section title="Status">
        <InfoRow icon={<span style={{ width: 8, height: 8, borderRadius: '50%', background: user.desktopOnline ? C.success : C.textMuted, display: 'inline-block' }} />}
          label="Desktop" value={user.desktopOnline ? 'Online' : 'Offline'} valueColor={user.desktopOnline ? C.success : C.textMuted} />
        <InfoRow icon={<Clock size={14} color={C.textMuted} />} label="Work status"
          value={ACTION_LABELS[user.currentAction] ?? user.currentAction} valueColor={ACTION_COLORS[user.currentAction] ?? C.textMuted} />
        {user.deviceName && <InfoRow icon={<Monitor size={14} color={C.textMuted} />} label="Device" value={user.deviceName} />}
        {user.currentApp && user.desktopOnline && <InfoRow icon={<Monitor size={14} color={C.accent} />} label="Current app" value={user.currentApp} valueColor={C.accent} />}
        {user.runningApps.length > 0 && user.desktopOnline && (
          <div style={{ padding: '8px 14px' }}>
            <div style={{ color: C.textMuted, fontSize: 11, marginBottom: 4 }}>Running apps</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {user.runningApps.map(app => (
                <span key={app} style={{ fontSize: 10, background: C.bgTertiary, color: C.textSecondary, padding: '2px 8px', borderRadius: 4 }}>{app}</span>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Information">
        <EditableRow label="Email" value={user.email ?? '—'} field="email"
          editing={editingField === 'email'} editValue={editValue} saving={saving}
          onStartEdit={onStartEdit} onCancel={onCancelEdit} onSave={onSaveEdit} setEditValue={setEditValue} />
        <EditableRow label="Phone" value={user.phone ?? '—'} field="phone"
          editing={editingField === 'phone'} editValue={editValue} saving={saving}
          onStartEdit={onStartEdit} onCancel={onCancelEdit} onSave={onSaveEdit} setEditValue={setEditValue} />
        <EditableRow label="Status" value={user.userStatus ?? '—'} field="userStatus"
          editing={editingField === 'userStatus'} editValue={editValue} saving={saving}
          onStartEdit={onStartEdit} onCancel={onCancelEdit} onSave={onSaveEdit} setEditValue={setEditValue} />
        <InfoRow icon={<Calendar size={14} color={C.textMuted} />} label="Joined" value={fmtDate(user.createdAt)} />
        {user.tokenExpiresAt && <InfoRow icon={<Clock size={14} color={C.textMuted} />} label="Token expires" value={fmtDateTime(user.tokenExpiresAt)} />}
      </Section>

      <Section title="Settings">
        <EditableRow label="Role" value={user.role} field="role"
          editing={editingField === 'role'} editValue={editValue} saving={saving}
          disabled={isSelf} disabledTooltip="Cannot change your own role"
          onStartEdit={onStartEdit} onCancel={onCancelEdit} onSave={onSaveEdit} setEditValue={setEditValue}
          options={['admin', 'user']} />
        <EditableRow label="Alias" value={user.alias ?? '—'} field="alias"
          editing={editingField === 'alias'} editValue={editValue} saving={saving}
          onStartEdit={onStartEdit} onCancel={onCancelEdit} onSave={onSaveEdit} setEditValue={setEditValue} />
        <EditableRow label="Daily work limit" value={(() => { const h = Math.floor(user.dailyWorkLimitHours); const m = Math.round((user.dailyWorkLimitHours - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` })()} field="dailyWorkLimitHours"
          editing={editingField === 'dailyWorkLimitHours'} editValue={editValue} saving={saving}
          onStartEdit={(f, v) => onStartEdit(f, v)} onCancel={onCancelEdit}
          onSave={(f, v) => {
            const parts = v.split(':');
            const hours = parseInt(parts[0] || '0', 10);
            const mins = parseInt(parts[1] || '0', 10);
            const total = hours + mins / 60;
            if (total >= 0.5 && total <= 24) onSaveEdit(f, Math.round(total * 100) / 100);
          }}
          setEditValue={setEditValue}
          placeholder="hh:mm (e.g. 08:00)" />
      </Section>

      {/* Overtime Requests */}
      <Section title="Overtime Requests">
        {/* Grant Additional Time button */}
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.separator}` }}>
          {!grantForm ? (
            <button onClick={() => setGrantForm(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                background: 'rgba(67,181,129,0.1)', border: '1px solid rgba(67,181,129,0.3)',
                borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                color: C.success, fontSize: 12, fontWeight: 600,
              }}>
              <Plus size={14} />
              Grant Additional Time for Today
            </button>
          ) : (
            <div style={{ background: C.bgInput, borderRadius: 8, padding: 12, border: `1px solid ${C.separator}` }}>
              <div style={{ color: C.text, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Grant extra hours for today</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: '0 0 80px' }}>
                  <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>Hours</div>
                  <input type="number" min="0.5" max="16" step="0.5" value={grantHours} onChange={e => setGrantHours(e.target.value)}
                    style={{ width: '100%', background: C.bgTertiary, border: `1px solid ${C.separator}`, borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>Note (optional)</div>
                  <input value={grantNote} onChange={e => setGrantNote(e.target.value)} placeholder="Reason for granting extra time"
                    onKeyDown={e => { if (e.key === 'Enter') void grantAdditionalTime(); if (e.key === 'Escape') setGrantForm(false) }}
                    style={{ width: '100%', background: C.bgTertiary, border: `1px solid ${C.separator}`, borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => void grantAdditionalTime()} disabled={granting}
                  style={{ border: 'none', background: C.success, color: '#fff', fontSize: 11, fontWeight: 600, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', opacity: granting ? 0.6 : 1 }}>
                  {granting ? 'Granting…' : 'Grant'}
                </button>
                <button onClick={() => setGrantForm(false)}
                  style={{ background: 'transparent', border: `1px solid ${C.separator}`, color: C.textMuted, fontSize: 11, padding: '6px 14px', borderRadius: 6, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {otLoading ? (
          <div style={{ padding: 14, display: 'flex', justifyContent: 'center' }}><Loader size={16} color={C.textMuted} /></div>
        ) : overtimeRequests.length === 0 ? (
          <div style={{ padding: '14px', color: C.textMuted, fontSize: 12, textAlign: 'center' }}>No overtime requests</div>
        ) : (
          overtimeRequests.map(req => (
            <div key={req.id} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.separator}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{req.date}</span>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{req.requestedHours}h requested</span>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                  background: req.status === 'approved' ? 'rgba(67,181,129,0.15)' : req.status === 'rejected' ? 'rgba(252,129,129,0.15)' : 'rgba(250,166,26,0.15)',
                  color: req.status === 'approved' ? C.success : req.status === 'rejected' ? '#fc8181' : C.warning,
                }}>{req.status}</span>
              </div>
              <div style={{ color: C.textSecondary, fontSize: 12, marginBottom: 6 }}>{req.reason}</div>
              {req.status === 'pending' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => void handleOTAction(req.id, 'approved')} disabled={otAction === req.id}
                    style={{ border: 'none', background: 'rgba(67,181,129,0.15)', color: C.success, fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>
                    {otAction === req.id ? <Loader size={12} /> : 'Approve'}
                  </button>
                  <button onClick={() => void handleOTAction(req.id, 'rejected')} disabled={otAction === req.id}
                    style={{ border: 'none', background: 'rgba(252,129,129,0.15)', color: '#fc8181', fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </Section>

      <Section title="Actions">
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => onRenewToken(user.id)} disabled={renewingUserId === user.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: C.accentLight, border: `1px solid ${C.accent}`,
              borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
              color: C.accent, fontSize: 13, fontWeight: 600,
              opacity: renewingUserId === user.id ? 0.6 : 1,
            }}>
            {renewingUserId === user.id ? <Loader size={14} /> : <RefreshCw size={14} />}
            Renew Token
          </button>
          {renewResult && renewResult.userId === user.id && (
            <div style={{ background: C.bgTertiary, borderRadius: 8, padding: '10px 14px', border: `1px solid ${C.separator}` }}>
              <div style={{ color: C.success, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Token renewed successfully</div>
              <div style={{ color: C.text, fontSize: 13, fontFamily: 'monospace', marginBottom: 4 }}>{renewResult.token}</div>
              <div style={{ color: C.textMuted, fontSize: 11 }}>{renewResult.dmSent ? '✓ Sent to Discord DM' : '✗ Discord DM failed — share manually'}</div>
            </div>
          )}

          {/* Remove member */}
          {!isSelf && (
            <>
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'rgba(252,129,129,0.1)', border: '1px solid rgba(252,129,129,0.3)',
                    borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                    color: '#fc8181', fontSize: 13, fontWeight: 600,
                  }}>
                  <Trash2 size={14} />
                  Remove Member
                </button>
              ) : (
                <div style={{ background: 'rgba(252,129,129,0.08)', border: '1px solid rgba(252,129,129,0.3)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <AlertTriangle size={14} color="#fc8181" />
                    <span style={{ color: '#fc8181', fontSize: 12, fontWeight: 600 }}>
                      Remove {displayName}? This cannot be undone.
                    </span>
                  </div>
                  <div style={{ color: C.textMuted, fontSize: 11, marginBottom: 10 }}>
                    All data including time logs, screenshots, reports, and salary records will be permanently deleted.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={async () => { setDeleting(true); await onDeleteUser(user.id) }} disabled={deleting}
                      style={{
                        border: 'none', background: '#fc8181', color: '#fff',
                        fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
                        opacity: deleting ? 0.6 : 1,
                      }}>
                      {deleting ? <Loader size={12} /> : 'Yes, Remove'}
                    </button>
                    <button onClick={() => setConfirmDelete(false)}
                      style={{
                        border: `1px solid ${C.separator}`, background: 'transparent', color: C.textMuted,
                        fontSize: 12, padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
                      }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{title}</div>
      <div style={{ background: C.bgInput, borderRadius: 10, padding: '4px 0', overflow: 'hidden' }}>{children}</div>
    </div>
  )
}

function InfoRow({ icon, label, value, valueColor }: { icon: React.ReactNode; label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
      {icon}
      <span style={{ color: C.textMuted, fontSize: 13, width: 100, flexShrink: 0 }}>{label}</span>
      <span style={{ color: valueColor ?? C.text, fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function EditableRow({ label, value, field, editing, editValue, saving, disabled, disabledTooltip, options, placeholder, onStartEdit, onCancel, onSave, setEditValue }: {
  label: string; value: string; field: string
  editing: boolean; editValue: string; saving: boolean
  disabled?: boolean; disabledTooltip?: string; options?: string[]; placeholder?: string
  onStartEdit: (field: string, value: string) => void; onCancel: () => void
  onSave: (field: string, value: string) => void; setEditValue: (v: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px' }}>
        <Edit2 size={14} color={C.accent} />
        <span style={{ color: C.textMuted, fontSize: 13, width: 100, flexShrink: 0 }}>{label}</span>
        {options ? (
          <select value={editValue} onChange={e => setEditValue(e.target.value)}
            style={{ flex: 1, background: C.bgTertiary, border: `1px solid ${C.separator}`, borderRadius: 6, padding: '4px 8px', color: C.text, fontSize: 13, outline: 'none' }}>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input value={editValue} onChange={e => setEditValue(e.target.value)} placeholder={placeholder}
            onKeyDown={e => { if (e.key === 'Enter') onSave(field, editValue); if (e.key === 'Escape') onCancel() }}
            autoFocus style={{ flex: 1, background: C.bgTertiary, border: `1px solid ${C.separator}`, borderRadius: 6, padding: '4px 8px', color: C.text, fontSize: 13, outline: 'none' }} />
        )}
        <button onClick={() => onSave(field, editValue)} disabled={saving}
          style={{ border: 'none', background: C.success, borderRadius: 6, padding: '4px 6px', cursor: 'pointer', display: 'flex' }}>
          {saving ? <Loader size={14} color="#fff" /> : <Check size={14} color="#fff" />}
        </button>
        <button onClick={onCancel}
          style={{ border: 'none', background: C.bgHover, borderRadius: 6, padding: '4px 6px', cursor: 'pointer', display: 'flex' }}>
          <X size={14} color={C.textMuted} />
        </button>
      </div>
    )
  }
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: hovered && !disabled ? C.bgHover : 'transparent', transition: 'background 0.1s ease',
      }}
      onClick={() => !disabled && onStartEdit(field, field === 'alias' && value === '—' ? '' : value)}
      title={disabled ? disabledTooltip : `Click to edit ${label.toLowerCase()}`}>
      <Edit2 size={14} color={C.textMuted} style={{ opacity: hovered && !disabled ? 1 : 0.5 }} />
      <span style={{ color: C.textMuted, fontSize: 13, width: 100, flexShrink: 0 }}>{label}</span>
      <span style={{ color: C.text, fontSize: 13, fontWeight: 500, flex: 1 }}>{value}</span>
      {hovered && !disabled && <ChevronRight size={14} color={C.textMuted} />}
    </div>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: C.textMuted }}>
      {icon}
      <span style={{ fontSize: 14 }}>{text}</span>
    </div>
  )
}

function CenterLoader() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <Loader size={24} color={C.textMuted} />
    </div>
  )
}

function Btn({ label, onClick, secondary }: { label: string; onClick: () => void; secondary?: boolean }) {
  const [h, setH] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        padding: '8px 16px', borderRadius: 8, border: `1px solid ${secondary ? C.separator : C.accent}`,
        background: secondary ? (h ? C.bgHover : 'transparent') : C.accentLight,
        color: secondary ? C.textMuted : C.accent,
        fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s ease',
      }}>
      {label}
    </button>
  )
}

function LabeledInput({ label, value, onChange, type, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ color: C.textMuted, fontSize: 10, marginBottom: 4 }}>{label}</div>
      <input type={type ?? 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', background: C.bgTertiary, border: `1px solid ${C.separator}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
    </div>
  )
}

function LabeledSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ color: C.textMuted, fontSize: 10, marginBottom: 4 }}>{label}</div>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', background: C.bgTertiary, border: `1px solid ${C.separator}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}>
        <option value="">Select...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex',
}

const dateInputStyle: React.CSSProperties = {
  background: C.bgInput, border: `1px solid ${C.separator}`, borderRadius: 8,
  padding: '6px 10px', color: C.text, fontSize: 12, outline: 'none',
}
