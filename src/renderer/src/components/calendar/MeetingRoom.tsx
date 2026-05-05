/**
 * Thin wrapper around <VoiceChannelView /> that joins the calendar
 * meeting's LiveKit room. The room name (`meeting_<eventId>`) is set
 * server-side at event creation; we read it from the event payload.
 *
 * Mode = 'vc' (not 'call') so the room renders the gallery layout
 * immediately rather than the "Calling…" waiting screen. A meeting is
 * a persistent room — first joiner shouldn't see "Calling Bob…", they
 * should see the empty room and wait for others to drop in. Same UX
 * as voice channels.
 *
 * Server gates the LiveKit token endpoint on calendar invite membership
 * (see src/app/api/livekit/token/route.ts), so a non-invitee opening
 * this view by URL hack would still get a 403 from the token endpoint
 * and never connect.
 *
 * Minimize button (v1.5.2104): clicking collapses the meeting to the
 * floating bar at the bottom-right while leaving the LiveKit session
 * connected. Lets the user keep working with the meeting in the
 * background even on the calendar tab.
 */

import { Minimize2 } from 'lucide-react'
import VoiceChannelView from '../calls/VoiceChannelView'
import { C } from '../../theme'
import type { ApiConfig, Auth } from '../../types'
import type { CalendarEvent } from './types'

export default function MeetingRoom({
  config, auth, event, onLeave, onMinimize,
}: {
  config: ApiConfig
  auth: Auth
  event: CalendarEvent
  onLeave: () => void
  /** Optional — when provided a Minimize button overlays the meeting top-right. */
  onMinimize?: () => void
}) {
  const roomId = event.meetingRoomId ?? `meeting_${event.id}`
  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
      <VoiceChannelView
        config={config}
        auth={auth}
        channelId={roomId}
        channelName={event.title}
        initialParticipants={[]}
        onLeave={onLeave}
        mode="vc"
      />
      {onMinimize && (
        // Bottom-left, away from the top-right Invite/Chat buttons that
        // VoiceChannelView renders. Stays visible during screen share
        // since it's positioned outside the gallery flow.
        <button
          onClick={onMinimize}
          aria-label="Minimize meeting"
          title="Minimize meeting (keeps the call connected)"
          style={{
            position: 'absolute', bottom: 16, left: 16, zIndex: 60,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 999,
            background: 'rgba(20,20,20,0.85)',
            border: `1px solid ${C.separator}`,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            color: C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
          }}
        >
          <Minimize2 size={13} />
          Minimize
        </button>
      )}
    </div>
  )
}
