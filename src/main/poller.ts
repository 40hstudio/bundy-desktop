/**
 * Status polling, SSE-driven refresh, midnight timer, and offline queue management.
 */

import { BrowserWindow, Notification, powerMonitor, systemPreferences } from 'electron'
import { autoUpdater } from 'electron-updater'
import store from './store'
import {
  getBundyStatus, sendDesktopHeartbeat,
  connectSSE, disconnectSSE, getDailyPlan,
  isServerReachable,
} from './api'
import { getToken } from './secure-storage'
import { startScreenshots, stopScreenshots } from './screenshot'
import { startActivity, stopActivity, getCurrentActivity, setOnRunningAppsChanged, setOnActiveAppChanged } from './activity'
import { syncOfflineData } from './sync'
import { startTrayTimer, stopTrayTimer, updateTray } from './tray'
import { openFullWindow, broadcastToAll } from './windows'
import {
  popupWin, fullNativeWin,
  setCachedStatus,
  setTrayTimerState,
} from './state'

// ─── Monitoring services ───────────────────────────────────────────────────────

export function stopServices(): void {
  stopScreenshots()
  stopActivity()
}

// ─── Offline / action queue helpers ───────────────────────────────────────────

export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return err instanceof TypeError || msg.includes('fetch') || msg.includes('network') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('abort') || msg.includes('timed out') || err.name === 'AbortError' || err.name === 'TimeoutError'
}

export function enqueueAction(action: string): void {
  const pending = store.get('pendingActions')
  store.set('pendingActions', [...pending, { action, timestamp: Date.now() }])
}

export async function drainActionQueue(): Promise<void> {
  const result = await syncOfflineData()
  if (result) {
    const total = result.synced.timeLogs + result.synced.screenshots + result.synced.activitySummaries
    if (total > 0) {
      broadcastOnlineState()
      broadcastToAll('sync-toast', { count: total, detail: result.synced })
    }
  }
}

export function broadcastOnlineState(): void {
  const pending = store.get('pendingActions')
  const pendingScreenshots = store.get('pendingScreenshots')
  const pendingActivity = store.get('pendingActivitySummaries')
  const pendingReport = store.get('pendingReport')
  const state = {
    isOnline: isServerReachable(),
    queuedCount: pending.length + pendingScreenshots.length + pendingActivity.length + (pendingReport ? 1 : 0),
  }
  broadcastToAll('online-state', state)
}

// ─── Status refresh (lightweight — no heartbeat POST) ──────────────────────

async function refreshStatus(): Promise<void> {
  if (!getToken()) return
  try {
    // Drain pending actions first so server state is up-to-date
    if (store.get('pendingActions').length > 0) {
      await drainActionQueue()
    }
    const [status, plan] = await Promise.all([
      getBundyStatus(),
      getDailyPlan().catch(() => null),
    ])
    // Skip server state override if there are still pending actions (local state is ahead)
    if (store.get('pendingActions').length > 0) return
    updateTray(status.isClockedIn, status.isTracking)
    setTrayTimerState({ baseMs: status.elapsedMs, snapshotAt: Date.now(), isTracking: status.isTracking })
    status.isTracking ? startTrayTimer() : stopTrayTimer()

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
      const scr = systemPreferences.getMediaAccessStatus('screen')
      const acc = systemPreferences.isTrustedAccessibilityClient(false)
      popupWin.webContents.send('permissions-update', { screen: scr, accessibility: acc })
    }
  } catch {
    // network error is non-fatal
  }
}

// ─── Full poll cycle (heartbeat + status + monitoring) ─────────────────────

export async function pollAndPush(): Promise<void> {
  if (!getToken()) return
  try {
    const heartbeatResult = await sendDesktopHeartbeat(
      getCurrentActivity(),
      powerMonitor.getSystemIdleTime() > 300,
    )
    broadcastOnlineState()

    if (heartbeatResult.midnightClockOut) handleMidnightClockOut()

    // Drain pending actions first to keep server in sync
    if (store.get('pendingActions').length > 0) {
      await drainActionQueue()
    }

    const status = await getBundyStatus()

    // Skip server state override if there are still pending actions (local state is ahead)
    if (store.get('pendingActions').length > 0) return

    setCachedStatus(status)
    updateTray(status.isClockedIn, status.isTracking)
    setTrayTimerState({ baseMs: status.elapsedMs, snapshotAt: Date.now(), isTracking: status.isTracking })
    status.isTracking ? startTrayTimer() : stopTrayTimer()

    if (status.isTracking) {
      startScreenshots()
      await startActivity()
    } else {
      stopScreenshots()
      stopActivity()
    }

    // Push status + permissions to both windows
    const scr = systemPreferences.getMediaAccessStatus('screen')
    const acc = systemPreferences.isTrustedAccessibilityClient(false)
    const perms = { screen: scr, accessibility: acc }

    for (const win of [popupWin, fullNativeWin].filter((w): w is BrowserWindow => !!w && !w.isDestroyed())) {
      win.webContents.send('status-update', status)
      win.webContents.send('permissions-update', perms)
    }

    // Handle server-enforced work limit break
    if (heartbeatResult.workLimitBreak) {
      const refreshed = await getBundyStatus()
      setCachedStatus(refreshed)
      updateTray(refreshed.isClockedIn, refreshed.isTracking)
      setTrayTimerState({ baseMs: refreshed.elapsedMs, snapshotAt: Date.now(), isTracking: refreshed.isTracking })
      if (!refreshed.isTracking) { stopTrayTimer(); stopScreenshots(); stopActivity() }
      broadcastToAll('status-update', refreshed)
      new Notification({
        title: 'Bundy — Daily Limit Reached',
        body: 'You have reached your daily work limit and have been set to break. Request overtime if you need to continue.',
      }).show()
    }
  } catch {
    // network error is non-fatal
  }
}

