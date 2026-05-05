import { useState, useCallback } from 'react'

export type ReportMember = {
  id: string
  role: string
  user: { id: string; username: string; alias: string | null; avatarUrl: string | null; role: string }
}

export type ReportMemberCandidate = {
  id: string
  username: string
  alias: string | null
  avatarUrl: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiFetch = (path: string, opts?: RequestInit) => Promise<any>

/**
 * Project-members modal state for ReportPanel (P3.26). Loads both the
 * current member list and the all-users picker in parallel. Add/remove
 * call back into `load` to refresh.
 */
export function useReportMembers(apiFetch: ApiFetch) {
  const [show, setShow] = useState<{ projectId: string; projectName: string } | null>(null)
  const [members, setMembers] = useState<ReportMember[]>([])
  const [allUsers, setAllUsers] = useState<ReportMemberCandidate[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (projectId: string) => {
    setLoading(true)
    const [membersRes, usersRes] = await Promise.all([
      apiFetch(`/api/report/projects/${projectId}/members`),
      apiFetch('/api/admin/users'),
    ])
    if (membersRes.ok) setMembers((await membersRes.json()).members)
    if (usersRes.ok) {
      const data = await usersRes.json()
      setAllUsers(data.users ?? [])
    }
    setLoading(false)
  }, [apiFetch])

  const add = useCallback(async (userId: string, role: string) => {
    if (!show) return
    const res = await apiFetch(`/api/report/projects/${show.projectId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    })
    if (res.ok) load(show.projectId)
  }, [apiFetch, show, load])

  const remove = useCallback(async (userId: string) => {
    if (!show) return
    const res = await apiFetch(
      `/api/report/projects/${show.projectId}/members?userId=${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    )
    if (res.ok) load(show.projectId)
  }, [apiFetch, show, load])

  return { show, setShow, members, allUsers, loading, load, add, remove }
}
