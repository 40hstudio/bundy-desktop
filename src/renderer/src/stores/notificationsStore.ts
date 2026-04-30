import { create } from 'zustand'

export type Toast = {
  id: string
  kind: 'info' | 'success' | 'warning' | 'error'
  message: string
  /** Optional auto-dismiss delay in ms. Pass 0 to require manual dismiss. */
  durationMs?: number
}

type NotificationsState = {
  toasts: Toast[]
  show: (toast: Omit<Toast, 'id'>) => string
  dismiss: (id: string) => void
  clear: () => void
}

/**
 * Lightweight toast queue. Components call `useNotifications().show({ kind, message })`
 * instead of inlining their own toast state. Render via a single <ToastTray>.
 */
export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  toasts: [],
  show: (input) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const toast: Toast = { id, durationMs: 4000, ...input }
    set((s) => ({ toasts: [...s.toasts, toast] }))
    if (toast.durationMs && toast.durationMs > 0) {
      setTimeout(() => get().dismiss(id), toast.durationMs)
    }
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}))
