import { sendHeartbeat } from './api'
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
const APP_POLL_MS = 5_000           // poll active window every 5s

let mouseEvents = 0
let keyEvents = 0
let activeSeconds = 0
let mouseActiveSeconds = 0
let keyActiveSeconds = 0
let lastActivityTs = Date.now()
let lastMouseTs = 0
let lastKeyTs = 0
let activeSecondsTick: NodeJS.Timeout | null = null
let heartbeatTimer: NodeJS.Timeout | null = null
let appPollTimer: NodeJS.Timeout | null = null
let windowStart: Date = new Date()

let appSeconds: Record<string, number> = {}
let urlSeconds: Record<string, number> = {}

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
    const fn = await getActiveWindowFn()
    const win = await fn()
    if (win?.owner?.name) {
      const app = win.owner.name
      appSeconds[app] = (appSeconds[app] ?? 0) + APP_POLL_MS / 1000
      // win.url comes from AX API in a subprocess — it requires TCC accessibility
      // for the 'main' binary itself, which it never has. Use osascript fallback.
      const rawUrl = win.url ?? await getBrowserUrlOsascript(app)
      if (rawUrl) {
        try {
          const domain = new URL(rawUrl).hostname.replace(/^www\./, '')
          if (domain) urlSeconds[domain] = (urlSeconds[domain] ?? 0) + APP_POLL_MS / 1000
        } catch { /* invalid URL */ }
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

function flushHeartbeat(): void {
  const totalSeconds = WINDOW_MS / 1000
  const topApps = { ...appSeconds }
  const topUrls = { ...urlSeconds }
  void sendHeartbeat({
    windowStart: windowStart.toISOString(),
    mouseEvents,
    keyEvents,
    activeSeconds,
    mouseActiveSeconds,
    keyActiveSeconds,
    totalSeconds,
    topApps,
    topUrls,
  })
  mouseEvents = 0
  keyEvents = 0
  activeSeconds = 0
  mouseActiveSeconds = 0
  keyActiveSeconds = 0
  appSeconds = {}
  urlSeconds = {}
  windowStart = new Date()
}

export async function startActivity(): Promise<void> {
  if (started) return

  // Check Accessibility permission WITHOUT prompting.
  // IMPORTANT: We must NOT import uiohook-napi before this check.
  // The mere act of importing it causes the native library to register
  // NSWorkspace notifications, which macOS treats as an accessibility API
  // access attempt and fires the system permission dialog every single time.
  const trusted = systemPreferences.isTrustedAccessibilityClient(false)
  if (!trusted) {
    console.warn('[activity] Accessibility not granted – skipping uiohook')
    return
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

  windowStart = new Date()
  startActiveTimer()
  heartbeatTimer = setInterval(flushHeartbeat, WINDOW_MS)

  // Start app/URL polling
  void pollActiveWindow()
  appPollTimer = setInterval(() => void pollActiveWindow(), APP_POLL_MS)
}

export function stopActivity(): void {
  if (!started) return
  started = false

  uIOhookInstance?.stop()
  uIOhookInstance = null

  stopActiveTimer()

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  if (appPollTimer) {
    clearInterval(appPollTimer)
    appPollTimer = null
  }

  // Flush partial window if there was any activity
  if (mouseEvents + keyEvents > 0 || Object.keys(appSeconds).length > 0) {
    void sendHeartbeat({
      windowStart: windowStart.toISOString(),
      mouseEvents,
      keyEvents,
      activeSeconds,
      mouseActiveSeconds,
      keyActiveSeconds,
      totalSeconds: Math.round((Date.now() - windowStart.getTime()) / 1000),
      topApps: { ...appSeconds },
      topUrls: { ...urlSeconds },
    })
    mouseEvents = 0
    keyEvents = 0
    activeSeconds = 0
    mouseActiveSeconds = 0
    keyActiveSeconds = 0
    appSeconds = {}
    urlSeconds = {}
  }
}
