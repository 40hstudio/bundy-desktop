import { sendHeartbeat } from './api'
import { queueActivitySummary } from './sync'
import { scheduleAtBoundary, trySendOrQueue } from './scheduler'
import { systemPreferences } from 'electron'
import { execFile as _execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(_execFile)

// ─── osascript URL fallback ────────────────────────────────────────────────
// active-win returns win.url via Accessibility API, but macOS TCC checks the
// code signature of the CALLING process (the spawned 'main' binary), not the
// Electron host. That binary never has its own TCC grant, so win.url is always
// undefined. We fall back to osascript, which runs in the Electron process and
// inherits Bundy's own permissions (macOS Automation permission per browser).
const BROWSER_SCRIPTS: Record<string, string> = {
  'Google Chrome':               'tell application "Google Chrome" to get URL of active tab of front window',
  'Google Chrome Beta':          'tell application "Google Chrome Beta" to get URL of active tab of front window',
  'Google Chrome Dev':           'tell application "Google Chrome Dev" to get URL of active tab of front window',
  'Google Chrome Canary':        'tell application "Google Chrome Canary" to get URL of active tab of front window',
  'Chromium':                    'tell application "Chromium" to get URL of active tab of front window',
  'Microsoft Edge':              'tell application "Microsoft Edge" to get URL of active tab of front window',
  'Microsoft Edge Beta':         'tell application "Microsoft Edge Beta" to get URL of active tab of front window',
  'Microsoft Edge Dev':          'tell application "Microsoft Edge Dev" to get URL of active tab of front window',
  'Microsoft Edge Canary':       'tell application "Microsoft Edge Canary" to get URL of active tab of front window',
  'Brave Browser':               'tell application "Brave Browser" to get URL of active tab of front window',
  'Brave Browser Beta':          'tell application "Brave Browser Beta" to get URL of active tab of front window',
  'Brave Browser Nightly':       'tell application "Brave Browser Nightly" to get URL of active tab of front window',
  'Arc':                         'tell application "Arc" to get URL of active tab of front window',
  'Opera':                       'tell application "Opera" to get URL of active tab of front window',
  'Opera GX':                    'tell application "Opera GX" to get URL of active tab of front window',
  'Vivaldi':                     'tell application "Vivaldi" to get URL of front window',
  'Safari':                      'tell application "Safari" to get URL of current tab of front window',
  'Safari Technology Preview':   'tell application "Safari Technology Preview" to get URL of current tab of front window',
  'Firefox':                     'tell application "Firefox" to get URL of front window',
  'Firefox Developer Edition':   'tell application "Firefox Developer Edition" to get URL of front window',
  'Tor Browser':                 'tell application "Tor Browser" to get URL of front window',
}

async function getBrowserUrlOsascript(appName: string): Promise<string | undefined> {
  const script = BROWSER_SCRIPTS[appName]
  if (!script) return undefined
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 2500 })
    const url = stdout.trim()
    return url.startsWith('http') ? url : undefined
  } catch {
    return undefined
  }
}

const WINDOW_MS = 10 * 60 * 1000   // 10-minute windows
const ACTIVITY_GRACE_MS = 30_000   // 30s inactivity before "inactive"
const APP_POLL_MS = 2_000           // poll active window every 2s

let mouseEvents = 0
let keyEvents = 0
let activeSeconds = 0
let mouseActiveSeconds = 0
let keyActiveSeconds = 0
let lastActivityTs = Date.now()
let lastMouseTs = 0
let lastKeyTs = 0
let activeSecondsTick: NodeJS.Timeout | null = null
let stopHeartbeat: (() => void) | null = null
let appPollTimer: NodeJS.Timeout | null = null
let windowStart: Date = new Date()

let appSeconds: Record<string, number> = {}
let urlSeconds: Record<string, number> = {}

// ─── Live activity (real-time current app/URL for presence) ────────────────
const BUNDY_APP_NAMES = ['bundy', 'electron', 'bundy desktop']
let liveApp: string | null = null
let liveUrl: string | null = null
let lastNonBundyApp: string | null = null
let lastNonBundyUrl: string | null = null
let liveRunningApps: string[] = []
let prevRunningAppsKey = ''

// Callback fired when running apps list changes
let onRunningAppsChangedCb: (() => void) | null = null
export function setOnRunningAppsChanged(cb: () => void): void {
  onRunningAppsChangedCb = cb
}

