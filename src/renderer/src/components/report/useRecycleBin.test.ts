/**
 * useRecycleBin regression tests — covers load, restore (which fans out
 * to the parent's refresh callback), and permanentDelete.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '../../test/renderHook'
import { useRecycleBin } from './useRecycleBin'

afterEach(() => { vi.restoreAllMocks() })

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

describe('useRecycleBin', () => {
  it('starts empty + not-loading + collapsed', () => {
    const { result } = renderHook(() => useRecycleBin(vi.fn(), vi.fn()))
    expect(result.current.show).toBe(false)
    expect(result.current.items).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.expanded.size).toBe(0)
  })

  it('load() populates items from /api/report/recycle-bin', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({
      items: [
        { id: 'f1', type: 'folder', name: 'Old', deletedAt: '2026-04-01', expiresAt: '2026-05-01', expired: false, deletedBy: null },
      ],
    }))
    const { result } = renderHook(() => useRecycleBin(apiFetch, vi.fn()))
    await act(async () => { await result.current.load() })
    expect(apiFetch).toHaveBeenCalledWith('/api/report/recycle-bin')
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].id).toBe('f1')
  })

  it('restore() reloads recycle bin AND fires the external refresh callback', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true })) // restore POST
      .mockResolvedValueOnce(jsonResponse({ items: [] })) // reload GET
    const refresh = vi.fn()
    const { result } = renderHook(() => useRecycleBin(apiFetch, refresh))
    await act(async () => { await result.current.restore('f1', 'folder') })
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/report/recycle-bin', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ id: 'f1', type: 'folder' }),
    }))
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/report/recycle-bin')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refresh callback uses the latest reference (ref pattern, not stale closure)', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true, items: [] }))
    let calls = 0
    const refreshA = () => { calls += 1 }
    const refreshB = () => { calls += 100 }
    const { result, rerender } = renderHook(() => {
      // Simulate parent re-rendering with a new refresh function
      // (this is what would happen when parent's loadClients/loadContents
      // change reference each render).
      const refresh = (calls < 50 ? refreshA : refreshB)
      return useRecycleBin(apiFetch, refresh)
    })
    await act(async () => { await result.current.restore('f1', 'folder') })
    expect(calls).toBe(1) // refreshA fired
    rerender()
    await act(async () => { await result.current.restore('f2', 'folder') })
    // calls=1 < 50, so still refreshA — confirms the ref captures latest
    expect(calls).toBe(2)
  })

  it('permanentDelete() reloads the bin but does NOT fire the external refresh', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
    const refresh = vi.fn()
    const { result } = renderHook(() => useRecycleBin(apiFetch, refresh))
    await act(async () => { await result.current.permanentDelete('f1', 'folder') })
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/report/recycle-bin?id=f1&type=folder', { method: 'DELETE' })
    expect(refresh).not.toHaveBeenCalled() // permanent delete doesn't refresh sidebar
  })

  it('non-2xx restore response does NOT reload nor refresh', async () => {
    const apiFetch = vi.fn().mockResolvedValueOnce(jsonResponse(null, false, 500))
    const refresh = vi.fn()
    const { result } = renderHook(() => useRecycleBin(apiFetch, refresh))
    await act(async () => { await result.current.restore('f1', 'folder') })
    expect(apiFetch).toHaveBeenCalledTimes(1) // only the failed POST, no reload
    expect(refresh).not.toHaveBeenCalled()
  })
})
