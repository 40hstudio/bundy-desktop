import type React from 'react'
import {
  Volume2, Eye, Mic, MicOff, Headphones, HeadphoneOff,
  Monitor, PhoneOff,
} from 'lucide-react'
import { C } from '../../theme'

export type FloatingCallBarProps = {
  myConference: { channelId: string; channelName: string } | null
  vcLocalState: { muted: boolean; deafened: boolean; screenSharing: boolean }
  vcPreview: { stream: MediaStream; name: string } | null
  vcPreviewVideoRef: React.RefObject<HTMLVideoElement>

  // The "show call" + preview-click reset both clear all four navigation
  // states so VoiceChannelView (mounted full-screen at the parent level)
  // becomes the visible pane.
  onShowCall: () => void
}

/**
 * Bottom-of-sidebar floating call control bar — shows when the user
 * is in a voice conference. Renders the "show call" button, an optional
 * video preview of whichever speaker is currently active, and the
 * mute/deafen/screenshare/disconnect controls.
 *
 * Mute / deafen / screenshare / disconnect are dispatched as window
 * CustomEvents that VoiceChannelView listens for. Local state
 * (vcLocalState) is owned by the parent so the icon flips immediately
 * on click without waiting for the LiveKit roundtrip.
 */
export function FloatingCallBar({
  myConference, vcLocalState, vcPreview, vcPreviewVideoRef,
  onShowCall,
}: FloatingCallBarProps) {
  if (!myConference) return null

  return (
    <div style={{
      borderTop: `1px solid ${C.separator}`, background: C.bgSecondary, flexShrink: 0,
      padding: '8px 10px',
    }}>
      {/* Top line: status + show call icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Volume2 size={14} color={C.success} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.success }}>Voice Connected</div>
          <div style={{ fontSize: 10, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{myConference.channelName}</div>
        </div>
        <button
          onClick={onShowCall}
          title="Show Call"
          style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, padding: 5, cursor: 'pointer', color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
        >
          <Eye size={14} />
        </button>
      </div>
      {/* Speaker video/screen preview — only shown when vcPreview is set
          (caller decides whether to populate it based on whether the call
          room is currently visible). */}
      {vcPreview && (
        <div
          onClick={onShowCall}
          title="Click to open call"
          style={{ marginBottom: 6, borderRadius: 6, overflow: 'hidden', background: '#000', position: 'relative', aspectRatio: '4/3', cursor: 'pointer' }}>
          <video ref={vcPreviewVideoRef} autoPlay playsInline muted
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          <div style={{ position: 'absolute', bottom: 4, left: 6, fontSize: 9, color: '#fff', background: 'rgba(0,0,0,0.6)', borderRadius: 3, padding: '1px 5px' }}>
            {vcPreview.name}
          </div>
          <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', borderRadius: 3, padding: '1px 4px', fontSize: 9, color: 'rgba(255,255,255,0.7)' }}>↗</div>
        </div>
      )}
      {/* Bottom line: mute, deafen, screen share, end call */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('bundy-vc-toggle-mute'))}
          title={vcLocalState.muted ? 'Unmute' : 'Mute'}
          style={{
            flex: 1, background: vcLocalState.muted ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 6, padding: '6px 0', cursor: 'pointer',
            color: vcLocalState.muted ? '#f87171' : C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.8' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          {vcLocalState.muted ? <MicOff size={15} /> : <Mic size={15} />}
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('bundy-vc-toggle-deafen'))}
          title={vcLocalState.deafened ? 'Undeafen' : 'Deafen'}
          style={{
            flex: 1, background: vcLocalState.deafened ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 6, padding: '6px 0', cursor: 'pointer',
            color: vcLocalState.deafened ? '#f87171' : C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.8' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          {vcLocalState.deafened ? <HeadphoneOff size={15} /> : <Headphones size={15} />}
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('bundy-vc-toggle-screenshare'))}
          title={vcLocalState.screenSharing ? 'Stop Sharing' : 'Share Screen'}
          style={{
            flex: 1, background: vcLocalState.screenSharing ? 'rgba(59,165,93,0.2)' : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 6, padding: '6px 0', cursor: 'pointer',
            color: vcLocalState.screenSharing ? C.success : C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.8' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          <Monitor size={15} />
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('bundy-vc-disconnect'))}
          title="Disconnect"
          style={{
            flex: 1, background: 'rgba(237,66,69,0.15)', border: 'none', borderRadius: 6,
            padding: '6px 0', cursor: 'pointer', color: '#f87171',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.8' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          <PhoneOff size={15} />
        </button>
      </div>
    </div>
  )
}
