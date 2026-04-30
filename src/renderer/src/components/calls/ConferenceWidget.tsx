import { useState, useEffect } from 'react'
import { Hash, Users, Move, MicOff, LayoutGrid, LayoutList } from 'lucide-react'
import { ApiConfig, Auth } from '../../types'
import { C } from '../../theme'
import Avatar from '../shared/Avatar'
import { CallControls } from './CallControls'
import useConference from './useConference'
import { useDraggableWindow } from '../../hooks/useDraggableWindow'
import { useAutoHideControls } from '../../hooks/useAutoHideControls'

export default function ConferenceWidget({ config, auth, channelId, channelName, initialParticipants, onLeave }: {
  config: ApiConfig; auth: Auth
  channelId: string; channelName: string
  initialParticipants: Array<{ id: string; name: string; avatar: string | null }>
  onLeave: () => void
}) {
  const conf = useConference({ config, auth, channelId, channelName, initialParticipants, onLeave })

  const [windowMode, setWindowMode] = useState<'mini' | 'normal' | 'fullscreen'>('normal')
  const { position, setPosition, isDragging, startDrag } = useDraggableWindow({
    initial: { x: window.innerWidth - 320, y: window.innerHeight - 260 },
  })
  const showControls = useAutoHideControls(windowMode === 'fullscreen')
  const [noiseSuppression, setNoiseSuppression] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'focus'>('grid')
  const [focusTarget, setFocusTarget] = useState<string | null>(null)
  const [backgroundBlur, setBackgroundBlur] = useState(false)
  const [volumeMenuPeer, setVolumeMenuPeer] = useState<string | null>(null)

  // LiveKit reports quality natively via RoomEvent.ConnectionQualityChanged.
  const connectionQuality = conf.connectionQuality ?? 'good'

  // ── Noise suppression toggle ────────────────────────────────────────────
  async function toggleNoiseSuppression() {
    const val = !noiseSuppression
    setNoiseSuppression(val)
    const t = conf.localStream.current?.getAudioTracks()[0]
    if (t) try { await t.applyConstraints({ noiseSuppression: val }) } catch { /* unsupported */ }
  }

  // ── Background blur toggle ─────────────────────────────────────────────
  async function toggleBackgroundBlur() {
    const val = !backgroundBlur
    setBackgroundBlur(val)
    const t = conf.localStream.current?.getVideoTracks()[0]
    if (t) try { await t.applyConstraints({ backgroundBlur: val } as any) } catch { /* unsupported */ }
  }

  const handleDragStart = startDrag

  const gridCols = conf.totalParticipants <= 2 ? 1 : conf.totalParticipants <= 4 ? 2 : 3

  // ── Participant tile ────────────────────────────────────────────────────
  function renderTile(id: string, stream: MediaStream | null, name: string, avatar: string | null, isSelf: boolean) {
    const isMuted = isSelf ? conf.muted : !!conf.peerMuted.get(id)
    const isSpeaking = conf.speakingPeers.has(id)
    const vol = conf.peerVolumes.get(id) ?? 100
    const hasVideo = stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled && (!isSelf ? !conf.peerVideoOff.get(id) : !conf.videoOff)
    return (
      <div key={id} style={{
        background: C.bgFloating, borderRadius: 8, overflow: 'hidden', position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0,
        outline: isSpeaking ? '2px solid #43B581' : '2px solid transparent', transition: 'outline-color 0.15s',
        animation: isSpeaking ? 'speakingGlow 1.5s ease-in-out infinite' : 'none',
      }}
      title={isSelf ? 'You' : name}
      onContextMenu={e => { if (!isSelf) { e.preventDefault(); setVolumeMenuPeer(volumeMenuPeer === id ? null : id) } }}
      >
        {hasVideo ? (
          <video autoPlay playsInline muted={isSelf}
            ref={el => { if (el && el.srcObject !== stream) { el.srcObject = stream; el.play().catch(() => {}) } }}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ textAlign: 'center', padding: 12 }}>
            <Avatar url={avatar} name={name} size={windowMode === 'mini' ? 28 : 48} />
            <div style={{ color: '#fff', fontSize: windowMode === 'mini' ? 10 : 12, fontWeight: 600, marginTop: 4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          </div>
        )}
        <div style={{
          position: 'absolute', bottom: 4, left: 6, color: '#fff', fontSize: 10,
          display: 'flex', alignItems: 'center', gap: 3,
          background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '2px 6px',
        }}>
          <span>{isSelf ? 'You' : name}</span>
          {isMuted && <MicOff size={8} color="#f87171" />}
        </div>
        {!isSelf && volumeMenuPeer === id && windowMode !== 'mini' && (
          <div onClick={e => e.stopPropagation()} style={{
            position: 'absolute', bottom: 24, left: 6, right: 6,
            background: 'rgba(0,0,0,0.85)', borderRadius: 6, padding: '8px 10px',
            display: 'flex', alignItems: 'center', gap: 8, zIndex: 2,
          }}>
            <span style={{ color: '#9ca3af', fontSize: 10, whiteSpace: 'nowrap' }}>Vol</span>
            <input type="range" min={0} max={200} value={vol}
              onChange={e => conf.setPeerVolume(id, Number(e.target.value))}
              style={{ flex: 1, accentColor: '#43B581', height: 4, cursor: 'pointer' }} />
            <span style={{ color: '#9ca3af', fontSize: 10, minWidth: 28, textAlign: 'right' }}>{vol}%</span>
          </div>
        )}
      </div>
    )
  }

  // ── Screen source picker modal ──────────────────────────────────────────
  const ScreenSourcePicker = () => conf.screenSources ? (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10001,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.bgSecondary, borderRadius: 12, padding: 20, width: 520,
        maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ fontWeight: 700, color: '#fff', marginBottom: 14, fontSize: 15 }}>Choose what to share</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {conf.screenSources.map(src => (
            <button key={src.id} onClick={() => conf.startScreenShare(src.id)}
              style={{ background: '#080808', border: '2px solid #333333', borderRadius: 8,
                cursor: 'pointer', padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <img src={src.thumbnail} alt={src.name}
                style={{ width: '100%', borderRadius: 4, aspectRatio: '16/9', objectFit: 'cover', background: '#000' }} />
              <span style={{ color: '#cccccc', fontSize: 11, textAlign: 'center',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{src.name}</span>
            </button>
          ))}
        </div>
        <button onClick={conf.dismissScreenSources}
          style={{ marginTop: 16, width: '100%', padding: '8px 0', background: '#282828',
            border: 'none', borderRadius: 8, color: '#cccccc', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
      </div>
    </div>
  ) : null

  // ── Invite modal ────────────────────────────────────────────────────────
  const InviteModal = () => conf.showInvite ? (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10001,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.bgSecondary, borderRadius: 12, padding: 20, width: 340,
        maxHeight: '60vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ fontWeight: 700, color: '#fff', marginBottom: 14, fontSize: 15 }}>Invite to call</div>
        {conf.inviteUsers.length === 0 ? (
          <div style={{ color: '#6b6b6b', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            All channel members are already in the call
          </div>
        ) : conf.inviteUsers.map(u => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 0', borderBottom: '1px solid #333333' }}>
            <Avatar url={u.avatarUrl ?? null} name={u.alias ?? u.username} size={32} />
            <span style={{ flex: 1, color: '#cccccc', fontSize: 13 }}>{u.alias ?? u.username}</span>
            <button onClick={() => conf.sendInvite(u.id)}
              style={{ background: C.accent, border: 'none', borderRadius: 6, color: '#fff',
                padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Invite</button>
          </div>
        ))}
        <button onClick={conf.closeInvite}
          style={{ marginTop: 16, width: '100%', padding: '8px 0', background: '#282828',
            border: 'none', borderRadius: 8, color: '#cccccc', cursor: 'pointer', fontSize: 13 }}>Close</button>
      </div>
    </div>
  ) : null

  // ── Call controls props (shared between modes) ──────────────────────────
  const controlProps = {
    muted: conf.muted, onToggleMute: conf.toggleMute,
    deafened: conf.deafened, onToggleDeafen: conf.toggleDeafen,
    videoOff: conf.videoOff, onToggleVideo: conf.toggleVideo,
    videoActive: conf.videoActive,
    windowMode, onSetWindowMode: setWindowMode,
    onHangup: conf.handleLeave,
    participantCount: conf.totalParticipants,
    callDuration: conf.callDuration,
    screenSharing: conf.screenSharing, onToggleScreenShare: conf.toggleScreenShare,
    connectionQuality,
    onSwitchAudioInput: (d: string) => conf.switchAudioInput(d, { noiseSuppression }),
    onSwitchAudioOutput: conf.switchAudioOutput,
    onSwitchVideoInput: conf.switchVideoInput,
    localSpeaking: conf.localSpeaking,
    noiseSuppression, onToggleNoiseSuppression: toggleNoiseSuppression,
    backgroundBlur, onToggleBackgroundBlur: toggleBackgroundBlur,
    onReaction: conf.sendReaction,
    pushToTalk: conf.pushToTalk, onTogglePushToTalk: conf.togglePushToTalk,
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ── Mini mode ──────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════
  if (windowMode === 'mini') {
    return (
      <>
        <ScreenSourcePicker />
        <InviteModal />
        <div style={{
          position: 'fixed', left: position.x, top: position.y, zIndex: 9998,
          width: 300, height: 200, background: '#080808', borderRadius: 12,
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div onMouseDown={handleDragStart} onDoubleClick={() => setWindowMode('normal')} style={{
            padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6,
            cursor: isDragging ? 'grabbing' : 'grab', background: 'rgba(255,255,255,0.05)', flexShrink: 0,
          }}>
            <Move size={10} color="#94a3b8" />
            <Hash size={10} color="#94a3b8" />
            <span style={{ color: '#fff', fontSize: 10, fontWeight: 600, flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channelName}</span>
            <span style={{ color: '#6b6b6b', fontSize: 10 }}>
              <Users size={10} style={{ verticalAlign: 'middle' }} /> {conf.totalParticipants}
            </span>
          </div>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${Math.min(gridCols, 2)}, 1fr)`,
            gap: 2, padding: 2, minHeight: 0 }}>
            {renderTile(auth.userId, conf.localStream.current, 'You', null, true)}
            {conf.peerList.slice(0, 3).map(([id, p]) => renderTile(id, p.stream, p.name, p.avatar, false))}
          </div>
          <div style={{ padding: '4px 8px', display: 'flex', justifyContent: 'center', flexShrink: 0,
            background: 'rgba(0,0,0,0.3)' }}>
            <CallControls {...controlProps} />
          </div>
          <video ref={conf.localVideo} autoPlay playsInline muted style={{ display: 'none' }} />
        </div>
      </>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ── Normal / Fullscreen mode ───────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════
  const isFs = windowMode === 'fullscreen'
  const fadeStyle = isFs ? { opacity: showControls ? 1 : 0, transition: 'opacity 0.3s' } : {}

  return (
    <>
      <ScreenSourcePicker />
      <InviteModal />
      <div style={{
        position: 'fixed', inset: 0, background: isFs ? '#000' : 'rgba(0,0,0,0.85)', zIndex: 9998,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, ...fadeStyle }}>
          <Hash size={16} color="#94a3b8" />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{channelName}</span>
          <span style={{ color: '#6b6b6b', fontSize: 12 }}>
            <Users size={12} style={{ verticalAlign: 'middle' }} /> {conf.totalParticipants}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={() => {
            setViewMode(viewMode === 'grid' ? 'focus' : 'grid')
            if (viewMode === 'grid' && !focusTarget && conf.peerList.length > 0) setFocusTarget(conf.peerList[0][0])
          }}
          style={{
            background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6,
            padding: '4px 8px', cursor: 'pointer', color: '#ccc',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
          }}
          title={viewMode === 'grid' ? 'Switch to focus view' : 'Switch to grid view'}>
            {viewMode === 'grid' ? <LayoutGrid size={14} /> : <LayoutList size={14} />}
            {viewMode === 'grid' ? 'Grid' : 'Focus'}
          </button>
        </div>

        {/* Participant grid / focus */}
        {viewMode === 'grid' ? (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gap: 8, padding: '0 20px', minHeight: 0 }}>
            {renderTile(auth.userId, conf.localStream.current, 'You', null, true)}
            {conf.peerList.map(([id, p]) => renderTile(id, p.stream, p.name, p.avatar, false))}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: '0 20px', minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              {(() => {
                if (focusTarget && focusTarget !== auth.userId) {
                  const p = conf.peers.get(focusTarget)
                  if (p) return renderTile(focusTarget, p.stream, p.name, p.avatar, false)
                }
                return renderTile(auth.userId, conf.localStream.current, 'You', null, true)
              })()}
            </div>
            <div style={{ display: 'flex', gap: 4, height: 80, flexShrink: 0, overflowX: 'auto' }}>
              {focusTarget !== auth.userId && (
                <div style={{ width: 100, flexShrink: 0, cursor: 'pointer' }} onClick={() => setFocusTarget(auth.userId)}>
                  {renderTile(auth.userId, conf.localStream.current, 'You', null, true)}
                </div>
              )}
              {conf.peerList.filter(([id]) => id !== focusTarget).map(([id, p]) => (
                <div key={id} style={{ width: 100, flexShrink: 0, cursor: 'pointer' }} onClick={() => setFocusTarget(id)}>
                  {renderTile(id, p.stream, p.name, p.avatar, false)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Push-to-talk indicator */}
        {conf.pushToTalk && conf.muted && (
          <div style={{ padding: '6px 16px', textAlign: 'center' }}>
            <span style={{
              display: 'inline-block', padding: '4px 14px', borderRadius: 6,
              background: 'rgba(88,101,242,0.2)', color: '#5865F2', fontSize: 12, fontWeight: 600,
            }}>
              Push to Talk — Hold{' '}
              <span style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 3, padding: '1px 6px', marginLeft: 4 }}>V</span>
            </span>
          </div>
        )}

        {/* Controls */}
        <div style={{ padding: '16px 0', display: 'flex', justifyContent: 'center', flexShrink: 0, ...fadeStyle }}>
          <div style={{ padding: '10px 24px', borderRadius: 8, background: isFs ? 'rgba(0,0,0,0.6)' : 'transparent' }}>
            <CallControls {...controlProps} onInvite={conf.loadInviteUsers} />
          </div>
        </div>

        {/* Floating emoji reactions */}
        {conf.callReactions.length > 0 && (
          <div style={{
            position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 8, pointerEvents: 'none', zIndex: 100,
          }}>
            {conf.callReactions.map(r => (
              <span key={r.id} style={{ fontSize: 32, animation: 'callReactionFloat 3s ease-out forwards' }}>{r.emoji}</span>
            ))}
          </div>
        )}
        <video ref={conf.localVideo} autoPlay playsInline muted style={{ display: 'none' }} />
      </div>
    </>
  )
}
