import { desktopCapturer, powerMonitor } from 'electron'
import { uploadScreenshot } from './api'
import { queueScreenshot } from './sync'
import { scheduleAtBoundary, trySendOrQueue } from './scheduler'
import { getInCall } from './activity'

const WINDOW_MS = 10 * 60 * 1000 // 10-minute window
// Fire screenshot 5 seconds after the boundary so it doesn't race the activity heartbeat
const BOUNDARY_OFFSET_MS = 5_000

// v1.5.2109 — storage-tier optimization (Lever 1 of the R2 free-tier plan):
// Activity screenshots only need to be readable enough to verify "user was at
// the machine and working on X". They are reviewed rarely and never need to be
// pixel-perfect. Capturing at 1440×810 instead of 1920×1080 cuts pixel count
// by ~44%, and JPEG quality 60 (vs 75) trims another ~25% of file bytes with
// no visible degradation for that use case. Combined: ~55% smaller per shot.
const CAPTURE_W = 1440
const CAPTURE_H = 810
const JPEG_QUALITY = 60

// Lever 2 — idle-aware capture: skip the shot when the user has had no
// keyboard/mouse input for ≥ IDLE_SKIP_SECONDS *and* isn't in a call.
// Why: a screensaver / lock-screen / "I went for coffee" capture has zero
// review value. The poller already uses 300s as the idle threshold for
// heartbeats, so we match it for consistency. Calls override the skip
// because someone presenting silently in a meeting still counts as working.
const IDLE_SKIP_SECONDS = 300

let stopFn: (() => void) | null = null

export function startScreenshots(): void {
  if (stopFn) return
  stopFn = scheduleAtBoundary({
    intervalMs: WINDOW_MS,
    offsetMs: BOUNDARY_OFFSET_MS,
    fn: () => { void captureAll() },
  })
}

export function stopScreenshots(): void {
  stopFn?.()
  stopFn = null
}

async function captureAll(): Promise<void> {
  try {
    const idleSeconds = powerMonitor.getSystemIdleTime()
    if (idleSeconds >= IDLE_SKIP_SECONDS && !getInCall()) {
      console.log(`[screenshot] skipping — idle ${idleSeconds}s, not in call`)
      return
    }

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: CAPTURE_W, height: CAPTURE_H },
    })

    const capturedAt = new Date().toISOString()

    await Promise.all(
      sources.map(async (source, index) => {
        const jpg = source.thumbnail.toJPEG(JPEG_QUALITY)
        const imageBase64 = jpg.toString('base64')
        const payload = { imageBase64, displayIndex: index, capturedAt, format: 'jpeg' as const }
        await trySendOrQueue(
          payload,
          (p) => uploadScreenshot(p.imageBase64, p.displayIndex, p.capturedAt, p.format),
          queueScreenshot,
        )
      }),
    )
  } catch (err) {
    console.error('[screenshot] capture failed:', err)
  }
}
