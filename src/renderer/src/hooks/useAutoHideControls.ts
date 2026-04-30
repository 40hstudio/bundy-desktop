import { useEffect, useRef, useState } from 'react'

/**
 * Returns `showControls` that auto-hides after `timeoutMs` of mouse inactivity
 * while `active` is true. Used by CallWidget and ConferenceWidget for the
 * fullscreen control bar (auto-hides 3 s after the last mousemove).
 *
 * When `active` is false, controls stay visible permanently.
 */
export function useAutoHideControls(active: boolean, timeoutMs = 3000): boolean {
  const [showControls, setShowControls] = useState(true)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!active) {
      setShowControls(true)
      return
    }
    function onMouseMove(): void {
      setShowControls(true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setShowControls(false), timeoutMs)
    }
    onMouseMove()
    window.addEventListener('mousemove', onMouseMove)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [active, timeoutMs])

  return showControls
}
