/**
 * Renderer-side API client.
 *
 * Replaces inline `fetch(\`${config.apiBase}/...\`, { headers: { Authorization: ... } })`
 * boilerplate that was scattered across 100+ call sites. Configure once
 * via `setApiClientConfig` (called from useApiConfig once the main process
 * returns the config), then use `apiFetch` everywhere.
 */

import type { ApiConfig } from '../types'

let _config: ApiConfig | null = null

export function setApiClientConfig(config: ApiConfig | null): void {
  _config = config
}

export function getApiClientConfig(): ApiConfig | null {
  return _config
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export type ApiFetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'
  /** JSON body. Will be stringified and Content-Type set to application/json. */
  body?: unknown
  /** Or a raw body (FormData, Blob, string). Skips JSON serialization. */
  rawBody?: BodyInit
  /** Extra headers. */
  headers?: Record<string, string>
  /** Override the configured API base for this call. */
  baseOverride?: string
  /** AbortSignal timeout in ms. */
  timeoutMs?: number
  /** AbortSignal from caller (e.g. cleanup). */
  signal?: AbortSignal
}

/**
 * Single fetch wrapper for renderer code.
 * Throws ApiError on non-2xx responses (with `{error}` JSON message when present).
 * Returns parsed JSON, or `undefined` for empty bodies.
 */
export async function apiFetch<T = unknown>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  if (!_config) throw new ApiError(0, 'API client not initialized — wait for useApiConfig')
  const { method = 'GET', body, rawBody, headers, baseOverride, timeoutMs, signal } = opts
  const url = `${baseOverride ?? _config.apiBase}${path}`

  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${_config.token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  }
  if (rawBody !== undefined) init.body = rawBody
  else if (body !== undefined) init.body = JSON.stringify(body)

  if (timeoutMs && signal) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    signal.addEventListener('abort', () => { clearTimeout(t); ctrl.abort() }, { once: true })
    init.signal = ctrl.signal
  } else if (timeoutMs) {
    init.signal = AbortSignal.timeout(timeoutMs)
  } else if (signal) {
    init.signal = signal
  }

  const res = await fetch(url, init)
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(res.status, json.error ?? `HTTP ${res.status}`)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** Build a server-relative URL into an absolute one (used by Avatar / AuthImage). */
export function resolveApiUrl(path: string): string {
  if (!_config) return path
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${_config.apiBase}${path}`
}
