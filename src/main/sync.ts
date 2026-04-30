/**
 * Offline-sync module.
 *
 * Queues screenshots and activity summaries locally when the server is
 * unreachable, then drains everything in a single POST to /api/desktop/sync
 * when connectivity is restored.
 */

import store from './store'
import type { PendingScreenshot, PendingActivitySummary } from './store'
import { getToken } from './secure-storage'
import { request } from './api'

// ─── Queue helpers ──────────────────────────────────────────────────────────

export function queueScreenshot(ss: PendingScreenshot): void {
  const queue = store.get('pendingScreenshots')
  // Cap at 200 to prevent store from growing too large (≈ ~20 hours of screenshots)
  if (queue.length >= 200) queue.shift()
  store.set('pendingScreenshots', [...queue, ss])
}

export function queueActivitySummary(summary: PendingActivitySummary): void {
  const queue = store.get('pendingActivitySummaries')
  if (queue.length >= 200) queue.shift()
  store.set('pendingActivitySummaries', [...queue, summary])
}

export function hasOfflineData(): boolean {
  return (
    store.get('pendingActions').length > 0 ||
    store.get('pendingScreenshots').length > 0 ||
    store.get('pendingActivitySummaries').length > 0 ||
    store.get('pendingReport') !== null
  )
}

// ─── Drain / sync ───────────────────────────────────────────────────────────

/** Send all queued offline data to the server in one batch. */
export async function syncOfflineData(): Promise<{ synced: { timeLogs: number; screenshots: number; activitySummaries: number } } | null> {
  if (!getToken()) return null

  const pendingActions = store.get('pendingActions')
  const pendingScreenshots = store.get('pendingScreenshots')
  const pendingActivitySummaries = store.get('pendingActivitySummaries')

  if (!pendingActions.length && !pendingScreenshots.length && !pendingActivitySummaries.length) {
    return null
  }

  try {
    const SCREENSHOT_BATCH_SIZE = 10
    let totalScreenshots = 0
    let totalTimeLogs = 0
    let totalActivitySummaries = 0

    // First batch: time logs + activity summaries (small payloads)
    if (pendingActions.length || pendingActivitySummaries.length) {
      try {
        const data = await request<{ synced: { timeLogs: number; activitySummaries: number } }>(
          '/api/desktop/sync',
          { method: 'POST', body: { timeLogs: pendingActions, activitySummaries: pendingActivitySummaries } },
        )
        totalTimeLogs = data.synced.timeLogs
        totalActivitySummaries = data.synced.activitySummaries
        // Clear only after confirmed delivery
        store.set('pendingActions', [])
        store.set('pendingActivitySummaries', [])
      } catch {
        // On failure: items stay in store — no data loss
      }
    }

    // Screenshot batches
    for (let i = 0; i < pendingScreenshots.length; i += SCREENSHOT_BATCH_SIZE) {
      const batch = pendingScreenshots.slice(i, i + SCREENSHOT_BATCH_SIZE)
      try {
        const data = await request<{ synced: { screenshots: number } }>(
          '/api/desktop/sync',
          { method: 'POST', body: { screenshots: batch } },
        )
        totalScreenshots += data.synced.screenshots
      } catch {
        // Stop sending remaining batches on failure
        break
      }
    }

    // Clear only the successfully sent screenshots
    if (totalScreenshots > 0) {
      const remaining = pendingScreenshots.slice(totalScreenshots)
      store.set('pendingScreenshots', remaining)
    }

    // Drain pending report (from offline clock-out)
    const pendingReport = store.get('pendingReport')
    if (pendingReport) {
      try {
        await request('/api/bundy/report', {
          method: 'POST',
          body: { content: pendingReport.content, planItems: pendingReport.planItems },
        })
        store.set('pendingReport', null)
      } catch { /* report stays queued */ }
    }

    return {
      synced: {
        timeLogs: totalTimeLogs,
        screenshots: totalScreenshots,
        activitySummaries: totalActivitySummaries,
      },
    }
  } catch {
    // Network still down — items remain in store, nothing lost
    return null
  }
}
