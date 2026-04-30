import { safeStorage } from 'electron'
import store from './store'

// Token is stored directly in electron-store which already uses encryptionKey.
// No Keychain (safeStorage) needed — avoids the macOS password prompt on every rebuild.

export function getToken(): string {
  // First check the new direct-storage field
  const direct = store.get('tokenDirect')
  if (direct) return direct

  // Migrate from old safeStorage-encrypted field (one-time)
  const encrypted = store.get('encryptedToken')
  if (encrypted) {
    let token = ''
    try {
      if (safeStorage.isEncryptionAvailable()) {
        token = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      } else {
        token = Buffer.from(encrypted, 'base64').toString('utf-8')
      }
    } catch {
      // safeStorage decrypt failed — try as plain base64
      try { token = Buffer.from(encrypted, 'base64').toString('utf-8') } catch {}
    }
    if (token) {
      store.set('tokenDirect', token)
      store.set('encryptedToken', '')
    }
    return token
  }
  return ''
}

export function setToken(token: string): void {
  store.set('tokenDirect', token || '')
  store.set('encryptedToken', '')
}

export function clearToken(): void {
  store.set('tokenDirect', '')
  store.set('encryptedToken', '')
}

/** One-time migration: re-encrypt old plaintext 'desktopToken' via store */
export function migrateToken(): void {
  const oldToken = store.get('desktopToken')
  if (oldToken) {
    setToken(oldToken)
    store.set('desktopToken', '')
  }
}
