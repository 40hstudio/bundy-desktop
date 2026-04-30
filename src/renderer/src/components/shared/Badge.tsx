import type { CSSProperties, ReactNode } from 'react'
import { C } from '../../theme'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: C.fillTertiary, fg: C.text },
  accent: { bg: C.accentLight, fg: C.accent },
  success: { bg: 'rgba(67, 181, 129, 0.18)', fg: C.success },
  warning: { bg: 'rgba(204, 167, 0, 0.18)', fg: C.warning },
  danger: { bg: 'rgba(240, 71, 71, 0.18)', fg: C.danger },
}

export default function Badge({ tone = 'neutral', children, style }: {
  tone?: BadgeTone
  children: ReactNode
  style?: CSSProperties
}) {
  const { bg, fg } = TONES[tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px',
      borderRadius: 999,
      background: bg, color: fg,
      fontSize: 11, fontWeight: 600,
      ...style,
    }}>
      {children}
    </span>
  )
}
