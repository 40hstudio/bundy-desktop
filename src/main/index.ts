/**
 * Main process entry point — thin orchestrator.
 *
 * Heavy logic lives in:
 *   state.ts    — shared mutable state
 *   tray.ts     — tray icon & timer
 *   windows.ts  — popup, full, call-float windows
 *   poller.ts   — polling, SSE, midnight timer, offline queue
 *   api.ts      — HTTP client
 *   activity.ts — keyboard/mouse/app monitoring
 */

import {
  app,
  desktopCapturer,
  ipcMain,
  Menu,
  Notification,
  powerMonitor,
  shell,
  systemPreferences,
  Tray,
} from 'electron'
import { autoUpdater } from 'electron-updater'
import store, { getApiBase } from './store'
import { exchangeToken, getBundyStatus, doAction, submitReport, getDailyPlan, ensureDailyPlan, getProjects, addPlanItem, updatePlanItem, deletePlanItem, submitReportWithPlan, setTokenExpiredHandler, isServerReachable, setOnlineStateChangeHandler, breakOnQuit } from './api'
import { initCrashReporter, sendUserReport } from './crash-reporter'
import { initErrorLogger, getErrorLogPath } from './error-logger'
import { getToken, setToken, clearToken, migrateToken } from './secure-storage'
import {
  setTray,
  popupWin, fullNativeWin,
  callFloatWin, callFloatState, fullWindowIds,
  cachedStatus, setCachedStatus,
  trayTimerState, setTrayTimerState,
  pendingUpdateVersion, pendingDownloadPercent, updateDownloaded,
  setPendingUpdateVersion, setPendingDownloadPercent, setUpdateDownloaded,
} from './state'
import { getTrayIcon, startTrayTimer, stopTrayTimer, updateTray } from './tray'
import { startScreenshots, stopScreenshots } from './screenshot'
import { startActivity, stopActivity } from './activity'
import { openFullWindow, flushUpdateState, openCallFloat } from './windows'
import { startPoller, stopPoller, stopServices, pollAndPush, isNetworkError, enqueueAction, broadcastOnlineState, drainActionQueue } from './poller'

// ─── IPC rate-limit guards ────────────────────────────────────────────────────
let lastLoginCall = 0
let lastDoActionCall = 0
let lastSubmitReportCall = 0

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-stored-auth', () => {
  const token = getToken()
  if (!token) return null
  return {
    userId: store.get('userId'),
    username: store.get('username'),
    role: store.get('role'),
    avatarUrl: store.get('avatarUrl') || null,
  }
})

ipcMain.handle('login', async (_event, shortToken: string) => {
  const now = Date.now()
  if (now - lastLoginCall < 3000) throw new Error('Please wait before trying again')
  lastLoginCall = now
  const os = await import('os')
  const deviceName = os.default.hostname()
  const result = await exchangeToken(shortToken, deviceName)
  setToken(result.desktopToken)
  store.set('userId', result.userId)
  store.set('username', result.username)
  store.set('role', result.role)
  store.set('avatarUrl', result.avatarUrl ?? '')
  startPoller()
  void openFullWindow()
  return result
})

ipcMain.handle('logout', async () => {
  try {
    if (isServerReachable()) {
      const status = await getBundyStatus()
      if (status.isClockedIn && !status.onBreak) {
        await doAction('break-start')
      }
    }
  } catch { /* best-effort */ }
  stopPoller()
  stopTrayTimer()
  stopServices()
  clearToken()
  store.set('userId', '')
  store.set('username', '')
  store.set('role', '')
  store.set('avatarUrl', '')
})

ipcMain.handle('get-status', async () => {
  try {
    const s = await getBundyStatus()
    setCachedStatus(s)
    return s
  } catch (err: unknown) {
    if (cachedStatus) return cachedStatus
    throw err
  }
})

