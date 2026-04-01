import { useState } from 'react'

interface Props {
  onLogin: (auth: { userId: string; username: string; role: string }) => void
}

// Inject keyframes once
const ANIM_ID = 'login-gradient-anim'
if (typeof document !== 'undefined' && !document.getElementById(ANIM_ID)) {
  const style = document.createElement('style')
  style.id = ANIM_ID
  style.textContent = `
    @keyframes loginGradientShift {
      0%   { background-position: 50% 10%, 50% 5%, 20% 90%; }
      33%  { background-position: 60% 15%, 40% 10%, 30% 85%; }
      66%  { background-position: 40% 8%, 55% 3%, 15% 95%; }
      100% { background-position: 50% 10%, 50% 5%, 20% 90%; }
    }
  `
  document.head.appendChild(style)
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
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: `
          radial-gradient(ellipse 80% 50%, rgba(0, 30, 120, 0.25) 0%, transparent 60%),
          radial-gradient(ellipse 60% 40%, rgba(100, 160, 255, 0.10) 0%, transparent 50%),
          radial-gradient(ellipse 50% 50%, rgba(0, 30, 120, 0.1) 0%, transparent 60%),
          #0e0e0e
        `,
        backgroundSize: '200% 200%, 200% 200%, 200% 200%, 100% 100%',
        animation: 'loginGradientShift 12s ease-in-out infinite',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: 380,
          padding: '36px 32px',
          gap: '20px',
          background: 'rgba(22, 22, 22, 0.5)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
      {/* Logo / Title */}
      <div style={{ textAlign: 'center' }}>
        <img
          src="workspace-logo.svg"
          alt="Bundy"
          style={{
            width: 56,
            height: 56,
            margin: '0 auto 8px',
            display: 'block',
          }}
        />
        <div
          style={{
            fontSize: '20px',
            fontWeight: 700,
            letterSpacing: '-0.5px',
            color: 'var(--text)'
          }}
        >
          40 HOUR STUDIO
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Internal Desktop App
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ width: '100%' }}>
        <div className="input-field" style={{ padding: '12px 16px', marginBottom: '12px', border: '1px solid rgba(255, 255, 255, 0.1)', background: 'transparent' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.5px', textAlign: 'center' }}>
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
          className="btn-primary"
          style={{
            width: '100%',
            padding: '10px',
            fontWeight: 600,
            fontSize: '14px',
            color: loading ? 'var(--text-tertiary)' : '#fff',
            cursor: loading ? 'wait' : 'pointer',
            border: 'none',
            borderRadius: '4px',
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
      <div style={{
        position: 'absolute', bottom: 16, left: 0, right: 0,
        textAlign: 'center', fontSize: 10, color: 'rgba(255, 255, 255, 0.2)',
      }}>
        v1.2.56
      </div>
    </div>
  )
}
