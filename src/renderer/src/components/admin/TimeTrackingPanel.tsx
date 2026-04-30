import { useState, useEffect, useCallback } from 'react'
import {
  Clock, ChevronDown, ChevronRight, Check, X, Plus, Trash2, Edit2,
  ChevronLeft, Loader, AlertCircle, User,
} from 'lucide-react'
import { C } from '../../theme'
import { Avatar } from '../shared/Avatar'
import type { ApiConfig } from '../../types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string
  username: string
  alias: string | null
  avatarUrl: string | null
}

interface ManualTimeRequest {
  id: string
  userId: string
  startTime: string
  endTime: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  adminNote: string | null
  createdAt: string
  user: { id: string; username: string; alias: string | null; avatarUrl: string | null }
}

interface TimeLogEntry {
  id: string
  action: string
  timestamp: string
}

interface UserTimeData {
  timeLogs: TimeLogEntry[]
  workedMs: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayWIB(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

function fmtHours(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'Asia/Jakarta', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function fmtRange(start: string, end: string): string {
  const s = new Date(start).toLocaleString('en-US', { timeZone: 'Asia/Jakarta', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  const e = new Date(end).toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', minute: '2-digit', hour12: true })
  return `${s} – ${e}`
}

const ACTION_COLORS: Record<string, string> = {
  CHECK_IN: '#22c55e',
  BREAK: '#f59e0b',
  BACK: '#3b82f6',
  CLOCK_OUT: '#ef4444',
}

const ACTION_LABELS: Record<string, string> = {
  CHECK_IN: 'Check In',
  BREAK: 'Break',
  BACK: 'Back',
  CLOCK_OUT: 'Clock Out',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TimeTrackingPanel({ config, users }: { config: ApiConfig; users: AdminUser[] }) {
  const [subTab, setSubTab] = useState<'requests' | 'breakdown'>('requests')
  const [selectedDate, setSelectedDate] = useState(todayWIB())
  const [filterUserId, setFilterUserId] = useState<string>('all')

  // Requests state
  const [requests, setRequests] = useState<ManualTimeRequest[]>([])
  const [loadingReqs, setLoadingReqs] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  // Breakdown state
  const [timeData, setTimeData] = useState<Record<string, UserTimeData>>({})
  const [loadingTime, setLoadingTime] = useState(false)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  // Add time form
  const [addTimeUserId, setAddTimeUserId] = useState<string | null>(null)
  const [addTimeHours, setAddTimeHours] = useState('1')
  const [addTimeNote, setAddTimeNote] = useState('')
  const [addingTime, setAddingTime] = useState(false)

  // Edit log entry
  const [editLogId, setEditLogId] = useState<string | null>(null)
  const [editLogTs, setEditLogTs] = useState('')
  const [editLogAction, setEditLogAction] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Add entry form (power user)
  const [addEntryUserId, setAddEntryUserId] = useState<string | null>(null)
  const [addEntryAction, setAddEntryAction] = useState('CHECK_IN')
  const [addEntryTs, setAddEntryTs] = useState('')
  const [addingEntry, setAddingEntry] = useState(false)

  const h = useCallback((opts?: RequestInit) => ({
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json',
    ...(opts?.headers ?? {}),
  }), [config.token])

  // ── Fetch requests ──────────────────────────────────────────────────────────

  const fetchRequests = useCallback(async () => {
    setLoadingReqs(true)
    try {
      const res = await fetch(`${config.apiBase}/api/admin/manual-requests`, { headers: h() })
      if (res.ok) {
        const data = await res.json() as { requests: ManualTimeRequest[] }
        setRequests(data.requests)
      }
    } catch { /* offline */ } finally { setLoadingReqs(false) }
  }, [config.apiBase, h])

  useEffect(() => { void fetchRequests() }, [fetchRequests])

  // ── Fetch time breakdown for visible users ──────────────────────────────────

  const fetchUserTime = useCallback(async (userId: string, date: string) => {
    try {
      const res = await fetch(
        `${config.apiBase}/api/admin/activity?userId=${userId}&date=${date}`,
        { headers: h() },
      )
      if (!res.ok) return
      const data = await res.json() as { timeLogs: TimeLogEntry[]; stats?: { totalTrackedMinutes: number } }
      // Compute workedMs from timeLogs client-side
      let workedMs = 0
      let lastCheckIn: Date | null = null
      for (const log of data.timeLogs ?? []) {
        if (log.action === 'CHECK_IN' || log.action === 'BACK') {
          lastCheckIn = new Date(log.timestamp)
        } else if ((log.action === 'BREAK' || log.action === 'CLOCK_OUT') && lastCheckIn) {
          workedMs += new Date(log.timestamp).getTime() - lastCheckIn.getTime()
          lastCheckIn = null
        }
      }
      // If still clocked in, count up to now
      if (lastCheckIn) workedMs += Date.now() - lastCheckIn.getTime()
      setTimeData(prev => ({ ...prev, [userId]: { timeLogs: data.timeLogs ?? [], workedMs } }))
    } catch { /* offline */ }
  }, [config.apiBase, h])

  const fetchAllVisible = useCallback(async () => {
    const targets = filterUserId === 'all' ? users : users.filter(u => u.id === filterUserId)
    if (targets.length === 0) return
    setLoadingTime(true)
    await Promise.all(targets.map(u => fetchUserTime(u.id, selectedDate)))
    setLoadingTime(false)
  }, [users, filterUserId, selectedDate, fetchUserTime])

  useEffect(() => {
    if (subTab === 'breakdown') void fetchAllVisible()
  }, [subTab, selectedDate, filterUserId, fetchAllVisible])

  // ── Approve / Reject request ────────────────────────────────────────────────

  async function approveRequest(id: string) {
    setProcessingId(id)
    try {
      const res = await fetch(`${config.apiBase}/api/admin/manual-requests`, {
        method: 'PATCH', headers: h(),
        body: JSON.stringify({ id, action: 'approved' }),
      })
      if (res.ok) { await fetchRequests(); void fetchAllVisible() }
    } catch { /* offline */ } finally { setProcessingId(null) }
  }

  async function rejectRequest(id: string) {
    setProcessingId(id)
    try {
      const res = await fetch(`${config.apiBase}/api/admin/manual-requests`, {
        method: 'PATCH', headers: h(),
        body: JSON.stringify({ id, action: 'rejected', adminNote: rejectNote.trim() || null }),
      })
      if (res.ok) { setRejectId(null); setRejectNote(''); await fetchRequests() }
    } catch { /* offline */ } finally { setProcessingId(null) }
  }

  // ── Add time block ──────────────────────────────────────────────────────────

  async function addTime(userId: string) {
    const hrs = parseFloat(addTimeHours)
    if (isNaN(hrs) || hrs < 0.1) return
    setAddingTime(true)
    try {
      const res = await fetch(`${config.apiBase}/api/admin/time-adjustment`, {
        method: 'POST', headers: h(),
        body: JSON.stringify({ userId, date: selectedDate, hours: hrs, note: addTimeNote.trim() || undefined }),
      })
      if (res.ok) {
        setAddTimeUserId(null); setAddTimeHours('1'); setAddTimeNote('')
        await fetchUserTime(userId, selectedDate)
      }
    } catch { /* offline */ } finally { setAddingTime(false) }
  }

  // ── Edit log entry ──────────────────────────────────────────────────────────

  function startEdit(log: TimeLogEntry) {
    setEditLogId(log.id)
    setEditLogAction(log.action)
    const d = new Date(log.timestamp)
    const pad = (n: number) => String(n).padStart(2, '0')
    // datetime-local needs local time in WIB
    const wib = new Date(d.getTime() + 7 * 3_600_000)
    setEditLogTs(`${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())}T${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}`)
  }

  async function saveEdit(userId: string) {
    if (!editLogId) return
    setSavingEdit(true)
    try {
      // Convert local WIB datetime-local back to UTC
      const localTs = new Date(editLogTs + ':00+07:00').toISOString()
      const res = await fetch(`${config.apiBase}/api/admin/manual-timelog`, {
        method: 'PATCH', headers: h(),
        body: JSON.stringify({ id: editLogId, action: editLogAction, timestamp: localTs }),
      })
      if (res.ok) { setEditLogId(null); await fetchUserTime(userId, selectedDate) }
    } catch { /* offline */ } finally { setSavingEdit(false) }
  }

  // ── Delete log entry ────────────────────────────────────────────────────────

  async function deleteLog(logId: string, userId: string) {
    // Optimistic
    setTimeData(prev => ({
      ...prev,
      [userId]: { ...prev[userId], timeLogs: (prev[userId]?.timeLogs ?? []).filter(l => l.id !== logId) },
    }))
    try {
      const res = await fetch(`${config.apiBase}/api/admin/manual-timelog?id=${encodeURIComponent(logId)}`, {
        method: 'DELETE', headers: h(),
      })
      if (res.ok) await fetchUserTime(userId, selectedDate)
      else await fetchUserTime(userId, selectedDate) // revert on error
    } catch { await fetchUserTime(userId, selectedDate) }
  }

  // ── Add individual log entry ────────────────────────────────────────────────

  async function addEntry(userId: string) {
    if (!addEntryTs) return
    setAddingEntry(true)
    try {
      const ts = new Date(addEntryTs + ':00+07:00').toISOString()
      const res = await fetch(`${config.apiBase}/api/admin/manual-timelog`, {
        method: 'POST', headers: h(),
        body: JSON.stringify({ userId, action: addEntryAction, timestamp: ts }),
      })
      if (res.ok) {
        setAddEntryUserId(null); setAddEntryTs(''); setAddEntryAction('CHECK_IN')
        await fetchUserTime(userId, selectedDate)
      }
    } catch { /* offline */ } finally { setAddingEntry(false) }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const pendingReqs = requests.filter(r => r.status === 'pending')
  const visibleUsers = filterUserId === 'all' ? users : users.filter(u => u.id === filterUserId)

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Clock size={18} color={C.accent} />
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Time Tracking</span>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.separator}` }}>
          {([
            { key: 'requests' as const, label: `Requests${pendingReqs.length > 0 ? ` (${pendingReqs.length})` : ''}` },
            { key: 'breakdown' as const, label: 'Time Breakdown' },
          ]).map(t => (
            <button key={t.key} onClick={() => setSubTab(t.key)} style={{
              padding: '8px 16px', border: 'none', cursor: 'pointer', background: 'transparent',
              color: subTab === t.key ? C.accent : C.textMuted,
              fontSize: 13, fontWeight: subTab === t.key ? 600 : 400,
              borderBottom: `2px solid ${subTab === t.key ? C.accent : 'transparent'}`,
              transition: 'all 0.15s', fontFamily: 'inherit',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, minHeight: 0 }}>

        {/* ── REQUESTS TAB ──────────────────────────────────────────────────── */}
        {subTab === 'requests' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loadingReqs && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                <Loader size={20} color={C.textMuted} />
              </div>
            )}
            {!loadingReqs && requests.length === 0 && (
              <div style={{ textAlign: 'center', padding: 48, color: C.textMuted }}>
                <AlertCircle size={32} strokeWidth={1} style={{ marginBottom: 8, opacity: 0.4 }} />
                <div style={{ fontSize: 13 }}>No manual time requests</div>
              </div>
            )}
            {requests.map(req => (
              <div key={req.id} style={{
                background: C.bgInput, borderRadius: 10,
                border: `1px solid ${req.status === 'pending' ? C.separator : req.status === 'approved' ? C.success + '40' : C.danger + '40'}`,
                padding: '12px 14px',
              }}>
                {/* Row top: avatar + name + range + status badge */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Avatar url={req.user.avatarUrl} name={req.user.alias ?? req.user.username} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                        {req.user.alias ?? req.user.username}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4,
                        color: req.status === 'approved' ? C.success : req.status === 'rejected' ? C.danger : C.warning,
                        background: req.status === 'approved' ? C.success + '18' : req.status === 'rejected' ? C.danger + '18' : C.warning + '18',
                      }}>{req.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.accent, marginTop: 2, fontWeight: 500 }}>
                      {fmtRange(req.startTime, req.endTime)}
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{req.reason}</div>
                    {req.adminNote && (
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, fontStyle: 'italic' }}>
                        Admin note: {req.adminNote}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
                      {new Date(req.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Jakarta', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                    </div>
                  </div>

                  {/* Action buttons — only for pending */}
                  {req.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginTop: 2 }}>
                      <button
                        onClick={() => approveRequest(req.id)}
                        disabled={processingId === req.id}
                        style={{
                          padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: C.success, color: '#fff', fontSize: 12, fontWeight: 600,
                          opacity: processingId === req.id ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                        <Check size={12} /> Approve
                      </button>
                      <button
                        onClick={() => { setRejectId(req.id); setRejectNote('') }}
                        disabled={processingId === req.id}
                        style={{
                          padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.danger}`, cursor: 'pointer',
                          background: 'transparent', color: C.danger, fontSize: 12, fontWeight: 600,
                          opacity: processingId === req.id ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                        <X size={12} /> Reject
                      </button>
                    </div>
                  )}
                </div>

                {/* Reject note input (inline expand) */}
                {rejectId === req.id && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      value={rejectNote}
                      onChange={e => setRejectNote(e.target.value)}
                      placeholder="Admin note (optional)"
                      autoFocus
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.separator}`, background: C.bgInput, color: C.text, fontSize: 12, outline: 'none' }}
                    />
                    <button onClick={() => rejectRequest(req.id)} disabled={processingId === req.id}
                      style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: C.danger, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Confirm
                    </button>
                    <button onClick={() => setRejectId(null)}
                      style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.separator}`, background: 'transparent', color: C.textMuted, fontSize: 12, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── BREAKDOWN TAB ─────────────────────────────────────────────────── */}
        {subTab === 'breakdown' && (
          <div>
            {/* Controls row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              {/* Date navigator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.bgInput, borderRadius: 8, padding: '4px 8px' }}>
                <button
                  onClick={() => {
                    const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() - 1)
                    setSelectedDate(d.toISOString().slice(0, 10))
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2, display: 'flex' }}>
                  <ChevronLeft size={14} />
                </button>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                  style={{ border: 'none', background: 'transparent', fontSize: 13, color: C.text, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }} />
                <button
                  onClick={() => {
                    const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() + 1)
                    setSelectedDate(d.toISOString().slice(0, 10))
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2, display: 'flex' }}>
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* User filter */}
              <select value={filterUserId} onChange={e => setFilterUserId(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.separator}`, background: C.bgInput, color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                <option value="all">All Users</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.alias ?? u.username}</option>
                ))}
              </select>

              {loadingTime && <Loader size={14} color={C.textMuted} />}
            </div>

            {/* User rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleUsers.map(user => {
                const data = timeData[user.id]
                const isExpanded = expandedUser === user.id
                const isAddingTime = addTimeUserId === user.id
                const isAddingEntry = addEntryUserId === user.id

                return (
                  <div key={user.id} style={{ background: C.bgInput, borderRadius: 10, border: `1px solid ${C.separator}`, overflow: 'hidden' }}>
                    {/* User row header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                      <Avatar url={user.avatarUrl} name={user.alias ?? user.username} size={30} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{user.alias ?? user.username}</div>
                        <div style={{ fontSize: 11, color: data ? C.accent : C.textMuted, fontWeight: data ? 600 : 400 }}>
                          {data ? fmtHours(data.workedMs) : '—'}
                          {data && data.timeLogs.length > 0 && (
                            <span style={{ color: C.textMuted, fontWeight: 400 }}> · {data.timeLogs.length} entries</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => { setAddTimeUserId(isAddingTime ? null : user.id); setAddEntryUserId(null) }}
                        style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.accent}`, background: 'transparent', color: C.accent, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Plus size={11} /> Add Time
                      </button>
                      <button
                        onClick={() => { setExpandedUser(isExpanded ? null : user.id); if (!data) void fetchUserTime(user.id, selectedDate) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, display: 'flex', alignItems: 'center' }}>
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </div>

                    {/* Add time form */}
                    {isAddingTime && (
                      <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.separator}`, background: C.bgInput, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, fontWeight: 600 }}>Hours to Add</div>
                          <input type="number" min="0.1" max="16" step="0.1" value={addTimeHours}
                            onChange={e => setAddTimeHours(e.target.value)}
                            style={{ width: 80, padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.separator}`, background: C.bgInput, color: C.text, fontSize: 13, outline: 'none' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, fontWeight: 600 }}>Note (optional)</div>
                          <input value={addTimeNote} onChange={e => setAddTimeNote(e.target.value)}
                            placeholder="Reason for adjustment"
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.separator}`, background: C.bgInput, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => addTime(user.id)} disabled={addingTime || !addTimeHours}
                            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: addingTime ? 0.5 : 1 }}>
                            {addingTime ? '…' : 'Add'}
                          </button>
                          <button onClick={() => setAddTimeUserId(null)}
                            style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.separator}`, background: 'transparent', color: C.textMuted, fontSize: 12, cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Expanded time logs */}
                    {isExpanded && (
                      <div style={{ borderTop: `1px solid ${C.separator}` }}>
                        {!data || data.timeLogs.length === 0 ? (
                          <div style={{ padding: '16px 14px', color: C.textMuted, fontSize: 12, textAlign: 'center' }}>
                            No time logs for this date
                          </div>
                        ) : (
                          <div style={{ padding: '8px 0' }}>
                            {data.timeLogs.map(log => (
                              <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px' }}>
                                {/* Action badge */}
                                <span style={{
                                  width: 80, fontSize: 10, fontWeight: 700, textAlign: 'center',
                                  padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                                  color: ACTION_COLORS[log.action] ?? C.textMuted,
                                  background: (ACTION_COLORS[log.action] ?? C.textMuted) + '18',
                                }}>{ACTION_LABELS[log.action] ?? log.action}</span>

                                {/* Timestamp or edit input */}
                                {editLogId === log.id ? (
                                  <>
                                    <select value={editLogAction} onChange={e => setEditLogAction(e.target.value)}
                                      style={{ padding: '4px 6px', borderRadius: 6, border: `1px solid ${C.separator}`, background: C.bgInput, color: C.text, fontSize: 12, outline: 'none' }}>
                                      {['CHECK_IN', 'BREAK', 'BACK', 'CLOCK_OUT'].map(a => (
                                        <option key={a} value={a}>{ACTION_LABELS[a]}</option>
                                      ))}
                                    </select>
                                    <input type="datetime-local" value={editLogTs}
                                      onChange={e => setEditLogTs(e.target.value)}
                                      style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.accent}`, background: C.bgInput, color: C.text, fontSize: 12, outline: 'none' }} />
                                    <button onClick={() => saveEdit(user.id)} disabled={savingEdit}
                                      style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: C.accent, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                      {savingEdit ? '…' : 'Save'}
                                    </button>
                                    <button onClick={() => setEditLogId(null)}
                                      style={{ padding: '4px 8px', borderRadius: 5, border: `1px solid ${C.separator}`, background: 'transparent', color: C.textMuted, fontSize: 11, cursor: 'pointer' }}>
                                      ✕
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span style={{ flex: 1, fontSize: 13, color: C.text }}>{fmtTs(log.timestamp)}</span>
                                    <button onClick={() => startEdit(log)} title="Edit"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, display: 'flex', alignItems: 'center' }}>
                                      <Edit2 size={13} />
                                    </button>
                                    <button onClick={() => deleteLog(log.id, user.id)} title="Delete"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 4, display: 'flex', alignItems: 'center' }}>
                                      <Trash2 size={13} />
                                    </button>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add entry row */}
                        {!isAddingEntry ? (
                          <div style={{ padding: '4px 14px 10px' }}>
                            <button
                              onClick={() => { setAddEntryUserId(user.id); setAddEntryTs(''); setAddEntryAction('CHECK_IN') }}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.textMuted, background: 'none', border: `1px dashed ${C.separator}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
                              <Plus size={11} /> Add Log Entry
                            </button>
                          </div>
                        ) : (
                          <div style={{ padding: '8px 14px 10px', borderTop: `1px solid ${C.separator}`, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select value={addEntryAction} onChange={e => setAddEntryAction(e.target.value)}
                              style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.separator}`, background: C.bgInput, color: C.text, fontSize: 12, outline: 'none' }}>
                              {['CHECK_IN', 'BREAK', 'BACK', 'CLOCK_OUT'].map(a => (
                                <option key={a} value={a}>{ACTION_LABELS[a]}</option>
                              ))}
                            </select>
                            <input type="datetime-local" value={addEntryTs} onChange={e => setAddEntryTs(e.target.value)}
                              style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.separator}`, background: C.bgInput, color: C.text, fontSize: 12, outline: 'none' }} />
                            <button onClick={() => addEntry(user.id)} disabled={addingEntry || !addEntryTs}
                              style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: addingEntry || !addEntryTs ? 0.5 : 1 }}>
                              {addingEntry ? '…' : 'Add'}
                            </button>
                            <button onClick={() => setAddEntryUserId(null)}
                              style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.separator}`, background: 'transparent', color: C.textMuted, fontSize: 12, cursor: 'pointer' }}>
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
