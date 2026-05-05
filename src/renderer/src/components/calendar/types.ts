/**
 * Shapes returned by /api/calendar/events. Mirrors the EVENT_SELECT
 * Prisma projection on the server. Kept narrow on purpose — if the
 * server adds a field, the renderer ignores it until we widen here.
 */

export type CalendarEventKind = 'meeting' | 'timeblock'
export type RsvpStatus = 'pending' | 'accepted' | 'declined'
export type RecurrenceKind = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'

export interface CalendarEventInvite {
  id: string
  userId: string
  status: RsvpStatus
  respondedAt: string | null
  user: { id: string; username: string; alias: string | null; avatarUrl: string | null }
}

export interface CalendarEvent {
  id: string
  /** For non-recurring events, equal to `id`. For recurring occurrences,
   *  the underlying parent series id (used for fetch / edit / delete). */
  seriesId?: string
  kind: CalendarEventKind
  title: string
  description: string | null
  startsAt: string
  endsAt: string
  isAllDay: boolean
  hostId: string
  meetingRoomId: string | null
  recurrence: RecurrenceKind
  recurrenceEnd: string | null
  createdAt: string
  updatedAt: string
  host: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  invites: CalendarEventInvite[]
}

export const RECURRENCE_OPTIONS: { value: RecurrenceKind; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  // v1.5.2105 — 'daily' is Mon-Fri only (skips weekends). Server-side
  // expansion shifts the first occurrence forward if startsAt is Sat/Sun.
  { value: 'daily', label: 'Every weekday (Mon–Fri)' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
]

export interface CalendarHoliday {
  id: string
  date: string
  description: string | null
}

/**
 * Task surfaced on the calendar. Comes in two flavors:
 *   - parent task (`isSubtask = false`) — shown on `effectiveDueDate`,
 *     which is the latest subtask dueDate (or the parent's own dueDate
 *     as a fallback).
 *   - subtask (`isSubtask = true`) — shown on its own dueDate.
 *
 * The renderer treats them as two visual classes so a parent can sit
 * alongside its latest subtask without looking duplicated.
 */
export interface CalendarTask {
  id: string
  title: string
  status: string
  priority: string
  dueDate: string | null
  effectiveDueDate: string | null
  parentTaskId: string | null
  isSubtask: boolean
  assigneeId: string | null
  createdBy: string
  projectId: string | null
  project: { id: string; name: string; color: string } | null
  assignee: { id: string; username: string; alias: string | null; avatarUrl: string | null } | null
  _count: { subtasks: number }
}

export type CalendarScope = 'team' | 'my'
