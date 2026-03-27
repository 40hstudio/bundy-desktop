import { desktopCapturer } from 'electron'
import { uploadScreenshot } from './api'

const WINDOW_MS = 10 * 60 * 1000 // 10-minute window

let timer: NodeJS.Timeout | null = null

/**
 * Returns the ms remaining until the next 10-minute boundary (minute 0, 10, 20…)
 * plus a random offset within that next window so each capture fires at a
 * different time each cycle (e.g. boundary at :10 → fires somewhere :10–:19).
 */
function msUntilNextWindow(): number {
  const now = Date.now()
  const msIntoWindow = now % WINDOW_MS
  const msToNextBoundary = WINDOW_MS - msIntoWindow
  const jitter = Math.floor(Math.random() * WINDOW_MS)
  return msToNextBoundary + jitter
}

function scheduleNext(): void {
  timer = setTimeout(() => {
    void captureAll()
    scheduleNext()
  }, msUntilNextWindow())
}

export function startScreenshots(): void {
  if (timer) return
  scheduleNext()
}

export function stopScreenshots(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

async function captureAll(): Promise<void> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 2560, height: 1440 }
    })

    const capturedAt = new Date().toISOString()

    await Promise.all(
      sources.map(async (source, index) => {
        const thumbnail = source.thumbnail
        const png = thumbnail.toPNG()
        const imageBase64 = png.toString('base64')
        await uploadScreenshot(imageBase64, index, capturedAt)
      })
    )
  } catch (err) {
    console.error('[screenshot] capture failed:', err)
  }
}
