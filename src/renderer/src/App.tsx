import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import FullDashboard from './pages/FullDashboard'
import FloatingCallOverlay from './pages/FloatingCallOverlay'

const DEMO_MODE = false

interface Auth {
  userId: string
  username: string
  role: string
}

export default function App(): JSX.Element {
  // Floating call overlay window — minimal shell, no auth needed
  if (window.location.hash === '#call-float') {
    return <FloatingCallOverlay />
  }

  const [auth, setAuth] = useState<Auth | null | undefined>(DEMO_MODE ? { userId: 'demo', username: 'john.doe', role: 'developer' } : undefined)
  const [windowMode, setWindowMode] = useState<'popup' | 'full' | null>(DEMO_MODE ? 'full' : null)

  useEffect(() => {
    if (DEMO_MODE) return
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
    if (DEMO_MODE) return
    return window.electronAPI.onTokenExpired(() => {
      setAuth(null)
    })
  }, [])

  if (auth === undefined || windowMode === null) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#6b6b6b',
          fontSize: '14px',
          fontWeight: 500,
          letterSpacing: '0.5px'
        }}
      >
        Loading…
      </div>
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
    return <FullDashboard auth={auth} onLogout={handleLogout} />
  }

  return (
    <Dashboard
      auth={auth}
      onLogout={handleLogout}
    />
  )
}
