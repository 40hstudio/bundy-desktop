import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { Loader } from 'lucide-react'
import { C } from '../../theme'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  loadingText?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  /** Override the primary background (e.g. project color). Variant must be 'primary'. */
  bg?: string
  type?: 'button' | 'submit' | 'reset'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary', size = 'md', loading, loadingText,
    leftIcon, rightIcon, bg,
    disabled, children, style, type = 'button', ...rest
  },
  ref,
) {
  const padding = size === 'sm' ? '6px 14px' : '7px 16px'
  const fontSize = 12
  const isDisabled = disabled || loading

  let base: CSSProperties
  switch (variant) {
    case 'primary':
      base = {
        background: bg ?? C.accent, color: '#fff', border: 'none',
        fontWeight: 600,
      }
      break
    case 'danger':
      base = {
        background: C.danger, color: '#fff', border: 'none',
        fontWeight: 600,
      }
      break
    case 'ghost':
      base = {
        background: 'transparent', color: C.textMuted, border: 'none',
      }
      break
    case 'secondary':
    default:
      base = {
        background: C.lgBg, color: C.textMuted,
        border: `1px solid ${C.separator}`,
      }
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      style={{
        padding,
        borderRadius: 8,
        fontSize,
        cursor: isDisabled ? 'default' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: 'inherit',
        ...base,
        ...style,
      }}
      {...rest}
    >
      {loading ? <Loader size={size === 'sm' ? 11 : 12} /> : leftIcon}
      {loading && loadingText ? loadingText : children}
      {!loading && rightIcon}
    </button>
  )
})

export default Button
