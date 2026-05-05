/**
 * Event detail side drawer.
 *
 * Shows the event metadata, host, invitee list with RSVP states, and a
 * Join button when:
 *   - kind = meeting AND
 *   - user is host OR invited OR meeting is all-hands AND
 *   - now is within [startsAt - 15min, endsAt + 30min]
 *
 * Host gets edit/delete affordances. Non-host invitees get RSVP buttons.
 */

import { useMemo, useState } from 'react'
import { Trash2, X, Phone, Repeat, Share2, ChevronLeft, Edit2 } from 'lucide-react'
import { ApiConfig, Auth } from '../../types'
import { C } from '../../theme'
import { Button } from '../shared'
import { Avatar } from '../shared/Avatar'
import { apiFetch, getApiClientConfig } from '../../api/client'
import type { CalendarEvent, RsvpStatus, RecurrenceKind } from './types'
import { RECURRENCE_OPTIONS } from './types'
import ShareEventModal from './ShareEventModal'
import CreateEventModal from './CreateEventModal'

const JOIN_EARLY_MS = 15 * 60 * 1000
const JOIN_LATE_MS = 30 * 60 * 1000

function fmtRange(ev: CalendarEvent): string {
  const s = new Date(ev.startsAt)
  const e = new Date(ev.endsAt)
  if (ev.isAllDay) return s.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + ' · All day'
  const sameDay = s.toDateString() === e.toDateString()
  const dateStr = s.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const startTime = s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const endTime = e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `${dateStr} · ${startTime} – ${endTime}`
  return `${s.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} – ${e.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
}

export default function EventDetailDrawer({
  config, auth, event, onBack, onClose, onUpdated, onDeleted, onSeriesTruncated, onJoin,
}: {
  config: ApiConfig
  auth: Auth
  event: CalendarEvent
  /** When set, a back chevron appears in the header that calls this
   *  instead of closing the drawer entirely. Used when the event was
   *  opened from a day drawer so the user can return there. */
  onBack?: () => void
  onClose: () => void
  onUpdated: (ev: CalendarEvent) => void
  onDeleted: (seriesId: string) => void
  /** Fires after a `scope=future` delete — caller drops occurrences
   *  >= pivotIso from local state so the calendar updates instantly. */
  onSeriesTruncated?: (seriesId: string, pivotIso: string) => void
  onJoin: (ev: CalendarEvent) => void
}) {
  const [savingRsvp, setSavingRsvp] = useState<RsvpStatus | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showShare, setShowShare] = useState(false)

  // The series id is what all CRUD targets — for non-recurring events
  // it equals event.id; for recurring occurrences it's the parent row.
  const seriesId = event.seriesId ?? event.id
  const shareUrl = useMemo(() => {
    const apiBase = getApiClientConfig()?.apiBase ?? 'https://bundy.40h.studio'
    return `${apiBase}/calendar/event/${seriesId}`
  }, [seriesId])

  // (Copy-link affordance lives inside ShareEventModal — see Share button above.)

  const isHost = event.hostId === auth.userId
  const myInvite = useMemo(
    () => event.invites.find((i) => i.userId === auth.userId) ?? null,
    [event.invites, auth.userId],
  )
  const isAllHands = event.invites.length === 0
  const canJoin = useMemo(() => {
    if (event.kind !== 'meeting') return false
    if (!isHost && !myInvite && !isAllHands) return false
    const now = Date.now()
    const start = new Date(event.startsAt).getTime()
    const end = new Date(event.endsAt).getTime()
    return now >= start - JOIN_EARLY_MS && now <= end + JOIN_LATE_MS
  }, [event, isHost, myInvite, isAllHands])

  async function setRsvp(status: RsvpStatus) {
    setSavingRsvp(status); setError(null)
    try {
      await apiFetch(`/api/calendar/events/${seriesId}/rsvp`, {
        method: 'POST',
        body: { status },
      })
      // Optimistic local update — server SSE will also fire and CalendarPanel
      // will refetch, but that path can be slow on a flaky network.
      const optimistic: CalendarEvent = {
        ...event,
        invites: event.invites.map((i) => i.userId === auth.userId
          ? { ...i, status, respondedAt: new Date().toISOString() }
          : i,
        ),
      }
      onUpdated(optimistic)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'RSVP failed')
    } finally {
      setSavingRsvp(null)
    }
  }

  const [showDeleteMenu, setShowDeleteMenu] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  async function performDelete(scope: 'all' | 'future') {
    setShowDeleteMenu(false); setDeleting(true); setError(null)
    try {
      const occStart = new Date(event.startsAt).toISOString()
      const qs = scope === 'future'
        ? `?scope=future&from=${encodeURIComponent(occStart)}`
        : ''
      await apiFetch(`/api/calendar/events/${seriesId}${qs}`, { method: 'DELETE' })
      // Update local state immediately — don't wait for the SSE round-trip.
      // For 'all' the parent drops every occurrence with this seriesId.
      // For 'future' it drops occurrences whose startsAt >= pivot.
      if (scope === 'all') {
        onDeleted(seriesId)
      } else {
        onSeriesTruncated?.(seriesId, occStart)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setDeleting(false)
    }
  }

  function handleDelete() {
    const isRecurring = event.recurrence && event.recurrence !== 'none'
    if (!isRecurring) {
      if (!confirm('Delete this event? This cannot be undone.')) return
      void performDelete('all')
      return
    }
    // Recurring — open the scope menu so the user picks "this + future"
    // vs "entire series".
    setShowDeleteMenu(true)
  }

  return (
    <div style={{
      width: 360, borderLeft: `1px solid ${C.separator}`, background: C.bgSecondary,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '12px 16px', borderBottom: `1px solid ${C.separator}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {onBack && (
          <button onClick={onBack} aria-label="Back" style={iconBtn} title="Back to day list">
            <ChevronLeft size={16} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {event.kind === 'meeting' ? 'Meeting' : 'Time block'}
            {event.kind === 'meeting' && (isAllHands ? ' · All-hands' : ' · Private')}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {event.title}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" style={iconBtn}>
          <X size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 12 }}>
          {fmtRange(event)}
        </div>

        {event.recurrence && event.recurrence !== 'none' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: C.textSecondary, marginBottom: 12,
          }}>
            <Repeat size={12} />
            <span>{recurrenceLabel(event.recurrence)}{event.recurrenceEnd ? ` until ${new Date(event.recurrenceEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</span>
          </div>
        )}

        {event.description && (
          <div style={{
            fontSize: 13, color: C.text, whiteSpace: 'pre-wrap',
            padding: 10, borderRadius: 6, background: C.bgPrimary,
            border: `1px solid ${C.separator}`, marginBottom: 12,
          }}>
            {event.description}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            Host
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar name={event.host.alias ?? event.host.username} url={event.host.avatarUrl} size={28} />
            <span style={{ fontSize: 13 }}>{event.host.alias ?? event.host.username}</span>
            {isHost && <span style={{ fontSize: 11, color: C.textMuted }}>(you)</span>}
          </div>
        </div>

        {event.kind === 'meeting' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              {isAllHands ? 'Open to everyone' : `Invitees (${event.invites.length})`}
            </div>
            {event.invites.map((inv) => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Avatar name={inv.user.alias ?? inv.user.username} url={inv.user.avatarUrl} size={24} />
                <span style={{ flex: 1, fontSize: 13 }}>{inv.user.alias ?? inv.user.username}</span>
                <RsvpBadge status={inv.status} />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: C.danger, marginBottom: 8 }}>{error}</div>
        )}
      </div>

      <div style={{ padding: 12, borderTop: `1px solid ${C.separator}`, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {canJoin && (
          <Button variant="primary" onClick={() => onJoin(event)} style={{ flex: 1, minWidth: 120 }}>
            <Phone size={14} style={{ marginRight: 4 }} />
            Join meeting
          </Button>
        )}
        {!isHost && myInvite && event.kind === 'meeting' && (
          <RsvpButtons
            current={myInvite.status}
            saving={savingRsvp}
            onChange={setRsvp}
          />
        )}
        {/* Copy is exposed inside the Share modal — keeps the drawer
             action bar uncluttered (v1.5.2105). */}
        <Button onClick={() => setShowShare(true)} title="Share or copy event link">
          <Share2 size={14} />
        </Button>
        {isHost && (
          <>
            <Button onClick={() => setShowEdit(true)} title="Edit event">
              <Edit2 size={14} />
            </Button>
            <Button onClick={handleDelete} loading={deleting} loadingText="…" title={
              event.recurrence && event.recurrence !== 'none' ? 'Delete recurring event…' : 'Delete event'
            }>
              <Trash2 size={14} />
            </Button>
          </>
        )}
      </div>

      {showShare && (
        <ShareEventModal
          config={config}
          auth={auth}
          event={event}
          shareUrl={shareUrl}
          onClose={() => setShowShare(false)}
        />
      )}

      {showDeleteMenu && (
        <DeleteScopeMenu
          event={event}
          deleting={deleting}
          onCancel={() => setShowDeleteMenu(false)}
          onPick={(scope) => void performDelete(scope)}
        />
      )}

      {showEdit && (
        <CreateEventModal
          config={config}
          auth={auth}
          editEvent={event}
          onClose={() => setShowEdit(false)}
          onCreated={(updated) => {
            setShowEdit(false)
            // For an "all" edit on a non-recurring event, the server
            // returns the patched row. For "future" edit on a recurring
            // event, the server returns the NEW split row — the
            // calendar will refetch via SSE either way. We just close.
            onUpdated(updated)
          }}
        />
      )}
    </div>
  )
}

function DeleteScopeMenu({
  event, deleting, onCancel, onPick,
}: {
  event: CalendarEvent
  deleting: boolean
  onCancel: () => void
  onPick: (scope: 'all' | 'future') => void
}) {
  const occLabel = new Date(event.startsAt).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  })
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 380, maxWidth: '90vw', padding: 18, borderRadius: 10,
          background: C.bgSecondary, border: `1px solid ${C.separator}`,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Delete recurring event?</div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>
          You picked the {occLabel} occurrence of "<strong>{event.title}</strong>".
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ScopeOption
            title="This and future occurrences"
            description="Past occurrences keep their existing data. The series ends just before this one."
            onClick={() => onPick('future')}
            disabled={deleting}
          />
          <ScopeOption
            title="Entire series"
            description="Every occurrence — past and future — is removed."
            onClick={() => onPick('all')}
            disabled={deleting}
            danger
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <Button onClick={onCancel} disabled={deleting}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

function ScopeOption({
  title, description, onClick, disabled, danger,
}: {
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'block', textAlign: 'left', width: '100%',
        padding: '10px 12px', borderRadius: 8,
        background: C.bgPrimary, border: `1px solid ${C.separator}`,
        color: danger ? C.danger : C.text,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11, color: C.textMuted }}>{description}</div>
    </button>
  )
}

function recurrenceLabel(kind: RecurrenceKind): string {
  const opt = RECURRENCE_OPTIONS.find((o) => o.value === kind)
  return opt?.label ?? 'Repeats'
}

function RsvpBadge({ status }: { status: RsvpStatus }) {
  const color = status === 'accepted' ? C.success : status === 'declined' ? C.danger : C.textMuted
  const label = status === 'accepted' ? 'Going' : status === 'declined' ? 'Declined' : 'Pending'
  return <span style={{ fontSize: 11, color, fontWeight: 600 }}>{label}</span>
}

function RsvpButtons({
  current, saving, onChange,
}: {
  current: RsvpStatus
  saving: RsvpStatus | null
  onChange: (s: RsvpStatus) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 4, flex: 1 }}>
      <Button
        variant={current === 'accepted' ? 'primary' : 'secondary'}
        onClick={() => onChange('accepted')}
        loading={saving === 'accepted'}
        style={{ flex: 1 }}
      >
        Accept
      </Button>
      <Button
        variant={current === 'declined' ? 'primary' : 'secondary'}
        onClick={() => onChange('declined')}
        loading={saving === 'declined'}
        style={{ flex: 1 }}
      >
        Decline
      </Button>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 4, border: 'none', background: 'transparent', color: C.text, cursor: 'pointer',
}