let onActiveAppChangedCb: (() => void) | null = null
export function setOnActiveAppChanged(cb: () => void): void {
  onActiveAppChangedCb = cb
}

// Apps to always filter out from running apps list (system/background noise)
const SYSTEM_NOISE = new Set([
  'Finder', 'SystemUIServer', 'Control Center', 'Dock', 'loginwindow',
  'WindowServer', 'Spotlight', 'NotificationCenter', 'sharingd',
  'universalaccessd', 'CoreLocationAgent', 'AirPlayUIAgent',
  'WiFiAgent', 'bluetoothd', 'cfprefsd', 'distnoted',
  'Bundy', 'Electron', 'Bundy Desktop',
])

async function fetchRunningApps(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'osascript',
      ['-e', 'tell application "System Events" to get name of every process whose background only is false'],
      { timeout: 3000 }
    )
    if (!stdout.trim()) return []
    return stdout
      .trim()
      .split(', ')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !SYSTEM_NOISE.has(s))
  } catch {
    return []
  }
}

/** Get the current live activity for presence broadcasting. */
export function getCurrentActivity(): { app: string | null; url: string | null; runningApps: string[] } {
  return { app: liveApp, url: liveUrl, runningApps: liveRunningApps }
}

// Cache the uiohook instance so stopActivity() can call .stop() synchronously
let uIOhookInstance: { stop: () => void } | null = null
let started = false

type ActiveWindowFn = () => Promise<{ owner: { name: string }; url?: string } | undefined>
let _activeWindowFn: ActiveWindowFn | null = null

async function getActiveWindowFn(): Promise<ActiveWindowFn> {
  if (!_activeWindowFn) {
    try {
      const mod = await import('active-win') as unknown as { default: ActiveWindowFn }
      _activeWindowFn = mod.default
    } catch {
      _activeWindowFn = async () => undefined
    }
  }
  return _activeWindowFn!
}

async function pollActiveWindow(): Promise<void> {
  try {
    // Refresh running apps list (every poll cycle = every 5s)
    const newApps = await fetchRunningApps()
    const newKey = newApps.join(',')
    if (newKey !== prevRunningAppsKey) {
      prevRunningAppsKey = newKey
      liveRunningApps = newApps
      onRunningAppsChangedCb?.()
    }

    // Only track the active window when user has recent input activity
    // to avoid logging the idle screen/screensaver as "used app"
    const now = Date.now()
    if (now - lastActivityTs > ACTIVITY_GRACE_MS) {
      liveApp = null
      liveUrl = null
      return // user is idle, skip
    }

    const fn = await getActiveWindowFn()
    const win = await fn()
    if (win?.owner?.name) {
      const app = win.owner.name
      appSeconds[app] = (appSeconds[app] ?? 0) + APP_POLL_MS / 1000

      const rawUrl = win.url ?? await getBrowserUrlOsascript(app)
      let domain: string | null = null
      if (rawUrl) {
        try {
          domain = new URL(rawUrl).hostname.replace(/^www\./, '')
          if (domain) urlSeconds[domain] = (urlSeconds[domain] ?? 0) + APP_POLL_MS / 1000
        } catch { /* invalid URL */ }
      }

      // Update live activity — skip Bundy itself, use previous app
      const prevApp = liveApp
      const prevUrl = liveUrl
      if (BUNDY_APP_NAMES.includes(app.toLowerCase())) {
        liveApp = lastNonBundyApp
        liveUrl = lastNonBundyUrl
      } else {
        liveApp = app
        liveUrl = domain
        lastNonBundyApp = app
        lastNonBundyUrl = domain
      }
      if (liveApp !== prevApp || liveUrl !== prevUrl) {
        onActiveAppChangedCb?.()
      }
    }
  } catch { /* silently ignore */ }
}

function bumpActivity(): void {
  lastActivityTs = Date.now()
}

function bumpMouse(): void {
  lastMouseTs = Date.now()
  bumpActivity()
}

function bumpKey(): void {
  lastKeyTs = Date.now()
  bumpActivity()
}

function startActiveTimer(): void {
  if (activeSecondsTick) return
  activeSecondsTick = setInterval(() => {
    const now = Date.now()
    if (now - lastActivityTs < ACTIVITY_GRACE_MS) {
      activeSeconds++
    }
    if (now - lastMouseTs < ACTIVITY_GRACE_MS) {
      mouseActiveSeconds++
    }
    if (now - lastKeyTs < ACTIVITY_GRACE_MS) {
      keyActiveSeconds++
    }
  }, 1000)
}

