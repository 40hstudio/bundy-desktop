/**
 * Public team calendar.
 *
 * Layout: header strip (month label + nav + scope toggle + "New event")
 * above a 7-column month grid. Each cell shows the day number, holidays,
 * up to 3 event chips, and up to 3 task chips. Clicking a day opens a
 * side drawer; clicking an event opens the EventDetailDrawer; clicking
 * a task fires `onOpenTask(taskId)` so FullDashboard can switch to the
 * Tasks tab and pop the detail drawer.
 *
 * Data: a single `/api/calendar/events?from=&to=&scope=` round-trip
 * returns events + holidays + tasks. Tasks come in two flavors:
 *   - parent task — placed at its `effectiveDueDate`, which the server
 *     computes as `max(subtask.dueDate)` if any subtasks have dueDate,
 *     else the parent's own dueDate. The parent's calendar position
 *     therefore tracks the latest subtask deadline automatically.
 *   - subtask — placed at its own dueDate.
 *
 * Scope: 'team' (default) shows everything; 'my' filters to events I
 * host or am invited to + tasks where I'm assignee or creator.
 *
 * SSE: subscribes to `bundy-calendar-event` AND `bundy-task-updated` —
 * any change touching the visible window triggers a refetch.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, CheckSquare, Square, Check } from 'lucide-react'
import { ApiConfig, Auth } from '../../types'
import { C } from '../../theme'
import { Button, Spinner, EmptyState } from '../shared'
import { apiFetch } from '../../api/client'
import type { CalendarEvent, CalendarHoliday, CalendarTask, CalendarScope } from './types'
import CreateEventModal from './CreateEventModal'
import EventDetailDrawer from './EventDetailDrawer'
import { useCalendarReminders } from './useCalendarReminders'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_VISIBLE_PER_DAY = 4

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function startOfMonthGrid(d: Date): Date {
  const first = startOfMonth(d)
  return new Date(first.getFullYear(), first.getMonth(), first.getDate() - first.getDay())
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtMonth(d: Date): string {
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function CalendarPanel({
  config, auth, onOpenTask, onJoinMeeting, pendingEventId, onPendingEventHandled,
}: {
  config: ApiConfig
  auth: Auth
  /** Cross-tab navigation — fire this to swap to the Tasks tab and open
   *  the detail drawer for the given task. Provided by FullDashboard. */
  onOpenTask?: (taskId: string) => void
  /** Lift "join meeting" to FullDashboard so the LiveKit session
   *  survives tab switches (rendered as a top-level overlay + floating
   *  bar — matches the Google Meet pattern). When undefined, falls back
   *  to in-panel rendering. */
  onJoinMeeting?: (event: CalendarEvent) => void
  /** Cross-tab nav INTO the calendar — when a CalendarEventLinkCard fires
   *  `bundy-open-calendar-event`, FullDashboard sets this prop and we
   *  open the corresponding event's detail drawer. */
  pendingEventId?: string | null
  onPendingEventHandled?: () => void
}) {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()))
  const [scope, setScope] = useState<CalendarScope>('team')
  const [showDone, setShowDone] = useState(false)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [holidays, setHolidays] = useState<CalendarHoliday[]>([])
  const [tasks, setTasks] = useState<CalendarTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState<{ initialDate?: Date } | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [drawerDate, setDrawerDate] = useState<Date | null>(null)

  const today = useMemo(() => new Date(), [])

  const windowStart = useMemo(() => startOfMonthGrid(cursor), [cursor])
  const windowEnd = useMemo(() => {
    const end = new Date(windowStart)
    end.setDate(end.getDate() + 42)
    return end
  }, [windowStart])

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await apiFetch<{
        events: CalendarEvent[]
        holidays: CalendarHoliday[]
        tasks: CalendarTask[]
      }>(
        `/api/calendar/events?from=${encodeURIComponent(windowStart.toISOString())}&to=${encodeURIComponent(windowEnd.toISOString())}&scope=${scope}`,
      )
      setEvents(data.events)
      setHolidays(data.holidays)
      setTasks(data.tasks ?? [])
      setLoading(false)
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : 'Failed to load calendar')
    }
  }, [windowStart, windowEnd, scope])

  useEffect(() => { setLoading(true); void load() }, [load])

  // Reminder notifications + calendar tab badge for events starting soon.
  useCalendarReminders(events, auth.userId)

  // Cross-tab open: fetch the event by id and open its detail drawer.
  // The event might be outside the current visible window (someone shared
  // a link to a meeting two months out) — in that case we still surface
  // the drawer; the user can scroll/jump from there if they want context.
  useEffect(() => {
    if (!pendingEventId) return
    let cancelled = false
    const inLocal = events.find((e) => (e.seriesId ?? e.id) === pendingEventId || e.id === pendingEventId)
    if (inLocal) {
      setSelectedEventId(inLocal.id)
      onPendingEventHandled?.()
      return
    }
    apiFetch<{ event: CalendarEvent }>(`/api/calendar/events/${pendingEventId}`)
      .then((res) => {
        if (cancelled) return
        // Merge into local state so selectedEvent (a useMemo over events)
        // picks it up. Mark with seriesId so updates land on the right row.
        const merged = { ...res.event, seriesId: res.event.id }
        setEvents((prev) => prev.some((e) => e.id === merged.id) ? prev : [...prev, merged])
        setSelectedEventId(merged.id)
        onPendingEventHandled?.()
      })
      .catch(() => { onPendingEventHandled?.() })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEventId])

  // SSE: refetch on calendar OR task changes. Task SSE is broad (fires
  // for every task edit by anyone), so we tolerate the extra requests at
  // 13-user scale rather than diff-applying server payloads to the local
  // CalendarTask state.
  useEffect(() => {
    const handler = () => { void load() }
    window.addEventListener('bundy-calendar-event' as keyof WindowEventMap, handler as EventListener)
    window.addEventListener('bundy-task-updated' as keyof WindowEventMap, handler as EventListener)
    return () => {
      window.removeEventListener('bundy-calendar-event' as keyof WindowEventMap, handler as EventListener)
      window.removeEventListener('bundy-task-updated' as keyof WindowEventMap, handler as EventListener)
    }
  }, [load])

  // Bucket events by local-date key. Multi-day events surface on every
  // day they span.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const start = new Date(ev.startsAt)
      const end = new Date(ev.endsAt)
      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      while (cur.getTime() < end.getTime()) {
        const key = dateKey(cur)
        const arr = map.get(key) ?? []
        arr.push(ev)
        map.set(key, arr)
        cur.setDate(cur.getDate() + 1)
      }
    }
    return map
  }, [events])

  const holidaysByDay = useMemo(() => {
    const map = new Map<string, CalendarHoliday[]>()
    for (const h of holidays) {
      const d = new Date(h.date)
      map.set(dateKey(d), [...(map.get(dateKey(d)) ?? []), h])
    }
    return map
  }, [holidays])

  const tasksByDay = useMemo(() => {
    const map = new Map<string, CalendarTask[]>()
    for (const t of tasks) {
      // Hide completed tasks by default — they clutter the grid once
      // they're checked off. Toggle in the header restores them.
      if (!showDone && t.status === 'done') continue
      const due = t.effectiveDueDate
      if (!due) continue
      const d = new Date(due)
      const key = dateKey(d)
      map.set(key, [...(map.get(key) ?? []), t])
    }
    return map
  }, [tasks, showDone])

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId],
  )

  const drawerDateEvents = useMemo(() => {
    if (!drawerDate) return []
    return (eventsByDay.get(dateKey(drawerDate)) ?? []).slice().sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    )
  }, [drawerDate, eventsByDay])

  const drawerDateHolidays = useMemo(() => {
    if (!drawerDate) return []
    return holidaysByDay.get(dateKey(drawerDate)) ?? []
  }, [drawerDate, holidaysByDay])

  const drawerDateTasks = useMemo(() => {
    if (!drawerDate) return []
    // Day drawer respects the same showDone filter via tasksByDay.
    return (tasksByDay.get(dateKey(drawerDate)) ?? []).slice().sort((a, b) => {
      // Subtasks below their parent's bucket
      if (a.isSubtask !== b.isSubtask) return a.isSubtask ? 1 : -1
      return a.title.localeCompare(b.title)
    })
  }, [drawerDate, tasksByDay])

  const handleEventCreated = useCallback((ev: CalendarEvent) => {
    setEvents((prev) => [...prev, ev])
    setShowCreate(null)
  }, [])

  const handleEventUpdated = useCallback((ev: CalendarEvent) => {
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? ev : e)))
  }, [])

  const handleEventDeleted = useCallback((id: string) => {
    // For non-recurring events `id` is the row id and matches event.id
    // exactly. For recurring events `id` is the seriesId, but every
    // occurrence in `events` has its own synthesised id like
    // `<seriesId>::<iso>` plus a `seriesId` field — we need to drop
    // every occurrence whose seriesId matches. v1.5.2105 fix.
    setEvents((prev) => prev.filter((e) => e.id !== id && (e.seriesId ?? e.id) !== id))
    setSelectedEventId(null)
  }, [])

  /** Future-only delete on a recurring event: the server caps the series
   *  but doesn't drop the row, so we have to drop occurrences whose
   *  startsAt is at-or-after the pivot ourselves. */
  const handleSeriesTruncated = useCallback((seriesId: string, pivotIso: string) => {
    const pivot = new Date(pivotIso).getTime()
    setEvents((prev) => prev.filter((e) => {
      if ((e.seriesId ?? e.id) !== seriesId) return true
      return new Date(e.startsAt).getTime() < pivot
    }))
    setSelectedEventId(null)
  }, [])

  const handleJoinMeeting = useCallback((ev: CalendarEvent) => {
    setSelectedEventId(null)
    // Hand off to FullDashboard — meeting renders at the top level so
    // the LiveKit session survives tab switches (see v1.5.2102).
    onJoinMeeting?.(ev)
  }, [onJoinMeeting])

  const handlePickTask = useCallback((taskId: string) => {
    if (onOpenTask) onOpenTask(taskId)
    setDrawerDate(null)
  }, [onOpenTask])

  // ── Render ─────────────────────────────────────────────────────────────
  // The active meeting (if any) is rendered at the top level by
  // FullDashboard so it survives tab switches — CalendarPanel just
  // shows the grid here. v1.5.2102+.

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, background: C.bgPrimary, color: C.text }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header
          cursor={cursor}
          scope={scope}
          onScopeChange={setScope}
          onPrev={() => setCursor((c) => addMonths(c, -1))}
          onNext={() => setCursor((c) => addMonths(c, 1))}
          onToday={() => setCursor(startOfMonth(new Date()))}
          onCreate={() => setShowCreate({})}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spinner />
            </div>
          ) : error ? (
            <div style={{ padding: 24 }}>
              <EmptyState icon={<CalendarIcon size={32} />} title="Couldn’t load calendar" description={error} />
            </div>
          ) : (
            <>
              <MonthGrid
                cursor={cursor}
                today={today}
                windowStart={windowStart}
                eventsByDay={eventsByDay}
                holidaysByDay={holidaysByDay}
                tasksByDay={tasksByDay}
                currentUserId={auth.userId}
                onPickDay={(d) => {
                  // Clicking a day from the grid always closes any open
                  // event detail and resets to the day drawer for that
                  // date — keeps the side panel single-track.
                  setSelectedEventId(null)
                  setDrawerDate(d)
                }}
                onPickEvent={(id) => { setSelectedEventId(id); setDrawerDate(null) }}
                onPickTask={handlePickTask}
                onCreate={(d) => setShowCreate({ initialDate: d })}
              />
              <ShowDonePill showDone={showDone} onChange={setShowDone} />
            </>
          )}
        </div>
      </div>

      {/* Only ONE side drawer is shown at a time (v1.5.2104 fix).
           When the event detail is open, day drawer hides; clicking a
           different day in the grid swaps cleanly. */}
      {!selectedEvent && drawerDate && (
        <DayDrawer
          date={drawerDate}
          events={drawerDateEvents}
          holidays={drawerDateHolidays}
          tasks={drawerDateTasks}
          currentUserId={auth.userId}
          onClose={() => setDrawerDate(null)}
          onPickEvent={(id) => setSelectedEventId(id)}
          onPickTask={handlePickTask}
          onCreate={() => { setShowCreate({ initialDate: drawerDate }); setDrawerDate(null) }}
        />
      )}

      {showCreate && (
        <CreateEventModal
          config={config}
          auth={auth}
          initialDate={showCreate.initialDate}
          onClose={() => setShowCreate(null)}
          onCreated={handleEventCreated}
        />
      )}

      {selectedEvent && (
        <EventDetailDrawer
          config={config}
          auth={auth}
          event={selectedEvent}
          /** When event was opened FROM a day drawer, show a back button
           *  that returns to that drawer instead of just closing. */
          onBack={drawerDate ? () => setSelectedEventId(null) : undefined}
          onClose={() => { setSelectedEventId(null); setDrawerDate(null) }}
          onUpdated={handleEventUpdated}
          onDeleted={handleEventDeleted}
          onSeriesTruncated={handleSeriesTruncated}
          onJoin={handleJoinMeeting}
        />
      )}
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────────

