import { useState, useRef, useCallback } from 'react'
import type React from 'react'

export type DragItem = { type: 'folder' | 'document' | 'file' | 'link'; id: string }

/**
 * Drag/drop state for ReportPanel. Owns the four state slots (dragOver
 * for the OS-file-drop overlay, draggingItem for in-app drag-to-move,
 * dropTargetId + dropColIdx for hover feedback) plus the stateless
 * helpers (enter/leave/over + item-start/end).
 *
 * The actual DROP handlers (onFolderDrop, onColumnDrop, handleDrop) stay
 * in the parent because they read/mutate the parent's content state
 * (folders, documents, files, links, selection, contents-loader). That
 * coupling is intentional — extracting them would be a wide interface
 * for negligible gain.
 */
export function useReportDrag() {
  const [dragOver, setDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const [draggingItem, setDraggingItem] = useState<DragItem | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [dropColIdx, setDropColIdx] = useState<number | null>(null)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setDragOver(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
  }, [])

  const onItemDragStart = useCallback((e: React.DragEvent, item: DragItem) => {
    setDraggingItem(item)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify(item))
    // v1.5.2207 — third attempt at drag-ghost positioning. Earlier tries
    // (v1.5.2205 setDragImage with click-point; v1.5.2206 clone-as-ghost
    // with click-point) both still showed visible offset on HiDPI.
    // Center-anchor is the most predictable: the cursor is always at the
    // middle of the ghost regardless of where the user clicked, so any
    // HiDPI math error becomes invisible (it'd just shift the center
    // slightly, but it's still centered around the cursor).
    try {
      const target = e.currentTarget as HTMLElement
      const rect = target.getBoundingClientRect()
      e.dataTransfer.setDragImage(target, rect.width / 2, rect.height / 2)
    } catch {
      // Some browsers throw if setDragImage is called after dragstart
      // returns; ignore — falls back to default ghost.
    }
  }, [])

  const onItemDragEnd = useCallback(() => {
    setDraggingItem(null)
    setDropTargetId(null)
    setDropColIdx(null)
  }, [])

  // Called by drop handlers in the parent after a successful file-drop
  // so the overlay clears and the counter resets even if onDragLeave
  // didn't fire (browsers are inconsistent during drop).
  const resetDragOver = useCallback(() => {
    setDragOver(false)
    dragCounterRef.current = 0
  }, [])

  return {
    dragOver,
    draggingItem, setDraggingItem,
    dropTargetId, setDropTargetId,
    dropColIdx, setDropColIdx,
    handleDragEnter, handleDragLeave, handleDragOver,
    onItemDragStart, onItemDragEnd,
    resetDragOver,
  }
}
