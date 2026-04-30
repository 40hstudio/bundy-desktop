import store, { getDeviceId, getApiBase } from './store'
import { getToken } from './secure-storage'

/** Builds an Authorization header from the stored desktop token, or {} if logged out. */
export function authHeader(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Called by index.ts to be notified when the server returns 401 (token expired). */
let _onTokenExpired: (() => void) | null = null
export function setTokenExpiredHandler(fn: () => void): void {
  _onTokenExpired = fn
}

// ─── Online state tracking ─────────────────────────────────────────────────────
let _serverReachable = true
export function isServerReachable(): boolean { return _serverReachable }

let _onOnlineStateChange: ((online: boolean) => void) | null = null
export function setOnlineStateChangeHandler(fn: (online: boolean) => void): void {
  _onOnlineStateChange = fn
}

function updateReachable(online: boolean): void {
  if (online === _serverReachable) return
  _serverReachable = online
  _onOnlineStateChange?.(online)
}

// ─── Request wrapper ───────────────────────────────────────────────────────────

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'
  body?: unknown
  /** AbortSignal timeout in ms. */
  timeoutMs?: number
  /** Extra headers to merge in. */
  headers?: Record<string, string>
  /** Override the API base for this request (used by createWebSession). */
  baseOverride?: string
  /** When true, suppress reachability tracking (used for fire-and-forget calls). */
  silent?: boolean
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/**
 * Single fetch wrapper used by every endpoint helper.
 *  - Adds Authorization + Content-Type (when body present)
 *  - Applies AbortSignal.timeout
 *  - Maps 401 → token-expired handler + throws TOKEN_EXPIRED
 *  - On non-2xx: parses JSON `{error}` field for the message
 *  - Tracks reachability so the offline indicator stays accurate
 */
export async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs, headers, baseOverride, silent } = opts
  const url = `${baseOverride ?? getApiBase()}${path}`
  const init: RequestInit = {
    method,
    headers: {
      ...authHeader(),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  if (timeoutMs) init.signal = AbortSignal.timeout(timeoutMs)

  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    if (!silent) updateReachable(false)
    throw err
  }

  if (!silent) updateReachable(true)

  if (res.status === 401) {
    _onTokenExpired?.()
    throw new HttpError(401, 'TOKEN_EXPIRED')
  }
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    throw new HttpError(res.status, json.error ?? `HTTP ${res.status}`)
  }

  // Some endpoints return 204 / no JSON body
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

// ─── Token exchange (no auth header) ───────────────────────────────────────────

