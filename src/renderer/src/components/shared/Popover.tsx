import { useRef, type CSSProperties, type ReactNode } from 'react'
import { C } from '../../theme'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useEscapeKey } from '../../hooks/useEscapeKey'

export type PopoverPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'

export type PopoverProps = {
  open: boolean
  onClose: () => void
  /** Element relative to which the popover is positioned. */
  anchorRef: React.RefObject<HTMLElement | null>
  placement?: PopoverPlacement
  /** Pixel gap between anchor and popover. */
  offset?: number
  /** Close on Escape. Default true. */
  closeOnEscape?: boolean
  /** Close on outside click. Default true. */
  closeOnOutsideClick?: boolean
  zIndex?: number
  panelStyle?: CSSProperties
  children: ReactNode
}

export default function Popover({
  open, onClose, anchorRef, placement = 'bottom-start',
  offset = 6, closeOnEscape = true, closeOnOutsideClick = true,
  zIndex = 100, panelStyle, children,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useClickOutside([panelRef, anchorRef], onClose, open && closeOnOutsideClick)
  useEscapeKey(onClose, open && closeOnEscape)

  if (!open) return null

  const anchorRect = anchorRef.current?.getBoundingClientRect()
  if (!anchorRect) return null

  const isBottom = placement.startsWith('bottom')
  const isStart = placement.endsWith('start')

  const top = isBottom ? anchorRect.bottom + offset : undefined
  const bottom = !isBottom ? window.innerHeight - anchorRect.top + offset : undefined
  const left = isStart ? anchorRect.left : undefined
  const right = !isStart ? window.innerWidth - anchorRect.right : undefined

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top, bottom, left, right,
        zIndex,
        background: C.bgFloating,
        border: `1px solid ${C.materialBorder}`,
        borderRadius: 8,
        boxShadow: C.shadowMed,
        padding: 4,
        ...panelStyle,
      }}
    >
      {children}
    </div>
  )
}
