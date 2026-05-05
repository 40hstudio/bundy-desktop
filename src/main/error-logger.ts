/**
 * error-logger.ts
 *
 * Captures runtime errors from BOTH main and renderer processes and appends
 * them to a structured log file under the OS user-data dir. The file is
 * append-only with a 5 MB cap (truncated to last 50% on overflow) so it
 * doesn't grow unbounded.
 *
 * Where the log lives:
 *   macOS:   ~/Library/Application Support/Bundy/error.log
 *   Windows: %APPDATA%/Bundy/error.log
 *
 * The renderer pushes errors via IPC `report-renderer-error`; main-side
 * exceptions land here too via `process.on(...)` hooks. A small helper
 * `appendErrorLog(...)` is exported for explicit logs from any module.
 */
import { app, ipcMain } from 'electron'
import { appendFileSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

const LOG_FILE = join(app.getPath('userData'), 'error.log')
const EVENT_LOG_FILE = join(app.getPath('userData'), 'events.log')
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
// Events log gets noisy fast (every click), so cap it more aggressively
// than error.log and trim more often.
const EVENT_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export interface ErrorEntry {
  timestamp: string
  source: 'main' | 'renderer'
  level: 'error' | 'warn' | 'unhandled'
  message: string
  stack?: string
  url?: string             // renderer URL where the error fired
  userAgent?: string
  appVersion: string
}

function trimIfTooLarge(file: string, maxBytes: number): void {
  try {
    const s = statSync(file)
    if (s.size <= maxBytes) return
    const data = readFileSync(file, 'utf-8')
    // Drop the first 50% of lines; keep the most recent half.
    const lines = data.split('\n')
    const half = Math.floor(lines.length / 2)
    const trimmed = lines.slice(half).join('\n')
    writeFileSync(file, `# trimmed at ${new Date().toISOString()}\n${trimmed}`)
  } catch { /* fs error — best-effort */ }
}

export function appendErrorLog(entry: Omit<ErrorEntry, 'appVersion' | 'timestamp'> & { timestamp?: string }): void {
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true })
    const full: ErrorEntry = {
      timestamp: entry.timestamp ?? new Date().toISOString(),
      source: entry.source,
      level: entry.level,
      message: entry.message,
      stack: entry.stack,
      url: entry.url,
      userAgent: entry.userAgent,
      appVersion: app.getVersion(),
    }
    appendFileSync(LOG_FILE, JSON.stringify(full) + '\n')
    trimIfTooLarge(LOG_FILE, MAX_BYTES)
  } catch { /* disk full / permission denied — nothing to do */ }
}

export interface EventEntry {
  ts: string
  kind: string
  name: string
  data?: Record<string, unknown>
  url?: string
  appVersion: string
}

export function appendEventLog(entry: Omit<EventEntry, 'appVersion'>): void {
  try {
    mkdirSync(dirname(EVENT_LOG_FILE), { recursive: true })
    const full: EventEntry = { ...entry, appVersion: app.getVersion() }
    appendFileSync(EVENT_LOG_FILE, JSON.stringify(full) + '\n')
    trimIfTooLarge(EVENT_LOG_FILE, EVENT_MAX_BYTES)
  } catch { /* disk full / permission denied — nothing to do */ }
}

export function getErrorLogPath(): string {
  return LOG_FILE
}

export function getEventLogPath(): string {
  return EVENT_LOG_FILE
}

export function initErrorLogger(): void {
  // Main-process unhandled errors. Crash reporter already buffers these for
  // server upload; we ALSO mirror them into the local log so you can grep
  // the file even if the network is down.
  process.on('uncaughtException', (err) => {
    appendErrorLog({
      source: 'main',
      level: 'unhandled',
      message: err.message,
      stack: err.stack,
    })
  })
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    appendErrorLog({ source: 'main', level: 'unhandled', message: msg, stack })
  })

  // Renderer reports — payload validated client-side; we additionally clamp
  // string lengths here so a runaway error doesn't blow up the log.
  ipcMain.on('report-renderer-error', (_event, payload: Partial<ErrorEntry>) => {
    if (!payload || typeof payload !== 'object') return
    const clamp = (s: unknown, n: number): string | undefined => {
      if (typeof s !== 'string') return undefined
      return s.length > n ? s.slice(0, n) + '… [truncated]' : s
    }
    appendErrorLog({
      source: 'renderer',
      level: payload.level === 'warn' || payload.level === 'unhandled' ? payload.level : 'error',
      message: clamp(payload.message, 4_000) ?? '(empty)',
      stack: clamp(payload.stack, 16_000),
      url: clamp(payload.url, 500),
      userAgent: clamp(payload.userAgent, 500),
      timestamp: typeof payload.timestamp === 'string' ? payload.timestamp : undefined,
    })
  })

  // IPC for the renderer to ask "where is the file?" (for the Settings UI)
  ipcMain.handle('get-error-log-path', () => LOG_FILE)
  ipcMain.handle('get-event-log-path', () => EVENT_LOG_FILE)

  // Renderer event stream — clicks, navigation, named feature events.
  // We clamp aggressively because any single payload could be a typo'd
  // 4MB innerText snapshot.
  ipcMain.on('report-renderer-event', (_event, payload: Partial<EventEntry>) => {
    if (!payload || typeof payload !== 'object') return
    const clamp = (s: unknown, n: number): string | undefined => {
      if (typeof s !== 'string') return undefined
      return s.length > n ? s.slice(0, n) + '… [truncated]' : s
    }
    const kind = typeof payload.kind === 'string' ? clamp(payload.kind, 32)! : 'log'
    const name = typeof payload.name === 'string' ? clamp(payload.name, 200)! : '(empty)'
    let data: Record<string, unknown> | undefined
    if (payload.data && typeof payload.data === 'object') {
      try {
        const json = JSON.stringify(payload.data)
        data = json.length > 4_000 ? { _truncated: true, preview: json.slice(0, 4_000) } : (payload.data as Record<string, unknown>)
      } catch { /* circular — drop */ }
    }
    appendEventLog({
      ts: typeof payload.ts === 'string' ? payload.ts : new Date().toISOString(),
      kind,
      name,
      data,
      url: clamp(payload.url, 500),
    })
  })
}
