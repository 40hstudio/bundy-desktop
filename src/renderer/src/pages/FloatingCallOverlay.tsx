import { useState, useEffect, useRef } from 'react'

interface CallState {
  userName: string
  userAvatar: string | null
  status: 'calling' | 'connected' | 'ended'
  duration: number
  muted: boolean
  videoActive: boolean
}

export default function FloatingCallOverlay(): JSX.Element {
  const [state, setState] = useState<CallState>({
    userName: '',
    userAvatar: null,
    status: 'calling',
    duration: 0,
    muted: false,
    videoActive: false,
  })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })

  // Make body/html transparent for the floating window
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.webkitAppRegion = 'no-drag'
  }, [])

  // Request initial state on mount (main process stores it for us)
  useEffect(() => {
    window.electronAPI?.getCallFloatState?.().then((s) => {
      if (s) setState(s as unknown as CallState)
    })
  }, [])

  // Listen for ongoing state updates from main window
  useEffect(() => {
    if (!window.electronAPI?.onCallFloatState) return
    const unsub = window.electronAPI.onCallFloatState((s) => {
      setState(s as unknown as CallState)
    })
    return unsub
  }, [])

  const handleAction = (action: string) => {
    window.electronAPI?.sendCallFloatAction({ action })
  }

  const fmtDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // Window drag via mousedown on body
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    setIsDragging(true)
    dragStart.current = { x: e.screenX, y: e.screenY }
  }

  useEffect(() => {
    if (!isDragging) return
    const handleMove = (e: MouseEvent) => {
      const dx = e.screenX - dragStart.current.x
      const dy = e.screenY - dragStart.current.y
      dragStart.current = { x: e.screenX, y: e.screenY }
      // Move the window — use IPC-free approach via window.moveTo offset
      window.moveBy(dx, dy)
    }
    const handleUp = () => setIsDragging(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isDragging])

  const initial = state.userName
    ? state.userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        width: '100%',
        height: '100%',
        background: 'rgba(14, 14, 14, 0.92)',
        borderRadius: 14,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        WebkitAppRegion: 'no-drag' as never,
      }}
    >
      {/* Main content row */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 10,
      }}>
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: state.status === 'connected' ? '#22c55e' : '#3b82f6',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          fontSize: 13, fontWeight: 700, color: '#fff',
          overflow: 'hidden',
        }}>
          {state.userAvatar ? (
            <img src={state.userAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : initial}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: '#fff', fontSize: 12, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {state.userName || 'Call'}
          </div>
          <div style={{
            color: state.status === 'connected' ? '#22c55e' : '#6b6b6b',
            fontSize: 10, marginTop: 1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {state.status === 'calling' ? 'Calling…' :
             state.status === 'connected' ? `Connected · ${fmtDuration(state.duration)}` :
             'Ended'}
          </div>
        </div>

        {/* Controls */}
        <div data-no-drag style={{ display: 'flex', gap: 6 }}>
          {/* Mute toggle */}
          <button
            onClick={() => handleAction(state.muted ? 'unmute' : 'mute')}
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: state.muted ? '#ef4444' : 'rgba(255,255,255,0.1)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 14,
              transition: 'background 0.15s',
            }}
            title={state.muted ? 'Unmute' : 'Mute'}
          >
            {state.muted ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .67-.1 1.32-.27 1.93" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

          {/* Expand back to app */}
          <button
            onClick={() => handleAction('expand')}
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 14,
              transition: 'background 0.15s',
            }}
            title="Expand to app"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>

          {/* Hangup */}
          <button
            onClick={() => handleAction('hangup')}
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: '#ef4444',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 14,
              transition: 'background 0.15s',
            }}
            title="End call"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
              <line x1="23" y1="1" x2="1" y2="23" />
            </svg>
          </button>
        </div>
      </div>

      {/* Green call indicator bar at bottom */}
      {state.status === 'connected' && (
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #22c55e, #16a34a)',
          borderRadius: '0 0 14px 14px',
        }} />
      )}
    </div>
  )
}
