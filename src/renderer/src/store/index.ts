import { create } from 'zustand'
import type { BundyStatus, PlanItem, Permissions, ApiConfig } from '../types'

interface AppState {
  // API config (fetched once at startup, used by apiFetch)
  apiConfig: ApiConfig | null
  setApiConfig: (config: ApiConfig) => void

  // Status
  status: BundyStatus | null
  statusSnapshotAt: number
  setStatus: (status: BundyStatus) => void
  permissions: Permissions | null
  setPermissions: (perms: Permissions) => void

  // Online state
  isOnline: boolean
  queuedCount: number
  setOnlineState: (isOnline: boolean, queuedCount: number) => void
  syncToast: string | null
  setSyncToast: (msg: string | null) => void

  // Plan
  planItems: PlanItem[]
  setPlanItems: (items: PlanItem[]) => void
  projects: Array<{ id: string; name: string }>
  setProjects: (projects: Array<{ id: string; name: string }>) => void
  refreshPlan: () => Promise<void>
  refreshProjects: () => Promise<void>

  // Updates
  updateVersion: string | null
  downloadPercent: number | null
  updateDownloaded: boolean
  setUpdateAvailable: (version: string) => void
  setDownloadProgress: (percent: number) => void
  setUpdateDownloaded: () => void
  appVersion: string
  setAppVersion: (version: string) => void
}

export const useAppStore = create<AppState>()((set) => ({
  // API config
  apiConfig: null,
  setApiConfig: (apiConfig) => set({ apiConfig }),

  // Status
  status: null,
  statusSnapshotAt: 0,
  setStatus: (status) => set({ status, statusSnapshotAt: Date.now() }),
  permissions: null,
  setPermissions: (permissions) => set({ permissions }),

  // Online state
  isOnline: true,
  queuedCount: 0,
  setOnlineState: (isOnline, queuedCount) => set({ isOnline, queuedCount }),
  syncToast: null,
  setSyncToast: (syncToast) => set({ syncToast }),

  // Plan
  planItems: [],
  setPlanItems: (planItems) => set({ planItems }),
  projects: [],
  setProjects: (projects) => set({ projects }),
  refreshPlan: async () => {
    try {
      const plan = await window.electronAPI.getDailyPlan()
      set({ planItems: plan?.items ?? [] })
    } catch { /* non-fatal */ }
  },
  refreshProjects: async () => {
    try {
      const p = await window.electronAPI.getProjects()
      set({ projects: p })
    } catch { /* non-fatal */ }
  },

  // Updates
  updateVersion: null,
  downloadPercent: null,
  updateDownloaded: false,
  setUpdateAvailable: (version) => set({ updateVersion: version }),
  setDownloadProgress: (percent) => set({ downloadPercent: percent }),
  setUpdateDownloaded: () => set({ updateDownloaded: true, downloadPercent: 100 }),
  appVersion: '',
  setAppVersion: (appVersion) => set({ appVersion }),
}))

/** Reset store to initial state (call on logout to prevent data leaking across sessions). */
export function resetStore(): void {
  useAppStore.setState({
    apiConfig: null,
    status: null,
    statusSnapshotAt: 0,
    permissions: null,
    isOnline: true,
    queuedCount: 0,
    syncToast: null,
    planItems: [],
    projects: [],
    updateVersion: null,
    downloadPercent: null,
    updateDownloaded: false,
    appVersion: '',
  })
}

/** Seed the store with demo data when __DEMO_MODE__ is true. */
export function seedDemoState(): void {
  useAppStore.setState({
    apiConfig: { apiBase: 'http://localhost:0', token: 'demo' },
    status: { isClockedIn: true, onBreak: false, isTracking: true, elapsedMs: 4 * 3600_000 + 23 * 60_000, username: 'john.doe', role: 'developer' },
    statusSnapshotAt: Date.now(),
    permissions: { screen: 'granted', accessibility: true },
    planItems: [
      { id: 'demo-1', project: { id: 'p1', name: 'Bundy Web' }, details: 'Fix login page responsiveness', status: 'completed', outcome: null },
      { id: 'demo-2', project: { id: 'p2', name: 'Backend API' }, details: 'Write unit tests for auth module', status: 'planned', outcome: null },
      { id: 'demo-3', project: { id: 'p1', name: 'Bundy Web' }, details: 'Update README documentation', status: 'planned', outcome: null },
    ],
    projects: [{ id: 'p1', name: 'Bundy Web' }, { id: 'p2', name: 'Backend API' }, { id: 'p3', name: 'Desktop App' }],
    appVersion: '1.0.0-demo',
    isOnline: true,
    queuedCount: 0,
  })
}
