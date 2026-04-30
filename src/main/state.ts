/**
 * Shared mutable state for the main process.
 *
 * Centralised here so that tray, windows, poller and IPC modules can
 * read / write without circular imports.
 */

import { BrowserWindow, Tray } from 'electron'
import type { BundyStatus } from './api'

// ─── Tray ──────────────────────────────────────────────────────────────────────
export let tray: Tray | null = null
export function setTray(t: Tray | null): void { tray = t }

// ─── Windows ───────────────────────────────────────────────────────────────────
export let popupWin: BrowserWindow | null = null
export function setPopupWin(w: BrowserWindow | null): void { popupWin = w }

export let fullNativeWin: BrowserWindow | null = null
export function setFullNativeWin(w: BrowserWindow | null): void { fullNativeWin = w }

export let callFloatWin: BrowserWindow | null = null
export function setCallFloatWin(w: BrowserWindow | null): void { callFloatWin = w }

export const callFloatState = new Map<number, Record<string, unknown>>()
export const fullWindowIds = new Set<number>()

// ─── Auto-update ───────────────────────────────────────────────────────────────
export let pendingUpdateVersion: string | null = null
export let pendingDownloadPercent: number | null = null
export let updateDownloaded = false

export function setPendingUpdateVersion(v: string | null): void { pendingUpdateVersion = v }
export function setPendingDownloadPercent(p: number | null): void { pendingDownloadPercent = p }
export function setUpdateDownloaded(d: boolean): void { updateDownloaded = d }

// ─── Cached status ─────────────────────────────────────────────────────────────
export let cachedStatus: BundyStatus | null = null
export function getCachedStatus(): BundyStatus | null { return cachedStatus }
export function setCachedStatus(s: BundyStatus | null): void { cachedStatus = s }

// ─── Tray timer snapshot ───────────────────────────────────────────────────────
export const trayTimerState = { baseMs: 0, snapshotAt: 0, isTracking: false }
export function setTrayTimerState(s: { baseMs: number; snapshotAt: number; isTracking: boolean }): void {
  trayTimerState.baseMs = s.baseMs
  trayTimerState.snapshotAt = s.snapshotAt
  trayTimerState.isTracking = s.isTracking
}
