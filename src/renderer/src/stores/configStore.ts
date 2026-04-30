import { create } from 'zustand'
import type { ApiConfig } from '../types'
import { setApiClientConfig } from '../api/client'
import { setApiBase } from '../hooks/useApiConfig'

type ConfigState = {
  config: ApiConfig | null
  /** Set the global API config. Also propagates to the apiFetch client. */
  setConfig: (config: ApiConfig | null) => void
}

/**
 * Holds the API base URL + Bearer token returned by the main process.
 * Used by `apiFetch`, Avatar/AuthImage URL resolution, and any component
 * that needs the apiBase or token directly. Replaces prop-drilled `config`.
 */
export const useConfigStore = create<ConfigState>((set) => ({
  config: null,
  setConfig: (config) => {
    setApiClientConfig(config)
    setApiBase(config?.apiBase ?? '')
    set({ config })
  },
}))

/** Convenience selector: read the current config (may be null until ready). */
export const useConfig = (): ApiConfig | null => useConfigStore((s) => s.config)
