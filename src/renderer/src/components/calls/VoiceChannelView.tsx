import { useState, useEffect, useRef } from 'react'
import { Users, MicOff, Monitor, PhoneOff, Mic, Video, VideoOff, Headphones, UserPlus2, Volume2, MessageSquare, Wifi, X, Phone, Music, Search, Star, Plus, Upload, Smile } from 'lucide-react'
import { ApiConfig, Auth } from '../../types'
import { C } from '../../theme'
import Avatar from '../shared/Avatar'
import { MessageInput } from '../messages/MessageInput'
import { renderMessageContent } from '../../utils/markdown'
import useConference from './useConference'

// HeadphoneOff fallback
const HeadphoneOff = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11L3 18a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    <path d="M21 11v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h2" />
    <path d="M12 5a9 9 0 0 0-9 9" /><path d="M12 5a9 9 0 0 1 9 9" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

export default function VoiceChannelView({ config, auth, channelId, channelName, initialParticipants, joinSeq: _joinSeq, onLeave, mode = 'vc' }: {
  config: ApiConfig; auth: Auth
  channelId: string; channelName: string
  initialParticipants: Array<{ id: string; name: string; avatar: string | null }>
  joinSeq?: number
  onLeave: () => void
  mode?: 'vc' | 'call'
}) {
  const isVcMode = mode === 'vc'
  const conf = useConference({ config, auth, channelId, channelName, initialParticipants, onLeave })

  // ── VC-specific state ───────────────────────────────────────────────────
  const [focusedPeer, setFocusedPeer] = useState<string | null>(null)
  const [volumeMenuPeer, setVolumeMenuPeer] = useState<string | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string; content: string; createdAt: string
    sender: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [screenZoom, setScreenZoom] = useState(1)
  const [screenPan, setScreenPan] = useState({ x: 0, y: 0 })
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0 })
  const panOffset = useRef({ x: 0, y: 0 })
  const focusVideoRef = useRef<HTMLVideoElement | null>(null)
  const focusContainerRef = useRef<HTMLDivElement>(null)
  // Camera resolution UI removed in v1.5.2105 — LiveKit auto-negotiates.
  const isMinimapDragging = useRef(false)
  const [showSoundboard, setShowSoundboard] = useState(false)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [sbUploading, setSbUploading] = useState(false)
  const [sbUploadName, setSbUploadName] = useState('')
  const [sbUploadEmoji, setSbUploadEmoji] = useState('')
  const [sbUploadVolume, setSbUploadVolume] = useState(1.0)
  const [sbSearch, setSbSearch] = useState('')
  const [sbShowUploadModal, setSbShowUploadModal] = useState(false)
  const sbFileRef = useRef<HTMLInputElement>(null)
  const [sbSelectedFile, setSbSelectedFile] = useState<File | null>(null)

  const vcId = channelId.startsWith('vc_') ? channelId.slice(3) : channelId
  const formatDuration = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  // ── Sidebar bar events ──────────────────────────────────────────────────
  useEffect(() => {
    const onDisconnect = () => conf.handleLeave()
    window.addEventListener('bundy-vc-disconnect', onDisconnect)
    return () => window.removeEventListener('bundy-vc-disconnect', onDisconnect)
  }, [])

  useEffect(() => {
    const onToggleMute = () => conf.toggleMute()
    const onToggleDeafen = () => conf.toggleDeafen()
    const onToggleScreenshare = () => conf.toggleScreenShare()
    window.addEventListener('bundy-vc-toggle-mute', onToggleMute)
    window.addEventListener('bundy-vc-toggle-deafen', onToggleDeafen)
    window.addEventListener('bundy-vc-toggle-screenshare', onToggleScreenshare)
    return () => {
      window.removeEventListener('bundy-vc-toggle-mute', onToggleMute)
      window.removeEventListener('bundy-vc-toggle-deafen', onToggleDeafen)
      window.removeEventListener('bundy-vc-toggle-screenshare', onToggleScreenshare)
    }
  }, [conf.muted, conf.deafened, conf.screenSharing, conf.videoActive])

  // Broadcast local VC state to floating sidebar bar
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('bundy-vc-state-update', {
      detail: { muted: conf.muted, deafened: conf.deafened, screenSharing: conf.screenSharing }
    }))
  }, [conf.muted, conf.deafened, conf.screenSharing])

  // ── Chat system ─────────────────────────────────────────────────────────
  async function loadChatMessages() {
    try {
      const res = await fetch(`${config.apiBase}/api/voice-channels/${vcId}/messages?limit=50`, {
        headers: { Authorization: `Bearer ${config.token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setChatMessages(data.messages ?? [])
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50)
    } catch { setChatMessages([]) }
  }

  async function sendChatMessage() {
    if (!chatInput.trim() || chatSending) return
    const content = chatInput.trim()
    setChatSending(true); setChatInput('')
    try {
      await fetch(`${config.apiBase}/api/voice-channels/${vcId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
    } catch {} finally { setChatSending(false) }
  }

  // Listen for real-time VC messages
  useEffect(() => {
    const onVcMsg = (e: Event) => {
      const msg = (e as CustomEvent).detail
      if (msg.voiceChannelId === vcId) {
        setChatMessages(prev => [...prev, { id: msg.id, content: msg.content, createdAt: msg.createdAt, sender: msg.sender }])
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
    }
    window.addEventListener('bundy-vc-message', onVcMsg)
    return () => window.removeEventListener('bundy-vc-message', onVcMsg)
  }, [vcId])

  // ── Auto-focus on screen share ──────────────────────────────────────────
  useEffect(() => {
    if (conf.screenSharing) return
    if (conf.screenSharePeers.length === 1 && focusedPeer !== conf.screenSharePeers[0][0]) {
      setFocusedPeer(conf.screenSharePeers[0][0])
    } else if (conf.screenSharePeers.length !== 1 && focusedPeer) {
      const fp = conf.peers.get(focusedPeer)
      const fpHasVideo = fp?.stream?.getVideoTracks()?.[0]?.enabled
      if (!fpHasVideo) setFocusedPeer(null)
    }
  }, [conf.screenSharePeers.length, conf.screenSharePeers[0]?.[0], conf.screenSharing])

  // Clear focused peer immediately when its entry is removed from the peers map
  // (e.g. remote peer stops screen share — prevents blank screen with "Sharing" badge)
  useEffect(() => {
    if (focusedPeer && !conf.peers.has(focusedPeer)) {
      setFocusedPeer(null)
    }
  }, [conf.peers])

  // Reset zoom when focus target changes
  useEffect(() => { setScreenZoom(1); setScreenPan({ x: 0, y: 0 }) }, [focusedPeer, conf.screenSharing])

  // Robustly attach & re-attach stream to focus video.
  // replaceTrack() on the sender does NOT fire ontrack on the receiver — the
  // receiver's existing track just starts receiving new content. Chrome/Electron
  // often fails to restart the decoder for the previously-silent track, so we
  // create a *fresh* MediaStream wrapper (same tracks, new container) which
  // forces the browser to reinitialise its decode pipeline.
  const focusedPeerSharing = focusedPeer?.includes(':screen') ?? false
  useEffect(() => {
    if (!focusedPeer) return
    let cancelled = false
    let resolved = false

    const tryAttach = () => {
      if (cancelled || resolved) return
      const el = focusVideoRef.current
      const pd = conf.peersRef.current.get(focusedPeer)
      if (!el || !pd?.stream) return

      // Already rendering content — stop retrying
      if (el.srcObject && el.videoWidth > 0 && el.videoHeight > 0) {
        resolved = true
        return
      }

      const vt = pd.stream.getVideoTracks()[0]

      if (!el.srcObject) {
        // First attach: use the persistent stream
        el.srcObject = pd.stream
        el.play().catch(() => {})
      } else if (vt && !vt.muted && vt.readyState === 'live') {
        // Content IS flowing but decoder stuck — wrap tracks in a fresh MediaStream
        el.srcObject = new MediaStream(pd.stream.getTracks())
        el.play().catch(() => {})
      }
    }

    // Listen for video track unmute (fires when replaceTrack content arrives)
    const pd = conf.peersRef.current.get(focusedPeer)
    const vt = pd?.stream?.getVideoTracks()?.[0]
    const onUnmute = () => { tryAttach(); setTimeout(tryAttach, 300) }
    if (vt) vt.addEventListener('unmute', onUnmute)

    // Initial + retries with increasing back-off
    tryAttach()
    const timers = [150, 400, 800, 1500, 3000, 6000].map(ms => setTimeout(tryAttach, ms))

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
      if (vt) vt.removeEventListener('unmute', onUnmute)
    }
  }, [focusedPeer, focusedPeerSharing])

  // Clear focus if peer left
  if (focusedPeer) {
    const fp = conf.peers.get(focusedPeer)
    if (!fp || !fp.stream || !fp.stream.getVideoTracks().length) {
      // Will clear on next render
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  // Require focused peer's stream to actually have tracks — prevents blank-screen
  // flash when a remote peer stops screen sharing before focusedPeer is cleared.
  const showFocusMode = conf.screenSharing || !!(focusedPeer && (
    (focusedPeer.includes(':screen') && (conf.peers.get(focusedPeer)?.stream?.getVideoTracks().length ?? 0) > 0) ||
    !!conf.peerScreenSharing.get(focusedPeer) ||
    (conf.peers.get(focusedPeer)?.stream?.getVideoTracks()?.[0]?.enabled && !conf.peerVideoOff.get(focusedPeer))
  ))

  function renderParticipantCard(
    id: string, stream: MediaStream | null, name: string, avatar: string | null,
    isSelf: boolean, size: 'large' | 'small' = 'large'
  ) {
    const isScreenCard = id.includes(':screen')
    const realId = isScreenCard ? id.split(':')[0] : id
    const isMutedPeer = isSelf ? conf.muted : !!conf.peerMuted.get(realId)
    const isDeafenedPeer = isSelf ? conf.deafened : !!conf.peerDeafened.get(realId)
    const isSpeaking = isScreenCard ? false : (isSelf ? conf.localSpeaking : conf.speakingPeers.has(id))
    const isPeerSharing = isScreenCard
    const isSelfScreenSharePreview = isSelf && conf.screenSharing && !!focusedPeer
    const hasVideo = isScreenCard
      ? (stream && stream.getVideoTracks().length > 0)
      : (stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled && (!isSelf ? (!conf.peerVideoOff.get(id)) : (isSelfScreenSharePreview || !conf.videoOff)))
    const vol = conf.peerVolumes.get(realId) ?? 100
    const isSmall = size === 'small'
    const cardH = isSmall ? 90 : undefined
    const connState = isSelf ? 'connected' : (conf.peerConnectionStates.get(id) ?? 'new')
    const signalColor = connState === 'connected' || connState === 'completed' ? '#43B581'
      : connState === 'checking' || connState === 'new' ? '#FAA61A' : '#f87171'

    // v1.5.2207 — large tile aspect now reflects the content. A 4:3 box
    // around 16:9 screen-share content was making the share look squished
    // (heavy letterbox bars + small visible area). Webcams stay 4:3.
    const cardAspectRatio = !isSmall
      ? ((isPeerSharing || isSelfScreenSharePreview) ? '16 / 9' : '4 / 3')
      : undefined
    return (
      <div key={id} style={{
        background: C.bgFloating, borderRadius: 12, overflow: 'hidden', position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        minHeight: isSmall ? cardH : undefined,
        height: isSmall ? cardH : undefined,
        aspectRatio: cardAspectRatio,
        outline: isSpeaking ? '3px solid #43B581' : '3px solid transparent', outlineOffset: 2,
        transition: 'outline-color 0.15s, transform 0.15s',
        cursor: !isSelf && (hasVideo || isPeerSharing) ? 'pointer' : 'default',
      }}
      onClick={() => {
        if (isSelf && conf.screenSharing && focusedPeer) setFocusedPeer(null)
        else if (!isSelf && (hasVideo || isPeerSharing)) setFocusedPeer(focusedPeer === id ? null : id)
      }}
      onContextMenu={e => { if (!isSelf) { e.preventDefault(); setVolumeMenuPeer(volumeMenuPeer === id ? null : id) } }}
      >
        {hasVideo ? (
          <video autoPlay playsInline muted
            ref={el => { if (el && stream && el.srcObject !== stream) { el.srcObject = stream; el.play().catch(() => {}) } }}
            style={{ width: '100%', height: '100%', objectFit: (isPeerSharing || isSelfScreenSharePreview) ? 'contain' : 'cover', position: 'absolute', inset: 0, background: (isPeerSharing || isSelfScreenSharePreview) ? '#000' : undefined }} />
        ) : (
          <div style={{ textAlign: 'center', padding: isSmall ? 8 : 16 }}>
            <Avatar url={avatar} name={name} size={isSmall ? 32 : 56} />
            <div style={{
              color: C.text, fontSize: isSmall ? 11 : 13, fontWeight: 600, marginTop: isSmall ? 4 : 8,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isSmall ? 80 : 140,
            }}>{isSelf ? 'You' : name}</div>
          </div>
        )}
        <div style={{ position: 'absolute', top: isSmall ? 4 : 6, right: isSmall ? 4 : 6, display: 'flex', alignItems: 'center', gap: 3 }}>
          <Wifi size={isSmall ? 10 : 12} color={signalColor} />
        </div>
        {/* v1.5.2208 — soundboard play badge. The peerSoundboardPlays
            map is keyed by participant userId; for the screen-share
            tile we still want to show it for the realId. */}
        {(() => {
          const meta = conf.peerSoundboardPlays?.get(realId)
          if (!meta) return null
          return (
            <div style={{
              position: 'absolute', top: isSmall ? 18 : 24, left: isSmall ? 4 : 8,
              background: 'rgba(67,181,129,0.92)', borderRadius: 999,
              padding: isSmall ? '2px 7px' : '3px 9px',
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: isSmall ? 9 : 11, fontWeight: 700, color: '#fff',
              boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
              maxWidth: 'calc(100% - 16px)',
              animation: 'bundy-sb-pulse 0.6s ease-out',
            }}>
              <Volume2 size={isSmall ? 9 : 11} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {meta.emoji ? `${meta.emoji} ${meta.name}` : meta.name}
              </span>
              <style>{`@keyframes bundy-sb-pulse { 0% { transform: scale(0.85); opacity: 0 } 60% { transform: scale(1.05); opacity: 1 } 100% { transform: scale(1); opacity: 1 } }`}</style>
            </div>
          )
        })()}
        <div style={{
          position: 'absolute', bottom: isSmall ? 4 : 8, left: isSmall ? 4 : 8, right: isSmall ? 4 : 8,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{
            background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: isSmall ? '2px 6px' : '3px 8px',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ color: '#fff', fontSize: isSmall ? 9 : 11, fontWeight: 500 }}>{isSelf ? 'You' : name}</span>
            {(isPeerSharing || isSelfScreenSharePreview) && <Monitor size={isSmall ? 8 : 10} color="#43B581" />}
            {isMutedPeer && <MicOff size={isSmall ? 8 : 10} color="#f87171" />}
            {isDeafenedPeer && <HeadphoneOff size={isSmall ? 8 : 10} />}
          </div>
        </div>
        {!isSelf && volumeMenuPeer === id && (
          <div onClick={e => e.stopPropagation()} style={{
            position: 'absolute', bottom: isSmall ? 22 : 32, left: 8, right: 8,
            background: 'rgba(0,0,0,0.85)', borderRadius: 6, padding: '8px 10px',
            display: 'flex', flexDirection: 'column', gap: 6, zIndex: 2,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#9ca3af', fontSize: 10, whiteSpace: 'nowrap' }}>Vol</span>
              <input type="range" min={0} max={200} value={vol}
                onChange={e => conf.setPeerVolume(id, Number(e.target.value))}
                style={{ flex: 1, accentColor: '#43B581', height: 4, cursor: 'pointer' }} />
              <span style={{ color: '#9ca3af', fontSize: 10, minWidth: 28, textAlign: 'right' }}>{vol}%</span>
            </div>
            <button
              onClick={() => conf.setPeerVolume(id, vol === 0 ? 100 : 0)}
              style={{
                background: vol === 0 ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.08)',
                border: 'none', borderRadius: 4, padding: '4px 0', cursor: 'pointer',
                color: vol === 0 ? '#f87171' : '#9ca3af', fontSize: 10, fontWeight: 600,
              }}
            >
              {vol === 0 ? 'Unmute for me' : 'Mute for me'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', background: C.contentBg }}>
      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${C.separator}`, background: C.lgBg, flexShrink: 0,
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {isVcMode ? <Volume2 size={18} color={C.accent} /> : <Phone size={18} color={C.accent} />}
        <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{channelName}</span>
        <span style={{ color: C.textMuted, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Users size={12} /> {conf.totalParticipants}
        </span>
        <span style={{ color: C.textMuted, fontSize: 12, marginLeft: 4 }}>{formatDuration(conf.callDuration)}</span>
        {/* v1.5.2107 — noise-suppression / echo-cancel pill so the user
             can verify it's enabled. The actual flags are passed to
             both the LiveKit room defaults and createLocalAudioTrack
             — see useConference.ts. WebRTC native (open source). */}
        <span
          title="Background noise + echo + auto-gain are suppressed automatically (browser WebRTC native)"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            marginLeft: 4, padding: '2px 8px', borderRadius: 999,
            background: `${C.success}18`, color: C.success,
            fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: 3, background: C.success,
            boxShadow: `0 0 6px ${C.success}`,
          }} />
          Noise suppression ON
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={conf.loadInviteUsers} title="Invite"
          style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: C.text, fontSize: 12 }}>
          <UserPlus2 size={13} /> Invite
        </button>
        {isVcMode && (
          <button onClick={() => { setShowChat(!showChat); if (!showChat) loadChatMessages() }} title="Messages"
            style={{ background: showChat ? `${C.accent}30` : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: showChat ? C.accent : C.text, fontSize: 12 }}>
            <MessageSquare size={13} /> Chat
          </button>
        )}
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, gap: 12, minHeight: 0, overflow: 'auto' }}>
          {showFocusMode ? (
            <>
              {/* Large screen share / focused video */}
              <div ref={focusContainerRef} style={{
                flex: 1, borderRadius: 12, overflow: 'hidden', background: '#000',
                position: 'relative', minHeight: 200,
                cursor: screenZoom > 1 ? (isPanning.current ? 'grabbing' : 'grab') : ((conf.screenSharing && !focusedPeer) ? 'default' : 'pointer'),
              }}
              onClick={() => { if (screenZoom <= 1 && (!conf.screenSharing || focusedPeer)) setFocusedPeer(null) }}
              onWheel={e => {
                e.preventDefault()
                setScreenZoom(prev => {
                  const next = Math.min(5, Math.max(1, prev - e.deltaY * 0.002))
                  if (next <= 1) setScreenPan({ x: 0, y: 0 })
                  return next
                })
              }}
              onMouseDown={e => {
                if (screenZoom > 1 && e.button === 0) {
                  isPanning.current = true
                  panStart.current = { x: e.clientX, y: e.clientY }
                  panOffset.current = { ...screenPan }
                  e.preventDefault()
                }
              }}
              onMouseMove={e => {
                if (isPanning.current) {
                  setScreenPan({
                    x: panOffset.current.x + (e.clientX - panStart.current.x),
                    y: panOffset.current.y + (e.clientY - panStart.current.y),
                  })
                }
              }}
              onMouseUp={() => { isPanning.current = false }}
              onMouseLeave={() => { isPanning.current = false }}
              title={conf.screenSharing && !focusedPeer ? 'Your screen share' : screenZoom > 1 ? 'Drag to pan, scroll to zoom' : 'Scroll to zoom, click to exit focus view'}
              >
                {focusedPeer && conf.peers.get(focusedPeer)?.stream ? (
                  <video key={`focus-${focusedPeer}`} autoPlay playsInline muted
                    ref={el => { focusVideoRef.current = el }}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${screenZoom}) translate(${screenPan.x / screenZoom}px, ${screenPan.y / screenZoom}px)`, transformOrigin: 'center center', transition: isPanning.current ? 'none' : 'transform 0.1s' }} />
                ) : conf.screenSharing ? (
                  <video key="self-screenshare" autoPlay playsInline muted
                    ref={el => {
                      if (el && conf.screenShareStream.current) {
                        if (el.srcObject !== conf.screenShareStream.current) el.srcObject = conf.screenShareStream.current
                        el.play().catch(() => {})
                      }
                    }}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${screenZoom}) translate(${screenPan.x / screenZoom}px, ${screenPan.y / screenZoom}px)`, transformOrigin: 'center center', transition: isPanning.current ? 'none' : 'transform 0.1s' }} />
                ) : null}
                {/* Minimap — shows when zoomed in */}
                {(conf.screenSharing || (focusedPeer && focusedPeer.includes(':screen'))) && screenZoom > 1 && (() => {
                  const mmW = 120, mmH = 80
                  const cW = focusContainerRef.current?.clientWidth ?? 600
                  const cH = focusContainerRef.current?.clientHeight ?? 400
                  const vpW = mmW / screenZoom
                  const vpH = mmH / screenZoom
                  const vpLeft = mmW * (0.5 - 0.5 / screenZoom) - screenPan.x * mmW / (screenZoom * cW)
                  const vpTop = mmH * (0.5 - 0.5 / screenZoom) - screenPan.y * mmH / (screenZoom * cH)
                  const clampedLeft = Math.max(0, Math.min(mmW - vpW, vpLeft))
                  const clampedTop = Math.max(0, Math.min(mmH - vpH, vpTop))
                  return (
                    <div
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => {
                        e.stopPropagation()
                        e.preventDefault()
                        isMinimapDragging.current = true
                        const rect = e.currentTarget.getBoundingClientRect()
                        const mx = e.clientX - rect.left
                        const my = e.clientY - rect.top
                        const newPanX = (0.5 - mx / mmW) * screenZoom * cW
                        const newPanY = (0.5 - my / mmH) * screenZoom * cH
                        setScreenPan({ x: newPanX, y: newPanY })
                      }}
                      onMouseMove={e => {
                        if (!isMinimapDragging.current) return
                        e.stopPropagation()
                        const rect = e.currentTarget.getBoundingClientRect()
                        const mx = Math.max(0, Math.min(mmW, e.clientX - rect.left))
                        const my = Math.max(0, Math.min(mmH, e.clientY - rect.top))
                        const newPanX = (0.5 - mx / mmW) * screenZoom * cW
                        const newPanY = (0.5 - my / mmH) * screenZoom * cH
                        setScreenPan({ x: newPanX, y: newPanY })
                      }}
                      onMouseUp={e => { e.stopPropagation(); isMinimapDragging.current = false }}
                      onMouseLeave={() => { isMinimapDragging.current = false }}
                      style={{
                        position: 'absolute', bottom: 46, right: 12,
                        width: mmW, height: mmH,
                        background: 'rgba(0,0,0,0.65)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)',
                        cursor: 'crosshair', overflow: 'hidden', zIndex: 2,
                      }}
                      title="Minimap — click or drag to pan"
                    >
                      {/* Viewport indicator */}
                      <div style={{
                        position: 'absolute',
                        left: clampedLeft, top: clampedTop,
                        width: vpW, height: vpH,
                        border: '2px solid rgba(255,255,255,0.7)',
                        borderRadius: 3,
                        background: 'rgba(255,255,255,0.08)',
                        pointerEvents: 'none',
                      }} />
                    </div>
                  )
                })()}
                {/* Zoom controls — bottom-right */}
                {(conf.screenSharing || (focusedPeer && focusedPeer.includes(':screen'))) && (
                  <div style={{
                    position: 'absolute', bottom: 12, right: 12,
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: '4px 6px',
                  }}>
                    <button onClick={e => { e.stopPropagation(); setScreenZoom(prev => Math.max(1, prev - 0.5)); if (screenZoom <= 1.5) setScreenPan({ x: 0, y: 0 }) }}
                      style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px 6px', fontSize: 16, lineHeight: 1 }}>−</button>
                    <span style={{ color: '#ccc', fontSize: 11, minWidth: 36, textAlign: 'center' }}>{Math.round(screenZoom * 100)}%</span>
                    <button onClick={e => { e.stopPropagation(); setScreenZoom(prev => Math.min(5, prev + 0.5)) }}
                      style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px 6px', fontSize: 16, lineHeight: 1 }}>+</button>
                    {screenZoom > 1 && (
                      <button onClick={e => { e.stopPropagation(); setScreenZoom(1); setScreenPan({ x: 0, y: 0 }) }}
                        style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '2px 6px', fontSize: 11 }}>Reset</button>
                    )}
                  </div>
                )}
                <div style={{
                  position: 'absolute', bottom: 12, left: 12,
                  background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '4px 10px',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {focusedPeer ? (
                    <>
                      <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{conf.peers.get(focusedPeer)?.name ?? 'Unknown'}</span>
                      {!!conf.peerMuted.get(focusedPeer.split(':')[0]) && <MicOff size={10} color="#f87171" />}
                      {focusedPeer.includes(':screen') && (
                        <span style={{ color: '#43B581', fontSize: 10, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Monitor size={10} /> Sharing
                        </span>
                      )}
                    </>
                  ) : conf.screenSharing ? (
                    <><Monitor size={12} color="#43B581" /><span style={{ color: '#43B581', fontSize: 12, fontWeight: 600 }}>You are sharing your screen</span></>
                  ) : null}
                </div>
              </div>
              {/* Small cards row */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, overflowX: 'auto', paddingBottom: 4 }}>
                <div style={{ width: 120, flexShrink: 0, cursor: conf.screenSharing && focusedPeer ? 'pointer' : undefined }}>
                  {renderParticipantCard(auth.userId, conf.screenSharing && focusedPeer ? conf.screenShareStream.current : conf.localStream.current, auth.username, auth.avatarUrl, true, 'small')}
                </div>
                {conf.peerList.filter(([id]) => id !== focusedPeer).map(([id, p]) => (
                  <div key={id} style={{ width: 120, flexShrink: 0 }}>
                    {renderParticipantCard(id, p.stream, p.name, p.avatar, false, 'small')}
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Grid mode */
            <div style={{
              flex: 1, display: 'flex', flexWrap: 'wrap', gap: 16, alignContent: 'center', justifyContent: 'center',
              padding: conf.totalParticipants === 1 ? (isVcMode ? '0 10%' : '0 20%') : undefined,
            }}>
              {!isVcMode && conf.totalParticipants === 1 ? (
                /* Calling state — waiting for target to pick up */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 40 }}>
                  <div style={{
                    width: 96, height: 96, borderRadius: '50%', position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{
                      position: 'absolute', inset: -8, borderRadius: '50%',
                      border: '3px solid rgba(67,181,129,0.3)',
                      animation: 'callingPulse 1.5s ease-in-out infinite',
                    }} />
                    <Avatar url={initialParticipants[0]?.avatar ?? null} name={channelName} size={96} />
                  </div>
                  <div style={{ color: C.text, fontSize: 18, fontWeight: 700 }}>{channelName}</div>
                  <div style={{ color: C.textMuted, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Phone size={14} />
                    <span>Calling…</span>
                  </div>
                </div>
              ) : (() => {
                const count = conf.totalParticipants
                const cardWidth = count === 1 ? '100%' : count <= 4 ? 'calc(50% - 8px)' : 'calc(33.33% - 11px)'
                const cardMinW = count === 1 ? (isVcMode ? 320 : 240) : 200
                const cardMaxW = count === 1 ? (isVcMode ? 800 : 400) : count <= 2 ? (isVcMode ? 500 : 400) : 320
                return (
                  <>
                    <div style={{ width: cardWidth, minWidth: cardMinW, maxWidth: cardMaxW }}>
                      {renderParticipantCard(auth.userId, conf.localStream.current, auth.username, auth.avatarUrl, true)}
                    </div>
                    {conf.peerList.map(([id, p]) => (
                      <div key={id} style={{ width: cardWidth, minWidth: cardMinW, maxWidth: cardMaxW }}>
                        {renderParticipantCard(id, p.stream, p.name, p.avatar, false)}
                      </div>
                    ))}
                  </>
                )
              })()}
            </div>
          )}
        </div>

        {/* Chat overlay */}
        {isVcMode && showChat && (
          <div style={{ position: 'absolute', inset: 0, background: C.contentBg, display: 'flex', flexDirection: 'column', zIndex: 5 }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.separator}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={16} color={C.accent} />
              <span style={{ fontWeight: 600, fontSize: 14, color: C.text, flex: 1 }}>Chat</span>
              <button onClick={() => setShowChat(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, padding: '40px 0' }}>
                  No messages yet. Start the conversation!
                </div>
              )}
              {chatMessages.map((msg, i) => {
                const prevMsg = chatMessages[i - 1]
                const timeDiff = prevMsg ? new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() : Infinity
                const showHeader = !prevMsg || prevMsg.sender.id !== msg.sender.id || timeDiff > 5 * 60 * 1000
                const senderName = msg.sender.alias ?? msg.sender.username
                return (
                  <div key={msg.id} style={{ display: 'flex', gap: 8, marginTop: showHeader ? 10 : 1, paddingLeft: showHeader ? 0 : 40 }}>
                    {showHeader && (
                      <div style={{ width: 32, height: 32, flexShrink: 0 }}>
                        <Avatar url={msg.sender.avatarUrl} name={senderName} size={32} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {showHeader && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 1 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{senderName}</span>
                          <span style={{ fontSize: 10, color: C.textMuted }}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      )}
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4, wordBreak: 'break-word' }}>{renderMessageContent(msg.content, false)}</div>
                    </div>
                  </div>
                )
              })}
              <div ref={chatEndRef} />
            </div>
            <MessageInput
              placeholder={`Message #${channelName}...`}
              config={config} channelId={channelId}
              onTyping={() => {}}
              input={chatInput} setInput={setChatInput}
              sendFn={sendChatMessage} sending={chatSending}
            />
          </div>
        )}
      </div>

      {/* PTT indicator */}
      {conf.pushToTalk && conf.muted && (
        <div style={{ padding: '6px 16px', textAlign: 'center', flexShrink: 0 }}>
          <span style={{
            display: 'inline-block', padding: '4px 14px', borderRadius: 6,
            background: 'rgba(88,101,242,0.2)', color: '#5865F2', fontSize: 12, fontWeight: 600,
          }}>
            Push to Talk — Hold <span style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 3, padding: '1px 6px', marginLeft: 4 }}>V</span>
          </span>
        </div>
      )}

      {/* Bottom control bar — flexWrap so buttons wrap to a second
           row on narrow windows (especially during screen share where
           the gallery side eats horizontal space) instead of overflowing
           off-screen. v1.5.2105. */}
      <div style={{
        borderTop: `1px solid ${C.separator}`, background: C.lgBg, flexShrink: 0,
        padding: '10px 12px', display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 8, flexWrap: 'wrap', rowGap: 8,
      }}>
        <ControlBtn icon={conf.muted ? <MicOff size={18} /> : <Mic size={18} />}
          label={conf.muted ? 'Unmute' : 'Mute'} active={!conf.muted} danger={conf.muted} onClick={conf.toggleMute} />
        <ControlBtn icon={conf.deafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
          label={conf.deafened ? 'Undeafen' : 'Deafen'} active={!conf.deafened} danger={conf.deafened} onClick={conf.toggleDeafen} />
        <ControlBtn icon={conf.videoActive && !conf.videoOff ? <Video size={18} /> : <VideoOff size={18} />}
          label={conf.screenSharing ? 'Camera unavailable while sharing' : conf.videoActive && !conf.videoOff ? 'Turn Off Camera' : 'Turn On Camera'}
          active={conf.videoActive && !conf.videoOff} disabled={conf.screenSharing} onClick={conf.toggleVideo} />
        <ControlBtn icon={<Monitor size={18} />}
          label={conf.screenSharing ? 'Stop Sharing' : 'Share Screen'}
          active={conf.screenSharing} highlight={conf.screenSharing} onClick={conf.toggleScreenShare} />
        {/* Camera resolution settings removed in v1.5.2105 — the
             auto-negotiated resolution from LiveKit is fine for our
             scale and the UI was clutter. */}
        {/* Single reaction toggle — opens a popover with the full emoji
            set instead of cluttering the controls bar with 4 inline
            emoji buttons. Closes on click-outside via backdrop. */}
        <div style={{ position: 'relative' }}>
          {/* v1.5.2105 — sized to match ControlBtn (40×40) so the bottom
               bar reads as a single row of equal-sized affordances. */}
          <button
            onClick={() => setShowReactionPicker(v => !v)}
            title="React"
            style={{
              background: showReactionPicker ? `${C.accent}30` : 'rgba(255,255,255,0.06)',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: showReactionPicker ? C.accent : '#9ca3af', transition: 'background 0.15s',
            }}>
            <Smile size={18} />
          </button>
          {showReactionPicker && (
            <>
              <div onClick={() => setShowReactionPicker(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
              <div style={{
                position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                marginBottom: 8, background: '#1e1f22',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                padding: '6px 8px', display: 'flex', gap: 2, zIndex: 9999,
                boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
              }}>
                {['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏'].map(emoji => (
                  <button key={emoji}
                    onClick={() => { conf.sendReaction(emoji); setShowReactionPicker(false) }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, padding: '4px 6px', borderRadius: 6 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {/* Soundboard button — same 40×40 footprint as the rest. */}
        <button
          onClick={() => { setShowSoundboard(v => !v); if (!showSoundboard) conf.loadSoundboardSounds() }}
          title="Soundboard"
          style={{
            background: showSoundboard ? `${C.accent}30` : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: showSoundboard ? C.accent : '#9ca3af', transition: 'background 0.15s',
          }}
        >
          <Music size={18} />
        </button>
        <div style={{ width: 1, height: 24, background: C.separator, margin: '0 4px' }} />
        <button onClick={conf.handleLeave} title={isVcMode ? 'Leave Voice Channel' : 'Leave Call'}
          style={{
            background: '#ED4245', border: 'none', borderRadius: 8, cursor: 'pointer',
            padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6,
            color: '#fff', fontSize: 13, fontWeight: 600, transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#c93b3e' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#ED4245' }}>
          <PhoneOff size={16} /> Leave
        </button>
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

      {/* Screen source picker modal */}
      {conf.screenSources && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.bgSecondary, borderRadius: 12, padding: 24, width: 580, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontWeight: 700, color: '#fff', marginBottom: 16, fontSize: 16 }}>Choose what to share</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {conf.screenSources.map(src => (
                <button key={src.id} onClick={() => conf.startScreenShare(src.id)}
                  style={{ background: '#080808', border: '2px solid #333333', borderRadius: 8, cursor: 'pointer', padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'border-color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#5865F2' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#333333' }}>
                  <div style={{ width: '100%', aspectRatio: '4/3', borderRadius: 4, overflow: 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={src.thumbnail} alt={src.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </div>
                  <span style={{ color: '#cccccc', fontSize: 11, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{src.name}</span>
                </button>
              ))}
            </div>
            <button onClick={conf.dismissScreenSources}
              style={{ marginTop: 16, width: '100%', padding: '10px 0', background: '#282828', border: 'none', borderRadius: 8, color: '#cccccc', cursor: 'pointer', fontSize: 13, transition: 'background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#333' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#282828' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Invite modal */}
      {conf.showInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.bgSecondary, borderRadius: 12, padding: 20, width: 340, maxHeight: '60vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontWeight: 700, color: '#fff', marginBottom: 14, fontSize: 15 }}>Invite to {isVcMode ? 'Voice Channel' : 'Call'}</div>
            {conf.inviteUsers.length === 0 ? (
              <div style={{ color: '#6b6b6b', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No users available to invite</div>
            ) : conf.inviteUsers.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #333333' }}>
                <Avatar url={u.avatarUrl ?? null} name={u.alias ?? u.username} size={32} />
                <span style={{ flex: 1, color: '#cccccc', fontSize: 13 }}>{u.alias ?? u.username}</span>
                <button onClick={() => conf.sendInvite(u.id)}
                  style={{ background: C.accent, border: 'none', borderRadius: 6, color: '#fff', padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Invite</button>
              </div>
            ))}
            <button onClick={conf.closeInvite}
              style={{ marginTop: 16, width: '100%', padding: '8px 0', background: '#282828', border: 'none', borderRadius: 8, color: '#cccccc', cursor: 'pointer', fontSize: 13 }}>Close</button>
          </div>
        </div>
      )}

      {/* Soundboard panel — Discord-style popover above the toolbar */}
      {showSoundboard && (() => {
        const filteredSounds = conf.soundboardSounds.filter(s =>
          !sbSearch || s.name.toLowerCase().includes(sbSearch.toLowerCase())
        )
        const bookmarked = filteredSounds.filter(s => s.bookmarked)
        const allSounds = filteredSounds

        return (
          <div style={{
            position: 'absolute', bottom: 72, left: '50%', transform: 'translateX(-50%)',
            width: 420, maxHeight: 420, background: C.bgSecondary,
            borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            border: `1px solid ${C.separator}`, zIndex: 10000,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Search bar */}
            <div style={{ padding: '12px 12px 8px', flexShrink: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px',
                border: `1px solid ${C.separator}`,
              }}>
                <Search size={16} color={C.textMuted} />
                <input
                  type="text"
                  placeholder="Find the perfect sound"
                  value={sbSearch}
                  onChange={e => setSbSearch(e.target.value)}
                  style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none',
                    color: '#fff', fontSize: 13,
                  }}
                />
                {/* Volume icon */}
                <Volume2 size={16} color={C.textMuted} style={{ cursor: 'pointer', flexShrink: 0 }} />
              </div>
            </div>

            {/* Sound grid */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 12px' }}>
              {/* Bookmarked section */}
              {bookmarked.length > 0 && (
                <>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 4px 6px', color: C.textMuted, fontSize: 11,
                    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>
                    <Star size={11} /> Favorites
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
                    {bookmarked.map(s => (
                      <SoundboardButton key={`fav-${s.id}`} sound={s} conf={conf} auth={auth} />
                    ))}
                  </div>
                </>
              )}

              {/* All sounds */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 4px 6px', color: C.textMuted, fontSize: 11,
                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                <Music size={11} /> All Sounds
              </div>
              {allSounds.length === 0 ? (
                <div style={{ color: '#6b6b6b', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                  {sbSearch ? 'No sounds match your search' : 'No sounds yet — add one!'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {allSounds.map(s => (
                    <SoundboardButton key={s.id} sound={s} conf={conf} auth={auth} />
                  ))}
                  {/* Add Sound button */}
                  <button
                    onClick={() => setSbShowUploadModal(true)}
                    style={{
                      background: 'none', border: '2px dashed rgba(255,255,255,0.15)',
                      borderRadius: 8, padding: '10px 8px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      color: C.textMuted, fontSize: 12, fontWeight: 500,
                      transition: 'border-color 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = C.textMuted }}
                  >
                    <Plus size={14} /> Add Sound
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Upload Sound modal — Discord-style */}
      {sbShowUploadModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { setSbShowUploadModal(false); setSbSelectedFile(null); setSbUploadName(''); setSbUploadEmoji(''); setSbUploadVolume(1.0) }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: C.bgSecondary, borderRadius: 12, padding: 24, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{ fontWeight: 700, color: '#fff', fontSize: 18 }}>Upload a Sound</span>
              <button onClick={() => { setSbShowUploadModal(false); setSbSelectedFile(null); setSbUploadName(''); setSbUploadEmoji(''); setSbUploadVolume(1.0) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, display: 'flex' }}><X size={20} /></button>
            </div>

            {/* File picker */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: C.textMuted, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, display: 'block' }}>
                File <span style={{ color: '#ED4245' }}>*</span>
              </label>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(255,255,255,0.07)', border: `1px solid ${C.separator}`,
                borderRadius: 8, padding: '10px 12px',
              }}>
                <Upload size={16} color={C.textMuted} />
                <span style={{ flex: 1, color: sbSelectedFile ? '#fff' : C.textMuted, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sbSelectedFile ? sbSelectedFile.name : 'Choose a file'}
                </span>
                <button onClick={() => sbFileRef.current?.click()}
                  style={{
                    background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6,
                    padding: '5px 14px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>Browse</button>
              </div>
              <input ref={sbFileRef} type="file" accept="audio/*" style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) {
                    if (file.size > 1024 * 1024) { alert('File must be under 1 MB'); return }
                    setSbSelectedFile(file)
                    if (!sbUploadName) setSbUploadName(file.name.replace(/\.[^.]+$/, ''))
                  }
                }}
              />
            </div>

            {/* Name + Emoji row */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ color: C.textMuted, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, display: 'block' }}>
                  Sound Name <span style={{ color: '#ED4245' }}>*</span>
                </label>
                <input
                  type="text" placeholder="Sound Name"
                  value={sbUploadName} onChange={e => setSbUploadName(e.target.value)}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.07)', border: `1px solid ${C.separator}`,
                    borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 13,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ width: 160 }}>
                <label style={{ color: C.textMuted, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, display: 'block' }}>
                  Related Emoji
                </label>
                <input
                  type="text" placeholder="😊 Click to select"
                  value={sbUploadEmoji} onChange={e => setSbUploadEmoji(e.target.value)}
                  maxLength={4}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.07)', border: `1px solid ${C.separator}`,
                    borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 13,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Volume slider */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ color: C.textMuted, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, display: 'block' }}>
                Sound Volume
              </label>
              <input
                type="range" min={0} max={1} step={0.01}
                value={sbUploadVolume} onChange={e => setSbUploadVolume(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#5865F2', cursor: 'pointer' }}
              />
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => { setSbShowUploadModal(false); setSbSelectedFile(null); setSbUploadName(''); setSbUploadEmoji(''); setSbUploadVolume(1.0) }}
                style={{
                  flex: 1, padding: '12px 0', background: 'rgba(255,255,255,0.07)',
                  border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer',
                  fontSize: 14, fontWeight: 600,
                }}>Never mind</button>
              <button
                onClick={async () => {
                  if (!sbSelectedFile || !sbUploadName.trim()) return
                  setSbUploading(true)
                  await conf.uploadSoundboardSound(sbUploadName.trim(), sbSelectedFile, sbUploadEmoji || undefined, sbUploadVolume)
                  setSbUploading(false)
                  setSbSelectedFile(null); setSbUploadName(''); setSbUploadEmoji(''); setSbUploadVolume(1.0)
                  setSbShowUploadModal(false)
                }}
                disabled={sbUploading || !sbSelectedFile || !sbUploadName.trim()}
                style={{
                  flex: 1, padding: '12px 0', background: sbUploading || !sbSelectedFile || !sbUploadName.trim() ? 'rgba(88,101,242,0.3)' : '#5865F2',
                  border: 'none', borderRadius: 8, color: '#fff', cursor: sbUploading ? 'wait' : 'pointer',
                  fontSize: 14, fontWeight: 600,
                }}>{sbUploading ? 'Uploading…' : 'Upload'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Soundboard button component ─────────────────────────────────────────────

function SoundboardButton({ sound, conf, auth }: {
  sound: { id: string; name: string; url: string; emoji: string | null; volume: number; bookmarked: boolean; uploader: { id: string; username: string; alias: string | null } }
  conf: ReturnType<typeof useConference>
  auth: { userId: string }
}) {
  const [hovered, setHovered] = useState(false)
  const isOwner = sound.uploader.id === auth.userId
  return (
    <div
      style={{
        background: hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
        borderRadius: 8, padding: '8px 8px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
        position: 'relative', transition: 'background 0.12s',
        minHeight: 36,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => conf.playSoundboardForAll(sound.id, sound.url, sound.volume)}
      title={`Play "${sound.name}" for everyone`}
    >
      {/* Emoji or speaker icon */}
      <span style={{ fontSize: 16, flexShrink: 0, width: 22, textAlign: 'center' }}>
        {sound.emoji || '🔊'}
      </span>
      {/* Name */}
      <span style={{
        flex: 1, color: '#fff', fontSize: 12, fontWeight: 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{sound.name}</span>

      {/* Hover actions */}
      {hovered && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
          onClick={e => e.stopPropagation()}>
          {/* Preview (self only) */}
          <button
            onClick={() => conf.previewSound(sound.url, sound.volume)}
            title="Preview (only you)"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              color: 'rgba(255,255,255,0.5)', display: 'flex', borderRadius: 3,
            }}><Volume2 size={12} /></button>
          {/* Play for room */}
          <button
            onClick={() => conf.playSoundboardForAll(sound.id, sound.url, sound.volume)}
            title="Play for everyone"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              color: 'rgba(255,255,255,0.5)', display: 'flex', borderRadius: 3,
            }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          </button>
          {/* Bookmark */}
          <button
            onClick={() => conf.toggleSoundBookmark(sound.id)}
            title={sound.bookmarked ? 'Remove from favorites' : 'Add to favorites'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              color: sound.bookmarked ? '#FAA61A' : 'rgba(255,255,255,0.5)', display: 'flex', borderRadius: 3,
            }}><Star size={12} fill={sound.bookmarked ? '#FAA61A' : 'none'} /></button>
          {/* Delete (owner only) */}
          {isOwner && (
            <button
              onClick={() => conf.deleteSoundboardSound(sound.id)}
              title="Delete"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                color: 'rgba(248,113,113,0.7)', display: 'flex', borderRadius: 3,
              }}><X size={12} /></button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Control button component ────────────────────────────────────────────────

function ControlBtn({ icon, label, active, danger, highlight, disabled, onClick }: {
  icon: React.ReactNode; label: string
  active?: boolean; danger?: boolean; highlight?: boolean; disabled?: boolean
  onClick: () => void
}) {
  return (
    <button onClick={disabled ? undefined : onClick} title={label}
      style={{
        background: danger ? 'rgba(237,66,69,0.15)' : highlight ? 'rgba(67,181,129,0.2)' : 'rgba(255,255,255,0.06)',
        border: 'none', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
        width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: danger ? '#f87171' : highlight ? '#43B581' : active ? '#fff' : '#9ca3af',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = danger ? 'rgba(237,66,69,0.3)' : 'rgba(255,255,255,0.12)' }}
      onMouseLeave={e => { e.currentTarget.style.background = danger ? 'rgba(237,66,69,0.15)' : highlight ? 'rgba(67,181,129,0.2)' : 'rgba(255,255,255,0.06)' }}>
      {icon}
    </button>
  )
}
