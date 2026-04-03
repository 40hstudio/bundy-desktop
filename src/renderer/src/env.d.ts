import type { StoredAuth, BundyStatus, Permissions, DailyPlanData, PlanItemData } from '../../preload/index'

declare global {
  const __DEMO_MODE__: boolean
  interface Window {
    electronAPI: {
      getStoredAuth: () => Promise<StoredAuth | null>
      login: (shortToken: string) => Promise<StoredAuth>
      logout: () => Promise<void>
      getStatus: () => Promise<BundyStatus>
      doAction: (action: string, note?: string) => Promise<void>
      submitReport: (content: string) => Promise<void>
      checkPermissions: () => Promise<Permissions>
      openAccessibilitySettings: () => Promise<void>
      openScreenRecordingSettings: () => Promise<void>
      openExternal: (url: string) => Promise<void>
      checkForUpdates: () => Promise<void>
      installUpdate: () => Promise<void>
      setBadgeCount: (count: number) => void
      getVersion: () => Promise<string>
      getUpdateState: () => Promise<{ version: string | null; percent: number | null; downloaded: boolean }>
      onUpdateAvailable: (cb: (info: { version: string }) => void) => () => void
      onDownloadProgress: (cb: (info: { percent: number }) => void) => () => void
      onUpdateDownloaded: (cb: () => void) => () => void
      onStatusUpdate: (cb: (status: BundyStatus) => void) => () => void
      onPermissionsUpdate: (cb: (perms: Permissions) => void) => () => void
      onPlanUpdate: (cb: (plan: DailyPlanData) => void) => () => void
      onTokenExpired: (cb: () => void) => () => void
      sendCrashReport: (note: string) => Promise<void>
      openFullWindow: () => Promise<void>
      focusWindow: () => Promise<void>
      getWindowMode: () => Promise<'popup' | 'full'>
      getApiConfig: () => Promise<{ apiBase: string; token: string }>
      onOnlineState: (cb: (state: { isOnline: boolean; queuedCount: number }) => void) => () => void
      onSyncToast: (cb: (data: { count: number }) => void) => () => void
      getDailyPlan: () => Promise<DailyPlanData | null>
      ensureDailyPlan: () => Promise<DailyPlanData>
      getProjects: () => Promise<Array<{ id: string; name: string }>>
      addPlanItem: (projectName: string, details: string) => Promise<PlanItemData>
      updatePlanItem: (itemId: string, status?: string, outcome?: string) => Promise<PlanItemData>
      deletePlanItem: (itemId: string) => Promise<void>
      submitReportWithPlan: (content: string, planItems: Array<{ itemId: string; status: string; outcome?: string }>) => Promise<void>
      // Floating call window
      openCallFloat: (state: Record<string, unknown>) => Promise<void>
      getCallFloatState: () => Promise<Record<string, unknown> | null>
      closeCallFloat: () => Promise<void>
      updateCallFloat: (state: Record<string, unknown>) => Promise<void>
      sendCallFloatAction: (action: Record<string, unknown>) => Promise<void>
      onCallFloatState: (cb: (state: Record<string, unknown>) => void) => () => void
      onCallFloatAction: (cb: (action: Record<string, unknown>) => void) => () => void
      setCallFloatAlwaysOnTop: (onTop: boolean) => Promise<void>
      writeClipboard: (text: string) => void
    }
  }
}

interface BundyStatus {
  isClockedIn: boolean
  onBreak: boolean
  elapsedMs: number
  username: string
  role: string
}