export async function exchangeToken(
  shortToken: string,
  deviceName: string,
): Promise<{ desktopToken: string; userId: string; username: string; role: string; avatarUrl: string | null }> {
  // Special: this endpoint authenticates with the short token in the body, not Bearer.
  const res = await fetch(`${getApiBase()}/api/desktop/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: shortToken, deviceName, deviceId: getDeviceId() }),
  })
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(json.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<{ desktopToken: string; userId: string; username: string; role: string; avatarUrl: string | null }>
}

// ─── Bundy status ──────────────────────────────────────────────────────────────

export interface BundyStatus {
  isClockedIn: boolean
  isTracking: boolean
  onBreak: boolean
  /** Total accumulated working milliseconds today (matches web app timer). */
  elapsedMs: number
  username: string
  role: string
}

const ACTION_MAP = {
  'clock-in': 'CHECK_IN',
  'clock-out': 'CLOCK_OUT',
  'break-start': 'BREAK',
  'break-end': 'BACK',
} as const

type DesktopAction = keyof typeof ACTION_MAP

interface BundyApiResponse {
  currentStatus: 'NONE' | 'CHECK_IN' | 'BREAK' | 'BACK' | 'CLOCK_OUT'
  allowedActions: string[]
  todayLogs: Array<{ id: string; action: string; timestamp: string }>
}

/** Mirrors the web dashboard todayMs calculation exactly. */
function computeElapsedMs(
  logs: Array<{ action: string; timestamp: string }>,
  currentStatus: string,
): number {
  let total = 0
  let lastIn: number | null = null
  for (const log of logs) {
    if (log.action === 'CHECK_IN' || log.action === 'BACK') {
      lastIn = new Date(log.timestamp).getTime()
    } else if ((log.action === 'BREAK' || log.action === 'CLOCK_OUT') && lastIn !== null) {
      total += new Date(log.timestamp).getTime() - lastIn
      lastIn = null
    }
  }
  if (lastIn !== null && (currentStatus === 'CHECK_IN' || currentStatus === 'BACK')) {
    total += Date.now() - lastIn
  }
  return total
}

export async function getBundyStatus(): Promise<BundyStatus> {
  const data = await request<BundyApiResponse>('/api/bundy', { timeoutMs: 5_000 })
  const { currentStatus, todayLogs } = data
  return {
    isClockedIn: ['CHECK_IN', 'BACK', 'BREAK'].includes(currentStatus),
    isTracking: ['CHECK_IN', 'BACK'].includes(currentStatus),
    onBreak: currentStatus === 'BREAK',
    elapsedMs: computeElapsedMs(todayLogs, currentStatus),
    username: store.get('username') || '',
    role: store.get('role') || '',
  }
}

export async function doAction(action: DesktopAction, _note?: string): Promise<void> {
  await request('/api/bundy', {
    method: 'POST',
    body: { action: ACTION_MAP[action] },
    timeoutMs: 3_000,
  })
}

export async function submitReport(content: string): Promise<void> {
  await request('/api/bundy/report', { method: 'POST', body: { content } })
}

export async function sendDesktopHeartbeat(
  currentActivity?: { app: string | null; url: string | null; runningApps?: string[] },
  idle?: boolean,
): Promise<{ currentStatus: string | null; midnightClockOut: boolean; workLimitBreak: boolean }> {
  if (!getToken()) return { currentStatus: null, midnightClockOut: false, workLimitBreak: false }
  try {
    const data = await request<{ currentStatus?: string; midnightClockOut?: boolean; workLimitBreak?: boolean }>(
      '/api/desktop/heartbeat',
      {
        method: 'POST',
        body: {
          currentApp: currentActivity?.app ?? null,
          currentUrl: currentActivity?.url ?? null,
          idle: idle ?? false,
          runningApps: currentActivity?.runningApps ?? [],
        },
        timeoutMs: 10_000,
      },
    )
    return {
      currentStatus: data.currentStatus ?? null,
      midnightClockOut: data.midnightClockOut ?? false,
      workLimitBreak: data.workLimitBreak ?? false,
    }
  } catch {
    return { currentStatus: null, midnightClockOut: false, workLimitBreak: false }
  }
}

export async function breakOnQuit(): Promise<void> {
  if (!getToken()) return
  // Best-effort: marks desktop offline + auto-breaks if user is clocked in
  await request('/api/desktop/quit', { method: 'POST', silent: true }).catch(() => {})
}

/** Exchange the desktop Bearer token for a one-time session URL (30 s TTL). */
export async function createWebSession(overrideBase?: string): Promise<{ jwt: string; maxAge: number }> {
  return request<{ jwt: string; maxAge: number }>('/api/desktop/web-session', {
    method: 'POST',
    baseOverride: overrideBase,
  })
}

export async function uploadScreenshot(
  imageBase64: string,
  displayIndex: number,
  capturedAt: string,
  format: 'png' | 'jpeg' = 'jpeg',
): Promise<void> {
  try {
    await request('/api/activity/screenshot', {
      method: 'POST',
      body: { imageBase64, displayIndex, capturedAt, format },
    })
  } catch (err) {
    console.error('[api] screenshot upload failed:', err instanceof Error ? err.message : err)
  }
}

// ─── Daily Plan API ────────────────────────────────────────────────────────────

export interface PlanProject {
  id: string
  name: string
}

export interface PlanItem {
  id: string
  projectId: string
  project: PlanProject
  details: string
  status: string
  outcome: string | null
  createdAt: string
  updatedAt: string
}

export interface DailyPlan {
  id: string
  userId: string
  date: string
  items: PlanItem[]
}

export async function getDailyPlan(): Promise<DailyPlan | null> {
  try {
    const data = await request<{ plan: DailyPlan | null }>('/api/desktop/daily-plan')
    return data.plan
  } catch {
    return null
  }
}

export async function ensureDailyPlan(): Promise<DailyPlan> {
  const data = await request<{ plan: DailyPlan }>('/api/desktop/daily-plan', { method: 'POST', body: {} })
  return data.plan
}

export async function getProjects(): Promise<PlanProject[]> {
  try {
    const data = await request<{ projects: PlanProject[] }>('/api/desktop/projects')
    return data.projects
  } catch {
    return []
  }
}

export async function addPlanItem(projectName: string, details: string): Promise<PlanItem> {
  const data = await request<{ item: PlanItem }>('/api/desktop/daily-plan/items', {
    method: 'POST',
    body: { projectName, details },
  })
  return data.item
}

export async function updatePlanItem(itemId: string, status?: string, outcome?: string): Promise<PlanItem> {
  const data = await request<{ item: PlanItem }>('/api/desktop/daily-plan/items', {
    method: 'PATCH',
    body: { itemId, status, outcome },
  })
  return data.item
}

export async function deletePlanItem(itemId: string): Promise<void> {
  await request('/api/desktop/daily-plan/items', { method: 'DELETE', body: { itemId } })
}

export async function submitReportWithPlan(
  content: string,
  planItems: Array<{ itemId: string; status: string; outcome?: string }>,
): Promise<void> {
  await request('/api/bundy/report', { method: 'POST', body: { content, planItems } })
}

// ─── SSE connection for real-time sync ─────────────────────────────────────────

let sseAbort: AbortController | null = null
let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null

export type SseTaskEvent =
  | { kind: 'task-update'; data: { taskId: string; mainTaskId: string; kind: 'created' | 'updated' | 'deleted'; changes?: Record<string, unknown> } }
  | { kind: 'task-comment'; data: { taskId: string; mainTaskId: string; summary: string; actorId: string } }
  | { kind: 'task-notification'; data: { userId: string; notificationId: string; taskId: string; type: string; message: string } }

export type ConnectSseOptions = {
  /** Generic "something changed in bundy clock state" — used to refetch status. */
  onUpdate: () => void
  /** Called once after each successful reconnect (skips the very first connect). */
  onReconnect?: () => void
  /** Typed task SSE channel. Fires per event so the renderer can apply deltas. */
  onTaskEvent?: (event: SseTaskEvent) => void
}

export function connectSSE(opts: ConnectSseOptions | (() => void), onReconnect?: () => void): void {
  // Backwards-compat: older callers passed (onUpdate, onReconnect) positionally.
  const options: ConnectSseOptions = typeof opts === 'function'
    ? { onUpdate: opts, onReconnect }
    : opts

  disconnectSSE()

  const token = store.get('desktopToken')
  if (!token) return

  let hasConnectedOnce = false
  const controller = new AbortController()
  sseAbort = controller

  const scheduleReconnect = () => {
    if (!controller.signal.aborted) {
      sseReconnectTimer = setTimeout(connect, 5_000)
    }
  }

  function connect(): void {
    sseReconnectTimer = null
    if (controller.signal.aborted) return

    fetch(`${getApiBase()}/api/bundy/stream`, {
      headers: { ...authHeader() },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok || !res.body) {
          scheduleReconnect()
          return
        }

        if (hasConnectedOnce && options.onReconnect) options.onReconnect()
        hasConnectedOnce = true

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = ''

        const read = (): void => {
          reader.read().then(({ done, value }) => {
            if (done) {
              scheduleReconnect()
              return
            }
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim()
              } else if (line.startsWith('data: ')) {
                const dataStr = line.slice(6)
                if (currentEvent === 'update') {
                  options.onUpdate()
                } else if (currentEvent === 'force-logout') {
                  if (_onTokenExpired) _onTokenExpired()
                } else if (
                  options.onTaskEvent &&
                  (currentEvent === 'task-update' || currentEvent === 'task-comment' || currentEvent === 'task-notification')
                ) {
                  try {
                    const data = JSON.parse(dataStr)
                    options.onTaskEvent({ kind: currentEvent, data } as SseTaskEvent)
                  } catch { /* malformed payload — drop */ }
                }
                currentEvent = ''
              } else if (line === '') {
                currentEvent = ''
              }
            }
            read()
          }).catch(() => {
            scheduleReconnect()
          })
        }
        read()
      })
      .catch(() => {
        scheduleReconnect()
      })
  }

  connect()
}

export function disconnectSSE(): void {
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer)
    sseReconnectTimer = null
  }
  if (sseAbort) {
    sseAbort.abort()
    sseAbort = null
  }
}

export async function sendHeartbeat(data: {
  windowStart: string
  mouseEvents: number
  keyEvents: number
  activeSeconds: number
  mouseActiveSeconds?: number
  keyActiveSeconds?: number
  totalSeconds: number
  topApps?: Record<string, number>
  topUrls?: Record<string, number>
}): Promise<void> {
  try {
    await request('/api/activity/heartbeat', { method: 'POST', body: data })
  } catch (err) {
    console.error('[api] heartbeat failed:', err instanceof Error ? err.message : err)
  }
}
