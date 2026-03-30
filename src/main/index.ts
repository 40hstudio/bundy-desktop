import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  shell,
  systemPreferences,
  Tray
} from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import store from './store'
import { exchangeToken, getBundyStatus, doAction, submitReport, sendDesktopHeartbeat, breakOnQuit, connectSSE, disconnectSSE, getDailyPlan, ensureDailyPlan, getProjects, addPlanItem, updatePlanItem, deletePlanItem, submitReportWithPlan, setTokenExpiredHandler, isServerReachable, setOnlineStateChangeHandler, type BundyStatus } from './api'
import { startScreenshots, stopScreenshots } from './screenshot'
import { startActivity, stopActivity } from './activity'
import { initCrashReporter, sendUserReport } from './crash-reporter'

let tray: Tray | null = null
let popupWin: BrowserWindow | null = null
let fullNativeWin: BrowserWindow | null = null
const fullWindowIds = new Set<number>()
let statusPollerTimer: NodeJS.Timeout | null = null
let pendingUpdateVersion: string | null = null
let pendingDownloadPercent: number | null = null
let updateDownloaded = false
let trayTimerTick: NodeJS.Timeout | null = null
let trayTimerState = { baseMs: 0, snapshotAt: 0, isTracking: false }
let cachedStatus: BundyStatus | null = null

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1_000)
  const h = Math.floor(s / 3_600)
  const m = Math.floor((s % 3_600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function startTrayTimer(): void {
  if (trayTimerTick) return
  trayTimerTick = setInterval(() => {
    if (!tray) return
    if (!trayTimerState.isTracking) {
      tray.setTitle('')
      return
    }
    const live = trayTimerState.baseMs + (Date.now() - trayTimerState.snapshotAt)
    tray.setTitle(formatMs(live))
  }, 1_000)
}

function stopTrayTimer(): void {
  if (trayTimerTick) {
    clearInterval(trayTimerTick)
    trayTimerTick = null
  }
  tray?.setTitle('')
}

// ─── Tray helpers ─────────────────────────────────────────────────────────────

function getTrayIcon(isClockedIn: boolean): Electron.NativeImage {
  const name = isClockedIn ? 'tray-active.png' : 'tray-icon.png'
  const iconPath = is.dev
    ? join(__dirname, '../../resources', name)
    : join(process.resourcesPath, name)
  const img = nativeImage.createFromPath(iconPath)
  if (img.isEmpty()) {
    console.error(`[tray] icon not found at: ${iconPath}`)
  }
  img.setTemplateImage(true)
  return img
}

function updateTray(isClockedIn: boolean, isTracking: boolean): void {
  if (!tray) return
  tray.setImage(getTrayIcon(isClockedIn))
  tray.setToolTip(
    isTracking ? 'Bundy – Tracking' :
    isClockedIn ? 'Bundy – On break' :
    'Bundy – Not clocked in'
  )
}

// ─── Popup window ─────────────────────────────────────────────────────────────

function createPopup(): BrowserWindow {
  const win = new BrowserWindow({
    width: 320,
    height: 480,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('blur', () => {
    if (!win.webContents.isDevToolsOpened()) win.hide()
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function togglePopup(): void {
  if (!tray) return
  if (!popupWin || popupWin.isDestroyed()) {
    popupWin = createPopup()
  }

  if (popupWin.isVisible()) {
    popupWin.hide()
    return
  }

  const bounds = tray.getBounds()
  const { width: winW } = popupWin.getBounds()
  popupWin.setPosition(
    Math.round(bounds.x + bounds.width / 2 - winW / 2),
    Math.round(bounds.y + bounds.height + 4),
    false
  )
  popupWin.show()
  // Flush any cached update state to the newly visible popup
  popupWin.webContents.once('did-finish-load', () => {
    flushUpdateState()
  })
  flushUpdateState()
}

function flushUpdateState(): void {
  if (!popupWin || popupWin.isDestroyed()) return
  if (updateDownloaded) {
    popupWin.webContents.send('update-downloaded')
  } else if (pendingUpdateVersion !== null) {
    popupWin.webContents.send('update-available', { version: pendingUpdateVersion })
    if (pendingDownloadPercent !== null) {
      popupWin.webContents.send('download-progress', { percent: pendingDownloadPercent })
    }
  }
}

// ─── Monitoring services ───────────────────────────────────────────────────────
// startScreenshots / startActivity are called from pollAndPush() only when
// the user is clocked in. stopServices() is still called on explicit logout.

function stopServices(): void {
  stopScreenshots()
  stopActivity()
}

// ─── Offline / action queue helpers ───────────────────────────────────────────

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return err instanceof TypeError || msg.includes('fetch') || msg.includes('network') || msg.includes('econnrefused') || msg.includes('enotfound')
}

function enqueueAction(action: string): void {
  const pending = store.get('pendingActions')
  store.set('pendingActions', [...pending, { action, timestamp: Date.now() }])
}

async function drainActionQueue(): Promise<void> {
  const pending = store.get('pendingActions')
  if (!pending.length) return
  store.set('pendingActions', [])
  broadcastOnlineState()
  let synced = 0
  for (const item of pending) {
    try {
      await doAction(item.action as 'clock-in' | 'clock-out' | 'break-start' | 'break-end')
      synced++
    } catch {
      // Skip actions that fail (e.g. duplicate/invalid state) — don't re-queue
    }
  }
  if (synced > 0 && popupWin && !popupWin.isDestroyed()) {
    popupWin.webContents.send('sync-toast', { count: synced })
  }
}

function broadcastOnlineState(): void {
  if (!popupWin || popupWin.isDestroyed()) return
  const pending = store.get('pendingActions')
  popupWin.webContents.send('online-state', {
    isOnline: isServerReachable(),
    queuedCount: pending.length
  })
}

// ─── Full-window mode ──────────────────────────────────────────────────────────

// ─── Native full-window mode ───────────────────────────────────────────────────

async function openFullWindow(): Promise<void> {
  if (fullNativeWin && !fullNativeWin.isDestroyed()) {
    if (!fullNativeWin.isVisible()) fullNativeWin.show()
    fullNativeWin.focus()
    return
  }

  fullNativeWin = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      autoplayPolicy: 'no-user-gesture-required',
    }
  })

  // Allow microphone + camera for WebRTC calls
  fullNativeWin.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'microphone', 'camera', 'audioCapture', 'videoCapture'].includes(permission))
  })

  fullWindowIds.add(fullNativeWin.webContents.id)

  fullNativeWin.on('closed', () => {
    if (fullNativeWin) fullWindowIds.delete(fullNativeWin.webContents.id)
    fullNativeWin = null
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    await fullNativeWin.loadURL(process.env.ELECTRON_RENDERER_URL + '#full')
  } else {
    await fullNativeWin.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'full' })
  }

  fullNativeWin.show()
  fullNativeWin.focus()
}