function handleMidnightClockOut(): void {
  stopScreenshots()
  stopActivity()
  void openFullWindow()
  new Notification({
    title: 'Bundy — Auto Clock-Out',
    body: 'You have been automatically clocked out at midnight. Clock in again if you need overtime.',
  }).show()
}

// ─── Midnight timer (WIB = UTC+7) ─────────────────────────────────────────

let midnightTimer: NodeJS.Timeout | null = null

function startMidnightTimer(): void {
  if (midnightTimer) return
  scheduleMidnightCheck()
}

function scheduleMidnightCheck(): void {
  const now = new Date()
  const wibNow = new Date(now.getTime() + 7 * 3600_000)
  const tomorrow = new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate() + 1))
  const midnightUtc = new Date(tomorrow.getTime() - 7 * 3600_000)
  const msUntilMidnight = midnightUtc.getTime() - now.getTime()
  const delay = Math.max(msUntilMidnight + 2000, 1000)
  midnightTimer = setTimeout(() => {
    midnightTimer = null
    void pollAndPush()
    scheduleMidnightCheck()
  }, delay)
}

function stopMidnightTimer(): void {
  if (midnightTimer) { clearTimeout(midnightTimer); midnightTimer = null }
}

// ─── Poller lifecycle ─────────────────────────────────────────────────────────

let statusPollerTimer: NodeJS.Timeout | null = null

export function startPoller(): void {
  if (statusPollerTimer) return
  sendDesktopHeartbeat(getCurrentActivity(), powerMonitor.getSystemIdleTime() > 300)
  void pollAndPush()
  statusPollerTimer = setInterval(() => void pollAndPush(), 30_000)
  startMidnightTimer()

  let appsHeartbeatTimer: NodeJS.Timeout | null = null
  const triggerAppsHeartbeat = (): void => {
    if (appsHeartbeatTimer) return
    appsHeartbeatTimer = setTimeout(() => { appsHeartbeatTimer = null }, 2_000)
    sendDesktopHeartbeat(getCurrentActivity(), powerMonitor.getSystemIdleTime() > 300).catch(() => {})
  }
  setOnRunningAppsChanged(triggerAppsHeartbeat)
  setOnActiveAppChanged(triggerAppsHeartbeat)

  connectSSE({
    onUpdate: () => void refreshStatus(),
    onReconnect: async () => {
      await drainActionQueue()
      autoUpdater.checkForUpdates().catch(() => {})
    },
    onTaskEvent: (event) => {
      // Fan out to every open renderer window. Each renderer dispatches a
      // CustomEvent that hooks/components listen for to update local state.
      // Fanout to popup + full dashboard. Call-float window doesn't show tasks.
      const allWindows = [popupWin, fullNativeWin].filter(
        (w): w is NonNullable<typeof w> => w != null && !w.isDestroyed(),
      )
      for (const w of allWindows) {
        w.webContents.send('task-event', event)
      }
    },
    onReportEvent: (event) => {
      // Same fan-out shape as onTaskEvent. Renderer dispatches a CustomEvent
      // that the report panel + chat preview cards listen for.
      const allWindows = [popupWin, fullNativeWin].filter(
        (w): w is NonNullable<typeof w> => w != null && !w.isDestroyed(),
      )
      for (const w of allWindows) {
        w.webContents.send('report-event', event)
      }
    },
    onCalendarEvent: (event) => {
      // Calendar SSE → all open windows. Only the renderer running
      // CalendarPanel actually subscribes; others ignore the event.
      const allWindows = [popupWin, fullNativeWin].filter(
        (w): w is NonNullable<typeof w> => w != null && !w.isDestroyed(),
      )
      for (const w of allWindows) {
        w.webContents.send('calendar-event', event)
      }
    },
  })
}

export function stopPoller(): void {
  disconnectSSE()
  stopMidnightTimer()
  if (statusPollerTimer) { clearInterval(statusPollerTimer); statusPollerTimer = null }
}
