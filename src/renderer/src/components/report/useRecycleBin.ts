import { useState, useCallback, useRef } from 'react'

export interface RecycleBinItem {
  id: string
  type: string
  name: string
  deletedAt: string
  expiresAt: string
  expired: boolean
  parent?: string
  parentItemId?: string
  parentItemType?: string
  url?: string
  mimeType?: string | null
  size?: number
  deletedBy: { id: string; username: string; alias: string | null; avatarUrl: string | null } | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiFetch = (path: string, opts?: RequestInit) => Promise<any>

/**
 * Recycle-bin panel state for ReportPanel. Restoring an item also has
 * to refresh the sidebar + the current folder's contents — that's
 * threaded in via a ref so this hook can be called before the parent's
 * `loadClients` / `loadContents` are defined without ordering pain.
 */
export function useRecycleBin(apiFetch: ApiFetch, refreshOutsideHook: () => void) {
  const refreshRef = useRef(refreshOutsideHook)
  refreshRef.current = refreshOutsideHook
  const [show, setShow] = useState(false)
  const [items, setItems] = useState<RecycleBinItem[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const res = await apiFetch('/api/report/recycle-bin')
    if (res.ok) {
      const data = await res.json()
      setItems(data.items)
    }
    setLoading(false)
  }, [apiFetch])

  const restore = useCallback(async (id: string, type: string) => {
    const res = await apiFetch('/api/report/recycle-bin', {
      method: 'POST',
      body: JSON.stringify({ id, type }),
    })
    if (res.ok) {
      load() // reload to reflect cascade restore of children
      refreshRef.current() // sidebar + current folder
    }
  }, [apiFetch, load])

  const permanentDelete = useCallback(async (id: string, type: string) => {
    const res = await apiFetch(
      `/api/report/recycle-bin?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`,
      { method: 'DELETE' },
    )
    if (res.ok) {
      load() // reload to reflect cascade deletion of children
    }
  }, [apiFetch, load])

  return { show, setShow, items, loading, expanded, setExpanded, load, restore, permanentDelete }
}
