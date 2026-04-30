import type { ReactNode } from 'react'
import { C } from '../../theme'

export default function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 8, padding: '40px 20px',
      color: C.textMuted, textAlign: 'center',
    }}>
      {icon && <div style={{ opacity: 0.6 }}>{icon}</div>}
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{title}</div>
      {description && <div style={{ fontSize: 12, color: C.textMuted, maxWidth: 360 }}>{description}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}
