/**
 * Allow-list of GET endpoints whose JSON responses we cache for offline
 * read access. Anything not matched here passes through `apiFetch` with
 * no caching (which is the safer default — random POSTs and ephemeral
 * endpoints like /typing or /read shouldn't be persisted).
 *
 * Match order: longest prefix first. Rules are checked top-to-bottom
 * after sorting by `path` length so `/api/tasks/notifications` wins
 * over `/api/tasks`.
 */

export interface CacheRule {
  /** URL prefix (no querystring). Matches against `pathname` only. */
  path: string
  /** Time after which cached value is considered stale (still served, but UI hints). */
  staleAfterMs: number
  /** Time after which cached value is dropped (hard expiry). */
  hardExpiryMs: number
  /** Optional human label used in stale-data hints ("Tasks", "Messages"). */
  label?: string
}

const ONE_MIN = 60_000
const FIVE_MIN = 5 * ONE_MIN
const ONE_HOUR = 60 * ONE_MIN
const ONE_DAY = 24 * ONE_HOUR
const ONE_WEEK = 7 * ONE_DAY

const RULES: CacheRule[] = [
  // Tasks
  { path: '/api/tasks/notifications', staleAfterMs: ONE_MIN, hardExpiryMs: ONE_DAY, label: 'Notifications' },
  { path: '/api/tasks/projects', staleAfterMs: FIVE_MIN, hardExpiryMs: ONE_WEEK, label: 'Projects' },
  { path: '/api/tasks/sections', staleAfterMs: FIVE_MIN, hardExpiryMs: ONE_WEEK, label: 'Sections' },
  { path: '/api/tasks/', staleAfterMs: ONE_MIN, hardExpiryMs: ONE_WEEK, label: 'Task' },
  { path: '/api/tasks', staleAfterMs: ONE_MIN, hardExpiryMs: ONE_WEEK, label: 'Tasks' },

  // Channels (DMs / groups / public / task-discussions)
  { path: '/api/channels/search', staleAfterMs: ONE_MIN, hardExpiryMs: ONE_HOUR, label: 'Search' },
  { path: '/api/channels/', staleAfterMs: ONE_MIN, hardExpiryMs: ONE_WEEK, label: 'Messages' },
  { path: '/api/channels', staleAfterMs: ONE_MIN, hardExpiryMs: ONE_WEEK, label: 'Conversations' },

  // Threads, scheduled
  { path: '/api/threads', staleAfterMs: FIVE_MIN, hardExpiryMs: ONE_DAY, label: 'Threads' },
  { path: '/api/scheduled-messages', staleAfterMs: FIVE_MIN, hardExpiryMs: ONE_DAY, label: 'Scheduled' },

  // Users / presence (presence is short-lived; UI dims stale dots)
  { path: '/api/users/status', staleAfterMs: 30_000, hardExpiryMs: ONE_HOUR, label: 'Presence' },
  { path: '/api/users', staleAfterMs: FIVE_MIN, hardExpiryMs: ONE_WEEK, label: 'Users' },

  // OG previews — external content rarely changes
  { path: '/api/og', staleAfterMs: ONE_HOUR, hardExpiryMs: ONE_WEEK, label: 'Link previews' },

  // Voice channels
  { path: '/api/voice-channels', staleAfterMs: FIVE_MIN, hardExpiryMs: ONE_DAY, label: 'Voice channels' },

  // Calendar — events + holidays bundled in one response. Cached so the
  // calendar tab loads from disk when the server is unreachable. Stale
  // window is short because RSVP / new-event events change visible state
  // and the UI surfaces "showing offline data" when stale.
  { path: '/api/calendar/events/', staleAfterMs: ONE_MIN, hardExpiryMs: ONE_WEEK, label: 'Event' },
  { path: '/api/calendar/events', staleAfterMs: ONE_MIN, hardExpiryMs: ONE_WEEK, label: 'Calendar' },
  { path: '/api/calendar/holidays', staleAfterMs: FIVE_MIN, hardExpiryMs: ONE_WEEK, label: 'Holidays' },
]

const SORTED = [...RULES].sort((a, b) => b.path.length - a.path.length)

export function findCacheRule(pathname: string): CacheRule | null {
  for (const rule of SORTED) {
    if (pathname === rule.path || pathname.startsWith(`${rule.path}/`) || pathname.startsWith(`${rule.path}?`)) {
      return rule
    }
  }
  return null
}

/** Strip query, return pathname only. */
export function pathnameOf(pathOrUrl: string): string {
  const q = pathOrUrl.indexOf('?')
  return q === -1 ? pathOrUrl : pathOrUrl.slice(0, q)
}

/** Cache key: per-user namespace + full path-with-query. */
export function cacheKeyOf(userId: string, fullPath: string): string {
  return `cache:v1:${userId}:${fullPath}`
}

export function metaKeyOf(userId: string, fullPath: string): string {
  return `meta:v1:${userId}:${fullPath}`
}

// ─── Write queue allow-list ──────────────────────────────────────────────────
// Mutating endpoints whose request we should hold in the queue rather
// than failing when the server is unreachable. Anything not matched
// here throws normally (the caller's existing error path applies).

import type { QueuedKind } from './writeQueue'

export interface WriteRule {
  method: 'POST' | 'PATCH' | 'DELETE' | 'PUT'
  /** Regex tested against `pathname`. */
  pathRegex: RegExp
  kind: QueuedKind
}