function stopActiveTimer(): void {
  if (activeSecondsTick) {
    clearInterval(activeSecondsTick)
    activeSecondsTick = null
  }
}

/**
 * Align windows to clock boundaries: :00, :10, :20, :30, :40, :50.
 * E.g. if user logs in at 8:35, the first window is 8:30–8:40 (partial),
 * then 8:40–8:50, etc.
 */
function alignedWindowStart(): Date {
  const now = new Date()
  now.setSeconds(0, 0)
  now.setMinutes(Math.floor(now.getMinutes() / 10) * 10)
  return now
}

function flushHeartbeat(): void {
  const now = Date.now()
  const totalSeconds = Math.round((now - windowStart.getTime()) / 1000)
  if (totalSeconds <= 0) return
  const topApps = { ...appSeconds }
  const topUrls = { ...urlSeconds }
  const data = {
    windowStart: windowStart.toISOString(),
    mouseEvents,
    keyEvents,
    activeSeconds,
    mouseActiveSeconds,
    keyActiveSeconds,
    totalSeconds,
    topApps,
    topUrls,
  }
  void trySendOrQueue(data, sendHeartbeat, queueActivitySummary)
  mouseEvents = 0
  keyEvents = 0
  activeSeconds = 0
  mouseActiveSeconds = 0
  keyActiveSeconds = 0
  appSeconds = {}
  urlSeconds = {}
  windowStart = alignedWindowStart()
}

function scheduleHeartbeat(): void {
  if (stopHeartbeat) return
  stopHeartbeat = scheduleAtBoundary({
    intervalMs: WINDOW_MS,
    fn: flushHeartbeat,
  })
}

export async function startActivity(): Promise<{ accessibilityDenied?: boolean }> {
  if (started) return {}

  // Check Accessibility permission WITHOUT prompting.
  // IMPORTANT: We must NOT import uiohook-napi before this check.
  // The mere act of importing it causes the native library to register
  // NSWorkspace notifications, which macOS treats as an accessibility API
  // access attempt and fires the system permission dialog every single time.
  const trusted = systemPreferences.isTrustedAccessibilityClient(false)
  if (!trusted) {
    console.warn('[activity] Accessibility not granted – skipping uiohook')
    return { accessibilityDenied: true }
  }

  // Mark started BEFORE the async import so concurrent calls from pollAndPush
  // don't race and load uiohook twice.
  started = true

  const { uIOhook } = await import('uiohook-napi')
  uIOhookInstance = uIOhook

  uIOhook.on('keydown', () => {
    keyEvents++
    bumpKey()
  })

  uIOhook.on('mousemove', () => {
    mouseEvents++
    bumpMouse()
  })

  uIOhook.on('mousedown', () => {
    mouseEvents++
    bumpMouse()
  })

  uIOhook.start()

  windowStart = alignedWindowStart()
  startActiveTimer()
  scheduleHeartbeat()

  // Start app/URL polling
  void pollActiveWindow()
  appPollTimer = setInterval(() => void pollActiveWindow(), APP_POLL_MS)

  return {}
}

export function stopActivity(): void {
  if (!started) return
  started = false

  uIOhookInstance?.stop()
  uIOhookInstance = null

  stopActiveTimer()

  stopHeartbeat?.()
  stopHeartbeat = null

  if (appPollTimer) {
    clearInterval(appPollTimer)
    appPollTimer = null
  }

  // Flush partial window if there was any activity
  if (mouseEvents + keyEvents > 0 || Object.keys(appSeconds).length > 0) {
    const data = {
      windowStart: windowStart.toISOString(),
      mouseEvents,
      keyEvents,
      activeSeconds,
      mouseActiveSeconds,
      keyActiveSeconds,
      totalSeconds: Math.round((Date.now() - windowStart.getTime()) / 1000),
      topApps: { ...appSeconds },
      topUrls: { ...urlSeconds },
    }
    void trySendOrQueue(data, sendHeartbeat, queueActivitySummary)
    mouseEvents = 0
    keyEvents = 0
    activeSeconds = 0
    mouseActiveSeconds = 0
    keyActiveSeconds = 0
    appSeconds = {}
    urlSeconds = {}
  }
}
