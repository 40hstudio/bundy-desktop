/**
 * Client-side calendar reminders.
 *
 * Watches the locally-cached events list and fires three reminders for
 * each meeting the user is host or invited to (or any all-hands meeting):
 *
 *   - 30 min before — "T-30: <title>"
 *   - 5 min before  — "T-5: <title>"
 *   - on-time       — "<title> is starting now"
 *
 * Each threshold is deduped independently so a 5-min reminder can fire
 * even if the user dismissed the 30-min one. Dedupe sets reset at
 * local midnight so a daily-standup recurrence reminds again tomorrow.
 *
 * Calendar tab badge counts events within the 30-min window so the
 * sidebar shows "you have something soon" at a glance.
 *
 * Server-driven push for offline users isn't here (that would need a
 * cron + Discord notify). This is "you have the app open and a meeting
 * is approaching" — the common case.
 */

import { useEffect, useRef } from 'react'
import { useNotificationsStore } from '../../stores/notificationsStore'
import type { CalendarEvent } from './types'

const TICK_MS = 30 * 1000

interface Threshold {
  /** Lower bound of the trigger window in ms (delta = start - now). The
   *  reminder fires when `delta` first crosses below `at` while still
   *  >= `floor`. Using a small floor avoids missing the trigger if the
   *  tick lands a few seconds late. */
  at: number
  floor: number
  key: string
  label: (title: string) => string
}

const THRESHOLDS: Threshold[] = [
  { at: 30 * 60_000, floor: 30 * 60_000 - TICK_MS - 1_000, key: '30', label: (t) => `${t} starts in 30 min` },
  { at:  5 * 60_000, floor:  5 * 60_000 - TICK_MS - 1_000, key:  '5', label: (t) => `${t} starts in 5 min` },
  { at:  0,          floor: -TICK_MS - 1_000,              key:  '0', label: (t) => `${t} is starting now` },
]
const BADGE_LEAD_MS = 30 * 60_000

export function useCalendarReminders(events: CalendarEvent[], userId: string): void {
  // Per-threshold dedupe — a Map<thresholdKey, Set<eventId>>. Cleared at
  // local midnight so daily recurrences re-trigger.
  const firedRef = useRef<Map<string, Set<string>>>(new Map(THRESHOLDS.map((t) => [t.key, new Set()])))
  const lastFiredDayRef = useRef<string>(localDayKey(new Date()))
  const eventsRef = useRef(events)
  eventsRef.current = events

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const dayKey = localDayKey(now)
      if (dayKey !== lastFiredDayRef.current) {
        for (const set of firedRef.current.values()) set.clear()
        lastFiredDayRef.current = dayKey
      }

      let upcomingCount = 0
      for (const ev of eventsRef.current) {
        if (ev.kind !== 'meeting') continue
        const isHost = ev.hostId === userId
        const isInvited = ev.invites.some((i) => i.userId === userId)
        const isAllHands = ev.invites.length === 0
        if (!isHost && !isInvited && !isAllHands) continue

        const start = new Date(ev.startsAt).getTime()
        const delta = start - now.getTime()
        if (delta > BADGE_LEAD_MS) continue
        // Past-end events shouldn't count toward the badge.
        if (delta < -10 * 60_000) continue
        upcomingCount++

        // Fire each threshold when we've crossed into its trigger window.
        // Order matters — checking 30 first, then 5, then 0 — but the
        // dedupe is per-threshold so any user-state combination works.
        for (const th of THRESHOLDS) {
          if (delta > th.at) continue
          if (delta < th.floor) continue
          const set = firedRef.current.get(th.key)!
          if (set.has(ev.id)) continue
          set.add(ev.id)

          const body = th.label(ev.title)
          try {
            window.electronAPI.showNotification('Upcoming meeting', body)
          } catch { /* native notif optional */ }
          useNotificationsStore.getState().show({
            kind: 'info',
            title: 'Upcoming meeting',
            message: body,
            // Persist until the user dismisses — calendar reminders are
            // important enough to not auto-disappear (per v1.5.2102 spec).
            durationMs: 0,
            onClick: () => {
              const seriesId = ev.seriesId ?? ev.id
              window.dispatchEvent(new CustomEvent('bundy-open-calendar-event', { detail: { eventId: seriesId } }))
            },
          })
        }
      }

      window.dispatchEvent(new CustomEvent('bundy-calendar-badge', {
        detail: { count: upcomingCount },
      }))
    }

    tick()
    const handle = setInterval(tick, TICK_MS)
    return () => clearInterval(handle)
  }, [userId])
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
