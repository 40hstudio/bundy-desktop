import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'warning' | 'error'
export type BannerKind =
  | ToastKind
  | 'task-mention'
  | 'task-assigned'
  | 'task-discussion'
  | 'task-subtask'
  | 'task-status'

export type Toast = {
  id: string
  kind: BannerKind
  /** Short bold line — e.g. "Mentioned in Acme website" */
  title?: string
  /** Body text — e.g. "Rifkie: please check the staging URL". */
  message: string
  /** Optional auto-dismiss delay in ms. Pass 0 to require manual dismiss. Default 6000. */
  durationMs?: number
  /** Click-handler — when provided the banner becomes clickable. */
  onClick?: () => void
}

type NotificationsState = {
  toasts: Toast[]
  show: (toast: Omit<Toast, 'id'>) => string
  dismiss: (id: string) => void
  clear: () => void
}

/**
 * In-app banner queue. Surfaces SSE notifications as macOS-style banners on
 * the right edge of the window. The <NotificationBanner> component renders
 * the stack and handles per-banner dismiss + clear-all.
 */
export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  toasts: [],
  show: (input) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const toast: Toast = { id, durationMs: 6000, ...input }
    set((s) => ({ toasts: [...s.toasts, toast] }))
    if (toast.durationMs && toast.durationMs > 0) {
      setTimeout(() => get().dismiss(id), toast.durationMs)
    }
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}))