// ─── Status polling → push to renderer ────────────────────────────────────────

/** Lightweight status refresh — no heartbeat POST. Used for SSE-triggered updates. */
async function refreshStatus(): Promise<void> {
  if (!store.get('desktopToken')) return
  try {
    const [status, plan] = await Promise.all([
      getBundyStatus(),
      getDailyPlan().catch(() => null)
    ])
    updateTray(status.isClockedIn, status.isTracking)

    trayTimerState = { baseMs: status.elapsedMs, snapshotAt: Date.now(), isTracking: status.isTracking }
    if (status.isTracking) {
      startTrayTimer()
    } else {
      stopTrayTimer()
    }

    if (status.isTracking) {
      startScreenshots()
      await startActivity()
    } else {
      stopScreenshots()
      stopActivity()
    }

    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.webContents.send('status-update', status)
      if (plan) popupWin.webContents.send('plan-update', plan)
      const screen = systemPreferences.getMediaAccessStatus('screen')
      const accessibility = systemPreferences.isTrustedAccessibilityClient(false)
      popupWin.webContents.send('permissions-update', { screen, accessibility })
    }
  } catch {
    // network error is non-fatal
  }
}

async function pollAndPush(): Promise<void> {
  if (!store.get('desktopToken')) return
  try {
    // Send heartbeat first so the web app knows desktop is online
    // before we make any other request
    await sendDesktopHeartbeat()
    broadcastOnlineState()

    const status = await getBundyStatus()
    cachedStatus = status
    updateTray(status.isClockedIn, status.isTracking)

    // Update tray title timer snapshot
    trayTimerState = { baseMs: status.elapsedMs, snapshotAt: Date.now(), isTracking: status.isTracking }
    if (status.isTracking) {
      startTrayTimer()
    } else {
      stopTrayTimer()
    }

    // Start or stop monitoring based on active working state (not on break)
    if (status.isTracking) {
      startScreenshots()
      await startActivity()
    } else {
      stopScreenshots()
      stopActivity()
    }

    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.webContents.send('status-update', status)
      // Push fresh permissions so the UI badge auto-updates without a reload
      const screen = systemPreferences.getMediaAccessStatus('screen')
      const accessibility = systemPreferences.isTrustedAccessibilityClient(false)
      popupWin.webContents.send('permissions-update', { screen, accessibility })
    }
  } catch {
    // network error is non-fatal
  }
}

