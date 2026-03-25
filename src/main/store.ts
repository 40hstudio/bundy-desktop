import ElectronStore from 'electron-store'

interface StoreSchema {
  desktopToken: string
  userId: string
  username: string
  role: string
  apiBase: string
}

const store = new ElectronStore<StoreSchema>({
  defaults: {
    desktopToken: '',
    userId: '',
    username: '',
    role: '',
    apiBase: 'https://bundy.40h.studio'
  },
  encryptionKey: 'bundy-desktop-key-2024'
})

export default store
