import { useState, useRef, useEffect, useCallback } from 'react'
import type React from 'react'

export type SelectableItem = { type: 'folder' | 'document' | 'file' | 'link'; id: string; name: string }

const selKey = (type: string, id: string) => `${type}-${id}`

/**
 * Multi-select state for ReportPanel — Cmd/Ctrl-click toggle, rubber-band
 * marquee, automatic clear on navigation. Bulk-delete stays in the
 * parent because it needs the per-type delete handlers; the hook
 * exposes `clear()` so the parent can reset selection after the bulk op.
 *
 * Pass the current navigation triple so the hook can auto-clear when
 * the user changes folder / project / view mode.
 */
export function useReportMultiSelect(deps: {
  selectionId: string | undefined
  folderId: string | null
  viewMode: string
}) {
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectableItem>>(new Map())
  const [rubberBand, setRubberBand] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const contentAreaRef = useRef<HTMLDivElement>(null)

  const isItemSelected = useCallback((type: string, id: string) => {
    return selectedItems.has(selKey(type, id))
  }, [selectedItems])

  // Returns true when the click toggled selection (caller should NOT
  // do the normal "open / navigate" action). Returns false when the
  // click should fall through to default behaviour.
  const handleItemClick = useCallback((e: React.MouseEvent, item: SelectableItem): boolean => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault()
      e.stopPropagation()
      setSelectedItems(prev => {
        const next = new Map(prev)
        const k = selKey(item.type, item.id)
        if (next.has(k)) next.delete(k); else next.set(k, item)
        return next
      })
      return true
    }
    // If we have multi-selection and click without Cmd, clear
    setSelectedItems(prev => (prev.size > 0 ? new Map() : prev))
    return false
  }, [])

  const onContentMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey) return
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('[draggable="true"]')) return
    const rect = contentAreaRef.current?.getBoundingClientRect()
    if (!rect) return
    const startX = e.clientX
    const startY = e.clientY
    setRubberBand({ startX, startY, x: startX, y: startY })
    setSelectedItems(new Map())

    const onMouseMove = (ev: MouseEvent) => {
      setRubberBand({ startX, startY, x: ev.clientX, y: ev.clientY })
      if (!contentAreaRef.current) return
      const itemEls = contentAreaRef.current.querySelectorAll('[data-sel-type]')
      const next = new Map<string, SelectableItem>()
      const rx = Math.min(startX, ev.clientX), ry = Math.min(startY, ev.clientY)
      const rw = Math.abs(ev.clientX - startX), rh = Math.abs(ev.clientY - startY)
      itemEls.forEach(el => {
        const r = el.getBoundingClientRect()
        if (r.right > rx && r.left < rx + rw && r.bottom > ry && r.top < ry + rh) {
          const type = el.getAttribute('data-sel-type') as 'folder' | 'document' | 'file' | 'link'
          const id = el.getAttribute('data-sel-id')!
          const name = el.getAttribute('data-sel-name')!
          next.set(selKey(type, id), { type, id, name })
        }
      })
      setSelectedItems(next)
    }
    const onMouseUp = () => {
      setRubberBand(null)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  const clear = useCallback(() => setSelectedItems(new Map()), [])

  // Clear selection on navigation/view change.
  useEffect(() => {
    clear()
  }, [deps.selectionId, deps.folderId, deps.viewMode, clear])

  return {
    selectedItems,
    setSelectedItems,
    rubberBand,
    contentAreaRef,
    isItemSelected,
    handleItemClick,
    onContentMouseDown,
    clear,
  }
}
