import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import FullDashboard from './pages/FullDashboard'

interface Auth {
  userId: string
  username: string
  role: string
}

export default function App(): JSX.Element {
  const [auth, setAuth] = useState<Auth | null | undefined>(undefined)
  const [windowMode, setWindowMode] = useState<'popup' | 'full' | null>(null)

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

  if (auth === undefined || windowMode === null) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-muted)'
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
