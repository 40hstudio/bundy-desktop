import { desktopCapturer } from 'electron'
import { uploadScreenshot } from './api'

const INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

let timer: NodeJS.Timeout | null = null

export function startScreenshots(): void {
  if (timer) return
  // Take one shortly after start, then every 10 min
  void captureAll()
  timer = setInterval(() => void captureAll(), INTERVAL_MS)
}

export function stopScreenshots(): void {
  if (timer) {
    clearInterval(timer)
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