function Header({
  cursor, scope, onScopeChange, onPrev, onNext, onToday, onCreate,
}: {
  cursor: Date
  scope: CalendarScope
  onScopeChange: (s: CalendarScope) => void
  onPrev: () => void; onNext: () => void; onToday: () => void; onCreate: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 20px', borderBottom: `1px solid ${C.separator}`,
    }}>
      {/* Chevrons flank the month label — Google Calendar / iCal pattern. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={onPrev} aria-label="Previous month" style={navButtonStyle}>
          <ChevronLeft size={16} />
        </button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, minWidth: 160, textAlign: 'center' }}>{fmtMonth(cursor)}</h2>
        <button onClick={onNext} aria-label="Next month" style={navButtonStyle}>
          <ChevronRight size={16} />
        </button>
      </div>
      <Button onClick={onToday}>Today</Button>
      <div style={{ flex: 1 }} />
      <ScopeToggle scope={scope} onChange={onScopeChange} />
      <Button variant="primary" onClick={onCreate}>
        <Plus size={14} style={{ marginRight: 4 }} />
        New event
      </Button>
    </div>
  )
}

/** Bottom-center pill toggle for "Show completed". Floats above the
 *  grid so it doesn't crowd the header. Background blurred so it stays
 *  readable over any cell content. */
function ShowDonePill({
  showDone, onChange,
}: {
  showDone: boolean
  onChange: (b: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!showDone)}
      style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 999,
        background: showDone ? C.accent : 'rgba(20,20,20,0.85)',
        color: showDone ? '#fff' : C.textSecondary,
        border: `1px solid ${showDone ? C.accent : C.separator}`,
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        zIndex: 10,
      }}
      title={showDone ? 'Hide completed tasks' : 'Show completed tasks'}
    >
      <span style={{
        width: 14, height: 14, borderRadius: 4,
        border: `1.5px solid ${showDone ? '#fff' : C.textMuted}`,
        background: showDone ? '#fff' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {showDone && <Check size={10} color={C.accent} strokeWidth={3} />}
      </span>
      Show completed
    </button>
  )
}

