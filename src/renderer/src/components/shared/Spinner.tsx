import { Loader } from 'lucide-react'
import { C } from '../../theme'

export default function Spinner({ size = 16, color = C.textMuted, label }: {
  size?: number
  color?: string
  label?: string
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color }}>
      <Loader size={size} />
      {label && <span style={{ fontSize: 12 }}>{label}</span>}
    </span>
  )
}
