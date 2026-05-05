/**
 * Floating bar shown bottom-right while a calendar meeting is active and
 * the user is on a tab other than Calendar. Mirrors Google Meet's
 * picture-in-picture: live duration counter + Return + Leave.
 *
 * The bar is presentational — it doesn't hold the LiveKit connection.
 * The full <MeetingRoom /> stays mounted at FullDashboard's top level
 * (visibility-hidden when not on the calendar tab) so the connection
 * survives. Clicking Return swaps to the calendar tab and reveals it;
 * clicking Leave tears down the connection by unmounting.
 */

import { useEffect, useState } from 'react'
import { Phone, PhoneOff } from 'lucide-react'
import { C } from '../../theme'
import { Button } from '../shared'
import type { CalendarEvent } from './types'

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

export default function FloatingMeetingBar({
  event, joinedAt, onReturn, onLeave,
}: {
  event: CalendarEvent
  joinedAt: number
  onReturn: () => void
  onLeave: () => void
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9500,
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 12,
      background: 'rgba(20, 20, 20, 0.94)',
      border: `1px solid ${C.accent}55`,
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      maxWidth: 360,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: `${C.accent}30`, color: C.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Phone size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
        }}>In meeting · {formatDuration(now - joinedAt)}</div>
        <div style={{
          fontSize: 13, fontWeight: 600, color: C.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{event.title}</div>
      </div>
      <Button onClick={onReturn} title="Return to meeting">
        Return
      </Button>
      <Button onClick={onLeave} title="Leave meeting" style={{ color: C.danger }}>
        <PhoneOff size={14} />
      </Button>
    </div>
  )
}