const WRITE_RULES: WriteRule[] = [
  // ── Messages ──────────────────────────────────────────────
  // Send a DM / channel / group / task-discussion message
  { method: 'POST', pathRegex: /^\/api\/channels\/[^/]+\/messages$/, kind: 'message' },
  // Edit / delete a channel message (PATCH/DELETE)
  { method: 'PATCH', pathRegex: /^\/api\/channels\/[^/]+\/messages\/[^/]+$/, kind: 'message' },
  { method: 'DELETE', pathRegex: /^\/api\/channels\/[^/]+\/messages\/[^/]+$/, kind: 'message' },
  // Toggle a reaction
  { method: 'POST', pathRegex: /^\/api\/channels\/[^/]+\/messages\/[^/]+\/reactions$/, kind: 'reaction' },
  // Toggle a pin
  { method: 'POST', pathRegex: /^\/api\/channels\/[^/]+\/messages\/[^/]+\/pin$/, kind: 'message' },

  // ── Tasks ─────────────────────────────────────────────────
  // Update a task (status / priority / assignee / etc)
  { method: 'PATCH', pathRegex: /^\/api\/tasks\/[^/]+$/, kind: 'task-status' },
  // Create a task (must NOT match /api/tasks/[id] which has a path segment)
  { method: 'POST', pathRegex: /^\/api\/tasks$/, kind: 'other' },
  // Delete a task
  { method: 'DELETE', pathRegex: /^\/api\/tasks\/[^/]+$/, kind: 'other' },

  // Task comments — create / edit / delete
  { method: 'POST', pathRegex: /^\/api\/tasks\/[^/]+\/comments$/, kind: 'comment' },
  { method: 'PATCH', pathRegex: /^\/api\/tasks\/[^/]+\/comments\/[^/]+$/, kind: 'comment' },
  { method: 'DELETE', pathRegex: /^\/api\/tasks\/[^/]+\/comments\/[^/]+$/, kind: 'comment' },
  // Toggle a reaction on a task comment
  { method: 'POST', pathRegex: /^\/api\/tasks\/[^/]+\/comments\/[^/]+\/reactions$/, kind: 'reaction' },

  // Task projects + sections — create / rename / delete
  { method: 'POST', pathRegex: /^\/api\/tasks\/projects$/, kind: 'other' },
  { method: 'PATCH', pathRegex: /^\/api\/tasks\/projects\/[^/]+$/, kind: 'other' },
  { method: 'DELETE', pathRegex: /^\/api\/tasks\/projects\/[^/]+$/, kind: 'other' },
  { method: 'POST', pathRegex: /^\/api\/tasks\/sections$/, kind: 'other' },
  { method: 'PATCH', pathRegex: /^\/api\/tasks\/sections\/[^/]+$/, kind: 'other' },
  { method: 'DELETE', pathRegex: /^\/api\/tasks\/sections\/[^/]+$/, kind: 'other' },

  // ── Read receipts (ephemeral but cheap to queue) ─────────
  { method: 'POST', pathRegex: /^\/api\/tasks\/notifications$/, kind: 'read' },
  { method: 'POST', pathRegex: /^\/api\/channels\/[^/]+\/read$/, kind: 'read' },
  { method: 'POST', pathRegex: /^\/api\/channels\/read-all$/, kind: 'read' },
]

// NOT queued (intentional):
//   - POST /api/tasks/[id]/typing               — ephemeral indicator
//   - POST /api/channels/[id]/typing            — ephemeral indicator
//   - POST /api/activity/heartbeat              — fires every Ns; queueing thousands wastes IDB
//   - POST /api/activity/screenshot             — binary blob; main-process queue handles this separately
//   - POST /api/tasks/[id]/attachments          — binary FormData; needs special handling, future work

// ─── Conflict resolution policy ──────────────────────────────────────────────
// When the queue drains after a server outage, multiple users may have
// concurrently mutated the same record. Bundy's policy:
//
//   1. Field updates (PATCH /api/tasks/[id], PATCH /api/channels/[id]/messages/[id]):
//      LAST-WRITE-WINS. The server timestamps each PATCH on arrival; whichever
//      arrives last sets the field's final value. Acceptable because per-field
//      collisions are rare in a 13-user team and the alternative (operational
//      transform / CRDTs) is dramatically more complex.
//
//   2. Creates (POST /api/tasks, POST /api/tasks/[id]/comments, POST messages):
//      APPEND-ONLY. Each creation gets a fresh server-assigned id; concurrent
//      creates from offline users produce N distinct rows. No conflicts possible.
//
//   3. Toggles (reactions, pins): IDEMPOTENT. The endpoint flips the flag based
//      on current state, so even if a queued toggle replays after another user
//      already toggled, the user sees the latest server state on next read.
//
//   4. Deletes: LAST-WRITE-WINS. If user A deletes while user B edits, the
//      delete wins (B's edit applies to a dead row, no-ops on next read).
//      Edge case worth knowing: if user A's queued delete drains AFTER user B
//      already saw the row was deleted client-side, B's UI re-fetch shows
//      consistent state. No data corruption.
//
// What this policy does NOT cover:
//   - Sequential dependencies between offline writes (e.g. "create task then
//     edit it" — both are queued; replay must be FIFO so the create lands
//     before the edit). The queue IS FIFO so this works as long as each user
//     stays in their own session.
//   - Cross-user collaboration during the outage itself — see local-first
//     architecture doc; messages sent during an outage don't reach the
//     recipient until the SENDER's queue drains.

export function findWriteRule(method: string, pathname: string): WriteRule | null {
  for (const rule of WRITE_RULES) {
    if (rule.method === method && rule.pathRegex.test(pathname)) return rule
  }
  return null
}
