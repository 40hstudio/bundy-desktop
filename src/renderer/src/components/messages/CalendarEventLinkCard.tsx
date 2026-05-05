/**
 * Inline preview card for a calendar event link in a chat message.
 *
 * URL pattern: /calendar/event/<seriesId>
 *
 * The card fetches the event metadata once (cached for 60s), shows a
 * compact summary (title, kind, time, host, invitee count), and opens
 * the calendar tab focused on the event when clicked. Recipients who
 * aren't invited still see the card but don't get a Join button — the
 * server enforces invite gating on the LiveKit token endpoint anyway.
 */

import { useEffect, useState } from 'react'
import { Calendar as CalendarIcon, ExternalLink, Repeat, Users } from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig } from '../../types'
import { apiFetch } from '../../api/client'
import type { CalendarEvent, RecurrenceKind } from '../calendar/types'
import { RECURRENCE_OPTIONS } from '../calendar/types'

interface CacheEntry { event: CalendarEvent | null; fetchedAt: number }
const CACHE_TTL_MS = 60_000
const eventCache = new Map<string, CacheEntry>()

function readCache(eventId: string): CalendarEvent | null | undefined {
  const entry = eventCache.get(eventId)
  if (!entry) return undefined
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    eventCache.delete(eventId)
    return undefined
  }
  return entry.event
}

function recurrenceLabel(kind: RecurrenceKind): string {
  return RECURRENCE_OPTIONS.find((o) => o.value === kind)?.label ?? 'Repeats'
}

function fmtRange(ev: CalendarEvent): string {
  const s = new Date(ev.startsAt)
  const e = new Date(ev.endsAt)
  if (ev.isAllDay) return s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · All day'
  const sameDay = s.toDateString() === e.toDateString()
  const dateStr = s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const startTime = s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const endTime = e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return sameDay ? `${dateStr} · ${startTime} – ${endTime}` : `${s.toLocaleString()} – ${e.toLocaleString()}`
}

export function CalendarEventLinkCard({ eventId, config: _config }: { eventId: string; config: ApiConfig }) {
  void _config
  const cached = readCache(eventId)
  const [event, setEvent] = useState<CalendarEvent | null | undefined>(cached)

  useEffect(() => {
    if (readCache(eventId) !== undefined) return
    let cancelled = false
    apiFetch<{ event: CalendarEvent }>(`/api/calendar/events/${eventId}`)
      .then((res) => {
        if (cancelled) return
        eventCache.set(eventId, { event: res.event, fetchedAt: Date.now() })
        setEvent(res.event)
      })
      .catch(() => {
        if (cancelled) return
        eventCache.set(eventId, { event: null, fetchedAt: Date.now() })
        setEvent(null)
      })
    return () => { cancelled = true }
  }, [eventId])

  if (event === undefined) {
    // Loading — show a skeleton to avoid layout shift.
    return (
      <div style={{
        marginTop: 6, padding: 10, borderRadius: 8,
        border: `1px solid ${C.separator}`, background: C.bgPrimary,
        fontSize: 12, color: C.textMuted,
      }}>Loading event…</div>
    )
  }
  if (event === null) {
    return (
      <div style={{
        marginTop: 6, padding: 10, borderRadius: 8,
        border: `1px solid ${C.separator}`, background: C.bgPrimary,
        fontSize: 12, color: C.textMuted,
      }}>Calendar event not found or you don't have access.</div>
    )
  }

  const isMeeting = event.kind === 'meeting'
  const accent = isMeeting ? C.accent : C.fillPrimary
  const isAllHands = event.invites.length === 0
  const recurrence = event.recurrence ?? 'none'

  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('bundy-open-calendar-event', { detail: { eventId } }))}
      style={{
        display: 'block', textAlign: 'left', width: '100%',
        marginTop: 6, padding: '10px 12px', borderRadius: 8,
        border: `1px solid ${C.separator}`, borderLeft: `3px solid ${accent}`,
        background: C.bgPrimary, color: C.text, cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
        <CalendarIcon size={11} />
        <span>{isMeeting ? (isAllHands ? 'All-hands meeting' : 'Meeting') : 'Time block'}</span>
        {recurrence !== 'none' && (
          <>
            <span style={{ opacity: 0.5 }}>·</span>
            <Repeat size={10} />
            <span>{recurrenceLabel(recurrence)}</span>
          </>
        )}
        <span style={{ flex: 1 }} />
        <ExternalLink size={11} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{event.title}</div>
      <div style={{ fontSize: 12, color: C.textSecondary }}>{fmtRange(event)}</div>
      {isMeeting && (
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Users size={10} />
          <span>
            Host: {event.host.alias ?? event.host.username}
            {!isAllHands && ` · ${event.invites.length} invitee${event.invites.length > 1 ? 's' : ''}`}
          </span>
        </div>
      )}
    </button>
  )
}
