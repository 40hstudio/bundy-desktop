/**
 * Renderer-side event capture. Logs UI events (clicks, keys, navigation,
 * state changes, errors) to the DevTools console and forwards them to
 * main for persistence in `events.log`. Pairs with `errorLogger.ts` —
 * errors continue to land in `error.log` via that pipeline; UI events
 * land in `events.log` so the two streams stay legible separately.
 *
 * Goals:
 *   - One init call wires global listeners; per-feature code only needs
 *     `track('name', { ...payload })` for state-only events that don't
 *     surface as DOM events.
 *   - Mark elements that need a friendly label with `data-track` (or an
 *     aria-label / title). The auto-click logger uses these in priority
 *     order so the event stream stays readable even on icon-only
 *     buttons.
 *   - High-throughput events (mousemove, scroll) are NOT captured.
 *     Click, dblclick, keydown for shortcuts, focus changes, and
 *     drag-end are.
 */

interface RendererEventPayload {
  ts: string
  kind: 'nav' | 'click' | 'dblclick' | 'key' | 'focus' | 'submit' | 'drag' | 'track' | 'log'
  name: string
  data?: Record<string, unknown>
  url?: string
}

interface ElectronEventBridge {
  reportEvent?: (p: RendererEventPayload) => void
}

function send(payload: RendererEventPayload): void {
  try {
    const api = (window as unknown as { electronAPI?: ElectronEventBridge }).electronAPI
    api?.reportEvent?.(payload)
  } catch { /* never let the logger throw */ }
}

let seq = 0
function emit(kind: RendererEventPayload['kind'], name: string, data?: Record<string, unknown>): void {
  seq += 1
  const payload: RendererEventPayload = {
    ts: new Date().toISOString(),
    kind,
    name,
    data,
    url: window.location?.hash || window.location?.pathname,
  }
  // Console: tagged for easy grep. seq lets you trace ordering when timestamps collide.
  // eslint-disable-next-line no-console
  console.info(`[evt#${seq}] ${kind}:${name}`, data ?? '')
  send(payload)
}

/**
 * Manually log a feature event. Use this for state changes that don't
 * surface as DOM events — file upload start, document save, call join,
 * settings toggled, etc.
 */
export function track(name: string, data?: Record<string, unknown>): void {
  emit('track', name, data)
}

/**
 * Best-effort label for a clicked element. Priority order:
 *   1. data-track attribute (explicit override)
 *   2. aria-label
 *   3. title
 *   4. text content (clamped)
 *   5. tag + role
 */
function describeElement(el: Element | null): { label: string; tag: string; role?: string; track?: string } {
  if (!el) return { label: '(none)', tag: '?' }
  // Walk up to the nearest element with data-track or actionable role.
  let target: Element | null = el
  for (let i = 0; i < 6 && target; i++) {
    const dataTrack = (target as HTMLElement).dataset?.track
    if (dataTrack) {
      return { label: dataTrack, tag: target.tagName.toLowerCase(), track: dataTrack }
    }
    const tag = target.tagName.toLowerCase()
    if (tag === 'button' || tag === 'a' || target.getAttribute('role') === 'button') break
    target = target.parentElement
  }
  if (!target) target = el
  const tag = target.tagName.toLowerCase()
  const role = target.getAttribute?.('role') ?? undefined
  const aria = target.getAttribute?.('aria-label')
  const title = target.getAttribute?.('title')
  const text = (target as HTMLElement).innerText?.replace(/\s+/g, ' ').trim()
  const label = aria || title || (text && text.length > 0 ? (text.length > 60 ? text.slice(0, 60) + '…' : text) : `${tag}${role ? `[role=${role}]` : ''}`)
  return { label, tag, role }
}

let installed = false

export function initEventLogger(): void {
  if (installed) return
  installed = true

  // ── Click capture ────────────────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    const target = e.target as Element | null
    const desc = describeElement(target)
    emit('click', desc.label, {
      tag: desc.tag,
      role: desc.role,
      track: desc.track,
      x: e.clientX, y: e.clientY,
      meta: e.metaKey, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey,
    })
  }, { capture: true })

  document.addEventListener('dblclick', (e) => {
    const desc = describeElement(e.target as Element | null)
    emit('dblclick', desc.label, { tag: desc.tag, role: desc.role, track: desc.track })
  }, { capture: true })

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  // Only log keys with a modifier — typing into inputs would otherwise flood
  // the stream. Letters/numbers without meta/ctrl are ignored.
  document.addEventListener('keydown', (e) => {
    const hasMod = e.metaKey || e.ctrlKey || e.altKey
    if (!hasMod && e.key.length === 1) return
    if (e.key === 'Shift' || e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') return
    const combo = [
      e.metaKey && '⌘', e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.key,
    ].filter(Boolean).join('+')
    emit('key', combo, { key: e.key, target: (e.target as HTMLElement)?.tagName?.toLowerCase() })
  }, { capture: true })

  // ── Form submits ─────────────────────────────────────────────────────────
  document.addEventListener('submit', (e) => {
    const desc = describeElement(e.target as Element | null)
    emit('submit', desc.label, { tag: desc.tag })
  }, { capture: true })

  // ── Focus / window state ─────────────────────────────────────────────────
  window.addEventListener('focus', () => emit('focus', 'window:focus'))
  window.addEventListener('blur', () => emit('focus', 'window:blur'))
  document.addEventListener('visibilitychange', () => emit('focus', `visibility:${document.visibilityState}`))

  // ── Drag end (cross-project / folder moves are surfaced through drop) ────
  // Drag start/end on the source element. The actual drop target's effect is
  // emitted via track() in the drop handlers since we have richer context
  // there.
  document.addEventListener('dragstart', (e) => {
    const desc = describeElement(e.target as Element | null)
    const dataTrack = (e.target as HTMLElement)?.dataset?.['selType']
    emit('drag', `start:${dataTrack ?? desc.tag}`, { label: desc.label })
  }, { capture: true })

  document.addEventListener('dragend', () => emit('drag', 'end'), { capture: true })

  // Errors continue to flow through errorLogger.ts — we don't double-handle
  // them here. But mirror unhandled rejections into the event stream too so
  // a single events.log gives the full timeline.
  window.addEventListener('error', (event) => {
    emit('log', 'error', { message: event.message, file: event.filename, line: event.lineno })
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const msg = reason instanceof Error ? reason.message : String(reason)
    emit('log', 'unhandledrejection', { message: msg })
  })

  emit('log', 'event-logger:init', { userAgent: navigator.userAgent.slice(0, 120) })
}

/**
 * Helper for the navigation transition. Pass through your existing
 * setTab — we log the from→to and call the original.
 */
export function trackedSetTab<T extends string>(setter: (t: T) => void, current: T): (next: T) => void {
  return (next: T) => {
    if (next !== current) emit('nav', `tab:${current}→${next}`, { from: current, to: next })
    setter(next)
  }
}
