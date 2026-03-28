import ElectronStore from 'electron-store'

interface StoreSchema {
  desktopToken: string
  userId: string
  username: string
  role: string
  apiBase: string
  restartForUpdate: boolean
}

const store = new ElectronStore<StoreSchema>({
  defaults: {
    desktopToken: '',
    userId: '',
    username: '',
    role: '',
    apiBase: 'https://bundy.40h.studio',
    restartForUpdate: false
  },
  encryptionKey: 'bundy-desktop-key-2024'
})

export default store
