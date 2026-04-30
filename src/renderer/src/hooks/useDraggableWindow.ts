import { useEffect, useRef, useState, useCallback, type MouseEvent } from 'react'

export type DraggableWindowOptions = {
  /** Initial top-left position. */
  initial?: { x: number; y: number }
  /** Min space between right/bottom edge of viewport and the widget. */
  rightMargin?: number
  /** Min space between bottom edge of viewport and the widget. */
  bottomMargin?: number
}

/**
 * Generic draggable-floating-widget hook. Owns position state, mousemove/up
 * listeners, and viewport-bound clamping. The caller wires `position`,
 * `isDragging`, and `startDrag` to the widget root and the drag handle.
 *
 * Replaces the duplicated drag blocks in CallWidget, ConferenceWidget,
 * and FloatingCallOverlay (each had ~12 identical lines).
 */
export function useDraggableWindow({
  initial,
  rightMargin = 300,
  bottomMargin = 80,
}: DraggableWindowOptions = {}) {
  const [position, setPosition] = useState(
    initial ?? { x: window.innerWidth - 320, y: window.innerHeight - 240 },
  )
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: globalThis.MouseEvent): void => {
      const x = Math.max(0, Math.min(window.innerWidth - rightMargin, e.clientX - dragOffset.current.x))
      const y = Math.max(0, Math.min(window.innerHeight - bottomMargin, e.clientY - dragOffset.current.y))
      setPosition({ x, y })
    }
    const onUp = (): void => setIsDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging, rightMargin, bottomMargin])

  const startDrag = useCallback((e: MouseEvent): void => {
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    setIsDragging(true)
  }, [position.x, position.y])

  return { position, setPosition, isDragging, startDrag }
}
