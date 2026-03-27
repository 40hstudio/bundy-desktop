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
import { exchangeToken, getBundyStatus, doAction, submitReport, sendDesktopHeartbeat, breakOnQuit, connectSSE, disconnectSSE, getDailyPlan, ensureDailyPlan, getProjects, addPlanItem, updatePlanItem, deletePlanItem, submitReportWithPlan, setTokenExpiredHandler } from './api'
import { startScreenshots, stopScreenshots } from './screenshot'
import { startActivity, stopActivity } from './activity'
import { initCrashReporter, sendUserReport } from './crash-reporter'

let tray: Tray | null = null
let popupWin: BrowserWindow | null = null
let statusPollerTimer: NodeJS.Timeout | null = null
let pendingUpdateVersion: string | null = null
let pendingDownloadPercent: number | null = null
let updateDownloaded = false
let trayTimerTick: NodeJS.Timeout | null = null
let trayTimerState = { baseMs: 0, snapshotAt: 0, isTracking: false }

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

    const status = await getBundyStatus()
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
  // onReconnect: SSE reconnects ~5s after server restart — check for app updates
  connectSSE(
    () => void refreshStatus(),
    () => autoUpdater.checkForUpdates().catch(() => {})
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
  return getBundyStatus()
})

ipcMain.handle('do-action', async (_event, action: string, note?: string) => {
  await doAction(action as 'clock-in' | 'clock-out' | 'break-start' | 'break-end', note)
  await pollAndPush()
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
  autoUpdater.quitAndInstall()
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
    // Auto-install 5 s after download — gives the user a brief window to click
    // "Restart Now" or just let it happen automatically.
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 5_000)
  })

  // Check on startup (delay 10s so the app is fully loaded first)
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10_000)
  // Fallback: check every 30 minutes (primary detection is via SSE reconnect)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1_000)

  tray = new Tray(getTrayIcon(false))
  tray.setToolTip('Bundy')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Bundy', click: togglePopup },
    { type: 'separator' },
    {
      label: 'Open in Browser',
      click: () => void shell.openExternal(store.get('apiBase') || 'https://bundy.40h.studio')
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])

  tray.on('click', togglePopup)
  tray.on('right-click', () => tray?.popUpContextMenu(contextMenu))

  // Auto-start services if token already stored
  if (store.get('desktopToken')) {
    startPoller()
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
  if (token) {
    // Await the quit call (marks offline + auto-break) before actually exiting
    breakOnQuit().finally(() => app.exit(0))
  } else {
    app.exit(0)
  }
})