// Compute the optimistic next status from a queued action — so the tray /
// dashboard reflect the user's INTENT immediately, even though the server
// hasn't acknowledged yet. Resolves the bug where clock-in offline reverted
// to the "Clock In" button after switching panels.
//
// v1.5.1651 — also updates `trayTimerState`, tray icon, and starts/stops
// screenshots + activity tracking. Without this, going on break offline
// stopped the in-app timer but the menu-bar tray title kept ticking, and
// screenshots/activity heartbeats kept firing during a break.
function applyOptimisticAction(action: string): void {
  const prev = cachedStatus
  if (!prev) return // no baseline to mutate; first poll after reconnect will fix
  const username = prev.username
  const role = prev.role
  // Freeze the live elapsed value at the moment of the action so the timer
  // doesn't snap back to the last polled value when the action takes effect.
  // (Tray title is `baseMs + (now - snapshotAt)` while tracking; mirror that.)
  const liveElapsed = trayTimerState.isTracking
    ? trayTimerState.baseMs + Math.max(0, Date.now() - trayTimerState.snapshotAt)
    : prev.elapsedMs
  const elapsed = liveElapsed
  let next: typeof prev
  switch (action) {
    case 'clock-in':
      next = { ...prev, isClockedIn: true, isTracking: true, onBreak: false, elapsedMs: elapsed, username, role }
      break
    case 'break-start':
      next = { ...prev, isClockedIn: true, isTracking: false, onBreak: true, elapsedMs: elapsed, username, role }
      break
    case 'break-end':
      next = { ...prev, isClockedIn: true, isTracking: true, onBreak: false, elapsedMs: elapsed, username, role }
      break
    case 'clock-out':
      next = { ...prev, isClockedIn: false, isTracking: false, onBreak: false, elapsedMs: 0, username, role }
      break
    default:
      return
  }
  setCachedStatus(next)

  // Mirror the side-effects the poller would normally apply when status
  // flips. Without this, the tray title keeps counting on break, screenshot
  // capture continues, and activity tracking keeps emitting heartbeats —
  // even though the in-app UI has correctly switched to "On break".
  setTrayTimerState({ baseMs: next.elapsedMs, snapshotAt: Date.now(), isTracking: next.isTracking })
  updateTray(next.isClockedIn, next.isTracking)
  if (next.isTracking) {
    startTrayTimer()
    startScreenshots()
    void startActivity()
  } else {
    stopTrayTimer()
    stopScreenshots()
    stopActivity()
  }
}

ipcMain.handle('do-action', async (_event, action: string, note?: string) => {
  const now = Date.now()
  if (now - lastDoActionCall < 2000) throw new Error('Please wait before trying again')
  lastDoActionCall = now
  if (!isServerReachable()) {
    enqueueAction(action)
    applyOptimisticAction(action) // ← so subsequent get-status reflects the queued action
    broadcastOnlineState()
    return
  }
  try {
    await doAction(action as 'clock-in' | 'clock-out' | 'break-start' | 'break-end', note)
    await pollAndPush()
  } catch (err) {
    if (isNetworkError(err)) {
      enqueueAction(action)
      applyOptimisticAction(action)
      broadcastOnlineState()
    } else {
      throw err
    }
  }
})

ipcMain.handle('submit-report', async (_event, content: string) => {
  const now = Date.now()
  if (now - lastSubmitReportCall < 5000) throw new Error('Please wait before submitting again')
  lastSubmitReportCall = now
  await submitReport(content)
  await pollAndPush()
})

ipcMain.handle('check-permissions', async () => {
  // P0-1 — these APIs are macOS-only. On Windows / Linux,
  // systemPreferences.getMediaAccessStatus('screen') doesn't exist on
  // the system in the way TCC does on macOS, and
  // isTrustedAccessibilityClient is undefined. Return a "granted" sentinel
  // so the renderer doesn't gate clock-in on a permission check that
  // can never be satisfied off macOS.
  if (process.platform !== 'darwin') {
    return { screen: 'granted', accessibility: true }
  }
  const screen = systemPreferences.getMediaAccessStatus('screen')
  const accessibility = systemPreferences.isTrustedAccessibilityClient(false)
  return { screen, accessibility }
})

ipcMain.handle('open-accessibility-settings', async () => {
  if (process.platform !== 'darwin') return
  await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
})

ipcMain.handle('open-screen-recording-settings', async () => {
  if (process.platform !== 'darwin') return
  await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
})

