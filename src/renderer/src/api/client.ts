/**
 * Renderer-side API client.
 *
 * Replaces inline `fetch(\`${config.apiBase}/...\`, { headers: { Authorization: ... } })`
 * boilerplate that was scattered across 100+ call sites. Configure once
 * via `setApiClientConfig` (called from useApiConfig once the main process
 * returns the config), then use `apiFetch` everywhere.
 *
 * Phase 1 of offline-first lives here too: GETs whose path matches a
 * `cacheRules.ts` entry write their response to IndexedDB, and serve
 * the cached body when the network throws. Components see the staleness
 * via `useCacheStatus` and surface a "showing offline data" hint.
 */

import { get as idbGet, set as idbSet } from 'idb-keyval'
import type { ApiConfig } from '../types'
import { findCacheRule, findWriteRule, cacheKeyOf, metaKeyOf, pathnameOf } from './cacheRules'
import { useCacheStatus } from './cacheStatusStore'
import { enqueue, QueuedWriteError } from './writeQueue'
import { applyOptimisticPatches } from './optimisticCache'

let _config: ApiConfig | null = null
let _userId: string | null = null

export function setApiClientConfig(config: ApiConfig | null, userId?: string | null): void {
  _config = config
  if (userId !== undefined) _userId = userId
}

export function setApiClientUserId(userId: string | null): void {
  _userId = userId
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
  /** Phase 2 — temp id the caller minted for optimistic UI. Echoed back
   *  via `bundy-write-replayed` when the queued request eventually succeeds
   *  so the panel can swap the placeholder for the real server-assigned id. */
  tempId?: string
  /** Set false to opt out of the offline write queue for this specific
   *  call (e.g. you want the network error to surface so you can show
   *  a toast immediately). Defaults to true for write-rule matches. */
  enqueueOnFail?: boolean
}

/**
 * Single fetch wrapper for renderer code.
 * Throws ApiError on non-2xx responses (with `{error}` JSON message when present).
 * Returns parsed JSON, or `undefined` for empty bodies.
 */
export async function apiFetch<T = unknown>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  if (!_config) throw new ApiError(0, 'API client not initialized — wait for useApiConfig')
  const { method = 'GET', body, rawBody, headers, baseOverride, timeoutMs, signal, tempId, enqueueOnFail } = opts
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

  // Cache-aside read for whitelisted GETs. We try the network first;
  // on network error (offline / 5xx-ish), we fall back to IndexedDB.
  // Successful network responses are written through to the cache.
  const isGet = method === 'GET'
  const rule = isGet ? findCacheRule(pathnameOf(path)) : null
  const cacheKey = rule && _userId ? cacheKeyOf(_userId, path) : null
  const metaKey = rule && _userId ? metaKeyOf(_userId, path) : null

  try {
    const res = await fetch(url, init)
    if (!res.ok) {
      // Server reachable but errored — don't smuggle in cache (the error
      // is real and panel-level retry/empty state should handle it).
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      throw new ApiError(res.status, json.error ?? `HTTP ${res.status}`)
    }
    const text = await res.text()
    const parsed = (text ? JSON.parse(text) : undefined) as T
    if (cacheKey && metaKey) {
      const fetchedAt = Date.now()
      void idbSet(cacheKey, parsed)
      void idbSet(metaKey, { fetchedAt })
      useCacheStatus.getState().markCached(path, fetchedAt, false)
    }
    return parsed
  } catch (err) {
    // Genuine network failure — fall back to cache if we have one.
    if (cacheKey && metaKey && err instanceof TypeError) {
      const cached = await idbGet(cacheKey).catch(() => undefined)
      if (cached !== undefined) {
        const meta = (await idbGet(metaKey).catch(() => undefined)) as { fetchedAt: number } | undefined
        if (meta) useCacheStatus.getState().markCached(path, meta.fetchedAt, true)
        return cached as T
      }
    }
    // Phase 2 — write queue. Only network failures (TypeError) on
    // whitelisted writes get enqueued; 4xx/5xx still throw normally so
    // the user sees real errors immediately.
    if (err instanceof TypeError && method !== 'GET' && enqueueOnFail !== false) {
      const writeRule = findWriteRule(method, pathnameOf(path))
      if (writeRule) {
        const queuedBody = (() => {
          if (rawBody !== undefined) return typeof rawBody === 'string' ? rawBody : null
          if (body !== undefined) return JSON.stringify(body)
          return null
        })()
        // Idempotency-Key gets re-attached on replay; preserve any other headers.
        const queuedHeaders: Record<string, string> = { ...(headers ?? {}) }
        if (queuedBody !== null) queuedHeaders['Content-Type'] = 'application/json'
        const item = await enqueue({
          method: method as 'POST' | 'PATCH' | 'DELETE' | 'PUT',
          path,
          body: queuedBody,
          headers: queuedHeaders,
          kind: writeRule.kind,
          tempId,
        })
        // Patch the IndexedDB-cached GET responses so the optimistic
        // record survives panel re-mounts. Without this, switching tabs
        // erases the optimistic state because the panel re-fetches
        // from cache, and the cache doesn't yet know about the queued
        // write. (Bug surfaced after v1.5.1649.)
        if (_userId) {
          // The patcher reads fields out of the request body (title,
          // parentTaskId, content, …). Callers may pass `body` as a value
          // (which we JSON.stringify above) OR pass `rawBody` as the
          // already-stringified JSON (e.g., MessagesPanel and
          // TaskDetailDrawer's inline RequestInit-style wrappers). For the
          // latter we need to parse it back so the patcher sees an object.
          const patchBody: unknown = body !== undefined
            ? body
            : (typeof rawBody === 'string'
                ? (() => { try { return JSON.parse(rawBody) } catch { return undefined } })()
                : undefined)
          void applyOptimisticPatches({
            method: method as 'POST' | 'PATCH' | 'DELETE' | 'PUT',
            path: pathnameOf(path),
            body: patchBody,
            tempId: item.tempId ?? item.id,
            userId: _userId,
          })
        }
        throw new QueuedWriteError(item)
      }
    }
    throw err
  }
}

/** Build a server-relative URL into an absolute one (used by Avatar / AuthImage). */
export function resolveApiUrl(path: string): string {
  if (!_config) return path
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${_config.apiBase}${path}`
}
