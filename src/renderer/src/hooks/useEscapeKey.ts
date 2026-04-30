import { useEffect } from 'react'

/** Calls `onEscape` whenever the user presses the Escape key while `enabled`. */
export function useEscapeKey(onEscape: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    function handler(e: KeyboardEvent): void {
      if (e.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, onEscape])
}
