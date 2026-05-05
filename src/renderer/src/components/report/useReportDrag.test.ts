/**
 * useReportDrag regression tests — covers the OS-file-drop overlay
 * counter, the in-app drag-to-move state, and the stateless event
 * helpers (enter/leave/over + item start/end).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '../../test/renderHook'
import { useReportDrag } from './useReportDrag'

afterEach(() => { vi.restoreAllMocks() })

// Build a minimal React.DragEvent stand-in. Real React.DragEvent has
// preventDefault / stopPropagation as methods + dataTransfer with types
// + setData / effectAllowed / dropEffect. Tests only need the shape.
function makeDragEvent(opts: {
  filesType?: boolean
  filesCount?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} = {}): any {
  const types: string[] = opts.filesType ? ['Files'] : []
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      types,
      files: { length: opts.filesCount ?? 0 },
      setData: vi.fn(),
      effectAllowed: '',
      dropEffect: '',
    },
  }
}

describe('useReportDrag — initial state', () => {
  it('starts with everything cleared', () => {
    const { result } = renderHook(() => useReportDrag())
    expect(result.current.dragOver).toBe(false)
    expect(result.current.draggingItem).toBe(null)
    expect(result.current.dropTargetId).toBe(null)
    expect(result.current.dropColIdx).toBe(null)
  })
})

describe('useReportDrag — OS file-drop overlay', () => {
  it('handleDragEnter on a Files-bearing event sets dragOver=true', () => {
    const { result } = renderHook(() => useReportDrag())
    const e = makeDragEvent({ filesType: true })
    act(() => { result.current.handleDragEnter(e) })
    expect(result.current.dragOver).toBe(true)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(e.stopPropagation).toHaveBeenCalled()
  })

  it('handleDragEnter without Files type does NOT set dragOver', () => {
    const { result } = renderHook(() => useReportDrag())
    act(() => { result.current.handleDragEnter(makeDragEvent({ filesType: false })) })
    expect(result.current.dragOver).toBe(false)
  })

  it('counter logic — enter twice + leave once keeps overlay visible', () => {
    // Browsers fire dragenter on each child crossing — the counter
    // pattern keeps overlay visible until ALL drags have left.
    const { result } = renderHook(() => useReportDrag())
    act(() => { result.current.handleDragEnter(makeDragEvent({ filesType: true })) })
    act(() => { result.current.handleDragEnter(makeDragEvent({ filesType: true })) })
    expect(result.current.dragOver).toBe(true)
    act(() => { result.current.handleDragLeave(makeDragEvent()) })
    // Counter is at 1 — still over a child.
    expect(result.current.dragOver).toBe(true)
    act(() => { result.current.handleDragLeave(makeDragEvent()) })
    // Counter is at 0 — overlay clears.
    expect(result.current.dragOver).toBe(false)
  })

  it('resetDragOver hard-clears the counter (used by drop handlers)', () => {
    const { result } = renderHook(() => useReportDrag())
    act(() => { result.current.handleDragEnter(makeDragEvent({ filesType: true })) })
    act(() => { result.current.handleDragEnter(makeDragEvent({ filesType: true })) })
    expect(result.current.dragOver).toBe(true)
    act(() => { result.current.resetDragOver() })
    expect(result.current.dragOver).toBe(false)
  })
})

describe('useReportDrag — in-app drag-to-move', () => {
  it('onItemDragStart sets draggingItem + writes dataTransfer', () => {
    const { result } = renderHook(() => useReportDrag())
    const e = makeDragEvent()
    act(() => {
      result.current.onItemDragStart(e, { type: 'folder', id: 'f1' })
    })
    expect(result.current.draggingItem).toEqual({ type: 'folder', id: 'f1' })
    expect(e.dataTransfer.effectAllowed).toBe('move')
    expect(e.dataTransfer.setData).toHaveBeenCalledWith(
      'text/plain',
      JSON.stringify({ type: 'folder', id: 'f1' }),
    )
  })

  it('onItemDragEnd clears all in-flight state', () => {
    const { result } = renderHook(() => useReportDrag())
    act(() => { result.current.onItemDragStart(makeDragEvent(), { type: 'document', id: 'd1' }) })
    act(() => { result.current.setDropTargetId('folder-x') })
    act(() => { result.current.setDropColIdx(2) })
    expect(result.current.draggingItem).not.toBe(null)
    expect(result.current.dropTargetId).toBe('folder-x')
    expect(result.current.dropColIdx).toBe(2)
    act(() => { result.current.onItemDragEnd() })
    expect(result.current.draggingItem).toBe(null)
    expect(result.current.dropTargetId).toBe(null)
    expect(result.current.dropColIdx).toBe(null)
  })

  it('handleDragOver always preventDefaults (so drops can fire)', () => {
    const { result } = renderHook(() => useReportDrag())
    const e = makeDragEvent()
    act(() => { result.current.handleDragOver(e) })
    expect(e.preventDefault).toHaveBeenCalled()
    expect(e.stopPropagation).toHaveBeenCalled()
  })
})
