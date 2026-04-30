/**
 * crash-reporter.ts
 *
 * Captures uncaught exceptions and unhandled promise rejections,
 * buffers them locally, and sends them to the server.
 */

import { app } from 'electron'
import { request } from './api'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

const MAX_BUFFER = 20 // max pending reports stored locally
const BUFFER_FILE = join(app.getPath('userData'), 'crash-reports.json')

interface CrashEntry {
  appVersion: string
  os: string
  error: string
  stack?: string
  context?: string
  timestamp: string
}

function loadBuffer(): CrashEntry[] {
  try {
    if (existsSync(BUFFER_FILE)) {
      return JSON.parse(readFileSync(BUFFER_FILE, 'utf-8'))
    }
  } catch { /* corrupted file */ }
  return []
}

function saveBuffer(entries: CrashEntry[]): void {
  try {
    writeFileSync(BUFFER_FILE, JSON.stringify(entries.slice(-MAX_BUFFER)))
  } catch { /* disk error — nothing we can do */ }
}

function getOsInfo(): string {
  const os = process.platform
  const arch = process.arch
  const release = process.getSystemVersion?.() ?? ''
  return `${os} ${arch} ${release}`.trim()
}

/** Buffer a crash locally and attempt to send it. */
function bufferAndSend(error: string, stack?: string, context?: string): void {
  const entry: CrashEntry = {
    appVersion: app.getVersion(),
    os: getOsInfo(),
    error,
    stack,
    context,
    timestamp: new Date().toISOString(),
  }

  const buf = loadBuffer()
  buf.push(entry)
  saveBuffer(buf)

  // Try to flush immediately
  void flushReports()
}

/** Send all buffered reports to the server. */
async function flushReports(): Promise<void> {
  const buf = loadBuffer()
  if (buf.length === 0) return

  const remaining: CrashEntry[] = []

  for (const entry of buf) {
    try {
      await request('/api/desktop/crash-report', { method: 'POST', body: entry, silent: true })
    } catch {
      remaining.push(entry) // network or HTTP error — retry later
    }
  }

  saveBuffer(remaining)
}

/** Send a user-initiated report (with optional note). */
export async function sendUserReport(note: string): Promise<void> {
  await request('/api/desktop/crash-report', {
    method: 'POST',
    body: {
      appVersion: app.getVersion(),
      os: getOsInfo(),
      error: 'User-submitted report',
      userNote: note,
    },
  })
}

/** Initialize crash capturing. Call once from app.whenReady(). */
export function initCrashReporter(): void {
  process.on('uncaughtException', (err) => {
    console.error('[crash-reporter] uncaughtException:', err)
    bufferAndSend(err.message, err.stack)
  })

  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    console.error('[crash-reporter] unhandledRejection:', msg)
    bufferAndSend(msg, stack)
  })

  // Flush any reports that failed to send last session
  void flushReports()
}
