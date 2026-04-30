import { type ReactNode, type CSSProperties } from 'react'
import { X } from 'lucide-react'
import { C } from '../../theme'
import { useEscapeKey } from '../../hooks/useEscapeKey'

export type ModalProps = {
  open: boolean
  onClose: () => void
  title?: ReactNode
  width?: number | string
  maxHeight?: number | string
  /** Render under the title (e.g. tab bar). */
  headerExtra?: ReactNode
  /** Footer row, typically Buttons. */
  footer?: ReactNode
  /** When true, clicking the overlay closes the modal. Default true. */
  closeOnOverlay?: boolean
  /** When true, pressing Escape closes the modal. Default true. */
  closeOnEscape?: boolean
  /** When false, hide the X close button in the header. Default true. */
  showCloseButton?: boolean
  zIndex?: number
  bodyStyle?: CSSProperties
  children?: ReactNode
}

export default function Modal({
  open, onClose, title, width = 480, maxHeight = '85vh',
  headerExtra, footer,
  closeOnOverlay = true, closeOnEscape = true, showCloseButton = true,
  zIndex = 80, bodyStyle, children,
}: ModalProps) {
  useEscapeKey(onClose, open && closeOnEscape)

  if (!open) return null

  return (
    <div
      onMouseDown={closeOnOverlay ? (e) => { if (e.target === e.currentTarget) onClose() } : undefined}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width, maxHeight,
          background: C.lgBg,
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {(title || showCloseButton) && (
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '14px 18px',
            borderBottom: `1px solid ${C.separator}`,
          }}>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.text }}>{title}</span>
            {showCloseButton && (
              <button
                onClick={onClose}
                aria-label="Close"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 0, display: 'flex' }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        {headerExtra}
        <div style={{
          flex: 1, overflow: 'auto',
          padding: 18,
          display: 'flex', flexDirection: 'column', gap: 12,
          ...bodyStyle,
        }}>
          {children}
        </div>
        {footer && (
          <div style={{
            display: 'flex', gap: 8,
            padding: '12px 18px',
            borderTop: `1px solid ${C.separator}`,
            justifyContent: 'flex-end',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
