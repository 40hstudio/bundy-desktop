import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface StoredAuth {
  userId: string
  username: string
  role: string
}

export interface BundyStatus {
  isClockedIn: boolean
  onBreak: boolean
  elapsedMs: number
  username: string
  role: string
}

export interface Permissions {
  screen: string
  accessibility: boolean
}

export interface PlanItemData {
  id: string
  projectId: string
  project: { id: string; name: string }
  details: string
  status: string
  outcome: string | null
  createdAt: string
  updatedAt: string
}

export interface DailyPlanData {
  id: string
  userId: string
  date: string
  items: PlanItemData[]
}

const api = {
  getStoredAuth: (): Promise<StoredAuth | null> => ipcRenderer.invoke('get-stored-auth'),
  login: (shortToken: string): Promise<StoredAuth> => ipcRenderer.invoke('login', shortToken),
  logout: (): Promise<void> => ipcRenderer.invoke('logout'),
  getStatus: (): Promise<BundyStatus> => ipcRenderer.invoke('get-status'),
  doAction: (action: string, note?: string): Promise<void> =>
    ipcRenderer.invoke('do-action', action, note),
  submitReport: (content: string): Promise<void> =>
    ipcRenderer.invoke('submit-report', content),
  checkPermissions: (): Promise<Permissions> => ipcRenderer.invoke('check-permissions'),
  openAccessibilitySettings: (): Promise<void> =>
    ipcRenderer.invoke('open-accessibility-settings'),
  openScreenRecordingSettings: (): Promise<void> =>
    ipcRenderer.invoke('open-screen-recording-settings'),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('open-external', url),
  getVersion: (): Promise<string> =>
    ipcRenderer.invoke('get-version'),
  getUpdateState: (): Promise<{ version: string | null; percent: number | null; downloaded: boolean }> =>
    ipcRenderer.invoke('get-update-state'),
  checkForUpdates: (): Promise<void> =>
    ipcRenderer.invoke('check-for-updates'),
  installUpdate: (): Promise<void> =>
    ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (cb: (info: { version: string }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { version: string }): void => cb(info)
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  },
  onDownloadProgress: (cb: (info: { percent: number }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { percent: number }): void => cb(info)
    ipcRenderer.on('download-progress', handler)
    return () => ipcRenderer.removeListener('download-progress', handler)
  },
  onUpdateDownloaded: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('update-downloaded', handler)
    return () => ipcRenderer.removeListener('update-downloaded', handler)
  },
  onStatusUpdate: (cb: (status: BundyStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: BundyStatus): void => cb(status)
    ipcRenderer.on('status-update', handler)
    return () => ipcRenderer.removeListener('status-update', handler)
  },
  onPermissionsUpdate: (cb: (perms: Permissions) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, perms: Permissions): void => cb(perms)
    ipcRenderer.on('permissions-update', handler)
    return () => ipcRenderer.removeListener('permissions-update', handler)
  },
  onPlanUpdate: (cb: (plan: DailyPlanData) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, plan: DailyPlanData): void => cb(plan)
    ipcRenderer.on('plan-update', handler)
    return () => ipcRenderer.removeListener('plan-update', handler)
  },
  onTokenExpired: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('token-expired', handler)
    return () => ipcRenderer.removeListener('token-expired', handler)
  },
  sendCrashReport: (note: string): Promise<void> =>
    ipcRenderer.invoke('send-crash-report', note),
  getDailyPlan: (): Promise<DailyPlanData | null> =>
    ipcRenderer.invoke('get-daily-plan'),
  ensureDailyPlan: (): Promise<DailyPlanData> =>
    ipcRenderer.invoke('ensure-daily-plan'),
  getProjects: (): Promise<Array<{ id: string; name: string }>> =>
    ipcRenderer.invoke('get-projects'),
  addPlanItem: (projectName: string, details: string): Promise<PlanItemData> =>
    ipcRenderer.invoke('add-plan-item', projectName, details),
  updatePlanItem: (itemId: string, status?: string, outcome?: string): Promise<PlanItemData> =>
    ipcRenderer.invoke('update-plan-item', itemId, status, outcome),
  deletePlanItem: (itemId: string): Promise<void> =>
    ipcRenderer.invoke('delete-plan-item', itemId),
  submitReportWithPlan: (content: string, planItems: Array<{ itemId: string; status: string; outcome?: string }>): Promise<void> =>
    ipcRenderer.invoke('submit-report-with-plan', content, planItems)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (for dev environments without context isolation)
  window.electron = electronAPI
  // @ts-ignore
  window.electronAPI = api
}
