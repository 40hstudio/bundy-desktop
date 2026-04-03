import React from 'react'
import { C } from '../../theme'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: React.ReactNode
  label?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ` — ${this.props.label}` : ''}]`, error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', width: '100%', padding: 32, gap: 16, textAlign: 'center',
        }}>
          <AlertTriangle size={36} color={C.warning} strokeWidth={1.5} />
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
            {this.props.label ? `${this.props.label} crashed` : 'Something went wrong'}
          </div>
          <div style={{
            fontSize: 12, color: C.textMuted, maxWidth: 400, lineHeight: 1.5,
            background: C.bgInput, borderRadius: 8, padding: '10px 14px',
            fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 120, overflowY: 'auto', textAlign: 'left',
          }}>
            {this.state.error?.message ?? 'Unknown error'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: C.accent, color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <RotateCcw size={14} />
            Retry
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
