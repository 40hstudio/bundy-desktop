import { useAppStore } from '../store'

/**
 * Centralized fetch wrapper that auto-injects apiBase and Authorization header.
 * Reads apiConfig from the Zustand store so callers don't need to pass config around.
 *
 * @param path - API path (e.g. '/api/tasks' or '/api/users')
 * @param init - Standard RequestInit options (method, body, etc.)
 * @returns The fetch Response (caller should check .ok)
 * @throws If apiConfig is not yet loaded
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const config = useAppStore.getState().apiConfig
  if (!config) throw new Error('apiFetch called before apiConfig is available')

  const headers = new Headers(init?.headers)
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${config.token}`)
  }
  if (!headers.has('Content-Type') && init?.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(`${config.apiBase}${path}`, { ...init, headers })
}

/** Convenience: GET JSON from the API. */
export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await apiFetch(path)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json()
}

/** Convenience: POST JSON to the API. */
export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json()
}

/** Fetch a full URL (not a path) with auto-injected auth header. For protected resources like images. */
export function apiFetchUrl(url: string, init?: RequestInit): Promise<Response> {
  const config = useAppStore.getState().apiConfig
  if (!config) throw new Error('apiFetchUrl called before apiConfig is available')
  const headers = new Headers(init?.headers)
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${config.token}`)
  }
  return fetch(url, { ...init, headers })
}

/** Get the current apiBase value for constructing URLs (e.g. image src). */
export function getApiBase(): string {
  return useAppStore.getState().apiConfig?.apiBase ?? ''
}
