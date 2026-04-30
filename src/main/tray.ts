/**
 * Tray icon and tray-title timer management.
 */

import { nativeImage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { formatMs } from './utils'
import { tray, trayTimerState } from './state'

let trayTimerTick: NodeJS.Timeout | null = null

export function startTrayTimer(): void {
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

export function stopTrayTimer(): void {
  if (trayTimerTick) {
    clearInterval(trayTimerTick)
    trayTimerTick = null
  }
  tray?.setTitle('')
}

export function getTrayIcon(isClockedIn: boolean): Electron.NativeImage {
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

export function updateTray(isClockedIn: boolean, isTracking: boolean): void {
  if (!tray) return
  tray.setImage(getTrayIcon(isClockedIn))
  tray.setToolTip(
    isTracking ? 'Bundy – Tracking' :
    isClockedIn ? 'Bundy – On break' :
    'Bundy – Not clocked in'
  )
}
