import React, { useEffect } from 'react'
import { Phone, PhoneOff } from 'lucide-react'
import { neu } from '../../theme'
import type { ApiConfig, Auth } from '../../types'
import { Avatar } from '../shared/Avatar'

export interface IncomingCallPayload {
  from: string
  fromName: string
  fromAvatar: string | null
  sdp: string
  callType: 'audio' | 'video'
}

export function IncomingCallOverlay({
  payload, onAccept, onReject,
}: {
  payload: IncomingCallPayload
  config?: ApiConfig; auth?: Auth
  onAccept: () => void; onReject: () => void
}) {
  useEffect(() => {
    const audio = new Audio('sounds/incoming-call.mp3')
    audio.loop = true
    audio.volume = 0.6
    audio.play().catch(() => {})
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(`Incoming ${payload.callType === 'video' ? 'Video' : 'Audio'} Call`, {
        body: payload.fromName,
        silent: false,
      })
      n.onclick = () => { window.electronAPI.focusWindow(); onAccept() }
    }
    window.electronAPI.focusWindow()
    return () => { audio.pause(); audio.src = '' }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 10002,
      ...neu(), padding: '16px 20px',
      display: 'flex', alignItems: 'center', gap: 14, minWidth: 280,
      animation: 'slideIn 0.2s ease-out',
    }}>
      <Avatar url={payload.fromAvatar} name={payload.fromName} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#aaa', fontWeight: 500 }}>
          {payload.callType === 'video' ? 'Video call' : 'Audio call'}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {payload.fromName}
        </div>
      </div>
      <button onClick={onReject}
        style={{ width: 36, height: 36, borderRadius: '50%', background: '#f04747', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title="Decline">
        <PhoneOff size={16} color="#fff" />
      </button>
      <button onClick={onAccept}
        style={{ width: 36, height: 36, borderRadius: '50%', background: '#43B581', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title="Accept">
        <Phone size={16} color="#fff" />
      </button>
    </div>
  )
}
