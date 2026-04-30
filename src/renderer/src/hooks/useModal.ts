import { useCallback, useState } from 'react'

export type ModalControls = {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  setOpen: (next: boolean) => void
}

/** Stable controls for an open/close UI surface (modal, drawer, menu). */
export function useModal(initial = false): ModalControls {
  const [isOpen, setOpen] = useState(initial)
  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((v) => !v), [])
  return { isOpen, open, close, toggle, setOpen }
}
