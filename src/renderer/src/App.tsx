import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

interface Auth {
  userId: string
  username: string
  role: string
}

export default function App(): JSX.Element {
  const [auth, setAuth] = useState<Auth | null | undefined>(undefined)

  useEffect(() => {
    window.electronAPI.getStoredAuth().then((stored) => {
      setAuth(stored)
    })
  }, [])

  if (auth === undefined) {
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

  if (!auth) {
    return <Login onLogin={(a) => setAuth(a)} />
  }

  return (
    <Dashboard
      auth={auth}
      onLogout={() => {
        window.electronAPI.logout()
        setAuth(null)
      }}
    />
  )
}