ipcMain.handle('open-external', async (_event, url: string) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('discord://'))) {
    await shell.openExternal(url)
  }
})

// Renderer pushes call state in/out so the activity engine can suppress
// idle while the user is in a LiveKit call (P2.9).
ipcMain.on('set-in-call', async (_event, value: boolean) => {
  const { setInCall } = await import('./activity')
  setInCall(!!value)
})

// Renderer pushes the currently-focused task so each heartbeat can be
// tagged with taskId (P2.10). Null = no task in focus.
ipcMain.on('set-current-task', async (_event, taskId: string | null) => {
  const { setCurrentTaskId } = await import('./activity')
  setCurrentTaskId(typeof taskId === 'string' ? taskId : null)
})

// P2.16 — Renderer pushes the currently-open report document. Mirrors
// set-current-task; tags ActivitySummary.reportDocumentId on next heartbeat.
ipcMain.on('set-current-report-document', async (_event, documentId: string | null) => {
  const { setCurrentReportDocumentId } = await import('./activity')
  setCurrentReportDocumentId(typeof documentId === 'string' ? documentId : null)
})

// P2.15 (DMs batch) — Renderer pushes the currently-focused DM/channel.
// Tags ActivitySummary.channelId on the next heartbeat so the rollup can
// populate `messagingSeconds`.
ipcMain.on('set-current-channel', async (_event, channelId: string | null) => {
  const { setCurrentChannelId } = await import('./activity')
  setCurrentChannelId(typeof channelId === 'string' ? channelId : null)
})

// Wave C-3 — Renderer pushes the currently-joined VC. Tags
// ActivitySummary.voiceChannelId on the next heartbeat so the rollup
// can credit time-spent-in-voice toward work hours.
ipcMain.on('set-current-voice-channel', async (_event, voiceChannelId: string | null) => {
  const { setCurrentVoiceChannelId } = await import('./activity')
  setCurrentVoiceChannelId(typeof voiceChannelId === 'string' ? voiceChannelId : null)
})

ipcMain.on('set-badge-count', (_event, count: number) => {
  if (app.setBadgeCount) app.setBadgeCount(count)
})

ipcMain.handle('show-notification', (_event, opts: { title: string; body: string }) => {
  if (Notification.isSupported()) {
    const notif = new Notification({ title: opts.title, body: opts.body })
    notif.on('click', () => {
      const win = fullNativeWin ?? popupWin
      if (win) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      }
    })
    notif.show()
  }
})

ipcMain.handle('get-version', () => app.getVersion())

ipcMain.handle('get-update-state', () => {
  return { version: pendingUpdateVersion, percent: pendingDownloadPercent, downloaded: updateDownloaded }
})

ipcMain.handle('check-for-updates', () => {
  autoUpdater.checkForUpdates().catch(() => {})
})

ipcMain.handle('install-update', () => {
  store.set('restartForUpdate', true)
  autoUpdater.quitAndInstall()
})

ipcMain.handle('open-full-window', () => void openFullWindow())

ipcMain.handle('focus-window', () => {
  const win = fullNativeWin ?? popupWin
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
})

ipcMain.handle('get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
  })
  return sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }))
})

ipcMain.handle('get-window-mode', (event) => {
  return fullWindowIds.has(event.sender.id) ? 'full' : 'popup'
})

// ─── Floating call window IPC ─────────────────────────────────────────────────

ipcMain.handle('open-call-float', async (_event, state: Record<string, unknown>) => {
  await openCallFloat(state)
})

ipcMain.handle('get-call-float-state', () => {
  if (callFloatWin && !callFloatWin.isDestroyed()) {
    return callFloatState.get(callFloatWin.webContents.id) ?? null
  }
  return null
})

ipcMain.handle('close-call-float', () => {
  if (callFloatWin && !callFloatWin.isDestroyed()) {
    callFloatState.delete(callFloatWin.webContents.id)
    callFloatWin.destroy()
  }
})

ipcMain.handle('update-call-float', (_event, state: Record<string, unknown>) => {
  if (callFloatWin && !callFloatWin.isDestroyed()) {
    callFloatWin.webContents.send('call-float-state', state)
  }
})

