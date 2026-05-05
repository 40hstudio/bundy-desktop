/**
 * Renderer-side error capture. Sends every uncaught error, unhandled
 * rejection, and `console.error` call to main via IPC, where they're
 * appended to a structured log file under the OS user-data dir.
 *
 * Initialise this exactly once, as early as possible. See main.tsx.
 */

interface RendererErrorPayload {
  level: 'error' | 'warn' | 'unhandled'
  message: string
  stack?: string
  url?: string
  userAgent?: string
  timestamp: string
}

function send(payload: RendererErrorPayload): void {
  try {
    // electronAPI is wired in preload/index.ts.
    const api = (window as unknown as { electronAPI?: { reportError?: (p: RendererErrorPayload) => void } }).electronAPI
    api?.reportError?.(payload)
  } catch { /* shouldn't happen — but never let the logger throw */ }
}

function stringifyArg(arg: unknown): string {
  if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`
  if (typeof arg === 'string') return arg
  try { return JSON.stringify(arg) } catch { return String(arg) }
}

let installed = false

export function initRendererErrorLogger(): void {
  if (installed) return
  installed = true

  // Wrap console.error so anything code logs gets persisted automatically.
  const originalConsoleError = console.error.bind(console)
  console.error = (...args: unknown[]): void => {
    originalConsoleError(...args)
    try {
      send({
        level: 'error',
        message: args.map(stringifyArg).join(' '),
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      })
    } catch { /* swallow */ }
  }

  // window.onerror — uncaught synchronous errors.
  window.addEventListener('error', (event) => {
    send({
      level: 'unhandled',
      message: event.message ?? 'Uncaught error',
      stack: event.error?.stack,
      url: event.filename ?? window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    })
  })

  // window.unhandledrejection — uncaught async errors.
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const msg = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    send({
      level: 'unhandled',
      message: msg,
      stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    })
  })
}
