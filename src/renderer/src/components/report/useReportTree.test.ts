/**
 * useReportTree regression tests — covers load (clients populated +
 * loading flag flipped), toggleExpand idempotence, selection updates.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '../../test/renderHook'
import { useReportTree } from './useReportTree'

afterEach(() => { vi.restoreAllMocks() })

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

describe('useReportTree', () => {
  it('starts with loading=true + empty clients', () => {
    const { result } = renderHook(() => useReportTree(vi.fn()))
    expect(result.current.clients).toEqual([])
    expect(result.current.expanded).toEqual({})
    expect(result.current.selection).toBe(null)
    expect(result.current.loading).toBe(true)
  })

  it('load() populates clients + clears loading on 2xx', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({
      clients: [{ id: 'c1', name: 'Client A', order: 0, projects: [] }],
    }))
    const { result } = renderHook(() => useReportTree(apiFetch))
    await act(async () => { await result.current.load() })
    expect(apiFetch).toHaveBeenCalledWith('/api/report/clients')
    expect(result.current.clients).toHaveLength(1)
    expect(result.current.clients[0].name).toBe('Client A')
    expect(result.current.loading).toBe(false)
  })

  it('load() clears loading even on non-2xx (so the spinner doesn’t hang)', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(null, false, 500))
    const { result } = renderHook(() => useReportTree(apiFetch))
    await act(async () => { await result.current.load() })
    expect(result.current.clients).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('toggleExpand flips the boolean for that client', () => {
    const { result } = renderHook(() => useReportTree(vi.fn()))
    act(() => { result.current.toggleExpand('c1') })
    expect(result.current.expanded.c1).toBe(true)
    act(() => { result.current.toggleExpand('c1') })
    expect(result.current.expanded.c1).toBe(false)
  })

  it('toggleExpand on a new client doesn’t clear other clients’ flags', () => {
    const { result } = renderHook(() => useReportTree(vi.fn()))
    act(() => { result.current.toggleExpand('c1') })
    act(() => { result.current.toggleExpand('c2') })
    expect(result.current.expanded.c1).toBe(true)
    expect(result.current.expanded.c2).toBe(true)
  })

  it('setSelection updates the current selection', () => {
    const { result } = renderHook(() => useReportTree(vi.fn()))
    act(() => { result.current.setSelection({ clientId: 'c1', projectId: 'p1' }) })
    expect(result.current.selection).toEqual({ clientId: 'c1', projectId: 'p1' })
    act(() => { result.current.setSelection(null) })
    expect(result.current.selection).toBe(null)
  })

  it('setClients can be called externally (for SSE tree updates)', async () => {
    const { result } = renderHook(() => useReportTree(vi.fn()))
    act(() => {
      result.current.setClients([{ id: 'c1', name: 'External', order: 0, projects: [] }])
    })
    expect(result.current.clients).toHaveLength(1)
    expect(result.current.clients[0].name).toBe('External')
  })
})
