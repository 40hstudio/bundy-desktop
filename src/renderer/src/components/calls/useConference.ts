/**
 * useConference – LiveKit SFU conference hook
 *
 * Drop-in replacement for the P2P mesh version. Uses LiveKit Room API
 * instead of manual RTCPeerConnection management. The return interface
 * is identical so VoiceChannelView / ConferenceWidget need zero changes.
 */

import { useState, useEffect, useRef } from 'react'
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  ConnectionQuality,
  ConnectionState,
  createLocalAudioTrack,
  createLocalVideoTrack,
} from 'livekit-client'
import { ApiConfig, Auth, UserInfo } from '../../types'
import { xhrUploadJson } from '../../api/xhrUpload'
import { trackUpload } from '../../stores/uploadProgressStore'
import { track } from '../../utils/eventLogger'

// ─── Types (keep identical to mesh version) ─────────────────────────────

export interface ConferencePeer {
  pc: RTCPeerConnection
  stream: MediaStream | null
  name: string
  avatar: string | null
  iceBuffer: RTCIceCandidateInit[]
  remoteDescSet: boolean
}

export interface PeerUIState {
  stream: MediaStream | null
  name: string
  avatar: string | null
}

interface UseConferenceOptions {
  config: ApiConfig
  auth: Auth
  channelId: string
  channelName: string
  initialParticipants: Array<{ id: string; name: string; avatar: string | null }>
  onLeave: () => void
}

// ─── Constants ──────────────────────────────────────────────────────────

const SIGNAL_TIMEOUT = 10_000
const HEARTBEAT_INTERVAL = 30_000

// ─── Soundboard ───────────────────────────────────────────────────────────

export interface SoundboardSound {
  id: string
  name: string
  url: string
  fileSize: number
  emoji: string | null
  volume: number
  bookmarked: boolean
  uploader: { id: string; username: string; alias: string | null }
}

// ─── Hook ───────────────────────────────────────────────────────────────

