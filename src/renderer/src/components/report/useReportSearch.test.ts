/**
 * useReportSearch regression tests — covers the 200ms debounced fetch,
 * minimum-length gate (queries < 2 chars skip the network), and reset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '../../test/renderHook'
import { useReportSearch } from './useReportSearch'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response
}

describe('useReportSearch', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useReportSearch(vi.fn()))
    expect(result.current.term).toBe('')
    expect(result.current.hits).toBe(null)
  })

  it('skips fetch when query is < 2 chars', async () => {
    const apiFetch = vi.fn()
    const { result } = renderHook(() => useReportSearch(apiFetch))
    act(() => { result.current.setTerm('a') })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(apiFetch).not.toHaveBeenCalled()
    expect(result.current.hits).toBe(null)
  })

  it('debounces — typing rapidly only fires the last query', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ hits: [] }))
    const { result } = renderHook(() => useReportSearch(apiFetch))
    act(() => { result.current.setTerm('te') })
    act(() => { result.current.setTerm('tes') })
    act(() => { result.current.setTerm('test') })
    // Advance halfway — nothing should fire yet
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(apiFetch).not.toHaveBeenCalled()
    // Now past the 200ms debounce
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    expect(apiFetch).toHaveBeenCalledOnce()
    expect(apiFetch).toHaveBeenCalledWith('/api/report/search?q=test')
  })

  it('populates hits from the response', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({
      hits: [{ kind: 'document', id: 'd1', label: 'Notes', projectId: 'p1', folderId: null, snippet: 'hello' }],
    }))
    const { result } = renderHook(() => useReportSearch(apiFetch))
    act(() => { result.current.setTerm('not') })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(result.current.hits).toHaveLength(1)
    expect(result.current.hits?.[0].label).toBe('Notes')
  })

  it('non-2xx response leaves hits unchanged', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ hits: [{ kind: 'client', id: 'c1', label: 'Acme', clientId: 'c1' }] }))
    const { result } = renderHook(() => useReportSearch(apiFetch))
    act(() => { result.current.setTerm('Acme') })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(result.current.hits).toHaveLength(1)
    apiFetch.mockResolvedValueOnce(jsonResponse(null, false))
    act(() => { result.current.setTerm('Beta') })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    // Non-ok kept previous results (no overwrite, no clear)
    expect(result.current.hits).toHaveLength(1)
  })

  it('clearing the term resets hits to null', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ hits: [{ kind: 'client', id: 'c1', label: 'Acme', clientId: 'c1' }] }))
    const { result } = renderHook(() => useReportSearch(apiFetch))
    act(() => { result.current.setTerm('Acme') })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(result.current.hits).toHaveLength(1)
    act(() => { result.current.setTerm('') })
    expect(result.current.hits).toBe(null)
  })

  it('whitespace-only term resets hits to null', async () => {
    const apiFetch = vi.fn()
    const { result } = renderHook(() => useReportSearch(apiFetch))
    act(() => { result.current.setTerm('   ') })
    expect(result.current.hits).toBe(null)
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
