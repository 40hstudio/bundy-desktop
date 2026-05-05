/**
 * useReportMembers regression tests — load (parallel members + all-users
 * fetch), add, remove. add/remove are no-ops if no project is currently
 * shown — locks that guard in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '../../test/renderHook'
import { useReportMembers } from './useReportMembers'

afterEach(() => { vi.restoreAllMocks() })

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

describe('useReportMembers', () => {
  it('starts empty + closed', () => {
    const { result } = renderHook(() => useReportMembers(vi.fn()))
    expect(result.current.show).toBe(null)
    expect(result.current.members).toEqual([])
    expect(result.current.allUsers).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('load() fans out to BOTH /members AND /admin/users in parallel', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ members: [{ id: 'm1', role: 'reviewer', user: { id: 'u1', username: 'a', alias: null, avatarUrl: null, role: 'staff' } }] }))
      .mockResolvedValueOnce(jsonResponse({ users: [{ id: 'u2', username: 'b', alias: null, avatarUrl: null }] }))
    const { result } = renderHook(() => useReportMembers(apiFetch))
    await act(async () => { await result.current.load('proj-1') })
    expect(apiFetch).toHaveBeenCalledWith('/api/report/projects/proj-1/members')
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/users')
    expect(result.current.members).toHaveLength(1)
    expect(result.current.allUsers).toHaveLength(1)
  })

  it('add() is a no-op when no project is shown', async () => {
    const apiFetch = vi.fn()
    const { result } = renderHook(() => useReportMembers(apiFetch))
    await act(async () => { await result.current.add('u1', 'reviewer') })
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('remove() is a no-op when no project is shown', async () => {
    const apiFetch = vi.fn()
    const { result } = renderHook(() => useReportMembers(apiFetch))
    await act(async () => { await result.current.remove('u1') })
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('add() POSTs membership when a project is shown + reloads', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true })) // POST
      .mockResolvedValueOnce(jsonResponse({ members: [] })) // reload members
      .mockResolvedValueOnce(jsonResponse({ users: [] })) // reload users
    const { result } = renderHook(() => useReportMembers(apiFetch))
    act(() => { result.current.setShow({ projectId: 'p1', projectName: 'Proj' }) })
    await act(async () => { await result.current.add('u1', 'reviewer') })
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/report/projects/p1/members', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ userId: 'u1', role: 'reviewer' }),
    }))
    expect(apiFetch).toHaveBeenCalledTimes(3) // POST + the 2 reload fetches
  })

  it('remove() DELETEs membership and reloads', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true })) // DELETE
      .mockResolvedValueOnce(jsonResponse({ members: [] }))
      .mockResolvedValueOnce(jsonResponse({ users: [] }))
    const { result } = renderHook(() => useReportMembers(apiFetch))
    act(() => { result.current.setShow({ projectId: 'p1', projectName: 'Proj' }) })
    await act(async () => { await result.current.remove('u1') })
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/report/projects/p1/members?userId=u1', { method: 'DELETE' })
  })
})
