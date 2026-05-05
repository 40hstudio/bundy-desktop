/**
 * CallsReviewPanel — admin-only review surface for completed/active
 * conference sessions.
 *
 * Reads /api/admin/conferences. For each session shows participants,
 * wall-clock duration, active% (engaged-vs-just-on-the-call), and any
 * heuristic flags. Lets the admin filter by user + date range. The
 * point is review-only — no recording, no enforcement. Admins still
 * have to talk to people based on what they see.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Headphones, Flag, Loader, Search, AlertTriangle } from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig } from '../../types'
import Avatar from '../shared/Avatar'

interface AdminUser {
  id: string; username: string; alias: string | null; avatarUrl: string | null
}

interface ParticipantRow {
  userId: string
  username: string
  alias: string | null
  avatarUrl: string | null
  joinedAt: string
  leftAt: string | null
  durationSeconds: number
  activeSeconds: number
  activePercent: number
  contextTags: { tasks: number; reports: number; channels: number }
  flags: string[]
  purposeTag: string | null
  purposeNote: string | null
}

const PURPOSE_LABELS: Record<string, { label: string; emoji: string }> = {
  work:     { label: 'Work',     emoji: '🛠' },
  standup:  { label: 'Standup',  emoji: '☕' },
  '1on1':   { label: '1:1',      emoji: '🤝' },
  planning: { label: 'Planning', emoji: '🗺' },
  social:   { label: 'Social',   emoji: '🎈' },
  other:    { label: 'Other',    emoji: '✏️' },
}

interface SessionRow {
  id: string
  channelId: string
  channelKind: 'vc' | 'dm-or-group'
  channelLabel: string | null
  startedAt: string
  endedAt: string | null
  durationSeconds: number
  participants: ParticipantRow[]
  flags: string[]
}

const FLAG_LABELS: Record<string, string> = {
  'long-low-activity': 'Long call, low activity',
  'no-task-tagged': 'No task / report context',
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function CallsReviewPanel({ config, users }: { config: ApiConfig; users: AdminUser[] }) {
  const today = useMemo(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }), [])
  const weekAgo = useMemo(() => {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
  }, [])
  const [from, setFrom] = useState(weekAgo)
  const [to, setTo] = useState(today)
  const [userId, setUserId] = useState<string>('')
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showOnlyFlagged, setShowOnlyFlagged] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ from, to })
      if (userId) params.set('userId', userId)
      const res = await fetch(`${config.apiBase}/api/admin/conferences?${params.toString()}`, {
        headers: { Authorization: `Bearer ${config.token}` },
      })
      if (!res.ok) { setSessions([]); return }
      const data = (await res.json()) as { sessions: SessionRow[] }
      setSessions(data.sessions ?? [])
    } catch { setSessions([]) }
    finally { setLoading(false) }
  }, [config, from, to, userId])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() =>
    showOnlyFlagged ? sessions.filter((s) => s.flags.length > 0) : sessions,
    [sessions, showOnlyFlagged]
  )

  const totalSeconds = useMemo(() =>
    sessions.reduce((s, x) => s + x.durationSeconds * x.participants.length, 0),
    [sessions]
  )
  const flaggedCount = useMemo(() => sessions.filter((s) => s.flags.length > 0).length, [sessions])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Headphones size={18} color={C.accent} />
            <span style={{ color: C.white, fontSize: 18, fontWeight: 700 }}>Calls Review</span>
          </div>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''} · {fmtDuration(totalSeconds)} total participant-time
            {flaggedCount > 0 && (
              <span style={{ marginLeft: 10, color: C.warning, fontWeight: 600 }}>
                · {flaggedCount} flagged for review
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="date" value={from} max={to}
            onChange={(e) => setFrom(e.target.value)}
            style={{ background: C.bgInput, color: C.text, border: `1px solid ${C.separator}`, borderRadius: 6, padding: '6px 8px', fontSize: 12 }} />
          <span style={{ color: C.textMuted, fontSize: 12 }}>→</span>
          <input type="date" value={to} min={from}
            onChange={(e) => setTo(e.target.value)}
            style={{ background: C.bgInput, color: C.text, border: `1px solid ${C.separator}`, borderRadius: 6, padding: '6px 8px', fontSize: 12 }} />
          <select value={userId} onChange={(e) => setUserId(e.target.value)}
            style={{ background: C.bgInput, color: C.text, border: `1px solid ${C.separator}`, borderRadius: 6, padding: '6px 8px', fontSize: 12 }}>
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.alias ?? u.username}</option>
            ))}
          </select>
          <button onClick={() => setShowOnlyFlagged((v) => !v)}
            style={{
              padding: '6px 10px', border: 'none', borderRadius: 6, cursor: 'pointer',
              background: showOnlyFlagged ? C.warning : C.bgInput,
              color: showOnlyFlagged ? '#000' : C.textMuted,
              fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
            <Flag size={11} /> Flagged only
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Loader size={24} color={C.textMuted} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 60, color: C.textMuted }}>
          <Search size={40} strokeWidth={1} />
          <span style={{ fontSize: 13 }}>No calls match the current filter</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function SessionCard({ session }: { session: SessionRow }) {
  const [expanded, setExpanded] = useState(false)
  const isActive = !session.endedAt
  return (
    <div style={{
      background: C.bgInput,
      borderRadius: 10,
      border: session.flags.length > 0 ? `1px solid ${C.warning}55` : `1px solid ${C.separator}`,
      overflow: 'hidden',
    }}>
      <div onClick={() => setExpanded((v) => !v)}
        style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: session.channelKind === 'vc' ? `${C.accent}22` : `${C.success}22`,
          color: session.channelKind === 'vc' ? C.accent : C.success,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Headphones size={14} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: C.white, fontSize: 13, fontWeight: 700 }}>
              {session.channelLabel ?? (session.channelKind === 'vc' ? 'Voice channel' : 'DM/group call')}
            </span>
            {isActive && (
              <span style={{
                background: C.success, color: '#000', borderRadius: 8,
                fontSize: 9, fontWeight: 700, padding: '1px 6px',
              }}>LIVE</span>
            )}
            {session.flags.map((f) => (
              <span key={f} title={FLAG_LABELS[f] ?? f}
                style={{
                  background: `${C.warning}33`, color: C.warning,
                  border: `1px solid ${C.warning}66`,
                  borderRadius: 8, fontSize: 9, fontWeight: 700,
                  padding: '1px 6px',
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                }}>
                <AlertTriangle size={9} /> {FLAG_LABELS[f] ?? f}
              </span>
            ))}
          </div>
          <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>
            {fmtDateTime(session.startedAt)} · {fmtDuration(session.durationSeconds)} · {session.participants.length} participant{session.participants.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', marginLeft: 'auto' }}>
          {session.participants.slice(0, 5).map((p) => (
            <div key={p.userId} style={{ marginLeft: -8 }} title={p.alias ?? p.username}>
              <Avatar url={p.avatarUrl} name={p.alias ?? p.username} size={26} />
            </div>
          ))}
          {session.participants.length > 5 && (
            <div style={{
              marginLeft: -8, width: 26, height: 26, borderRadius: '50%',
              background: C.bgInput, border: `2px solid ${C.bgSecondary}`,
              color: C.textMuted, fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>+{session.participants.length - 5}</div>
          )}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '0 14px 12px 58px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {session.participants.map((p) => (
            <ParticipantRow key={p.userId} p={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function ParticipantRow({ p }: { p: ParticipantRow }) {
  const isLive = !p.leftAt
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
      background: p.flags.length > 0 ? `${C.warning}10` : 'transparent',
      borderRadius: 6,
      borderLeft: p.flags.length > 0 ? `2px solid ${C.warning}` : '2px solid transparent',
    }}>
      <Avatar url={p.avatarUrl} name={p.alias ?? p.username} size={22} />
      <span style={{ color: C.white, fontSize: 12, fontWeight: 600, minWidth: 110 }}>
        {p.alias ?? p.username}
      </span>
      <span style={{ color: C.textMuted, fontSize: 11, fontVariantNumeric: 'tabular-nums', minWidth: 70 }}>
        {fmtDuration(p.durationSeconds)}{isLive && <span style={{ color: C.success }}> · live</span>}
      </span>
      <span style={{
        color: p.activePercent < 20 ? C.warning : p.activePercent < 50 ? C.textMuted : C.success,
        fontSize: 11, fontVariantNumeric: 'tabular-nums', minWidth: 80,
      }}>
        {p.activePercent}% active
      </span>
      <span style={{ color: C.textMuted, fontSize: 10, flex: 1 }}>
        {p.contextTags.tasks > 0 && `🎯 ${p.contextTags.tasks} task${p.contextTags.tasks !== 1 ? 's' : ''}`}
        {p.contextTags.reports > 0 && ` 📄 ${p.contextTags.reports}`}
        {p.contextTags.channels > 0 && ` 💬 ${p.contextTags.channels}`}
        {p.contextTags.tasks + p.contextTags.reports + p.contextTags.channels === 0 && p.durationSeconds > 600 && !p.purposeTag && (
          <span style={{ color: C.warning }}>no work context tagged</span>
        )}
      </span>
      {p.purposeTag && PURPOSE_LABELS[p.purposeTag] && (
        <span title={p.purposeNote ?? undefined}
          style={{
            background: `${C.accent}22`, color: C.accent,
            border: `1px solid ${C.accent}55`,
            borderRadius: 8, fontSize: 10, fontWeight: 600,
            padding: '2px 8px',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            cursor: p.purposeNote ? 'help' : 'default',
          }}>
          {PURPOSE_LABELS[p.purposeTag].emoji} {PURPOSE_LABELS[p.purposeTag].label}
          {p.purposeNote && <span style={{ marginLeft: 2, opacity: 0.7 }}>·</span>}
        </span>
      )}
    </div>
  )
}