ipcMain.handle('call-float-action', (_event, action: Record<string, unknown>) => {
  if (callFloatWin && !callFloatWin.isDestroyed()) {
    callFloatWin.destroy()
  }
  if (fullNativeWin && !fullNativeWin.isDestroyed()) {
    fullNativeWin.webContents.send('call-float-action', action)
  }
})

ipcMain.handle('set-call-float-always-on-top', (_event, onTop: boolean) => {
  if (callFloatWin && !callFloatWin.isDestroyed()) {
    callFloatWin.setAlwaysOnTop(onTop)
  }
})

// ─── Daily plan & misc IPC ────────────────────────────────────────────────────

ipcMain.handle('get-api-config', async () => {
  return { apiBase: getApiBase(), token: getToken() }
})

ipcMain.handle('send-crash-report', async (_event, note: string) => {
  await sendUserReport(note)
})

ipcMain.handle('get-daily-plan', async () => getDailyPlan())
ipcMain.handle('ensure-daily-plan', async () => ensureDailyPlan())
ipcMain.handle('get-projects', async () => getProjects())

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

  migrateToken()

  setTokenExpiredHandler(() => {
    stopPoller()
    stopTrayTimer()
    stopServices()
    clearToken()
    store.set('userId', '')
    store.set('username', '')
    store.set('role', '')
    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.webContents.send('token-expired')
    }
  })

  setOnlineStateChangeHandler((online) => {
    if (online) void drainActionQueue().then(() => void pollAndPush())
    broadcastOnlineState()
  })

  initCrashReporter()
  initErrorLogger()
  console.log(`[error-logger] Errors are appended to: ${getErrorLogPath()}`)

  // ── Auto-updater ────────────────────────────────────────────────────────────
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    setPendingUpdateVersion(info.version)
    flushUpdateState()
  })
  autoUpdater.on('download-progress', (progress) => {
    setPendingDownloadPercent(Math.round(progress.percent))
    flushUpdateState()
  })
  autoUpdater.on('update-downloaded', () => {
    setUpdateDownloaded(true)
    setPendingDownloadPercent(100)
    flushUpdateState()
  })

  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10_000)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1_000)

  // ── Tray ────────────────────────────────────────────────────────────────────
  const trayInstance = new Tray(getTrayIcon(false))
  trayInstance.setToolTip('Bundy')
  setTray(trayInstance)

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => void openFullWindow() },
    { type: 'separator' },
    { label: 'Open in Browser', click: () => void shell.openExternal(getApiBase()) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])
  trayInstance.on('click', () => void openFullWindow())
  trayInstance.on('right-click', () => trayInstance.popUpContextMenu(contextMenu))

  // ── Auto-start if already logged in ─────────────────────────────────────────
  if (getToken()) {
    startPoller()
    void openFullWindow()

    if (store.get('restartForUpdate')) {
      store.set('restartForUpdate', false)
      setTimeout(async () => {
        try {
          const status = await getBundyStatus()
          if (status.isClockedIn && !status.isTracking) {
            await doAction('break-end')
            await pollAndPush()
          }
        } catch { /* non-fatal */ }
      }, 2_000)
    }
  }

  // ── Lid close / screen lock / shutdown → auto-break ────────────────────────
  async function autoBreakOnSuspend(): Promise<void> {
    if (!getToken()) return
    if (!cachedStatus?.isTracking) return
    try {
      await doAction('break-start')
    } catch {
      enqueueAction('break-start')
    }
  }
  powerMonitor.on('suspend', () => void autoBreakOnSuspend())
  powerMonitor.on('lock-screen', () => void autoBreakOnSuspend())
  powerMonitor.on('shutdown', () => void autoBreakOnSuspend())
})

app.on('window-all-closed', () => {
  // Keep running in tray
})

let isQuitting = false
app.on('before-quit', (event) => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  stopPoller()
  stopTrayTimer()
  stopServices()
  const token = getToken()
  if (token && !store.get('restartForUpdate')) {
    breakOnQuit().finally(() => app.exit(0))
  } else {
    app.exit(0)
  }
})
