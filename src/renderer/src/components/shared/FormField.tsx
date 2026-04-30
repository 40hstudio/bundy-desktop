import type { ReactNode } from 'react'
import { C } from '../../theme'

export default function FormField({ label, required, hint, error, children }: {
  label?: ReactNode
  required?: boolean
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      {label && (
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>
          {label}{required && ' *'}
        </div>
      )}
      {children}
      {hint && !error && (
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>{hint}</div>
      )}
      {error && (
        <div style={{ fontSize: 10, color: C.danger, marginTop: 4, fontWeight: 600 }}>{error}</div>
      )}
    </div>
  )
}
