import ElectronStore from 'electron-store'

export interface PendingAction {
  action: string
  timestamp: number
}

interface StoreSchema {
  desktopToken: string
  userId: string
  username: string
  role: string
  apiBase: string
  restartForUpdate: boolean
  pendingActions: PendingAction[]
}

const store = new ElectronStore<StoreSchema>({
  defaults: {
    desktopToken: '',
    userId: '',
    username: '',
    role: '',
    apiBase: 'https://bundy.40h.studio',
    restartForUpdate: false,
    pendingActions: []
  },
  encryptionKey: 'bundy-desktop-key-2024'
})

export default store