function startPoller(): void {
  if (statusPollerTimer) return
  // Fire heartbeat immediately so the server sees the desktop as online
  // right away — before the heavier pollAndPush cycle completes.
  sendDesktopHeartbeat()
  void pollAndPush()
  statusPollerTimer = setInterval(() => void pollAndPush(), 30_000)

  // Real-time sync: listen for SSE events so web actions update instantly
  // onReconnect: SSE reconnects ~5s after server restart — drain queue then check for updates
  connectSSE(
    () => void refreshStatus(),
    async () => {
      await drainActionQueue()
      autoUpdater.checkForUpdates().catch(() => {})
    }
  )
}

function stopPoller(): void {
  disconnectSSE()
  if (statusPollerTimer) {
    clearInterval(statusPollerTimer)
    statusPollerTimer = null
  }
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-stored-auth', () => {
  const token = store.get('desktopToken')
  if (!token) return null
  return {
    userId: store.get('userId'),
    username: store.get('username'),
    role: store.get('role')
  }
})

ipcMain.handle('login', async (_event, shortToken: string) => {
  const os = await import('os')
  const deviceName = os.default.hostname()
  const result = await exchangeToken(shortToken, deviceName)
  store.set('desktopToken', result.desktopToken)
  store.set('userId', result.userId)
  store.set('username', result.username)
  store.set('role', result.role)
  startPoller()
  // Open the full dashboard after login
  void openFullWindow()
  return result
})

ipcMain.handle('logout', () => {
  stopPoller()
  stopTrayTimer()
  stopServices()
  store.set('desktopToken', '')
  store.set('userId', '')
  store.set('username', '')
  store.set('role', '')
})

ipcMain.handle('get-status', async () => {
  try {
    const s = await getBundyStatus()
    cachedStatus = s
    return s
  } catch (err: unknown) {
    if (cachedStatus) return cachedStatus
    throw err
  }
})

ipcMain.handle('do-action', async (_event, action: string, note?: string) => {
  if (!isServerReachable()) {
    // Server unreachable — queue the action to replay on reconnect
    enqueueAction(action)
    broadcastOnlineState()
    return
  }
  try {
    await doAction(action as 'clock-in' | 'clock-out' | 'break-start' | 'break-end', note)
    await pollAndPush()
  } catch (err) {
    if (isNetworkError(err)) {
      enqueueAction(action)
      broadcastOnlineState()
    } else {
      throw err
    }
  }
})

ipcMain.handle('submit-report', async (_event, content: string) => {
  await submitReport(content)
  await pollAndPush()
})

ipcMain.handle('check-permissions', async () => {
  const screen = systemPreferences.getMediaAccessStatus('screen')
  // isTrustedAccessibilityClient(false) = check without triggering the system prompt
  const accessibility = systemPreferences.isTrustedAccessibilityClient(false)
  return { screen, accessibility }
})

ipcMain.handle('open-accessibility-settings', async () => {
  await shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
  )
})

ipcMain.handle('open-screen-recording-settings', async () => {
  await shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
  )
})

ipcMain.handle('open-external', async (_event, url: string) => {
  // Only allow https and discord deep links
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('discord://'))) {
    await shell.openExternal(url)
  }
})

ipcMain.handle('get-version', () => app.getVersion())

ipcMain.handle('get-update-state', () => ({
  version: pendingUpdateVersion,
  percent: pendingDownloadPercent,
  downloaded: updateDownloaded,
}))

ipcMain.handle('check-for-updates', () => {
  autoUpdater.checkForUpdates().catch(() => {})
})

ipcMain.handle('install-update', () => {
  store.set('restartForUpdate', true)
  autoUpdater.quitAndInstall()
})

ipcMain.handle('open-full-window', () => void openFullWindow())

ipcMain.handle('get-window-mode', (event) => {
  return fullWindowIds.has(event.sender.id) ? 'full' : 'popup'
})

ipcMain.handle('get-api-config', async () => {
  const token = store.get('desktopToken')
  const remote = store.get('apiBase') || 'https://bundy.40h.studio'
  let apiBase = remote
  try {
    const r = await fetch('http://localhost:3000/api/auth/session', {
      signal: AbortSignal.timeout(1000)
    })
    if (r.status === 200 || r.status === 401) apiBase = 'http://localhost:3000'
  } catch { /* use remote */ }
  return { apiBase, token }
})

ipcMain.handle('send-crash-report', async (_event, note: string) => {
  await sendUserReport(note)
})

ipcMain.handle('get-daily-plan', async () => {
  return getDailyPlan()
})

