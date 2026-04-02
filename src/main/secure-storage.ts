import { safeStorage } from 'electron'
import store from './store'

/**
 * Secure token storage using Electron's safeStorage API.
 * Uses macOS Keychain / Windows DPAPI / Linux libsecret to encrypt the bearer token.
 * The encrypted bytes are stored as base64 in electron-store under 'encryptedToken'.
 */

export function getToken(): string {
  const encrypted = store.get('encryptedToken')
  if (!encrypted) return ''
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    // Decryption failed (e.g. keychain entry was removed) — treat as no token
    store.set('encryptedToken', '')
    return ''
  }
}

export function setToken(token: string): void {
  if (!token) {
    store.set('encryptedToken', '')
    return
  }
  const encrypted = safeStorage.encryptString(token)
  store.set('encryptedToken', encrypted.toString('base64'))
}

export function clearToken(): void {
  store.set('encryptedToken', '')
}

/**
 * One-time migration: if an old plaintext/weak-encrypted 'desktopToken' exists
 * in the store, re-encrypt it via safeStorage and clear the old field.
 * Call this once at app startup (after app.whenReady()).
 */
export function migrateToken(): void {
  const oldToken = store.get('desktopToken')
  if (oldToken) {
    setToken(oldToken)
    store.set('desktopToken', '')
  }
}
