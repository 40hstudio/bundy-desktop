import { create } from 'zustand'
import type { Auth } from '../types'

type AuthState = {
  auth: Auth | null
  setAuth: (auth: Auth | null) => void
}

/**
 * Currently logged-in user. App.tsx writes here after handleLogin/handleLogout;
 * downstream components read via `useAuth()` or the selector form.
 *
 * Note: the Auth type in types/index.ts is { userId, username, role, avatarUrl }.
 * App.tsx defines its own narrower local type — we standardise on the exported one here.
 */
export const useAuthStore = create<AuthState>((set) => ({
  auth: null,
  setAuth: (auth) => set({ auth }),
}))

export const useAuth = (): Auth | null => useAuthStore((s) => s.auth)
