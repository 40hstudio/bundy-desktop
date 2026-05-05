import ElectronStore from 'electron-store'
import crypto from 'node:crypto'

export interface PendingAction {
  action: string
  timestamp: number
}

export interface PendingScreenshot {
  imageBase64: string
  displayIndex: number
  capturedAt: string
  format: 'png' | 'jpeg' | 'webp'
}

export interface PendingActivitySummary {
  windowStart: string
  mouseEvents: number
  keyEvents: number
  activeSeconds: number
  mouseActiveSeconds: number
  keyActiveSeconds: number
  totalSeconds: number
  topApps: Record<string, number>
  topUrls: Record<string, number>
}

export interface PendingReport {
  content: string
  planItems: Array<{ itemId: string; status: string; outcome?: string }>
  timestamp: number
}

interface StoreSchema {
  /** @deprecated TODO: Remove after next release — kept only for migration */
  desktopToken: string
  /** @deprecated Migrated to tokenDirect — kept only for migration from safeStorage */
  encryptedToken: string
  tokenDirect: string
  userId: string
  username: string
  role: string
  avatarUrl: string
  apiBase: string
  restartForUpdate: boolean
  deviceId: string
  pendingActions: PendingAction[]
  pendingScreenshots: PendingScreenshot[]
  pendingActivitySummaries: PendingActivitySummary[]
  pendingReport: PendingReport | null
}

const store = new ElectronStore<StoreSchema>({
  defaults: {
    desktopToken: '',
    encryptedToken: '',
    tokenDirect: '',
    userId: '',
    username: '',
    role: '',
    avatarUrl: '',
    apiBase: 'https://bundy.40h.studio',
    restartForUpdate: false,
    deviceId: '',
    pendingActions: [],
    pendingScreenshots: [],
    pendingActivitySummaries: [],
    pendingReport: null,
  },
  encryptionKey: 'bundy-desktop-key-2024'
})

/** Returns a stable device ID, generating one on first call. */
export function getDeviceId(): string {
  let id = store.get('deviceId')
  if (!id) {
    id = crypto.randomUUID()
    store.set('deviceId', id)
  }
  return id
}

export default store

/** Returns the configured API base URL. Single source of truth. */
export function getApiBase(): string {
  return store.get('apiBase')
}
