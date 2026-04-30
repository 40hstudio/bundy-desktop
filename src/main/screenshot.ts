import { desktopCapturer } from 'electron'
import { uploadScreenshot } from './api'
import { queueScreenshot } from './sync'
import { scheduleAtBoundary, trySendOrQueue } from './scheduler'

const WINDOW_MS = 10 * 60 * 1000 // 10-minute window
// Fire screenshot 5 seconds after the boundary so it doesn't race the activity heartbeat
const BOUNDARY_OFFSET_MS = 5_000

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
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    })

    const capturedAt = new Date().toISOString()

    await Promise.all(
      sources.map(async (source, index) => {
        const jpg = source.thumbnail.toJPEG(75)
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
