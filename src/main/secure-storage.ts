import { safeStorage } from 'electron'
import store from './store'

export function getToken(): string {
  const encrypted = store.get('encryptedToken')
  if (!encrypted) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    }
    // Fallback: stored as plain base64
    return Buffer.from(encrypted, 'base64').toString('utf-8')
  } catch {
    store.set('encryptedToken', '')
    return ''
  }
}

export function setToken(token: string): void {
  if (!token) {
    store.set('encryptedToken', '')
    return
  }
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token)
    store.set('encryptedToken', encrypted.toString('base64'))
  } else {
    // Fallback: store as plain base64 when Keychain is unavailable
    store.set('encryptedToken', Buffer.from(token, 'utf-8').toString('base64'))
  }
}

export function clearToken(): void {
  store.set('encryptedToken', '')
}

/** One-time migration: re-encrypt old plaintext 'desktopToken' via safeStorage */
export function migrateToken(): void {
  const oldToken = store.get('desktopToken')
  if (oldToken) {
    setToken(oldToken)
    store.set('desktopToken', '')
  }
}
