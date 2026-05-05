/**
 * lightboxClaim — coordinates `bundy-open-lightbox` handlers across the
 * app so the topmost mounted overlay claims the event.
 *
 * The DMs panel, the task drawer, and the in-DMs task discussion mirror
 * all listen for inline-image clicks. Without coordination they'd each
 * open their own lightbox. With this stack, only the most recently
 * pushed claim runs — and its `stopImmediatePropagation` keeps the
 * other listeners (including MessagesPanel's default one) silent.
 *
 * Use via `useLightboxClaim` from a React component that has its own
 * lightbox state — the handler is auto-registered on mount and popped
 * on unmount, so the next visible layer takes over automatically.
 */
import { useEffect } from 'react'

/** Lightbox payload — image-style overlays use only url/filename, the
 * DMs gallery extends it with `items` for swipeable multi-image views. */
type ClaimDetail = {
  url: string
  filename: string
  items?: Array<{ url: string; filename: string }>
  index?: number
}
type ClaimHandler = (detail: ClaimDetail) => void

const stack: ClaimHandler[] = []
let installed = false

function ensureRootListener() {
  if (installed) return
  installed = true
  window.addEventListener('bundy-open-lightbox', (e: Event) => {
    const top = stack[stack.length - 1]
    if (!top) return
    const detail = (e as CustomEvent).detail as ClaimDetail | undefined
    if (!detail) return
    // Belt-and-braces: stopImmediatePropagation alone *should* keep the
    // bubble-phase listeners (e.g. MessagesPanel's) silent, but if any
    // future caller dispatches the event from a different target the
    // capture-phase guarantee weakens. preventDefault gives downstream
    // listeners a second hook (`if (e.defaultPrevented) return`) to be
    // safe against double-rendering a lightbox.
    e.preventDefault()
    e.stopImmediatePropagation()
    top(detail)
  }, { capture: true })
}

/**
 * Subscribe a lightbox-open handler for as long as the calling
 * component is mounted. The most recently mounted subscriber wins.
 */
export function useLightboxClaim(handler: ClaimHandler) {
  useEffect(() => {
    ensureRootListener()
    stack.push(handler)
    return () => {
      const idx = stack.lastIndexOf(handler)
      if (idx >= 0) stack.splice(idx, 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
