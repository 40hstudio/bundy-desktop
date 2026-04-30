import { useEffect, type RefObject } from 'react'

/**
 * Calls `onOutside` when a mousedown lands outside every provided ref.
 * Pass multiple refs when the "inside" surface is split (e.g. anchor + panel).
 */
export function useClickOutside(
  refs: RefObject<HTMLElement | null> | Array<RefObject<HTMLElement | null>>,
  onOutside: (e: MouseEvent) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return
    const refList = Array.isArray(refs) ? refs : [refs]
    function handler(e: MouseEvent): void {
      const target = e.target as Node
      for (const ref of refList) {
        if (ref.current?.contains(target)) return
      }
      onOutside(e)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, onOutside, ...(Array.isArray(refs) ? refs : [refs])])
}
