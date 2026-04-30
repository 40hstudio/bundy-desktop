import { forwardRef, type CSSProperties, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { C, neu } from '../../theme'

/** The shared field style — used by Input, Textarea, Select. Identical to the
 * `fieldStyle` object that was duplicated across every modal. */
export const fieldStyle: CSSProperties = {
  ...neu(true),
  padding: '7px 10px',
  fontSize: 12,
  color: C.text,
  border: 'none',
  outline: 'none',
  width: '100%',
  fontFamily: 'inherit',
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, ...props }, ref) {
    return <input ref={ref} {...props} style={{ ...fieldStyle, ...style }} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ style, rows = 3, ...props }, ref) {
    return <textarea ref={ref} rows={rows} {...props} style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5, ...style }} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ style, children, ...props }, ref) {
    return <select ref={ref} {...props} style={{ ...fieldStyle, cursor: 'pointer', ...style }}>{children}</select>
  },
)

export default Input