export default function useConference({
  config, auth, channelId, channelName: _channelName, initialParticipants: _initialParticipants, onLeave,
}: UseConferenceOptions) {

  // ─── State (identical to mesh version) ────────────────────────────────
  const [peers, setPeers] = useState<Map<string, PeerUIState>>(new Map())
  const [muted, setMuted] = useState(false)
  const [videoActive, setVideoActive] = useState(false)
  const [videoOff, setVideoOff] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set())
  const [localSpeaking, setLocalSpeaking] = useState(false)
  const [peerMuted, setPeerMuted] = useState<Map<string, boolean>>(new Map())
  const [peerDeafened, setPeerDeafened] = useState<Map<string, boolean>>(new Map())
  const [peerVideoOff, setPeerVideoOff] = useState<Map<string, boolean>>(new Map())
  const [peerScreenSharing, setPeerScreenSharing] = useState<Map<string, boolean>>(new Map())
  const [peerVolumes, setPeerVolumes] = useState<Map<string, number>>(new Map())
  const [peerConnectionStates, setPeerConnectionStates] = useState<Map<string, string>>(new Map())
  const [callReactions, setCallReactions] = useState<Array<{ id: number; emoji: string; from: string }>>([])
  const [screenSources, setScreenSources] = useState<Array<{ id: string; name: string; thumbnail: string }> | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteUsers, setInviteUsers] = useState<UserInfo[]>([])
  const [pushToTalk, setPushToTalk] = useState(false)
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'fair' | 'poor' | 'disconnected'>('good')

  // ─── Soundboard ───────────────────────────────────────────────────────
  const [soundboardSounds, setSoundboardSounds] = useState<SoundboardSound[]>([])
  // v1.5.2208 — who's currently playing a soundboard clip. Keyed by
  // participant identity (== userId) → { name: friendly clip name,
  // emoji, expiresAt }. Auto-clears once the badge times out so we
  // don't have to reach across the network for an "I stopped" signal.
  const [peerSoundboardPlays, setPeerSoundboardPlays] =
    useState<Map<string, { name: string; emoji?: string; expiresAt: number }>>(new Map())

  // ─── Refs ─────────────────────────────────────────────────────────────
  const roomRef = useRef<Room | null>(null)
  const peerStreamsRef = useRef<Map<string, MediaStream>>(new Map())
  const localStream = useRef<MediaStream | null>(null)
  const localVideo = useRef<HTMLVideoElement>(null)
  const screenShareStream = useRef<MediaStream | null>(null)
  const mountedRef = useRef(true)
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const peersRef = useRef<Map<string, ConferencePeer>>(new Map())
  const cleanedUpRef = useRef(false)
  const connectedAtRef = useRef(0)
  const reactionIdRef = useRef(0)
  const durationTimer = useRef<NodeJS.Timeout | null>(null)
  // v1.5.2111 — periodic ghost-peer pruner; see RoomEvent setup for usage.
  const ghostReconcilerRef = useRef<NodeJS.Timeout | null>(null)
  const deafenedRef = useRef(deafened)
  deafenedRef.current = deafened
  const peerVolumesRef = useRef(peerVolumes)
  peerVolumesRef.current = peerVolumes
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const videoTogglingRef = useRef(false)
  const lastPreviewPidRef = useRef<string | null>(null)
  const [, forceRender] = useState(0)

  // ─── Signaling helper (for metadata broadcasts) ───────────────────────

  function signalFetch(body: object): Promise<Response> {
    return fetch(`${config.apiBase}/api/calls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SIGNAL_TIMEOUT),
    })
  }

  // ─── Build peer MediaStreams from remote participant tracks ─────────
  // Creates separate streams for camera+audio and screen share

  function buildPeerStreams(participant: RemoteParticipant): { camera: MediaStream; screen: MediaStream | null } {
    const pid = participant.identity

    // Camera + audio stream
    let camStream = peerStreamsRef.current.get(pid)
    if (!camStream) {
      camStream = new MediaStream()
      peerStreamsRef.current.set(pid, camStream)
    }

    const wantedCam = new Set<MediaStreamTrack>()
    for (const pub of participant.trackPublications.values()) {
      if (!pub.track?.mediaStreamTrack) continue
      if (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) continue
      wantedCam.add(pub.track.mediaStreamTrack)
    }
    for (const t of camStream.getTracks()) { if (!wantedCam.has(t)) camStream.removeTrack(t) }
    const existCam = new Set(camStream.getTracks())
    for (const t of wantedCam) { if (!existCam.has(t)) camStream.addTrack(t) }

    // Screen share stream (separate)
    const screenPub = participant.getTrackPublication(Track.Source.ScreenShare)
    const screenTrack = screenPub?.track?.mediaStreamTrack
    const screenKey = `${pid}:screen`
    let screenStream: MediaStream | null = null
    if (screenTrack && screenPub?.isSubscribed && !screenPub?.isMuted) {
      screenStream = peerStreamsRef.current.get(screenKey) ?? null
      if (!screenStream) {
        screenStream = new MediaStream()
        peerStreamsRef.current.set(screenKey, screenStream)
      }
      const existScreen = new Set(screenStream.getTracks())
      if (!existScreen.has(screenTrack)) {
        screenStream.getTracks().forEach(t => screenStream!.removeTrack(t))
        screenStream.addTrack(screenTrack)
      }
    } else {
      peerStreamsRef.current.delete(screenKey)
    }

    return { camera: camStream, screen: screenStream }
  }

  function updatePeerUI(participant: RemoteParticipant) {
    if (!mountedRef.current) return
    const pid = participant.identity
    const { camera, screen } = buildPeerStreams(participant)
    const name = participant.name || pid
    const avatar = participant.metadata ? (() => { try { return JSON.parse(participant.metadata!).avatar ?? null } catch { return null } })() : null
    const screenKey = `${pid}:screen`

    setPeers(prev => {
      const next = new Map(prev)
      // Camera card
      next.set(pid, {
        stream: camera.getTracks().length > 0 ? camera : null,
        name,
        avatar,
      })
      // Screen share card (separate entry)
      if (screen && screen.getVideoTracks().length > 0) {
        next.set(screenKey, {
          stream: screen,
          name: `${name}'s screen`,
          avatar: null,
        })
      } else {
        next.delete(screenKey)
      }
      return next
    })

    // Audio element for playback
    const audioTrack = participant.getTrackPublication(Track.Source.Microphone)?.track
    if (audioTrack?.mediaStreamTrack) {
      let audioEl = audioElementsRef.current.get(pid)
      if (!audioEl) {
        audioEl = document.createElement('audio')
        audioEl.autoplay = true
        document.body.appendChild(audioEl)
        audioElementsRef.current.set(pid, audioEl)
      }
      audioEl.srcObject = new MediaStream([audioTrack.mediaStreamTrack])
      audioEl.play().catch(() => {})
      const vol = peerVolumesRef.current.get(pid) ?? 100
      audioEl.volume = Math.min(vol / 100, 1)
      if (deafenedRef.current) audioEl.muted = true
    }

    // Track mute/video states from LiveKit publication states
    const micPub = participant.getTrackPublication(Track.Source.Microphone)
    const camPub = participant.getTrackPublication(Track.Source.Camera)
    const screenPub = participant.getTrackPublication(Track.Source.ScreenShare)

    setPeerMuted(prev => { const n = new Map(prev); n.set(pid, micPub?.isMuted ?? true); return n })
    setPeerVideoOff(prev => { const n = new Map(prev); n.set(pid, !camPub?.isSubscribed || camPub?.isMuted !== false); return n })
    setPeerScreenSharing(prev => { const n = new Map(prev); n.set(pid, !!screenPub?.isSubscribed && !screenPub?.isMuted); return n })
    setPeerConnectionStates(prev => { const n = new Map(prev); n.set(pid, 'connected'); return n })

    // Keep peersRef in sync for consumers that read it directly (VoiceChannelView focus video, etc.)
    peersRef.current.set(pid, {
      pc: null as unknown as RTCPeerConnection,
      stream: camera.getTracks().length > 0 ? camera : null,
      name,
      avatar,
      iceBuffer: [],
      remoteDescSet: true,
    })
    if (screen && screen.getVideoTracks().length > 0) {
      peersRef.current.set(screenKey, {
        pc: null as unknown as RTCPeerConnection,
        stream: screen,
        name: `${name}'s screen`,
        avatar: null,
        iceBuffer: [],
        remoteDescSet: true,
      })
    } else {
      peersRef.current.delete(screenKey)
    }
  }

  function removePeerUI(pid: string) {
    if (!mountedRef.current) return
    const screenKey = `${pid}:screen`
    const audioEl = audioElementsRef.current.get(pid)
    if (audioEl) { audioEl.pause(); audioEl.srcObject = null; audioEl.remove(); audioElementsRef.current.delete(pid) }
    peersRef.current.delete(pid)
    peersRef.current.delete(screenKey)
    peerStreamsRef.current.delete(pid)
    peerStreamsRef.current.delete(screenKey)
    setPeers(prev => { const n = new Map(prev); n.delete(pid); n.delete(screenKey); return n })
    setPeerConnectionStates(prev => { const n = new Map(prev); n.delete(pid); return n })
    setPeerMuted(prev => { const n = new Map(prev); n.delete(pid); return n })
    setPeerDeafened(prev => { const n = new Map(prev); n.delete(pid); return n })
    setPeerVideoOff(prev => { const n = new Map(prev); n.delete(pid); return n })
    setPeerScreenSharing(prev => { const n = new Map(prev); n.delete(pid); return n })
  }

  // ─── VC sound notifications ───────────────────────────────────────────

  function playVcSound(type: 'join' | 'leave') {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      const t = ctx.currentTime
      if (type === 'join') {
        osc.frequency.setValueAtTime(880, t)
        osc.frequency.linearRampToValueAtTime(1100, t + 0.12)
      } else {
        osc.frequency.setValueAtTime(880, t)
        osc.frequency.linearRampToValueAtTime(660, t + 0.12)
      }
      gain.gain.setValueAtTime(0.18, t)
      gain.gain.linearRampToValueAtTime(0, t + 0.14)
      osc.start(t)
      osc.stop(t + 0.15)
      osc.onended = () => ctx.close()
    } catch {
      // AudioContext unavailable – silently ignore
    }
  }

  // ─── Sidebar preview helper ────────────────────────────────────────────

  function updateSidebarPreview() {
    if (!mountedRef.current) return
    const room = roomRef.current
    if (!room) return

    // Collect all remote screen shares with live video
    const screens: Array<{ pid: string; stream: MediaStream; name: string }> = []
    for (const [pid, stream] of peerStreamsRef.current.entries()) {
      if (pid.endsWith(':screen') && stream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled)) {
        const basePid = pid.replace(':screen', '')
        const rp = room.remoteParticipants.get(basePid)
        screens.push({ pid, stream, name: (rp?.name ?? basePid) + ' (Screen)' })
      }
    }

    // Collect all cameras with live video (remote + local)
    const cameras: Array<{ pid: string; stream: MediaStream; name: string }> = []
    for (const [pid, stream] of peerStreamsRef.current.entries()) {
      if (!pid.endsWith(':screen') && stream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled)) {
        const rp = room.remoteParticipants.get(pid)
        cameras.push({ pid, stream, name: rp?.name ?? pid })
      }
    }
    if (localStream.current?.getVideoTracks().some(t => t.readyState === 'live' && t.enabled)) {
      cameras.push({ pid: auth.userId, stream: localStream.current!, name: 'You' })
    }

    // Prefer screen shares
    if (screens.length > 0) {
      const current = screens.find(s => s.pid === lastPreviewPidRef.current)
      const target = current ?? screens[0]
      lastPreviewPidRef.current = target.pid
      window.dispatchEvent(new CustomEvent('bundy-vc-preview-stream', { detail: { stream: target.stream, name: target.name } }))
      return
    }

    // Cameras — keep current target if still available
    if (cameras.length > 0) {
      const current = cameras.find(c => c.pid === lastPreviewPidRef.current)
      if (current) {
        window.dispatchEvent(new CustomEvent('bundy-vc-preview-stream', { detail: { stream: current.stream, name: current.name } }))
        return
      }
      // Current target lost video — prefer active speaker
      for (const s of (room.activeSpeakers ?? [])) {
        const cam = cameras.find(c => c.pid === s.identity)
        if (cam) {
          lastPreviewPidRef.current = cam.pid
          window.dispatchEvent(new CustomEvent('bundy-vc-preview-stream', { detail: { stream: cam.stream, name: cam.name } }))
          return
        }
      }
      // Fall back to first available
      const target = cameras[0]
      lastPreviewPidRef.current = target.pid
      window.dispatchEvent(new CustomEvent('bundy-vc-preview-stream', { detail: { stream: target.stream, name: target.name } }))
      return
    }

    // Nothing available
    lastPreviewPidRef.current = null
    window.dispatchEvent(new CustomEvent('bundy-vc-preview-stream', { detail: { stream: null, name: '' } }))
  }

  // ─── Init: connect to LiveKit room ────────────────────────────────────

  async function initConference(ctrl: AbortController) {
    track('call:vc:join', { channelId })
    try {
      // 1. Fetch LiveKit token from server
      const tokenRes = await fetch(`${config.apiBase}/api/livekit/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: channelId }),
        signal: AbortSignal.timeout(SIGNAL_TIMEOUT),
      })
      if (!tokenRes.ok) throw new Error(`Token fetch failed: ${tokenRes.status}`)
      const { token, url } = await tokenRes.json()
      if (ctrl.signal.aborted) return

      // 2. Create LiveKit Room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: { autoGainControl: true, noiseSuppression: true, echoCancellation: true },
      })
      roomRef.current = room

      // 3. Wire up events BEFORE connecting
      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        updatePeerUI(participant)
        playVcSound('join')
      })

      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        removePeerUI(participant.identity)
        playVcSound('leave')
        // Re-evaluate preview — switch to another available source
        if (lastPreviewPidRef.current === participant.identity || lastPreviewPidRef.current === `${participant.identity}:screen`) {
          lastPreviewPidRef.current = null
        }
        updateSidebarPreview()
      })

      room.on(RoomEvent.TrackSubscribed, (_track, _pub, participant) => {
        if (participant instanceof RemoteParticipant) {
          updatePeerUI(participant)
          updateSidebarPreview()
        }
      })

      room.on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => {
        if (participant instanceof RemoteParticipant) {
          updatePeerUI(participant)
          updateSidebarPreview()
          setTimeout(() => {
            if (mountedRef.current) {
              updatePeerUI(participant)
              updateSidebarPreview()
            }
          }, 200)
        }
      })

      room.on(RoomEvent.TrackMuted, (pub, participant) => {
        if (participant instanceof RemoteParticipant) {
          updatePeerUI(participant)
          updateSidebarPreview()
        } else if (participant === room.localParticipant && pub.source === Track.Source.Microphone) {
          // Local microphone mute changed (server-driven, push-to-talk
          // release, etc.) — sync the React state so the icon never lies
          // about the actual track state. v1.5.2107.
          if (mountedRef.current) setMuted(true)
        }
      })

      room.on(RoomEvent.TrackUnmuted, (pub, participant) => {
        if (participant instanceof RemoteParticipant) {
          updatePeerUI(participant)
          updateSidebarPreview()
        } else if (participant === room.localParticipant && pub.source === Track.Source.Microphone) {
          if (mountedRef.current) setMuted(false)
        }
      })


      // Refresh peer UI when metadata changes (e.g. avatar set after initial connect)
      room.on(RoomEvent.ParticipantMetadataChanged, (_metadata, participant) => {
        if (participant instanceof RemoteParticipant) updatePeerUI(participant)
      })

      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        console.log('[Conference/LK] connection state:', state)
        if (state === ConnectionState.Disconnected && mountedRef.current && !cleanedUpRef.current) {
          console.warn('[Conference/LK] disconnected unexpectedly')
        }
      })

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        if (!mountedRef.current) return
        const speaking = new Set<string>()
        let localIsSpeaking = false
        for (const s of speakers) {
          if (s.identity === auth.userId) {
            localIsSpeaking = true
          } else {
            speaking.add(s.identity)
          }
        }
        setSpeakingPeers(speaking)
        setLocalSpeaking(localIsSpeaking)
        updateSidebarPreview()
      })

      room.on(RoomEvent.Disconnected, () => {
        if (mountedRef.current && !cleanedUpRef.current) {
          cleanupAll(true)
          onLeave()
        }
      })

      room.on(RoomEvent.ConnectionQualityChanged, (_quality: ConnectionQuality, participant) => {
        if (!mountedRef.current) return
        // Map LiveKit quality to the UI's 4-level scale
        type QLevel = 'good' | 'fair' | 'poor' | 'disconnected'
        const rank: Record<QLevel, number> = { good: 0, fair: 1, poor: 2, disconnected: 3 }
        let worst: QLevel = 'good'
        // Check all participants including local
        const allParticipants = [room.localParticipant, ...room.remoteParticipants.values()]
        for (const p of allParticipants) {
          const q = p.connectionQuality
          let mapped: QLevel = 'good'
          if (q === ConnectionQuality.Lost) mapped = 'disconnected'
          else if (q === ConnectionQuality.Poor) mapped = 'poor'
          else if (q === ConnectionQuality.Good) mapped = 'fair'
          // Excellent → 'good'
          if (rank[mapped] > rank[worst]) worst = mapped
        }
        setConnectionQuality(worst)
        // Also update the per-peer connection state string
        if (participant instanceof RemoteParticipant) {
          const state = participant.connectionQuality === ConnectionQuality.Lost ? 'disconnected' : 'connected'
          setPeerConnectionStates(prev => { const n = new Map(prev); n.set(participant.identity, state); return n })
        }
      })

      room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant) => {
        if (!participant || !mountedRef.current) return
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload))
          if (msg.type === 'reaction') {
            const id = ++reactionIdRef.current
            setCallReactions(prev => [...prev, { id, emoji: msg.emoji, from: (participant as RemoteParticipant).name || participant.identity }])
            setTimeout(() => setCallReactions(prev => prev.filter(r => r.id !== id)), 3000)
          } else if (msg.type === 'deafened') {
            setPeerDeafened(prev => { const n = new Map(prev); n.set(participant.identity, msg.deafened); return n })
          } else if (msg.type === 'soundboard' && msg.soundUrl) {
            // Another participant triggered a soundboard sound — play locally
            playSoundUrl(msg.soundUrl, msg.volume ?? 1.0)
            // v1.5.2208 — flag the originating participant as "currently
            // playing X" so the caller card can show a badge. Defaults to
            // 4s; the participant doesn't broadcast a stop signal so we
            // expire on a timer.
            const expiresAt = Date.now() + 4000
            const playName = (msg.soundName as string | undefined) || 'Soundboard'
            const playEmoji = msg.soundEmoji as string | undefined
            setPeerSoundboardPlays(prev => {
              const next = new Map(prev)
              next.set(participant.identity, { name: playName, emoji: playEmoji, expiresAt })
              return next
            })
          }
        } catch { /* ignore non-JSON data */ }
      })

      // 4. Connect to room
      console.log('[Conference/LK] connecting to', url)
      await room.connect(url, token)
      console.log('[Conference/LK] connected to room')
      connectedAtRef.current = Date.now()
      if (ctrl.signal.aborted) { room.disconnect(); return }

      // v1.5.2111 — periodic ghost-peer reconciler. ParticipantDisconnected
      // is reliable in the happy path, but if a peer crashes / loses network
      // / closes the laptop without disconnecting cleanly, LiveKit takes a
      // beat to evict them. This sweep prunes any local peer whose identity
      // is no longer in `room.remoteParticipants`.
      if (ghostReconcilerRef.current) clearInterval(ghostReconcilerRef.current)
      ghostReconcilerRef.current = setInterval(() => {
        if (!mountedRef.current || cleanedUpRef.current) return
        const r = roomRef.current
        if (!r) return
        const live = new Set<string>()
        for (const [, p] of r.remoteParticipants) live.add(p.identity)
        // Identify ghosts in our peers map
        for (const key of Array.from(peersRef.current.keys())) {
          const baseId = key.includes(':screen') ? key.slice(0, key.indexOf(':screen')) : key
          if (baseId === auth.userId) continue
          if (!live.has(baseId)) {
            console.log('[Conference/LK] reconciler pruning ghost peer:', key)
            removePeerUI(baseId)
          }
        }
      }, 10_000)

      // Unlock the shared soundboard AudioContext using the user's
      // "Join" gesture so subsequent soundboard plays — including ones
      // triggered by *other* participants via data channel — aren't
      // blocked by the autoplay policy.
      try {
        const ctx = getSoundboardCtx()
        if (ctx && ctx.state === 'suspended') await ctx.resume()
      } catch { /* ignore */ }

      // 5. Publish local audio track
      try {
        // v1.5.2111 — strengthen noise suppression hints. Chromium's default
        // NS is weak for keyboard/chatter; layering the Google-extension flags
        // engages the more aggressive Web RTC audio pipeline that catches
        // low-rumble + typing detection. `voiceIsolation` is Safari-only.
        // For deeper NS we'd need @livekit/krisp-noise-filter (paid).
        const audioTrack = await createLocalAudioTrack({
          autoGainControl: true,
          noiseSuppression: true,
          echoCancellation: true,
          voiceIsolation: true,
          // Browser-specific extended constraints — ignored where unsupported.
          ...({
            googHighpassFilter: true,
            googTypingNoiseDetection: true,
            googAutoGainControl: true,
            googNoiseSuppression: true,
            googEchoCancellation: true,
          } as Record<string, boolean>),
        } as Parameters<typeof createLocalAudioTrack>[0])
        await room.localParticipant.publishTrack(audioTrack)
        localStream.current = new MediaStream([audioTrack.mediaStreamTrack])
        console.log('[Conference/LK] audio track published successfully')
      } catch (err) {
        console.error('[Conference/LK] AUDIO CAPTURE FAILED — mic may be blocked or unavailable:', err)
        setMuted(true)
      }

      // Set avatar in metadata so remote peers can read it
      try {
        await room.localParticipant.setMetadata(JSON.stringify({ avatar: auth.avatarUrl ?? null }))
      } catch { /* metadata optional */ }

      // 6. Populate already-present participants
      for (const [, participant] of room.remoteParticipants) {
        updatePeerUI(participant)
      }

      // 7. Listen for SSE metadata events
      listenForSSESignals(ctrl)

    } catch (err) {
      console.error('[Conference/LK] init failed:', err)
      if (!ctrl.signal.aborted) { cleanupAll(true); onLeave() }
    }
  }

  // ─── SSE signal listeners (for features that use server signaling) ────

  function listenForSSESignals(ctrl: AbortController) {
    const onConfReaction = (e: Event) => {
      const payload = (e as CustomEvent<{ emoji: string; from: string; fromName?: string; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      const id = ++reactionIdRef.current
      setCallReactions(prev => [...prev, { id, emoji: payload.emoji, from: payload.fromName ?? payload.from }])
      setTimeout(() => setCallReactions(prev => prev.filter(r => r.id !== id)), 3000)
    }

    const onConfEnded = (e: Event) => {
      const payload = (e as CustomEvent<{ channelId: string }>).detail
      if (payload.channelId !== channelId) return
      // Ignore stale conference-ended events within 5s of connecting
      if (Date.now() - connectedAtRef.current < 5000) return
      cleanupAll(false); onLeave()
    }

    window.addEventListener('bundy-conference-reaction', onConfReaction)
    window.addEventListener('bundy-conference-ended', onConfEnded)
    ctrl.signal.addEventListener('abort', () => {
      window.removeEventListener('bundy-conference-reaction', onConfReaction)
      window.removeEventListener('bundy-conference-ended', onConfEnded)
    })
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  function cleanupAll(sendLeave: boolean) {
    if (cleanedUpRef.current) return
    cleanedUpRef.current = true

    if (ghostReconcilerRef.current) {
      clearInterval(ghostReconcilerRef.current)
      ghostReconcilerRef.current = null
    }

    const room = roomRef.current
    if (room) {
      room.disconnect()
      roomRef.current = null
    }

    for (const [, audioEl] of audioElementsRef.current) {
      audioEl.pause(); audioEl.srcObject = null; audioEl.remove()
    }
    audioElementsRef.current.clear()
    peersRef.current.clear()
    peerStreamsRef.current.clear()
    screenShareStream.current = null
    localStream.current = null

    if (sendLeave) {
      signalFetch({ action: 'conference-leave', channelId }).catch(() => {})
    }

    setMuted(false); setDeafened(false); setVideoActive(false); setVideoOff(false); setScreenSharing(false)
    setPeers(new Map()); setPeerMuted(new Map()); setPeerDeafened(new Map()); setPeerVideoOff(new Map())
    setPeerScreenSharing(new Map()); setPeerVolumes(new Map()); setPeerConnectionStates(new Map())
    setSpeakingPeers(new Set()); setLocalSpeaking(false)
  }

  // ─── Controls ─────────────────────────────────────────────────────────

  // v1.5.2107 — make mute idempotent + race-free.
  //
  // Old toggleMute had two failure modes:
  //   1. If the audio track wasn't published yet (still in init or
  //      capture failed), `getTrackPublication(Microphone)` returned
  //      undefined and the if-block silently no-op'd while still
  //      flipping React state. UI would show muted but the track was
  //      unaffected — and after that the local state diverged.
  //   2. The mute state was driven by a React state ref that didn't
  //      track LiveKit's actual track-mute state, so server-side
  //      events or rapid clicks could leave the UI lying.
  //
  // Fix: route through `setMicrophoneEnabled` (LiveKit's idempotent
  // API that handles "track not ready" internally and creates one if
  // needed) and let `RoomEvent.TrackMuted/Unmuted` for the local
  // participant drive the React `muted` state. We still update React
  // state optimistically below so the icon flips immediately.
  async function toggleMute() {
    const room = roomRef.current
    const desired = !mutedRef.current
    track('call:vc:mute', { channelId, muted: desired })
    setMuted(desired)
    signalFetch({ action: 'conference-mute', channelId, muted: desired }).catch(() => {})
    if (!room) return
    try {
      await room.localParticipant.setMicrophoneEnabled(!desired)
    } catch (err) {
      console.error('[Conference/LK] setMicrophoneEnabled failed:', err)
    }
  }

  function toggleDeafen() {
    const newDeafened = !deafenedRef.current
    track('call:vc:deafen', { channelId, deafened: newDeafened })
    setDeafened(newDeafened)
    for (const [, audioEl] of audioElementsRef.current) audioEl.muted = newDeafened
    signalFetch({ action: 'conference-deafen', channelId, deafened: newDeafened }).catch(() => {})
    // Broadcast via data channel so LiveKit peers get it
    const room = roomRef.current
    if (room) {
      const msg = new TextEncoder().encode(JSON.stringify({ type: 'deafened', deafened: newDeafened }))
      room.localParticipant.publishData(msg, { reliable: true }).catch(() => {})
    }
    if (newDeafened && !mutedRef.current) {
      // Fire-and-forget — toggleMute is async since v1.5.2107.
      void toggleMute()
    }
  }

  async function toggleVideo() {
    const room = roomRef.current
    if (!room) return
    if (screenSharing) return
    if (videoTogglingRef.current) return
    videoTogglingRef.current = true

    try {
      if (!videoActive) {
        // v1.5.2208 — let the camera publish at its native resolution
        // up to 4K. The width/height fields are passed to getUserMedia as
        // `ideal` constraints, so a 1080p webcam stays at 1080p and a 4K
        // webcam goes to 2160p — no artificial cap. Bitrate scales with
        // pixel area so each tier is publishable on a normal LAN.
        const resKey = (localStorage.getItem('bundy_cam_resolution') ?? '4k') as '4k' | '1440p' | '1080p' | '720p' | '480p' | '360p'
        const resMap: Record<string, { width: number; height: number; frameRate: number; bitrate: number }> = {
          '4k':    { width: 3840, height: 2160, frameRate: 30, bitrate: 12_000_000 },
          '1440p': { width: 2560, height: 1440, frameRate: 30, bitrate: 6_000_000 },
          '1080p': { width: 1920, height: 1080, frameRate: 30, bitrate: 3_000_000 },
          '720p':  { width: 1280, height: 720,  frameRate: 30, bitrate: 1_700_000 },
          '480p':  { width: 854,  height: 480,  frameRate: 30, bitrate: 700_000 },
          '360p':  { width: 640,  height: 360,  frameRate: 30, bitrate: 400_000 },
        }
        const resolution = resMap[resKey] ?? resMap['4k']
        const videoTrack = await createLocalVideoTrack({ resolution })
        // Bump publish bitrate so 1080p doesn't get encoded down to a
        // muddy 1.7 Mbps default — LiveKit otherwise picks a conservative
        // value that looks blurry on widescreen monitors.
        await room.localParticipant.publishTrack(videoTrack, {
          videoEncoding: { maxBitrate: resolution.bitrate, maxFramerate: resolution.frameRate },
        })
        localStream.current?.addTrack(videoTrack.mediaStreamTrack)
        if (localVideo.current) {
          localVideo.current.srcObject = new MediaStream([videoTrack.mediaStreamTrack])
        }
        setVideoActive(true); setVideoOff(false)
        signalFetch({ action: 'conference-video', channelId, videoOff: false }).catch(() => {})
      } else if (!videoOff) {
        const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera)
        if (camPub) await camPub.mute()
        setVideoOff(true)
        signalFetch({ action: 'conference-video', channelId, videoOff: true }).catch(() => {})
      } else {
        const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera)
        if (camPub) {
          await camPub.unmute()
          // Refresh local video display — browser may not restart the decoder after unmute
          const track = camPub.track?.mediaStreamTrack
          if (track) {
            // Sync the video track into localStream so the visible participant card picks it up
            if (localStream.current) {
              localStream.current.getVideoTracks().forEach(t => localStream.current!.removeTrack(t))
              localStream.current.addTrack(track)
            }
            if (localVideo.current) {
              localVideo.current.srcObject = new MediaStream([track])
              localVideo.current.play().catch(() => {})
            }
          }
        }
        setVideoOff(false)
        signalFetch({ action: 'conference-video', channelId, videoOff: false }).catch(() => {})
      }
    } catch (err) {
      console.error('[Conference/LK] toggleVideo failed:', err)
    } finally {
      videoTogglingRef.current = false
    }
  }

  async function toggleScreenShare() {
    const room = roomRef.current
    if (!room) return

    if (screenSharing) {
      const screenPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)
      if (screenPub?.track) {
        await room.localParticipant.unpublishTrack(screenPub.track)
      }
      screenShareStream.current?.getTracks().forEach(t => t.stop())
      screenShareStream.current = null
      setScreenSharing(false)
      signalFetch({ action: 'conference-screen-share', channelId, sharing: false }).catch(() => {})
      if (!videoActive || videoOff) {
        signalFetch({ action: 'conference-video', channelId, videoOff: true }).catch(() => {})
      }
    } else {
      try {
        const sources = await (window as any).electronAPI.getScreenSources()
        if (!sources || sources.length === 0) return
        setScreenSources(sources)
      } catch (err) { console.error('[Conference/LK] getScreenSources failed:', err) }
    }
  }

  async function startScreenShare(sourceId: string) {
    const room = roomRef.current
    if (!room) return
    track('call:vc:screenshare:start', { channelId, sourceId })
    setScreenSources(null)
    try {
      // Ask Electron desktopCapturer for native-resolution video at
      // 30 fps. The default mandatory constraints with no width/height
      // cap topped out around 720p, which is why screen share looked
      // blurry on widescreen displays. 2560x1440 covers most laptop +
      // external displays; LiveKit will downscale if the source is
      // smaller than that.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            // v1.5.2111 — bumped from 2560×1440 to 3840×2160 to capture native
            // resolution on Retina / 4K displays. LiveKit's encoder downscales
            // if needed; capturing higher fidelity = sharper after encode.
            minWidth: 1280, maxWidth: 3840,
            minHeight: 720, maxHeight: 2160,
            // v1.5.2111 — 15 fps is plenty for screen content (mostly static)
            // and lets the same bitrate budget produce far sharper frames.
            maxFrameRate: 15,
          },
        } as any,
      })
      screenShareStream.current = stream
      const screenTrack = stream.getVideoTracks()[0]
      screenTrack.onended = () => {
        setScreenSharing(false)
        screenShareStream.current = null
        const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)
        if (pub?.track) room.localParticipant.unpublishTrack(pub.track).catch(() => {})
        signalFetch({ action: 'conference-screen-share', channelId, sharing: false }).catch(() => {})
      }

      // v1.5.2111 — VP9 codec for screen share. VP9 is dramatically more
      // efficient for the kind of content screen share produces (UI + text +
      // mostly static frames) compared to VP8 (LiveKit default). Combined
      // with simulcast=false + 15fps + 5 Mbps target, text/UI stay sharp.
      await room.localParticipant.publishTrack(screenTrack, {
        source: Track.Source.ScreenShare,
        name: 'screen',
        simulcast: false,
        videoCodec: 'vp9',
        videoEncoding: { maxBitrate: 5_000_000, maxFramerate: 15 },
      })
      setScreenSharing(true)
      signalFetch({ action: 'conference-video', channelId, videoOff: false }).catch(() => {})
      signalFetch({ action: 'conference-screen-share', channelId, sharing: true }).catch(() => {})
    } catch (err) { console.error('[Conference/LK] screen share failed:', err) }
  }

  function handleLeave() { track('call:vc:leave', { channelId }); cleanupAll(true); onLeave() }

  function sendReaction(emoji: string) {
    const id = ++reactionIdRef.current
    setCallReactions(prev => [...prev, { id, emoji, from: 'You' }])
    setTimeout(() => setCallReactions(prev => prev.filter(r => r.id !== id)), 3000)
    const room = roomRef.current
    if (room) {
      const msg = new TextEncoder().encode(JSON.stringify({ type: 'reaction', emoji }))
      room.localParticipant.publishData(msg, { reliable: true }).catch(() => {})
    }
    signalFetch({ action: 'conference-reaction', channelId, emoji }).catch(() => {})
  }

  // ─── Soundboard ───────────────────────────────────────────────────────
  //
  // Soundboard sounds are decoded + played via a shared AudioContext
  // instead of `new Audio()` so the browser doesn't block playback on
  // *remote* clients (the remote user hasn't gestured for the specific
  // sound, only for joining the call). The context is unlocked once at
  // connect time using the user's "Join" gesture, then sounds play
  // freely for the rest of the session.

  const sharedSoundboardCtxRef = useRef<AudioContext | null>(null)
  function getSoundboardCtx(): AudioContext | null {
    try {
      if (!sharedSoundboardCtxRef.current) {
        sharedSoundboardCtxRef.current = new AudioContext()
      }
      const ctx = sharedSoundboardCtxRef.current
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
      return ctx
    } catch { return null }
  }

  async function playSoundUrl(url: string, volume = 1.0) {
    try {
      const resolvedUrl = url.startsWith('/') ? `${config.apiBase}${url}` : url
      const res = await fetch(resolvedUrl, {
        headers: { Authorization: `Bearer ${config.token}` },
      })
      if (!res.ok) return
      const buf = await res.arrayBuffer()
      const ctx = getSoundboardCtx()
      if (!ctx) return
      const audioBuffer = await ctx.decodeAudioData(buf.slice(0))
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      const gain = ctx.createGain()
      gain.gain.value = Math.max(0, Math.min(1, volume))
      source.connect(gain).connect(ctx.destination)
      source.start(0)
    } catch (err) {
      console.error('[soundboard] play failed:', err)
    }
  }

  async function loadSoundboardSounds() {
    try {
      const res = await fetch(`${config.apiBase}/api/soundboard`, {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(SIGNAL_TIMEOUT),
      })
      if (!res.ok) return
      const data = await res.json()
      if (mountedRef.current) setSoundboardSounds(data.sounds ?? [])
    } catch { /* ignore */ }
  }

  async function uploadSoundboardSound(name: string, file: File, emoji?: string, volume?: number): Promise<boolean> {
    const tracker = trackUpload({ name: name || file.name, surface: 'soundboard', total: file.size })
    try {
      const fd = new FormData()
      fd.append('name', name)
      fd.append('file', file)
      if (emoji) fd.append('emoji', emoji)
      if (volume !== undefined) fd.append('volume', String(volume))
      await xhrUploadJson(
        `${config.apiBase}/api/soundboard`, config.token, fd,
        (loaded, total) => tracker.onProgress(total > 0 ? (loaded / total) * 100 : 0),
      )
      await loadSoundboardSounds()
      tracker.success()
      return true
    } catch (err) {
      tracker.fail(err instanceof Error ? err.message : String(err))
      return false
    }
  }

  async function deleteSoundboardSound(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${config.apiBase}/api/soundboard/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(SIGNAL_TIMEOUT),
      })
      if (!res.ok) return false
      setSoundboardSounds(prev => prev.filter(s => s.id !== id))
      return true
    } catch { return false }
  }

  function playSoundboardForAll(soundId: string, soundUrl: string, volume = 1.0) {
    // Play locally
    playSoundUrl(soundUrl, volume)
    // v1.5.2208 — look up the metadata so the badge can show what was
    // played, not just "Soundboard". Broadcast the same payload so peers
    // can render the same badge text on our card.
    const meta = soundboardSounds.find(s => s.id === soundId)
    const soundName = meta?.name ?? 'Soundboard'
    const soundEmoji = meta?.emoji ?? undefined
    // Tag self so our own card shows the badge too.
    setPeerSoundboardPlays(prev => {
      const next = new Map(prev)
      next.set(auth.userId, { name: soundName, emoji: soundEmoji, expiresAt: Date.now() + 4000 })
      return next
    })
    // Broadcast to all participants via data channel
    const room = roomRef.current
    if (room) {
      const msg = new TextEncoder().encode(JSON.stringify({
        type: 'soundboard', soundId, soundUrl, volume, soundName, soundEmoji,
      }))
      room.localParticipant.publishData(msg, { reliable: true }).catch(() => {})
    }
  }

  // v1.5.2208 — periodic sweep that drops expired soundboard-play badges.
  // Cheap (typically empty Map) and runs only while the conference hook
  // is mounted.
  useEffect(() => {
    const id = window.setInterval(() => {
      setPeerSoundboardPlays(prev => {
        if (prev.size === 0) return prev
        const now = Date.now()
        let mutated = false
        const next = new Map(prev)
        for (const [k, v] of prev) {
          if (v.expiresAt <= now) { next.delete(k); mutated = true }
        }
        return mutated ? next : prev
      })
    }, 500)
    return () => window.clearInterval(id)
  }, [])

  function previewSound(soundUrl: string, volume = 1.0) {
    playSoundUrl(soundUrl, volume)
  }

  async function toggleSoundBookmark(soundId: string): Promise<boolean | null> {
    try {
      const res = await fetch(`${config.apiBase}/api/soundboard/${soundId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(SIGNAL_TIMEOUT),
      })
      if (!res.ok) return null
      const data = await res.json()
      // Update local state
      setSoundboardSounds(prev => prev.map(s => s.id === soundId ? { ...s, bookmarked: data.bookmarked } : s))
      return data.bookmarked
    } catch { return null }
  }

  async function changeVideoResolution(resKey: string) {
    const room = roomRef.current
    if (!room || !videoActive || videoOff) return
    if (videoTogglingRef.current) return
    videoTogglingRef.current = true
    try {
      const resMap: Record<string, { width: number; height: number; frameRate: number; bitrate: number }> = {
        '4k':    { width: 3840, height: 2160, frameRate: 30, bitrate: 12_000_000 },
        '1440p': { width: 2560, height: 1440, frameRate: 30, bitrate: 6_000_000 },
        '1080p': { width: 1920, height: 1080, frameRate: 30, bitrate: 3_000_000 },
        '720p':  { width: 1280, height: 720,  frameRate: 30, bitrate: 1_700_000 },
        '480p':  { width: 854,  height: 480,  frameRate: 30, bitrate: 700_000 },
        '360p':  { width: 640,  height: 360,  frameRate: 30, bitrate: 400_000 },
      }
      const resolution = resMap[resKey] ?? resMap['4k']
      // Unpublish current camera track
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera)
      if (camPub?.track) {
        await room.localParticipant.unpublishTrack(camPub.track)
        camPub.track.stop()
      }
      // Create new track at the requested resolution
      const videoTrack = await createLocalVideoTrack({ resolution })
      await room.localParticipant.publishTrack(videoTrack, {
        videoEncoding: { maxBitrate: resolution.bitrate, maxFramerate: resolution.frameRate },
      })
      // Replace localStream with a fresh reference so video elements re-attach
      const audioTracks = localStream.current?.getAudioTracks() ?? []
      localStream.current = new MediaStream([...audioTracks, videoTrack.mediaStreamTrack])
      if (localVideo.current) {
        localVideo.current.srcObject = new MediaStream([videoTrack.mediaStreamTrack])
        localVideo.current.play().catch(() => {})
      }
      forceRender(n => n + 1)
    } catch (err) {
      console.error('[Conference/LK] changeVideoResolution failed:', err)
    } finally {
      videoTogglingRef.current = false
    }
  }

  function setPeerVolume(peerId: string, vol: number) {
    setPeerVolumes(prev => { const n = new Map(prev); n.set(peerId, vol); return n })
    const audioEl = audioElementsRef.current.get(peerId)
    if (audioEl) audioEl.volume = Math.min(vol / 100, 1)
  }

  async function switchAudioInput(deviceId: string, _extraConstraints?: Record<string, unknown>) {
    const room = roomRef.current
    if (!room) return
    try {
      await room.switchActiveDevice('audioinput', deviceId)
      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
      if (micPub?.track?.mediaStreamTrack) {
        localStream.current = new MediaStream([micPub.track.mediaStreamTrack])
      }
    } catch (err) { console.error('[Conference/LK] switchAudioInput failed:', err) }
  }

  async function switchAudioOutput(deviceId: string) {
    const room = roomRef.current
    if (!room) return
    try {
      await room.switchActiveDevice('audiooutput', deviceId)
      for (const [, audioEl] of audioElementsRef.current) {
        if ('setSinkId' in audioEl) await (audioEl as any).setSinkId(deviceId)
      }
    } catch (err) { console.error('[Conference/LK] switchAudioOutput failed:', err) }
  }

  async function switchVideoInput(deviceId: string) {
    const room = roomRef.current
    if (!room) return
    try {
      await room.switchActiveDevice('videoinput', deviceId)
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera)
      if (camPub?.track?.mediaStreamTrack && localVideo.current) {
        localVideo.current.srcObject = new MediaStream([camPub.track.mediaStreamTrack])
      }
    } catch (err) { console.error('[Conference/LK] switchVideoInput failed:', err) }
  }

  async function loadInviteUsers() {
    try {
      const res = await fetch(`${config.apiBase}/api/channels/${channelId}/members`, {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(SIGNAL_TIMEOUT),
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data = await res.json()
      const room = roomRef.current
      const inConf = new Set([auth.userId])
      if (room) {
        for (const [, p] of room.remoteParticipants) inConf.add(p.identity)
      }
      const others = (data.members ?? data ?? []).filter((u: UserInfo) => !inConf.has(u.id))
      setInviteUsers(others)
      setShowInvite(true)
    } catch (err) { console.error('[Conference/LK] loadInviteUsers failed:', err) }
  }

  async function sendInvite(userId: string) {
    await signalFetch({ action: 'conference-invite', to: userId, channelId }).catch(() => {})
    if (channelId.startsWith('vc_')) {
      fetch(`${config.apiBase}/api/voice-channels/invite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceChannelId: channelId.slice(3), targetUserId: userId }),
      }).catch(() => {})
    }
    setInviteUsers(prev => prev.filter(x => x.id !== userId))
  }

  function closeInvite() { setShowInvite(false) }
  function dismissScreenSources() { setScreenSources(null) }

  function togglePushToTalk() {
    const newPtt = !pushToTalk
    setPushToTalk(newPtt)
    if (newPtt) {
      const room = roomRef.current
      const micPub = room?.localParticipant.getTrackPublication(Track.Source.Microphone)
      if (micPub) micPub.mute()
      setMuted(true)
      signalFetch({ action: 'conference-mute', channelId, muted: true }).catch(() => {})
    }
  }

  // ─── Effects ──────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true
    cleanedUpRef.current = false
    const ctrl = new AbortController()
    initConference(ctrl)
    loadSoundboardSounds()
    durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000)
    // Wave C-3 — tag the activity heartbeat with the joined VC so the
    // daily rollup credits time-spent-in-voice toward work hours. Only
    // applies when the conference is bound to a persistent VC (channelId
    // starts with "vc_"); ad-hoc DM/group calls don't have a stable VC id.
    if (channelId.startsWith('vc_')) {
      window.electronAPI.setCurrentVoiceChannel?.(channelId.slice(3))
    }
    return () => {
      mountedRef.current = false
      ctrl.abort()
      cleanupAll(true)
      if (durationTimer.current) clearInterval(durationTimer.current)
      window.electronAPI.setCurrentVoiceChannel?.(null)
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      signalFetch({ action: 'conference-heartbeat', channelId }).catch(() => {})
    }, HEARTBEAT_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  const lastBroadcastSpeaking = useRef(false)
  useEffect(() => {
    if (localSpeaking && !lastBroadcastSpeaking.current) {
      lastBroadcastSpeaking.current = true
      signalFetch({ action: 'conference-speaking', channelId, speaking: true }).catch(() => {})
      return undefined
    } else if (!localSpeaking && lastBroadcastSpeaking.current) {
      const timer = setTimeout(() => {
        lastBroadcastSpeaking.current = false
        signalFetch({ action: 'conference-speaking', channelId, speaking: false }).catch(() => {})
      }, 300)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [localSpeaking])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setScreenSources(null); setShowInvite(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!pushToTalk) return
    const room = roomRef.current
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'v' && !e.repeat && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && !(e.target as HTMLElement).isContentEditable) {
        const micPub = room?.localParticipant.getTrackPublication(Track.Source.Microphone)
        if (micPub) micPub.unmute()
        setMuted(false)
        signalFetch({ action: 'conference-mute', channelId, muted: false }).catch(() => {})
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'v' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && !(e.target as HTMLElement).isContentEditable) {
        const micPub = room?.localParticipant.getTrackPublication(Track.Source.Microphone)
        if (micPub) micPub.mute()
        setMuted(true)
        signalFetch({ action: 'conference-mute', channelId, muted: true }).catch(() => {})
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [pushToTalk])

  // ─── Derived state ────────────────────────────────────────────────────

  const peerList = Array.from(peers.entries())
  // Count only real participants (exclude :screen entries) for participant count
  const totalParticipants = peerList.filter(([id]) => !id.includes(':screen')).length + 1
  const screenSharePeers = peerList.filter(([id]) => id.includes(':screen'))

  // ─── Return (identical interface to mesh version) ─────────────────────

  return {
    peers, peerList, totalParticipants,
    muted, videoActive, videoOff, screenSharing, deafened,
    callDuration, speakingPeers, localSpeaking, connectionQuality,
    peerMuted, peerDeafened, peerVideoOff, peerScreenSharing, peerVolumes, peerConnectionStates,
    callReactions, screenSources, screenSharePeers,
    showInvite, inviteUsers,
    pushToTalk,
    soundboardSounds, peerSoundboardPlays,

    toggleMute, toggleDeafen, toggleVideo, changeVideoResolution,
    toggleScreenShare, startScreenShare, dismissScreenSources,
    handleLeave, sendReaction, setPeerVolume,
    loadInviteUsers, sendInvite, closeInvite,
    switchAudioInput, switchAudioOutput, switchVideoInput,
    togglePushToTalk,
    loadSoundboardSounds, uploadSoundboardSound, deleteSoundboardSound, playSoundboardForAll,
    previewSound, toggleSoundBookmark,

    localStream, localVideo, screenShareStream,
    peersRef, audioElementsRef,
  }
}
