import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { C } from '../../theme'

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> & {
  icon: ReactNode
  label: string
  size?: number
  active?: boolean
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 28, active, disabled, style, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      style={{
        width: size, height: size,
        borderRadius: 6,
        border: 'none',
        background: active ? C.bgActive : 'transparent',
        color: active ? C.text : C.textMuted,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: 0,
        ...style,
      }}
      {...rest}
    >
      {icon}
    </button>
  )
})

export default IconButton
