/**
 * useActivityLog regression tests — covers the load + paginate happy path
 * and the non-2xx fallback (load called but data not applied).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '../../test/renderHook'
import { useActivityLog } from './useActivityLog'

afterEach(() => { vi.restoreAllMocks() })

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('useActivityLog', () => {
  it('starts empty + not-loading', () => {
    const apiFetch = vi.fn()
    const { result } = renderHook(() => useActivityLog(apiFetch))
    expect(result.current.show).toBe(false)
    expect(result.current.logs).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.page).toBe(1)
    expect(result.current.total).toBe(0)
  })

  it('load() populates logs + paginates from server response', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({
      logs: [{ id: 'a', action: 'create', targetType: 'folder', targetId: 'f1', targetName: 'Notes', details: null, projectId: null, createdAt: '2026-05-01T00:00:00Z', projectName: null, clientName: null, user: { id: 'u1', username: 'alice', alias: null, avatarUrl: null } }],
      total: 137,
      page: 2,
    }))
    const { result } = renderHook(() => useActivityLog(apiFetch))
    await act(async () => { await result.current.load(2) })
    expect(apiFetch).toHaveBeenCalledWith('/api/report/audit-log?page=2&limit=50')
    expect(result.current.logs).toHaveLength(1)
    expect(result.current.total).toBe(137)
    expect(result.current.page).toBe(2)
    expect(result.current.loading).toBe(false)
  })

  it('load() defaults page=1', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ logs: [], total: 0, page: 1 }))
    const { result } = renderHook(() => useActivityLog(apiFetch))
    await act(async () => { await result.current.load() })
    expect(apiFetch).toHaveBeenCalledWith('/api/report/audit-log?page=1&limit=50')
  })

  it('non-2xx response leaves prior logs untouched but clears loading', async () => {
    const apiFetch = vi.fn()
    apiFetch.mockResolvedValueOnce(jsonResponse({ logs: [{ id: 'a' }], total: 1, page: 1 }))
    const { result } = renderHook(() => useActivityLog(apiFetch))
    await act(async () => { await result.current.load(1) })
    expect(result.current.logs).toHaveLength(1)
    apiFetch.mockResolvedValueOnce(jsonResponse(null, false, 500))
    await act(async () => { await result.current.load(2) })
    expect(result.current.logs).toHaveLength(1) // unchanged
    expect(result.current.loading).toBe(false)
  })

  it('setShow toggles the panel-visible flag', () => {
    const apiFetch = vi.fn()
    const { result } = renderHook(() => useActivityLog(apiFetch))
    act(() => { result.current.setShow(true) })
    expect(result.current.show).toBe(true)
    act(() => { result.current.setShow(false) })
    expect(result.current.show).toBe(false)
  })
})
