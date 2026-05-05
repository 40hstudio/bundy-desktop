import { useState, useCallback } from 'react'

export interface TreeProject { id: string; name: string; order: number }
export interface TreeClient { id: string; name: string; order: number; projects: TreeProject[] }
export interface TreeSelection { clientId: string; projectId: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiFetch = (path: string, opts?: RequestInit) => Promise<any>

/**
 * Sidebar tree state for ReportPanel — clients/projects, expand/collapse,
 * current selection. Pulled out as a hook so the parent isn't carrying
 * five tree-shaped useStates plus their loaders / togglers inline.
 *
 * The contents of the *currently-selected* folder (folders, documents,
 * files, links) deliberately stay in the parent — those are a different
 * concept and they're loaded via `loadContents(projectId, folderId)` which
 * needs the parent's broader context to refresh after CRUD operations.
 */
export function useReportTree(apiFetch: ApiFetch) {
  const [clients, setClients] = useState<TreeClient[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selection, setSelection] = useState<TreeSelection | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await apiFetch('/api/report/clients')
    if (res.ok) {
      const data = await res.json()
      setClients(data.clients)
    }
    setLoading(false)
  }, [apiFetch])

  const toggleExpand = useCallback((clientId: string) => {
    setExpanded(prev => ({ ...prev, [clientId]: !prev[clientId] }))
  }, [])

  return {
    clients, setClients,
    expanded, setExpanded,
    selection, setSelection,
    loading,
    load,
    toggleExpand,
  }
}
