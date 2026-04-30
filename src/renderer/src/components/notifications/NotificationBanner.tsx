import { useState } from 'react'
import { X, AtSign, MessageSquare, GitBranch, UserCheck, Activity, Info, Check, AlertTriangle, AlertCircle } from 'lucide-react'
import { C } from '../../theme'
import { useNotificationsStore, type BannerKind } from '../../stores/notificationsStore'

/** Icon + accent for each banner kind. */
const KIND_META: Record<BannerKind, { icon: React.ReactNode; color: string }> = {
  'task-mention':     { icon: <AtSign size={16} />,        color: C.danger },
  'task-assigned':    { icon: <UserCheck size={16} />,     color: C.accent },
  'task-discussion':  { icon: <MessageSquare size={16} />, color: C.warning },
  'task-subtask':     { icon: <GitBranch size={16} />,     color: '#1a8ad4' },
  'task-status':      { icon: <Activity size={16} />,      color: C.success },
  'info':             { icon: <Info size={16} />,          color: C.accent },
  'success':          { icon: <Check size={16} />,         color: C.success },
  'warning':          { icon: <AlertTriangle size={16} />, color: C.warning },
  'error':            { icon: <AlertCircle size={16} />,   color: C.danger },
}

/**
 * macOS-style banner stack rendered top-right of the window.
 * Each banner can be dismissed individually, or all at once via "Clear all".
 * Auto-dismisses after `durationMs` (default 6 s) unless 0 is passed.
 */
export default function NotificationBanner() {
  const toasts = useNotificationsStore(s => s.toasts)
  const dismiss = useNotificationsStore(s => s.dismiss)
  const clear = useNotificationsStore(s => s.clear)
  const [hovered, setHovered] = useState(false)

  if (toasts.length === 0) return null

  // Most recent on top. Show last 5 so the stack doesn't dominate the viewport.
  const visible = toasts.slice(-5).reverse()
  const overflow = toasts.length - visible.length

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed', top: 16, right: 16, zIndex: 9000,
        display: 'flex', flexDirection: 'column', gap: 8,
        maxWidth: 360, pointerEvents: 'none',
      }}
    >
      {visible.map(t => {
        const meta = KIND_META[t.kind] ?? KIND_META.info
        return (
          <div
            key={t.id}
            onClick={() => {
              if (t.onClick) {
                t.onClick()
                dismiss(t.id)
              }
            }}
            style={{
              pointerEvents: 'auto',
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 12px', borderRadius: 12,
              background: 'rgba(20, 20, 20, 0.92)',
              border: `1px solid ${meta.color}55`,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              cursor: t.onClick ? 'pointer' : 'default',
              animation: 'bundyBannerIn 220ms ease',
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: `${meta.color}25`, color: meta.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>{meta.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {t.title && (
                <div style={{
                  fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{t.title}</div>
              )}
              <div style={{
                fontSize: 12, color: C.textSecondary, lineHeight: 1.4,
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{t.message}</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); dismiss(t.id) }}
              aria-label="Dismiss"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: C.textMuted, padding: 2, flexShrink: 0, display: 'flex',
              }}
            ><X size={14} /></button>
          </div>
        )
      })}
      {(overflow > 0 || (hovered && toasts.length > 1)) && (
        <button
          onClick={clear}
          style={{
            pointerEvents: 'auto',
            alignSelf: 'flex-end', marginTop: 4,
            padding: '4px 10px', borderRadius: 14,
            background: 'rgba(20,20,20,0.85)', color: C.textMuted, border: `1px solid ${C.separator}`,
            fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <X size={11} />
          {overflow > 0 ? `Clear all (${toasts.length})` : 'Clear all'}
        </button>
      )}
      <style>{`
        @keyframes bundyBannerIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
