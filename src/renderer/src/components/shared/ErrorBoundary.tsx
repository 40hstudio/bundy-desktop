import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', gap: 12, padding: 24, textAlign: 'center',
          color: '#999', fontSize: 13,
        }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <div style={{ fontWeight: 600 }}>Something went wrong</div>
          <div style={{ fontSize: 11, color: '#666', maxWidth: 320, wordBreak: 'break-word' }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 8, padding: '8px 20px', fontSize: 12, fontWeight: 600,
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              background: 'rgba(255,255,255,0.05)', color: '#ccc', cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
