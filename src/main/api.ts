import store from './store'

function baseUrl(): string {
  return store.get('apiBase') || 'https://bundy.40h.studio'
}

function authHeader(): Record<string, string> {
  const token = store.get('desktopToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function exchangeToken(
  shortToken: string,
  deviceName: string
): Promise<{ desktopToken: string; userId: string; username: string; role: string }> {
  const res = await fetch(`${baseUrl()}/api/desktop/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: shortToken, deviceName })
  })
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(json.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<{ desktopToken: string; userId: string; username: string; role: string }>
}

export interface BundyStatus {
  isClockedIn: boolean
  isTracking: boolean
  onBreak: boolean
  /** Total accumulated working milliseconds today (matches web app timer). */
  elapsedMs: number
  username: string
  role: string
}

// The web API uses different action names — map desktop → server
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
  currentStatus: string
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
  const res = await fetch(`${baseUrl()}/api/bundy`, {
    headers: { ...authHeader() }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = (await res.json()) as BundyApiResponse
  const { currentStatus, todayLogs } = data

  const isClockedIn = ['CHECK_IN', 'BACK', 'BREAK'].includes(currentStatus)
  const isTracking = ['CHECK_IN', 'BACK'].includes(currentStatus)
  const onBreak = currentStatus === 'BREAK'
  const elapsedMs = computeElapsedMs(todayLogs, currentStatus)

  return {
    isClockedIn,
    isTracking,
    onBreak,
    elapsedMs,
    username: store.get('username') || '',
    role: store.get('role') || '',
  }
}

export async function doAction(action: DesktopAction, _note?: string): Promise<void> {
  const serverAction = ACTION_MAP[action]
  const res = await fetch(`${baseUrl()}/api/bundy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ action: serverAction })
  })
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(json.error ?? `HTTP ${res.status}`)
  }
}

export async function submitReport(content: string): Promise<void> {
  const res = await fetch(`${baseUrl()}/api/bundy/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ content })
  })
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(json.error ?? `HTTP ${res.status}`)
  }
}

export async function sendDesktopHeartbeat(): Promise<void> {
  if (!store.get('desktopToken')) return
  await fetch(`${baseUrl()}/api/desktop/heartbeat`, {
    method: 'POST',
    headers: { ...authHeader() }
  }).catch(() => {})
}

export async function breakOnQuit(): Promise<void> {
  if (!store.get('desktopToken')) return
  // Immediately marks desktop offline + auto-breaks if user is clocked in
  await fetch(`${baseUrl()}/api/desktop/quit`, {
    method: 'POST',
    headers: { ...authHeader() }
  }).catch(() => {})
}

export async function uploadScreenshot(
  imageBase64: string,
  displayIndex: number,
  capturedAt: string
): Promise<void> {
  const res = await fetch(`${baseUrl()}/api/activity/screenshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ imageBase64, displayIndex, capturedAt })
  })
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    console.error('[api] screenshot upload failed:', json.error ?? `HTTP ${res.status}`)
  }
}

// ─── SSE connection for real-time sync ─────────────────────────────────────────

let sseAbort: AbortController | null = null
let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null

export function connectSSE(onUpdate: () => void): void {
  disconnectSSE()

  const token = store.get('desktopToken')
  if (!token) return

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

    fetch(`${baseUrl()}/api/bundy/stream`, {
      headers: { ...authHeader() },
      signal: controller.signal
    })
      .then((res) => {
        if (!res.ok || !res.body) {
          scheduleReconnect()
          return
        }

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
                if (currentEvent === 'update') {
                  onUpdate()
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
  const res = await fetch(`${baseUrl()}/api/activity/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(data)
  })
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    console.error('[api] heartbeat failed:', json.error ?? `HTTP ${res.status}`)
  }
}
