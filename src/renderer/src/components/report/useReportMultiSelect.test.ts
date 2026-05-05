/**
 * useReportMultiSelect regression tests — covers Cmd/Ctrl-click toggle,
 * auto-clear on navigation (selection / folder / view-mode change), and
 * the explicit clear() helper.
 *
 * The rubber-band marquee path uses real mouse events on document and
 * is hard to drive in jsdom — covered by manual smoke instead. The
 * Cmd-click logic is the audit-required correctness path.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '../../test/renderHook'
import { useReportMultiSelect } from './useReportMultiSelect'

afterEach(() => { vi.restoreAllMocks() })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clickEvent(opts: { meta?: boolean; ctrl?: boolean } = {}): any {
  return {
    metaKey: !!opts.meta,
    ctrlKey: !!opts.ctrl,
    button: 0,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: { closest: () => null } as unknown as HTMLElement,
  }
}

const baseDeps = { selectionId: 'p1' as string | undefined, folderId: null as string | null, viewMode: 'icons' }

describe('useReportMultiSelect — initial state', () => {
  it('starts with no selection + no rubber band', () => {
    const { result } = renderHook(() => useReportMultiSelect(baseDeps))
    expect(result.current.selectedItems.size).toBe(0)
    expect(result.current.rubberBand).toBe(null)
  })
})

describe('useReportMultiSelect — Cmd-click toggle', () => {
  it('Cmd-click adds the item to selection + returns true (handled)', () => {
    const { result } = renderHook(() => useReportMultiSelect(baseDeps))
    let handled = false
    act(() => {
      handled = result.current.handleItemClick(clickEvent({ meta: true }), {
        type: 'folder', id: 'f1', name: 'Notes',
      })
    })
    expect(handled).toBe(true)
    expect(result.current.selectedItems.size).toBe(1)
    expect(result.current.isItemSelected('folder', 'f1')).toBe(true)
  })

  it('Cmd-click on the same item again removes it', () => {
    const { result } = renderHook(() => useReportMultiSelect(baseDeps))
    act(() => {
      result.current.handleItemClick(clickEvent({ meta: true }), { type: 'folder', id: 'f1', name: 'Notes' })
    })
    expect(result.current.selectedItems.size).toBe(1)
    act(() => {
      result.current.handleItemClick(clickEvent({ meta: true }), { type: 'folder', id: 'f1', name: 'Notes' })
    })
    expect(result.current.selectedItems.size).toBe(0)
  })

  it('Ctrl-click works the same as Cmd-click (Windows path)', () => {
    const { result } = renderHook(() => useReportMultiSelect(baseDeps))
    act(() => {
      result.current.handleItemClick(clickEvent({ ctrl: true }), { type: 'document', id: 'd1', name: 'Spec' })
    })
    expect(result.current.isItemSelected('document', 'd1')).toBe(true)
  })

  it('plain click with non-empty selection clears it + returns false (not handled)', () => {
    const { result } = renderHook(() => useReportMultiSelect(baseDeps))
    // Build a selection first
    act(() => {
      result.current.handleItemClick(clickEvent({ meta: true }), { type: 'folder', id: 'f1', name: 'A' })
    })
    expect(result.current.selectedItems.size).toBe(1)
    // Plain click — should clear AND return false (so caller does default action)
    let handled = true
    act(() => {
      handled = result.current.handleItemClick(clickEvent(), { type: 'folder', id: 'f2', name: 'B' })
    })
    expect(handled).toBe(false)
    expect(result.current.selectedItems.size).toBe(0)
  })

  it('plain click with EMPTY selection just returns false (no state change)', () => {
    const { result } = renderHook(() => useReportMultiSelect(baseDeps))
    let handled = true
    act(() => {
      handled = result.current.handleItemClick(clickEvent(), { type: 'folder', id: 'f1', name: 'A' })
    })
    expect(handled).toBe(false)
    expect(result.current.selectedItems.size).toBe(0)
  })

  it('Cmd-click multiple different items accumulates', () => {
    const { result } = renderHook(() => useReportMultiSelect(baseDeps))
    act(() => {
      result.current.handleItemClick(clickEvent({ meta: true }), { type: 'folder', id: 'f1', name: 'A' })
    })
    act(() => {
      result.current.handleItemClick(clickEvent({ meta: true }), { type: 'document', id: 'd1', name: 'B' })
    })
    act(() => {
      result.current.handleItemClick(clickEvent({ meta: true }), { type: 'file', id: 'fi1', name: 'C' })
    })
    expect(result.current.selectedItems.size).toBe(3)
    expect(result.current.isItemSelected('folder', 'f1')).toBe(true)
    expect(result.current.isItemSelected('document', 'd1')).toBe(true)
    expect(result.current.isItemSelected('file', 'fi1')).toBe(true)
  })
})

describe('useReportMultiSelect — auto-clear on navigation', () => {
  it('clears when selectionId changes', () => {
    let deps = { ...baseDeps }
    const { result, rerender } = renderHook(() => useReportMultiSelect(deps))
    act(() => {
      result.current.handleItemClick(clickEvent({ meta: true }), { type: 'folder', id: 'f1', name: 'A' })
    })
    expect(result.current.selectedItems.size).toBe(1)
    deps = { ...baseDeps, selectionId: 'p2' }
    rerender()
    expect(result.current.selectedItems.size).toBe(0)
  })

  it('clears when folderId changes', () => {
    let deps = { ...baseDeps, folderId: null as string | null }
    const { result, rerender } = renderHook(() => useReportMultiSelect(deps))
    act(() => {
      result.current.handleItemClick(clickEvent({ meta: true }), { type: 'folder', id: 'f1', name: 'A' })
    })
    expect(result.current.selectedItems.size).toBe(1)
    deps = { ...baseDeps, folderId: 'subfolder-1' }
    rerender()
    expect(result.current.selectedItems.size).toBe(0)
  })

  it('clears when viewMode changes', () => {
    let deps = { ...baseDeps, viewMode: 'icons' }
    const { result, rerender } = renderHook(() => useReportMultiSelect(deps))
    act(() => {
      result.current.handleItemClick(clickEvent({ meta: true }), { type: 'folder', id: 'f1', name: 'A' })
    })
    expect(result.current.selectedItems.size).toBe(1)
    deps = { ...baseDeps, viewMode: 'list' }
    rerender()
    expect(result.current.selectedItems.size).toBe(0)
  })
})

describe('useReportMultiSelect — clear()', () => {
  it('clear() empties the selection', () => {
    const { result } = renderHook(() => useReportMultiSelect(baseDeps))
    act(() => {
      result.current.handleItemClick(clickEvent({ meta: true }), { type: 'folder', id: 'f1', name: 'A' })
      result.current.handleItemClick(clickEvent({ meta: true }), { type: 'document', id: 'd1', name: 'B' })
    })
    expect(result.current.selectedItems.size).toBe(2)
    act(() => { result.current.clear() })
    expect(result.current.selectedItems.size).toBe(0)
  })
})
