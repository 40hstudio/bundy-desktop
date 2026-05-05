/**
 * Modal: create a calendar event (meeting OR timeblock).
 *
 * Defaults (v1.5.2200):
 *   - Starts = now, rounded UP to the next 15-minute boundary
 *   - Ends   = Starts + 30 minutes (matches Google Calendar default)
 *   - When the user changes Starts, Ends auto-advances to preserve the
 *     current duration (so dragging the start later doesn't accidentally
 *     create a zero-length event).
 *
 * Recurrence (v1.5.2200):
 *   - Picker offers daily / weekly / biweekly / monthly / does-not-repeat.
 *   - Optional "ends on" date caps the series; null = open-ended (server
 *     defensively caps queries at window-end + 1 year).
 */

import { useEffect, useMemo, useState } from 'react'
import { ApiConfig, Auth, UserInfo } from '../../types'
import { C } from '../../theme'
import { Modal, Button, FormField, Input, Textarea, Select } from '../shared'
import { Avatar } from '../shared/Avatar'
import { apiFetch } from '../../api/client'
import type { CalendarEvent, CalendarEventKind, RecurrenceKind } from './types'
import { RECURRENCE_OPTIONS } from './types'

const DEFAULT_DURATION_MS = 30 * 60 * 1000

function nextQuarterHour(d: Date): Date {
  const out = new Date(d)
  out.setMinutes(Math.ceil(out.getMinutes() / 15) * 15, 0, 0)
  return out
}
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function CreateEventModal({
  config: _config, auth, initialDate, editEvent, onClose, onCreated,
}: {
  config: ApiConfig
  auth: Auth
  initialDate?: Date
  /** When set, the modal opens in edit mode pre-filled with the event's
   *  current values. Recurring events show a scope picker when saved
   *  (this+future / entire series). */
  editEvent?: CalendarEvent
  onClose: () => void
  onCreated: (ev: CalendarEvent) => void
}) {
  void _config
  const isEdit = !!editEvent

  // Compute initial start (now-ish, rounded) + end (start + 30min). If
  // the caller gave us a target date (e.g. user double-clicked May 12),
  // anchor to that day at the same rounded clock-time.
  const { startInit, endInit, dateInit, kindInit, titleInit, descInit, allDayInit, recurrenceInit, recurrenceEndInit, inviteeInit } = useMemo(() => {
    if (editEvent) {
      const s = new Date(editEvent.startsAt)
      const e = new Date(editEvent.endsAt)
      return {
        startInit: toLocalInputValue(s),
        endInit: toLocalInputValue(e),
        dateInit: toDateInputValue(s),
        kindInit: editEvent.kind,
        titleInit: editEvent.title,
        descInit: editEvent.description ?? '',
        allDayInit: editEvent.isAllDay,
        recurrenceInit: (editEvent.recurrence ?? 'none') as RecurrenceKind,
        recurrenceEndInit: editEvent.recurrenceEnd ? toDateInputValue(new Date(editEvent.recurrenceEnd)) : '',
        inviteeInit: new Set(editEvent.invites.map((i) => i.userId)),
      }
    }
    const now = new Date()
    const target = initialDate ? new Date(initialDate) : null
    const base = target ? new Date(
      target.getFullYear(), target.getMonth(), target.getDate(),
      now.getHours(), now.getMinutes(), 0, 0,
    ) : now
    const start = nextQuarterHour(base)
    const end = new Date(start.getTime() + DEFAULT_DURATION_MS)
    return {
      startInit: toLocalInputValue(start),
      endInit: toLocalInputValue(end),
      dateInit: toDateInputValue(initialDate ?? new Date()),
      kindInit: 'meeting' as CalendarEventKind,
      titleInit: '', descInit: '', allDayInit: false,
      recurrenceInit: 'none' as RecurrenceKind,
      recurrenceEndInit: '',
      inviteeInit: new Set<string>(),
    }
  }, [initialDate, editEvent])

  const [kind, setKind] = useState<CalendarEventKind>(kindInit)
  const [title, setTitle] = useState(titleInit)
  const [description, setDescription] = useState(descInit)
  const [isAllDay, setIsAllDay] = useState(allDayInit)
  const [startsAtLocal, setStartsAtLocal] = useState(startInit)
  const [endsAtLocal, setEndsAtLocal] = useState(endInit)
  const [allDayDate, setAllDayDate] = useState(dateInit)
  const [recurrence, setRecurrence] = useState<RecurrenceKind>(recurrenceInit)
  const [recurrenceEnd, setRecurrenceEnd] = useState(recurrenceEndInit)
  const [users, setUsers] = useState<UserInfo[]>([])
  const [inviteeIds, setInviteeIds] = useState<Set<string>>(inviteeInit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Recurring-event edit scope. Default to 'future' so editing a series
  // affects only this and subsequent occurrences (per v1.5.2104 spec).
  const [editScope, setEditScope] = useState<'future' | 'all'>('future')

  useEffect(() => {
    apiFetch<{ users: UserInfo[] }>('/api/users')
      .then((d) => setUsers(d.users.filter((u) => u.id !== auth.userId)))
      .catch(() => { /* leave invitee list empty */ })
  }, [auth.userId])

  /** When the user moves Starts, slide Ends by the same delta so the
   *  duration is preserved. If Ends is currently before-or-equal to the
   *  new Starts (rare — manual editing race), force end = start + 30min. */
  function handleStartsChange(next: string) {
    setStartsAtLocal(next)
    const prevStart = new Date(startsAtLocal)
    const prevEnd = new Date(endsAtLocal)
    const newStart = new Date(next)
    if (Number.isNaN(newStart.getTime())) return
    if (Number.isNaN(prevStart.getTime()) || Number.isNaN(prevEnd.getTime())) return
    const duration = Math.max(prevEnd.getTime() - prevStart.getTime(), DEFAULT_DURATION_MS)
    const newEnd = new Date(newStart.getTime() + duration)
    setEndsAtLocal(toLocalInputValue(newEnd))
  }

  function buildPayload() {
    const startsAt = isAllDay
      ? new Date(`${allDayDate}T00:00:00`).toISOString()
      : new Date(startsAtLocal).toISOString()
    const endsAt = isAllDay
      ? new Date(`${allDayDate}T23:59:59`).toISOString()
      : new Date(endsAtLocal).toISOString()
    return {
      kind,
      title: title.trim(),
      description: description.trim() || null,
      startsAt,
      endsAt,
      isAllDay,
      recurrence,
      recurrenceEnd: recurrence !== 'none' && recurrenceEnd
        ? new Date(`${recurrenceEnd}T23:59:59`).toISOString()
        : null,
      inviteeIds: kind === 'meeting' ? [...inviteeIds] : [],
    }
  }

  async function handleCreate() {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true); setError(null)
    try {
      const payload = buildPayload()
      if (isEdit && editEvent) {
        // Edit path. For recurring, append the scope so the server
        // either patches in place ('all') or splits the series and
        // creates a new one starting at this occurrence ('future').
        const seriesId = editEvent.seriesId ?? editEvent.id
        const isRecurring = editEvent.recurrence && editEvent.recurrence !== 'none'
        const occStart = new Date(editEvent.startsAt).toISOString()
        const qs = isRecurring && editScope === 'future'
          ? `?scope=future&from=${encodeURIComponent(occStart)}`
          : ''
        const data = await apiFetch<{ event: CalendarEvent }>(
          `/api/calendar/events/${seriesId}${qs}`,
          { method: 'PATCH', body: payload },
        )
        onCreated(data.event)
        return
      }
      // Create path.
      const data = await apiFetch<{ event: CalendarEvent }>('/api/calendar/events', {
        method: 'POST',
        body: payload,
      })
      onCreated(data.event)
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEdit ? 'Failed to save changes' : 'Failed to create event'))
    } finally {
      setSaving(false)
    }
  }

  function toggleInvitee(id: string) {
    setInviteeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const isRecurringEdit = isEdit && editEvent && editEvent.recurrence && editEvent.recurrence !== 'none'

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit event' : 'New event'}
      width={520}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleCreate}
          loading={saving}
          loadingText={isEdit ? 'Saving…' : 'Creating…'}
          disabled={!title.trim()}
        >
          {isEdit ? 'Save' : 'Create'}
        </Button>
      </>}
    >
      {error && <div style={{ fontSize: 12, color: C.danger, fontWeight: 600 }}>{error}</div>}

      {isRecurringEdit && (
        <div style={{
          background: C.bgInput, border: `1px solid ${C.separator}`, borderRadius: 6,
          padding: 10, marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            Apply changes to
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { value: 'future' as const, label: 'This and future' },
              { value: 'all' as const, label: 'Entire series' },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setEditScope(opt.value)}
                style={{
                  padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: editScope === opt.value ? C.accent : 'transparent',
                  color: editScope === opt.value ? '#fff' : C.textSecondary,
                  fontSize: 12, fontWeight: 600,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>
            {editScope === 'future'
              ? 'Past occurrences keep their existing data. The series splits at this occurrence.'
              : 'Every occurrence — past and future — is updated.'}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['meeting', 'timeblock'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            style={{
              padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: kind === k ? C.accent : C.bgInput,
              color: kind === k ? '#fff' : C.text,
              fontSize: 12, fontWeight: 600,
            }}
          >
            {k === 'meeting' ? 'Meeting' : 'Time block'}
          </button>
        ))}
      </div>

      <FormField label="Title" required>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Standup, deep work, off-site…" />
      </FormField>
      <FormField label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional details" />
      </FormField>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.textSecondary, margin: '8px 0' }}>
        <input type="checkbox" checked={isAllDay} onChange={(e) => setIsAllDay(e.target.checked)} />
        All day
      </label>

      {isAllDay ? (
        <FormField label="Date" required>
          <Input type="date" value={allDayDate} onChange={(e) => setAllDayDate(e.target.value)} />
        </FormField>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <FormField label="Starts" required>
            <Input type="datetime-local" value={startsAtLocal} onChange={(e) => handleStartsChange(e.target.value)} />
          </FormField>
          <FormField label="Ends" required>
            <Input type="datetime-local" value={endsAtLocal} onChange={(e) => setEndsAtLocal(e.target.value)} />
          </FormField>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: recurrence === 'none' ? '1fr' : '1fr 1fr', gap: 10 }}>
        <FormField label="Repeats">
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as RecurrenceKind)}>
            {RECURRENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </FormField>
        {recurrence !== 'none' && (
          <FormField label="Repeat until" hint="Leave blank for no end">
            <Input type="date" value={recurrenceEnd} onChange={(e) => setRecurrenceEnd(e.target.value)} />
          </FormField>
        )}
      </div>

      {kind === 'meeting' && (
        <FormField
          label="Invitees"
          hint={inviteeIds.size === 0 ? 'No invitees = open to everyone (all-hands)' : `${inviteeIds.size} invited`}
        >
          <div style={{
            maxHeight: 200, overflowY: 'auto',
            border: `1px solid ${C.separator}`, borderRadius: 4, padding: 4,
            background: C.bgInput,
          }}>
            {users.length === 0 ? (
              <div style={{ padding: 8, color: C.textMuted, fontSize: 12 }}>Loading…</div>
            ) : users.map((u) => {
              const checked = inviteeIds.has(u.id)
              return (
                <label key={u.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px',
                  cursor: 'pointer', borderRadius: 4,
                  background: checked ? 'rgba(0,122,204,0.12)' : 'transparent',
                }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleInvitee(u.id)} />
                  <Avatar name={u.alias ?? u.username} url={u.avatarUrl} size={24} />
                  <span style={{ fontSize: 13 }}>{u.alias ?? u.username}</span>
                </label>
              )
            })}
          </div>
        </FormField>
      )}
    </Modal>
  )
}
