import ElectronStore from 'electron-store'

export interface PendingAction {
  action: string
  timestamp: number
}

interface StoreSchema {
  /** @deprecated TODO: Remove after next release — kept only for migration */
  desktopToken: string
  encryptedToken: string
  userId: string
  username: string
  role: string
  avatarUrl: string
  apiBase: string
  restartForUpdate: boolean
  pendingActions: PendingAction[]
}

const store = new ElectronStore<StoreSchema>({
  defaults: {
    desktopToken: '',
    encryptedToken: '',
    userId: '',
    username: '',
    role: '',
    avatarUrl: '',
    apiBase: 'https://bundy.40h.studio',
    restartForUpdate: false,
    pendingActions: []
  },
  encryptionKey: 'bundy-desktop-key-2024'
})

export default store
