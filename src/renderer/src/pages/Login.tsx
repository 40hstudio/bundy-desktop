import { useState } from 'react'

interface Props {
  onLogin: (auth: { userId: string; username: string; role: string }) => void
}

export default function Login({ onLogin }: Props): JSX.Element {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const t = token.trim().toUpperCase()
    if (t.length !== 6) {
      setError('Token must be 6 characters')
      return
    }
    setLoading(true)
    setError('')
    try {
      const auth = await window.electronAPI.login(t)
      onLogin(auth)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '24px',
        gap: '20px'
      }}
    >
      {/* Logo / Title */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '4px' }}>🕐</div>
        <div
          style={{
            fontSize: '20px',
            fontWeight: 700,
            letterSpacing: '-0.5px',
            color: 'var(--text)'
          }}
        >
          Bundy
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          Desktop Clock-In
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ width: '100%' }}>
        <div className="neu-inset" style={{ padding: '12px 16px', marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            DESKTOP TOKEN
          </div>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="XXXXXX"
            autoFocus
            spellCheck={false}
            style={{
              width: '100%',
              fontSize: '22px',
              letterSpacing: '6px',
              fontWeight: 700,
              color: 'var(--text)',
              textAlign: 'center',
              fontFamily: 'SF Mono, Menlo, monospace'
            }}
          />
        </div>

        {error && (
          <div
            style={{
              color: 'var(--danger)',
              fontSize: '11px',
              textAlign: 'center',
              marginBottom: '8px'
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || token.trim().length !== 6}
          className="neu-raised"
          style={{
            width: '100%',
            padding: '10px',
            fontWeight: 600,
            fontSize: '13px',
            color: loading ? 'var(--text-muted)' : 'var(--accent)',
            border: 'none',
            cursor: loading ? 'wait' : 'pointer',
            transition: 'box-shadow 0.15s ease'
          }}
        >
          {loading ? 'Connecting…' : 'Connect'}
        </button>
      </form>

      <button
        onClick={() => window.electronAPI.openExternal('discord://discord.com/channels/1212930840728702987/1482944295865421844')}
        style={{
          background: 'none',
          border: 'none',
          fontSize: '11px',
          color: 'var(--accent)',
          cursor: 'pointer',
          textDecoration: 'underline',
          padding: 0
        }}
      >
        Request a token via Discord →
      </button>

      <p style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
        Ask Bundy Bot on Discord for your token, then paste it above.
      </p>
    </div>
  )
}
