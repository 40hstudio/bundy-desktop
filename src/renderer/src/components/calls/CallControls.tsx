import React, { useState, useEffect, useRef } from 'react'
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  Headphones, Monitor, Users, ChevronUp, Settings2,
  Minimize2, Maximize2, UserPlus2,
  Wifi, WifiLow, WifiZero, WifiOff,
  Layers, Activity, Check,
} from 'lucide-react'
import { CALL_EMOJIS } from './EmojiReactionPicker'

// HeadphoneOff is not exported from lucide-react in all versions, use a fallback
const HeadphoneOff = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11L3 18a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    <path d="M21 11v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h2" />
    <path d="M12 5a9 9 0 0 0-9 9" />
    <path d="M12 5a9 9 0 0 1 9 9" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

export function CallControls({
  muted, onToggleMute,
  deafened, onToggleDeafen,
  videoOff, onToggleVideo,
  videoActive,
  windowMode, onSetWindowMode,
  onHangup,
  participantCount,
  callDuration,
  screenSharing, onToggleScreenShare,
  onInvite,
  connectionQuality,
  onSwitchAudioInput,
  onSwitchAudioOutput,
  onSwitchVideoInput,
  localSpeaking,
  noiseSuppression, onToggleNoiseSuppression,
  backgroundBlur, onToggleBackgroundBlur,
  onReaction,
  pushToTalk, onTogglePushToTalk,
}: {
  muted: boolean; onToggleMute: () => void
  deafened?: boolean; onToggleDeafen?: () => void
  videoOff: boolean; onToggleVideo: () => void
  videoActive: boolean
  windowMode: 'mini' | 'normal' | 'fullscreen'
  onSetWindowMode: (m: 'mini' | 'normal' | 'fullscreen') => void
  onHangup: () => void
  participantCount?: number
  callDuration?: number
  screenSharing?: boolean; onToggleScreenShare?: () => void
  onInvite?: () => void
  connectionQuality?: 'good' | 'fair' | 'poor' | 'disconnected'
  onSwitchAudioInput?: (deviceId: string) => void
  onSwitchAudioOutput?: (deviceId: string) => void
  onSwitchVideoInput?: (deviceId: string) => void
  localSpeaking?: boolean
  noiseSuppression?: boolean; onToggleNoiseSuppression?: () => void
  backgroundBlur?: boolean; onToggleBackgroundBlur?: () => void
  onReaction?: (emoji: string) => void
  pushToTalk?: boolean; onTogglePushToTalk?: () => void
}) {
  const [deviceMenu, setDeviceMenu] = useState<'mic' | 'camera' | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const deviceMenuRef = useRef<HTMLDivElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([])
  const [showSpeakerList, setShowSpeakerList] = useState(false)

  useEffect(() => {
    if (!deviceMenu) return
    const h = (e: MouseEvent) => { if (deviceMenuRef.current && !deviceMenuRef.current.contains(e.target as Node)) setDeviceMenu(null) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [deviceMenu])

  useEffect(() => {
    if (!settingsOpen) return
    const h = (e: MouseEvent) => { if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) { setSettingsOpen(false); setShowSpeakerList(false) } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [settingsOpen])

  const openDeviceMenu = async (kind: 'mic' | 'camera') => {
    setSettingsOpen(false)
    if (deviceMenu === kind) { setDeviceMenu(null); return }
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const kindMap = { mic: 'audioinput', camera: 'videoinput' } as const
      setDevices(all.filter(d => d.kind === kindMap[kind] && d.deviceId))
      setDeviceMenu(kind)
    } catch { setDeviceMenu(null) }
  }

  const loadSpeakerDevices = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setSpeakerDevices(all.filter(d => d.kind === 'audiooutput' && d.deviceId))
      setShowSpeakerList(!showSpeakerList)
    } catch {}
  }

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const isMini = windowMode === 'mini'
  const iconSize = isMini ? 16 : 20

  const btnStyle = (active: boolean, activeColor?: string): React.CSSProperties => ({
    width: isMini ? 32 : 40, height: isMini ? 32 : 40,
    borderRadius: '50%', border: 'none', cursor: 'pointer',
    background: active ? (activeColor || '#ed4245') : 'rgba(255,255,255,0.1)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s',
  })
  const chevronStyle: React.CSSProperties = {
    width: 16, height: 20, border: 'none', cursor: 'pointer', padding: 0,
    background: 'rgba(255,255,255,0.08)', color: '#aaa', display: 'flex', alignItems: 'center',
    justifyContent: 'center', borderRadius: 4, marginLeft: -4,
  }
  const settingsItemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
    background: 'transparent', border: 'none', color: '#ddd', fontSize: 13,
    cursor: 'pointer', width: '100%', textAlign: 'left',
  }
  const deviceMenuStyle: React.CSSProperties = {
    position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
    background: '#1e1f22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
    padding: '4px 0', minWidth: 220, maxWidth: 300, marginBottom: 8, zIndex: 9999,
  }
  const deviceItemStyle = (isDefault?: boolean): React.CSSProperties => ({
    padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: isDefault ? '#43B581' : '#ddd',
    display: 'flex', alignItems: 'center', gap: 8, background: 'transparent',
    border: 'none', width: '100%', textAlign: 'left',
  })

  const renderDeviceMenu = (kind: 'mic' | 'camera') => {
    if (deviceMenu !== kind || isMini) return null
    const onSelect = kind === 'mic' ? onSwitchAudioInput : onSwitchVideoInput
    if (!onSelect) return null
    return (
      <div ref={deviceMenuRef} style={deviceMenuStyle}>
        <div style={{ padding: '6px 12px', fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>
          {kind === 'mic' ? 'Input Device' : 'Camera'}
        </div>
        {devices.map(d => (
          <button key={d.deviceId} style={deviceItemStyle(d.deviceId === 'default')}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            onClick={() => { onSelect(d.deviceId); setDeviceMenu(null) }}>
            {d.label || `${kind === 'mic' ? 'Microphone' : 'Camera'} ${d.deviceId.slice(0, 5)}`}
          </button>
        ))}
        {devices.length === 0 && <div style={{ padding: '8px 12px', fontSize: 12, color: '#666' }}>No devices found</div>}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: isMini ? 6 : 8 }}>
      {callDuration !== undefined && (
        <span style={{ color: '#6b6b6b', fontSize: 12, fontVariantNumeric: 'tabular-nums', marginRight: 2 }}>
          {formatDuration(callDuration)}
        </span>
      )}
      {participantCount !== undefined && participantCount > 0 && (
        <span style={{ color: '#6b6b6b', fontSize: 11, marginRight: 2 }}>
          <Users size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} />{participantCount}
        </span>
      )}

      {/* Mic + device picker */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <button onClick={onToggleMute} style={{
          ...btnStyle(muted),
          boxShadow: localSpeaking && !muted ? '0 0 0 3px #43B581' : 'none',
          transition: 'box-shadow 0.15s ease, background 0.15s',
        }} title={muted ? 'Unmute' : 'Mute'}>
          {muted ? <MicOff size={iconSize} /> : <Mic size={iconSize} />}
        </button>
        {!isMini && onSwitchAudioInput && (
          <button onClick={() => openDeviceMenu('mic')} style={chevronStyle} title="Select microphone">
            <ChevronUp size={10} />
          </button>
        )}
        {renderDeviceMenu('mic')}
      </div>

      {/* Deafen */}
      {onToggleDeafen && (
        <button onClick={onToggleDeafen} style={btnStyle(!!deafened)} title={deafened ? 'Undeafen' : 'Deafen'}>
          {deafened ? <HeadphoneOff size={iconSize} /> : <Headphones size={iconSize} />}
        </button>
      )}

      {/* Video + device picker */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <button onClick={onToggleVideo} style={btnStyle(videoOff && videoActive)} title={videoActive ? (videoOff ? 'Turn on camera' : 'Turn off camera') : 'Start video'}>
          {videoActive && !videoOff ? <Video size={iconSize} /> : <VideoOff size={iconSize} />}
        </button>
        {!isMini && onSwitchVideoInput && (
          <button onClick={() => openDeviceMenu('camera')} style={chevronStyle} title="Select camera">
            <ChevronUp size={10} />
          </button>
        )}
        {renderDeviceMenu('camera')}
      </div>

      {/* Screen Share */}
      {onToggleScreenShare && !isMini && (
        <button onClick={onToggleScreenShare} style={btnStyle(!!screenSharing, '#43B581')} title={screenSharing ? 'Stop sharing' : 'Share screen'}>
          <Monitor size={iconSize} />
        </button>
      )}

      {/* Settings gear */}
      {!isMini && (
        <div ref={settingsRef} style={{ position: 'relative' }}>
          <button onClick={() => { setSettingsOpen(!settingsOpen); setDeviceMenu(null); setShowSpeakerList(false) }}
            style={btnStyle(false)} title="Call settings">
            <Settings2 size={iconSize} />
          </button>
          {settingsOpen && (
            <div style={{
              position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
              background: '#1e1f22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
              padding: '8px 0', minWidth: 220, marginBottom: 8, zIndex: 9999,
            }}>
              {onReaction && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 2, padding: '4px 8px' }}>
                    {CALL_EMOJIS.map(e => (
                      <button key={e} onClick={() => onReaction(e)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, padding: '4px 5px', borderRadius: 4 }}
                        onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
                        onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = 'transparent' }}>
                        {e}
                      </button>
                    ))}
                  </div>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                </>
              )}
              {onToggleNoiseSuppression && (
                <button onClick={onToggleNoiseSuppression} style={settingsItemStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                  <Activity size={16} color={noiseSuppression ? '#43B581' : '#aaa'} />
                  <span style={{ flex: 1 }}>Noise Suppression</span>
                  {noiseSuppression && <Check size={14} color="#43B581" />}
                </button>
              )}
              {onToggleBackgroundBlur && videoActive && (
                <button onClick={onToggleBackgroundBlur} style={settingsItemStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                  <Layers size={16} color={backgroundBlur ? '#5865F2' : '#aaa'} />
                  <span style={{ flex: 1 }}>Background Blur</span>
                  {backgroundBlur && <Check size={14} color="#5865F2" />}
                </button>
              )}
              {onTogglePushToTalk && (
                <button onClick={onTogglePushToTalk} style={settingsItemStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                  <Mic size={16} color={pushToTalk ? '#5865F2' : '#aaa'} />
                  <span style={{ flex: 1 }}>Push to Talk <span style={{ color: '#666', fontSize: 11 }}>(V)</span></span>
                  {pushToTalk && <Check size={14} color="#5865F2" />}
                </button>
              )}
              {onSwitchAudioOutput && (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                  <button onClick={loadSpeakerDevices} style={settingsItemStyle}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    <Headphones size={16} color="#aaa" />
                    <span style={{ flex: 1 }}>Output Device</span>
                    <ChevronUp size={12} color="#666" style={{ transform: showSpeakerList ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.15s' }} />
                  </button>
                  {showSpeakerList && speakerDevices.map(d => (
                    <button key={d.deviceId} onClick={() => { onSwitchAudioOutput(d.deviceId); setShowSpeakerList(false) }}
                      style={{ ...settingsItemStyle, paddingLeft: 40, fontSize: 12 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                      {d.label || `Speaker ${d.deviceId.slice(0, 5)}`}
                    </button>
                  ))}
                </>
              )}
              {connectionQuality && (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                  <div style={{ ...settingsItemStyle, cursor: 'default' }}>
                    {connectionQuality === 'good' ? <Wifi size={16} color="#43B581" /> :
                     connectionQuality === 'fair' ? <WifiLow size={16} color="#eab308" /> :
                     connectionQuality === 'poor' ? <WifiZero size={16} color="#F04747" /> :
                     <WifiOff size={16} color="#6b7280" />}
                    <span style={{ flex: 1 }}>Connection: <span style={{ textTransform: 'capitalize', color: connectionQuality === 'good' ? '#43B581' : connectionQuality === 'fair' ? '#eab308' : '#F04747' }}>{connectionQuality}</span></span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {onInvite && !isMini && (
        <button onClick={onInvite} style={btnStyle(false)} title="Invite to call">
          <UserPlus2 size={iconSize} />
        </button>
      )}

      {/* Window mode */}
      {!isMini && (
        <button onClick={() => onSetWindowMode('mini')} style={btnStyle(false)} title="Minimize to mini window">
          <Minimize2 size={iconSize} />
        </button>
      )}
      {isMini && (
        <button onClick={() => onSetWindowMode('normal')} style={btnStyle(false)} title="Expand">
          <Maximize2 size={iconSize} />
        </button>
      )}
      {windowMode === 'normal' && (
        <button onClick={() => onSetWindowMode('fullscreen')} style={btnStyle(false)} title="Fullscreen">
          <Maximize2 size={iconSize} />
        </button>
      )}
      {windowMode === 'fullscreen' && (
        <button onClick={() => onSetWindowMode('normal')} style={btnStyle(false)} title="Exit fullscreen">
          <Minimize2 size={iconSize} />
        </button>
      )}

      {/* Hangup */}
      <button onClick={onHangup} style={{
        width: isMini ? 56 : 72, height: isMini ? 32 : 40,
        borderRadius: 24, border: 'none', cursor: 'pointer',
        background: '#ed4245', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s',
      }} title="Hang up">
        <PhoneOff size={iconSize + 2} />
      </button>
    </div>
  )
}

export default CallControls
