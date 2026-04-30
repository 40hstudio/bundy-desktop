/**
 * Window creation and management — popup, full-dashboard, call-float.
 */

import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import {
  popupWin, setPopupWin,
  fullNativeWin, setFullNativeWin,
  callFloatWin, setCallFloatWin,
  callFloatState, fullWindowIds,
  pendingUpdateVersion, pendingDownloadPercent, updateDownloaded,
} from './state'

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
      sandbox: true,
    },
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

export function flushUpdateState(): void {
  const targets = [popupWin, fullNativeWin].filter(
    (w): w is BrowserWindow => !!w && !w.isDestroyed()
  )
  for (const target of targets) {
    if (updateDownloaded) {
      target.webContents.send('update-downloaded')
    } else if (pendingUpdateVersion !== null) {
      target.webContents.send('update-available', { version: pendingUpdateVersion })
      if (pendingDownloadPercent !== null) {
        target.webContents.send('download-progress', { percent: pendingDownloadPercent })
      }
    }
  }
}

export function togglePopup(): void {
  // Dynamic import of tray from state to avoid reading stale reference at module load time
  const { tray } = require('./state') as typeof import('./state')
  if (!tray) return
  let win = popupWin
  if (!win || win.isDestroyed()) {
    win = createPopup()
    setPopupWin(win)
  }

  if (win.isVisible()) {
    win.hide()
    return
  }

  const bounds = tray.getBounds()
  const { width: winW } = win.getBounds()
  win.setPosition(
    Math.round(bounds.x + bounds.width / 2 - winW / 2),
    Math.round(bounds.y + bounds.height + 4),
    false
  )
  win.show()
  win.webContents.once('did-finish-load', () => flushUpdateState())
  flushUpdateState()
}

// ─── Full native window ───────────────────────────────────────────────────────

export async function openFullWindow(): Promise<void> {
  if (fullNativeWin && !fullNativeWin.isDestroyed()) {
    if (!fullNativeWin.isVisible()) fullNativeWin.show()
    fullNativeWin.focus()
    return
  }

  const win = new BrowserWindow({
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
      ...(is.dev ? { webSecurity: false } : {}),
    },
  })

  // Allow microphone + camera for WebRTC calls
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'microphone', 'camera', 'audioCapture', 'videoCapture'].includes(permission))
  })

  // Override CSP so the feedback-link iframe can load proxied content from the server
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob: https:; " +
          "media-src 'self' https:; " +
          "font-src 'self' data: https:; " +
          "connect-src 'self' https://bundy.40h.studio wss://livekit.40h.studio https://livekit.40h.studio; " +
          "frame-src 'self' https://bundy.40h.studio; " +
          "child-src 'self' https://bundy.40h.studio"
        ],
      },
    })
  })

  const wcId = win.webContents.id
  fullWindowIds.add(wcId)
  setFullNativeWin(win)

  win.on('closed', () => {
    fullWindowIds.delete(wcId)
    setFullNativeWin(null)
    if (!popupWin || popupWin.isDestroyed() || !popupWin.isVisible()) {
      app.dock?.hide()
    }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL + '#full')
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'full' })
  }

  win.webContents.once('did-finish-load', () => flushUpdateState())

  // Enable DevTools via Cmd+Option+I in dev mode only
  if (is.dev) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.meta && input.alt && input.key.toLowerCase() === 'i') {
        win.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  }

  app.dock?.show()
  win.show()
  win.focus()
}

// ─── Floating call window ─────────────────────────────────────────────────────

export async function openCallFloat(state: Record<string, unknown>): Promise<void> {
  if (callFloatWin && !callFloatWin.isDestroyed()) {
    callFloatWin.focus()
    return
  }

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize

  const win = new BrowserWindow({
    width: 300,
    height: 100,
    x: sw - 316,
    y: sh - 116,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    roundedCorners: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      ...(is.dev ? { webSecurity: false } : {}),
    },
  })

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  setCallFloatWin(win)

  win.on('closed', () => {
    if (callFloatWin) callFloatState.delete(callFloatWin.webContents.id)
    setCallFloatWin(null)
    if (fullNativeWin && !fullNativeWin.isDestroyed()) {
      fullNativeWin.webContents.send('call-float-action', { action: 'expand' })
    }
  })

  callFloatState.set(win.webContents.id, state)

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL + '#call-float')
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'call-float' })
  }

  win.show()
}

// ─── Broadcast helpers ────────────────────────────────────────────────────────

/** Send an IPC message to all open renderer windows. */
export function broadcastToAll(channel: string, ...args: unknown[]): void {
  const targets = [popupWin, fullNativeWin].filter(
    (w): w is BrowserWindow => !!w && !w.isDestroyed()
  )
  for (const win of targets) {
    win.webContents.send(channel, ...args)
  }
}
