import { useEffect } from 'react'
import { useAppStore } from './index'

/**
 * Centralised IPC → Zustand bridge.
 * Call once at the app root (not inside call-float windows).
 * Subscribes to every push event from main and seeds initial state.
 * Pass `enabled = false` to skip all IPC (e.g. before auth or in demo mode).
 */
export function useIpcSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return

    const api = window.electronAPI
    const s = useAppStore.getState

    // ── Initial fetches ───────────────────────────────────────────────
    api.getApiConfig().then((c) => {
      s().setApiConfig(c)
    }).catch(() => {})
    api.getStatus().then((st) => s().setStatus(st)).catch(() => {})
    api.checkPermissions().then((p) => s().setPermissions(p)).catch(() => {})
    api.getVersion().then((v) => s().setAppVersion(v)).catch(() => {})
    api.getDailyPlan().then((p) => s().setPlanItems(p?.items ?? [])).catch(() => {})
    api.getProjects().then((p) => s().setProjects(p)).catch(() => {})
    api.getUpdateState().then(({ version, percent, downloaded }) => {
      if (downloaded) s().setUpdateDownloaded()
      else if (version) {
        s().setUpdateAvailable(version)
        if (percent !== null) s().setDownloadProgress(percent)
      }
    }).catch(() => {})

    // ── Subscriptions ─────────────────────────────────────────────────
    let toastTimer: ReturnType<typeof setTimeout> | null = null

    const unsubs = [
      api.onStatusUpdate((st) => s().setStatus(st)),
      api.onPermissionsUpdate((p) => s().setPermissions(p)),
      api.onPlanUpdate((plan) => s().setPlanItems(plan.items ?? [])),
      api.onOnlineState(({ isOnline, queuedCount }) => s().setOnlineState(isOnline, queuedCount)),
      api.onSyncToast(({ count }) => {
        const msg = `${count} action${count !== 1 ? 's' : ''} synced`
        s().setSyncToast(msg)
        if (toastTimer) clearTimeout(toastTimer)
        toastTimer = setTimeout(() => s().setSyncToast(null), 2500)
      }),
      api.onUpdateAvailable(({ version }) => s().setUpdateAvailable(version)),
      api.onDownloadProgress(({ percent }) => s().setDownloadProgress(percent)),
      api.onUpdateDownloaded(() => s().setUpdateDownloaded()),
    ]

    return () => {
      unsubs.forEach((fn) => fn())
      if (toastTimer) clearTimeout(toastTimer)
    }
  }, [enabled])
}
