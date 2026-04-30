import { useState, useEffect, useRef } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import FullDashboard from './pages/FullDashboard'
import FloatingCallOverlay from './pages/FloatingCallOverlay'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { attachTasksSseListeners } from './stores/tasksStore'

const SPLASH_MIN_MS = 5000

const FUNNY_QUOTES = [
  "Convincing the clock to cooperate…",
  "Loading excuses for being late…",
  "Syncing procrastination levels…",
  "Calculating optimal coffee break timing…",
  "Teaching pixels to count hours…",
  "Bribing the server with virtual donuts…",
  "Aligning planets for maximum productivity…",
  "Initializing mandatory meeting simulation…",
  "Rounding up stray milliseconds…",
  "Negotiating with time zones…",
  "Installing motivation… please wait…",
  "Polishing the virtual punch card…",
  "Asking 'have you tried clocking in?'…",
  "Almost ready — just finishing your timesheet…",
  "Defragmenting overtime hours…",
]

interface Auth {
  userId: string
  username: string
  role: string
}

function StartupSplash({ onDone }: { onDone: () => void }) {
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'downloading' | 'ready'>('checking')
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [fadeOut, setFadeOut] = useState(false)
  const [quoteIdx, setQuoteIdx] = useState(() => Math.floor(Math.random() * FUNNY_QUOTES.length))
  const startedAt = useRef(Date.now())
  const doneRef = useRef(false)

  // Rotate quotes every 1.8 seconds while loading
  useEffect(() => {
    const t = setInterval(() => {
      setQuoteIdx(i => (i + 1) % FUNNY_QUOTES.length)
    }, 1800)
    return () => clearInterval(t)
  }, [])

  const finish = () => {
    if (doneRef.current) return
    const elapsed = Date.now() - startedAt.current
    const delay = Math.max(0, SPLASH_MIN_MS - elapsed)
    setTimeout(() => {
      if (doneRef.current) return
      doneRef.current = true
      setFadeOut(true)
      setTimeout(onDone, 350)
    }, delay)
  }

  useEffect(() => {
    let cleanup: (() => void) | undefined

    window.electronAPI.getUpdateState().then((state) => {
      if (state.downloaded) {
        setUpdateStatus('ready')
        setDownloadProgress(100)
        // Don't auto-dismiss when update is ready — show restart button
      } else if (state.percent !== null && state.percent > 0) {
        setUpdateStatus('downloading')
        setDownloadProgress(Math.round(state.percent))
      } else {
        setUpdateStatus('idle')
        finish()
      }
    }).catch(() => {
      setUpdateStatus('idle')
      finish()
    })

    const unsubProgress = window.electronAPI.onDownloadProgress((p: { percent: number }) => {
      setUpdateStatus('downloading')
      setDownloadProgress(Math.round(p.percent))
    })

    const unsubDownloaded = window.electronAPI.onUpdateDownloaded(() => {
      setUpdateStatus('ready')
      setDownloadProgress(100)
    })

    cleanup = () => { unsubProgress(); unsubDownloaded() }
    return cleanup
  }, [])

  return (
    <>
      {/* Keyframe injection */}
      <style>{`
        @keyframes bundySpin { to { transform: rotate(360deg); } }
        @keyframes bundyPulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
        @keyframes bundyFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes loginGradientShift {
          0%   { background-position: 50% 10%, 50% 5%, 20% 90%; }
          33%  { background-position: 60% 15%, 40% 10%, 30% 85%; }
          66%  { background-position: 40% 8%, 55% 3%, 15% 95%; }
          100% { background-position: 50% 10%, 50% 5%, 20% 90%; }
        }
      `}</style>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: `
          radial-gradient(ellipse 80% 50%, rgba(0, 30, 120, 0.25) 0%, transparent 60%),
          radial-gradient(ellipse 60% 40%, rgba(100, 160, 255, 0.10) 0%, transparent 50%),
          radial-gradient(ellipse 50% 50%, rgba(0, 30, 120, 0.1) 0%, transparent 60%),
          #0e0e0e
        `,
        backgroundSize: '200% 200%, 200% 200%, 200% 200%, 100% 100%',
        animation: 'loginGradientShift 12s ease-in-out infinite',
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.35s ease',
        userSelect: 'none',
      }}>
        <img src="workspace-logo.svg" alt="Bundy" style={{ width: 72, height: 72, marginBottom: 20 }} />
        <div style={{ color: '#fff', fontSize: 22, fontWeight: 700, letterSpacing: '-0.3px', marginBottom: 4 }}>40 HOUR STUDIO</div>

        {/* Funny quote */}
        <div key={quoteIdx} style={{
          color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 28, maxWidth: 240, textAlign: 'center', lineHeight: 1.5,
          animation: 'bundyFadeIn 0.4s ease',
        }}>
          {FUNNY_QUOTES[quoteIdx]}
        </div>

        {/* Spinner (shown while checking/downloading) */}
        {updateStatus !== 'ready' && (
          <div style={{ width: 28, height: 28, marginBottom: 16, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.15)',
              borderTopColor: '#fff',
              animation: 'bundySpin 0.9s linear infinite',
            }} />
          </div>
        )}

        <div style={{ color: '#6b7280', fontSize: 12, marginBottom: updateStatus === 'downloading' || updateStatus === 'ready' ? 16 : 0 }}>
          {updateStatus === 'checking' && 'Checking for updates…'}
          {updateStatus === 'idle' && ''}
          {updateStatus === 'downloading' && `Downloading update… ${downloadProgress}%`}
          {updateStatus === 'ready' && 'Update ready to install'}
        </div>

        {/* Progress bar for download */}
        {(updateStatus === 'downloading' || updateStatus === 'ready') && (
          <div style={{ width: 220, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: '#fff',
              width: `${downloadProgress}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
        )}

        {/* Restart button when update is ready */}
        {updateStatus === 'ready' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => window.electronAPI.installUpdate()}
              style={{
                background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8,
                padding: '9px 24px', cursor: 'pointer',
                color: '#fff', fontSize: 13, fontWeight: 600,
              }}
            >
              Restart to Update
            </button>
            <button
              onClick={finish}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#6b7280', fontSize: 12, padding: '4px 8px',
              }}
            >
              Skip for now
            </button>
          </div>
        )}
      </div>
    </>
  )
}

export default function App(): JSX.Element {
  // Floating call overlay window — minimal shell, no auth needed
  if (window.location.hash === '#call-float') {
    return <FloatingCallOverlay />
  }

  const [auth, setAuth] = useState<Auth | null | undefined>(undefined)
  const [windowMode, setWindowMode] = useState<'popup' | 'full' | null>(null)
  const [splashDone, setSplashDone] = useState(false)

  useEffect(() => {
    Promise.all([
      window.electronAPI.getStoredAuth(),
      window.electronAPI.getWindowMode(),
    ]).then(([stored, mode]) => {
      setAuth(stored)
      setWindowMode(mode)
    })
  }, [])

  // If the server rejects our token (expired at 5 AM WIB), force re-login
  useEffect(() => {
    return window.electronAPI.onTokenExpired(() => {
      setAuth(null)
    })
  }, [])

  // Bridge SSE task events → window CustomEvents that panels and link cards
  // already subscribe to. Keeps Phase-1 SSE consumers loose-coupled.
  useEffect(() => {
    attachTasksSseListeners()
    return window.electronAPI.onTaskEvent((event) => {
      if (event.kind === 'task-update') {
        const { taskId, mainTaskId, kind, changes } = event.data
        window.dispatchEvent(new CustomEvent('bundy-task-updated', {
          detail: { taskId, mainTaskId, kind, changes },
        }))
      } else if (event.kind === 'task-comment') {
        window.dispatchEvent(new CustomEvent('bundy-task-comment-added', { detail: event.data }))
      } else if (event.kind === 'task-notification') {
        window.dispatchEvent(new CustomEvent('bundy-task-notification', { detail: event.data }))
      }
    })
  }, [])

  if (!splashDone || auth === undefined || windowMode === null) {
    const appReady = auth !== undefined && windowMode !== null
    return (
      <>
        {appReady && !splashDone ? null : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }} />
        )}
        <StartupSplash onDone={() => setSplashDone(true)} />
      </>
    )
  }

  const handleLogin = (a: Auth) => setAuth(a)
  const handleLogout = () => {
    window.electronAPI.logout()
    setAuth(null)
  }

  if (!auth) {
    return <Login onLogin={handleLogin} />
  }

  if (windowMode === 'full') {
    return (
      <ErrorBoundary label="App">
        <FullDashboard auth={auth} onLogout={handleLogout} />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary label="App">
      <Dashboard
        auth={auth}
        onLogout={handleLogout}
      />
    </ErrorBoundary>
  )
}
