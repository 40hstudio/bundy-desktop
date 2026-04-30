import { useEffect } from 'react'
import type { ApiConfig } from '../types'
import { useConfigStore } from '../stores/configStore'

/** @internal used by Avatar, AuthImage to resolve server-relative URLs */
export let apiBase = ''
export function setApiBase(base: string) { apiBase = base }

/**
 * Loads the API config from the main process on mount and writes it to the
 * global config store. Returns the current config (null until loaded).
 *
 * New code should prefer `useConfig()` from `stores/configStore` directly —
 * this hook remains for backward compatibility with existing call sites.
 */
export function useApiConfig(): ApiConfig | null {
  const config = useConfigStore((s) => s.config)
  const setConfig = useConfigStore((s) => s.setConfig)
  useEffect(() => {
    if (config) return
    window.electronAPI.getApiConfig().then(c => setConfig(c)).catch(() => {})
  }, [config, setConfig])
  return config
}
