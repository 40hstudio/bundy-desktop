import { useState, useEffect } from 'react'
import type { ApiConfig } from '../types'

const DEMO_MODE = false // keep in sync with FullDashboard

/** @internal used by Avatar, AuthImage to resolve server-relative URLs */
export let apiBase = ''
export function setApiBase(base: string) { apiBase = base }

export function useApiConfig(): ApiConfig | null {
  const [config, setConfig] = useState<ApiConfig | null>(
    DEMO_MODE ? { apiBase: 'http://localhost:0', token: 'demo' } : null
  )
  useEffect(() => {
    if (DEMO_MODE) return
    window.electronAPI.getApiConfig().then(c => {
      setApiBase(c.apiBase)
      setConfig(c)
    }).catch(() => {})
  }, [])
  return config
}
