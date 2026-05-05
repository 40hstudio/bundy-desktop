import { useState, useCallback } from 'react'

export interface AuditLogEntry {
  id: string
  action: string
  targetType: string
  targetId: string
  targetName: string
  details: Record<string, unknown> | null
  projectId: string | null
  createdAt: string
  projectName: string | null
  clientName: string | null
  user: { id: string; username: string; alias: string | null; avatarUrl: string | null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiFetch = (path: string, opts?: RequestInit) => Promise<any>

/**
 * Activity Log panel state for ReportPanel — paginated audit-log feed.
 * Self-contained: nothing else in ReportPanel reads or writes these
 * fields, so lifting them into a hook removes 5 useStates from the
 * parent without changing any externally-visible behaviour.
 */
export function useActivityLog(apiFetch: ApiFetch) {
  const [show, setShow] = useState(false)
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    const res = await apiFetch(`/api/report/audit-log?page=${p}&limit=50`)
    if (res.ok) {
      const data = await res.json()
      setLogs(data.logs)
      setTotal(data.total)
      setPage(data.page)
    }
    setLoading(false)
  }, [apiFetch])

  return { show, setShow, logs, loading, page, total, load }
}