function ScopeToggle({ scope, onChange }: { scope: CalendarScope; onChange: (s: CalendarScope) => void }) {
  const opts: { value: CalendarScope; label: string }[] = [
    { value: 'team', label: 'Team' },
    { value: 'my', label: 'My' },
  ]
  return (
    <div style={{
      display: 'inline-flex', borderRadius: 6, overflow: 'hidden',
      border: `1px solid ${C.separator}`, background: C.bgInput,
    }}>
      {opts.map((o) => {
        const active = o.value === scope
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: '5px 12px', fontSize: 12, fontWeight: 600,
              background: active ? C.accent : 'transparent',
              color: active ? '#fff' : C.textSecondary,
              border: 'none', cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

const navButtonStyle: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 4, border: 'none', background: 'transparent', color: C.text, cursor: 'pointer',
}

// ── Month grid ────────────────────────────────────────────────────────────

function MonthGrid({
  cursor, today, windowStart, eventsByDay, holidaysByDay, tasksByDay,
  currentUserId, onPickDay, onPickEvent, onPickTask, onCreate,
}: {
  cursor: Date
  today: Date
  windowStart: Date
  eventsByDay: Map<string, CalendarEvent[]>
  holidaysByDay: Map<string, CalendarHoliday[]>
  tasksByDay: Map<string, CalendarTask[]>
  currentUserId: string
  onPickDay: (d: Date) => void
  onPickEvent: (id: string) => void
  onPickTask: (id: string) => void
  onCreate: (d: Date) => void
}) {
  const cells = useMemo(() => {
    const arr: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(windowStart)
      d.setDate(windowStart.getDate() + i)
      arr.push(d)
    }
    return arr
  }, [windowStart])

  // Subtle background tints layered onto cells. Weekend tint is the
  // base; in-month vs out-of-month adjusts brightness; hover overlay
  // is added on top in the cell render (via inline mouse handlers).
  const WEEKEND_TINT = 'rgba(255,255,255,0.025)'
  const HOVER_TINT = 'rgba(255,255,255,0.05)'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        borderBottom: `1px solid ${C.separator}`,
      }}>
        {WEEKDAY_LABELS.map((label, i) => {
          const isWeekend = i === 0 || i === 6
          return (
            <div key={label} style={{
              padding: '8px 12px', fontSize: 11, fontWeight: 600,
              color: isWeekend ? C.warning : C.textMuted,
              textTransform: 'uppercase',
              background: isWeekend ? WEEKEND_TINT : 'transparent',
            }}>{label}</div>
          )
        })}
      </div>
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gridAutoRows: 'minmax(0, 1fr)',
      }}>
        {cells.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth()
          const isToday = isSameDay(d, today)
          const isWeekend = d.getDay() === 0 || d.getDay() === 6
          const key = dateKey(d)
          const dayEvents = (eventsByDay.get(key) ?? []).slice()
            .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
          const dayTasks = (tasksByDay.get(key) ?? []).slice().sort((a, b) => {
            if (a.isSubtask !== b.isSubtask) return a.isSubtask ? 1 : -1
            return a.title.localeCompare(b.title)
          })
          const dayHolidays = holidaysByDay.get(key) ?? []
          // Interleave: events first, then tasks. Cap visible at MAX_VISIBLE_PER_DAY total.
          const combined: Array<{ kind: 'event'; ev: CalendarEvent } | { kind: 'task'; task: CalendarTask }> = [
            ...dayEvents.map((ev) => ({ kind: 'event' as const, ev })),
            ...dayTasks.map((task) => ({ kind: 'task' as const, task })),
          ]
          const visible = combined.slice(0, MAX_VISIBLE_PER_DAY)
          const overflow = combined.length - visible.length

          // Layered background:
          //   1. weekend tint (subtle warm)
          //   2. out-of-month dim
          //   3. (hover, applied via mouse handlers — not in inline style)
          const baseBg = isWeekend ? WEEKEND_TINT : 'transparent'

          return (
            <div
              key={key}
              onClick={() => onPickDay(d)}
              onDoubleClick={() => onCreate(d)}
              onMouseEnter={(e) => { e.currentTarget.style.background = HOVER_TINT }}
              onMouseLeave={(e) => { e.currentTarget.style.background = baseBg }}
              style={{
                position: 'relative', padding: 6,
                borderRight: `1px solid ${C.separator}`,
                borderBottom: `1px solid ${C.separator}`,
                background: baseBg,
                color: inMonth ? C.text : C.textMuted,
                opacity: inMonth ? 1 : 0.55,
                cursor: 'pointer', overflow: 'hidden',
                transition: 'background 0.12s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  width: 22, height: 22, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isToday ? C.accent : 'transparent',
                  color: isToday ? '#fff' : (isWeekend ? C.warning : 'inherit'),
                }}>{d.getDate()}</span>
              </div>
              {dayHolidays.map((h) => (
                <div key={h.id} title={h.description ?? 'Holiday'} style={holidayChip}>
                  {h.description ?? 'Holiday'}
                </div>
              ))}
              {visible.map((item, i) => item.kind === 'event' ? (
                <EventChip
                  key={`${key}-e${i}-${item.ev.id}`}
                  event={item.ev}
                  currentUserId={currentUserId}
                  onClick={(e) => { e.stopPropagation(); onPickEvent(item.ev.id) }}
                />
              ) : (
                <TaskChip
                  key={`${key}-t${i}-${item.task.id}`}
                  task={item.task}
                  onClick={(e) => { e.stopPropagation(); onPickTask(item.task.id) }}
                />
              ))}
              {overflow > 0 && (
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  +{overflow} more
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const holidayChip: React.CSSProperties = {
  fontSize: 11, padding: '2px 6px', borderRadius: 4, marginBottom: 2,
  background: 'rgba(240, 71, 71, 0.18)', color: '#f5a3a3',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}

function EventChip({
  event, currentUserId, onClick,
}: {
  event: CalendarEvent
  currentUserId: string
  onClick: (e: React.MouseEvent) => void
}) {
  const isHost = event.hostId === currentUserId
  const isInvited = event.invites.some((i) => i.userId === currentUserId)
  const isMine = isHost || isInvited
  const accent = event.kind === 'meeting' ? C.accent : C.fillPrimary
  return (
    <div
      onClick={onClick}
      style={{
        fontSize: 11, padding: '2px 6px', borderRadius: 4, marginBottom: 2,
        background: isMine ? accent : 'rgba(255,255,255,0.05)',
        color: isMine ? '#fff' : C.textSecondary,
        cursor: 'pointer',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        opacity: isMine ? 1 : 0.85,
      }}
      title={`${event.title} — ${fmtTime(event.startsAt)}`}
    >
      {!event.isAllDay && <span style={{ opacity: 0.85, marginRight: 4 }}>{fmtTime(event.startsAt)}</span>}
      {event.title}
    </div>
  )
}

/**
 * Tasks render with:
 *   - a checkbox icon (filled if status === 'done')
 *   - a 4-px project-color stripe on the left
 *   - subtle outline rather than solid fill (so they read as different
 *     from events at a glance)
 *   - subtask indent for visual hierarchy in dense days
 */
function TaskChip({
  task, onClick,
}: {
  task: CalendarTask
  onClick: (e: React.MouseEvent) => void
}) {
  const isDone = task.status === 'done'
  const projectColor = task.project?.color ?? C.fillPrimary
  const Check = isDone ? CheckSquare : Square
  return (
    <div
      onClick={onClick}
      title={`${task.isSubtask ? 'Subtask: ' : ''}${task.title}${task.project ? ` · ${task.project.name}` : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 11, padding: '2px 6px', borderRadius: 4, marginBottom: 2,
        marginLeft: task.isSubtask ? 8 : 0,
        background: 'transparent',
        border: `1px solid ${C.separator}`,
        borderLeft: `3px solid ${projectColor}`,
        color: isDone ? C.textMuted : C.text,
        textDecoration: isDone ? 'line-through' : 'none',
        cursor: 'pointer',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        opacity: isDone ? 0.7 : 1,
      }}
    >
      <Check size={11} style={{ flexShrink: 0, opacity: 0.85 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.title}</span>
    </div>
  )
}

// ── Day drawer ────────────────────────────────────────────────────────────

function DayDrawer({
  date, events, holidays, tasks, currentUserId, onClose, onPickEvent, onPickTask, onCreate,
}: {
  date: Date
  events: CalendarEvent[]
  holidays: CalendarHoliday[]
  tasks: CalendarTask[]
  currentUserId: string
  onClose: () => void
  onPickEvent: (id: string) => void
  onPickTask: (id: string) => void
  onCreate: () => void
}) {
  void currentUserId
  const isEmpty = holidays.length === 0 && events.length === 0 && tasks.length === 0
  return (
    <div style={{
      width: 320, borderLeft: `1px solid ${C.separator}`, background: C.bgSecondary,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '12px 16px', borderBottom: `1px solid ${C.separator}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {date.toLocaleString(undefined, { weekday: 'long' })}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {date.toLocaleString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" style={navButtonStyle}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {isEmpty && (
          <EmptyState icon={<CalendarIcon size={28} />} title="Nothing scheduled" description="Click + to add an event." />
        )}

        {holidays.length > 0 && (
          <SectionLabel>Holidays</SectionLabel>
        )}
        {holidays.map((h) => (
          <div key={h.id} style={{ ...holidayChip, marginBottom: 6 }}>
            {h.description ?? 'Holiday'}
          </div>
        ))}

        {events.length > 0 && <SectionLabel>Events</SectionLabel>}
        {events.map((ev) => (
          <button
            key={ev.id}
            onClick={() => onPickEvent(ev.id)}
            style={drawerItemStyle}
          >
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 2 }}>
              {ev.isAllDay ? 'All day' : `${fmtTime(ev.startsAt)} – ${fmtTime(ev.endsAt)}`}
              {ev.kind === 'meeting' ? ' · Meeting' : ' · Time block'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{ev.title}</div>
            {ev.invites.length > 0 && (
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                {ev.invites.length} invitee{ev.invites.length > 1 ? 's' : ''}
              </div>
            )}
          </button>
        ))}

        {tasks.length > 0 && <SectionLabel>Tasks due</SectionLabel>}
        {tasks.map((task) => {
          const isDone = task.status === 'done'
          const projectColor = task.project?.color ?? C.fillPrimary
          const Check = isDone ? CheckSquare : Square
          return (
            <button
              key={task.id}
              onClick={() => onPickTask(task.id)}
              style={{
                ...drawerItemStyle,
                borderLeft: `3px solid ${projectColor}`,
                paddingLeft: 9,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Check size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                <span style={{ fontSize: 12, color: C.textMuted }}>
                  {task.isSubtask ? 'Subtask' : (task._count.subtasks > 0 ? `Parent · ${task._count.subtasks} subtasks` : 'Task')}
                  {task.project ? ` · ${task.project.name}` : ''}
                </span>
              </div>
              <div style={{
                fontSize: 14, fontWeight: 600,
                textDecoration: isDone ? 'line-through' : 'none',
                color: isDone ? C.textMuted : C.text,
              }}>
                {task.title}
              </div>
              {task.assignee && (
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  Assigned to {task.assignee.alias ?? task.assignee.username}
                </div>
              )}
            </button>
          )
        })}
      </div>
      <div style={{ padding: 12, borderTop: `1px solid ${C.separator}` }}>
        <Button variant="primary" onClick={onCreate} style={{ width: '100%' }}>
          <Plus size={14} style={{ marginRight: 4 }} />
          New event on this day
        </Button>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
      fontWeight: 700, margin: '12px 0 6px',
    }}>{children}</div>
  )
}

const drawerItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '10px 12px', marginBottom: 6, borderRadius: 6,
  background: C.bgPrimary, border: `1px solid ${C.separator}`, color: C.text, cursor: 'pointer',
}