ipcMain.handle('ensure-daily-plan', async () => {
  return ensureDailyPlan()
})

ipcMain.handle('get-projects', async () => {
  return getProjects()
})

ipcMain.handle('add-plan-item', async (_event, projectName: string, details: string) => {
  return addPlanItem(projectName, details)
})

ipcMain.handle('update-plan-item', async (_event, itemId: string, status?: string, outcome?: string) => {
  return updatePlanItem(itemId, status, outcome)
})

ipcMain.handle('delete-plan-item', async (_event, itemId: string) => {
  return deletePlanItem(itemId)
})

ipcMain.handle('submit-report-with-plan', async (_event, content: string, planItems: Array<{ itemId: string; status: string; outcome?: string }>) => {
  await submitReportWithPlan(content, planItems)
  await pollAndPush()
})

// ─── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  app.dock?.hide()

  // ── Token expiry handler — fires when server returns 401 ─────────────────
  setTokenExpiredHandler(() => {
    stopPoller()
    stopTrayTimer()
    stopServices()
    store.set('desktopToken', '')
    store.set('userId', '')
    store.set('username', '')
    store.set('role', '')
    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.webContents.send('token-expired')
    }
  })
  // ── Online state change — drain queue when connection restored ───────────
  setOnlineStateChangeHandler((online) => {
    if (online) void drainActionQueue().then(() => void pollAndPush())
    broadcastOnlineState()
  })
  // ── Crash reporter ──────────────────────────────────────────────────────────
  initCrashReporter()

  // ── Auto-updater ────────────────────────────────────────────────────────────
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    pendingUpdateVersion = info.version
    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.webContents.send('update-available', { version: info.version })
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    pendingDownloadPercent = Math.round(progress.percent)
    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.webContents.send('download-progress', { percent: pendingDownloadPercent })
    }
  })

  autoUpdater.on('update-downloaded', () => {
    updateDownloaded = true
    pendingDownloadPercent = 100
    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.webContents.send('update-downloaded')
    }
    // Don't force-restart — let the user choose when to restart via the UI.
    // The app will also install on next quit (autoInstallOnAppQuit = true).
  })

  // Check on startup (delay 10s so the app is fully loaded first)
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10_000)
  // Fallback: check every 30 minutes (primary detection is via SSE reconnect)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1_000)

  tray = new Tray(getTrayIcon(false))
  tray.setToolTip('Bundy')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => void openFullWindow() },
    { label: 'Open Mini Panel', click: togglePopup },
    { type: 'separator' },
    {
      label: 'Open in Browser',
      click: () => void shell.openExternal(store.get('apiBase') || 'https://bundy.40h.studio')
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])

  tray.on('click', () => void openFullWindow())
  tray.on('right-click', () => tray?.popUpContextMenu(contextMenu))

  // Auto-start services if token already stored
  if (store.get('desktopToken')) {
    startPoller()
    // Open the full dashboard as the primary interface on startup
    void openFullWindow()

    // If we restarted after an automatic update, resume the user's session.
    // The flag is only set when quitting via quitAndInstall — not on lid close
    // or intentional quit (both of those call breakOnQuit() instead).
    if (store.get('restartForUpdate')) {
      store.set('restartForUpdate', false)
      setTimeout(async () => {
        try {
          const status = await getBundyStatus()
          // Only resume if the user is clocked in but on break (paused for update)
          if (status.isClockedIn && !status.isTracking) {
            await doAction('break-end')
            await pollAndPush()
          }
        } catch {
          // non-fatal: network may not be up yet
        }
      }, 2_000)
    }
  }

  // ── Lid close / screen lock → auto-break ────────────────────────────────────
  async function autoBreakOnSuspend(): Promise<void> {
    if (!store.get('desktopToken')) return
    try {
      const status = await getBundyStatus()
      if (status.isTracking) {
        await doAction('break-start')
        await pollAndPush()
      }
    } catch {
      // non-fatal: network may already be offline on lid close
    }
  }

  powerMonitor.on('suspend', () => void autoBreakOnSuspend())
  powerMonitor.on('lock-screen', () => void autoBreakOnSuspend())
})

app.on('window-all-closed', () => {
  // Keep running in tray — don't quit when popup is closed
})

let isQuitting = false
app.on('before-quit', (event) => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  stopPoller()
  stopTrayTimer()
  stopServices()
  const token = store.get('desktopToken')
  if (token && !store.get('restartForUpdate')) {
    // Await the quit call (marks offline + auto-break) before actually exiting
    breakOnQuit().finally(() => app.exit(0))
  } else {
    app.exit(0)
  }
})
