/**
 * useConference – shared WebRTC conference hook
 *
 * Extracted from VoiceChannelView + ConferenceWidget to eliminate ~80%
 * duplicate code. Handles all peer-connection lifecycle, audio pipelines,
 * speaking detection, screen sharing, and signaling.
 */

import { useState, useEffect, useRef } from 'react'
import { ApiConfig, Auth, UserInfo } from '../../types'

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Constants ──────────────────────────────────────────────────────────────

/** STUN-only fallback when the server /api/ice-servers endpoint is unreachable */
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

const SIGNAL_TIMEOUT = 10_000
const ICE_RESTART_DELAYS = [5_000, 10_000, 20_000] // Exponential backoff: 3 attempts
const MAX_ICE_RETRIES = ICE_RESTART_DELAYS.length
const HEARTBEAT_INTERVAL = 30_000
const HEALTH_AUDIT_INTERVAL = 15_000
const PROACTIVE_CONNECT_DELAY = 3_000 // Wait before proactively connecting to a new joiner

// ─── Hook ───────────────────────────────────────────────────────────────────

export default function useConference({
  config, auth, channelId, channelName: _channelName, initialParticipants, onLeave,
}: UseConferenceOptions) {

  // ─── State ──────────────────────────────────────────────────────────────
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

  // ─── Refs ─────────────────────────────────────────────────────────────
  const peersRef = useRef<Map<string, ConferencePeer>>(new Map())
  const localStream = useRef<MediaStream | null>(null)
  const localVideo = useRef<HTMLVideoElement>(null)
  const screenShareStream = useRef<MediaStream | null>(null)
  const mountedRef = useRef(true)
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const iceRestartTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const sharedAudioCtxRef = useRef<AudioContext | null>(null)
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map())
  const peerAnalysersRef = useRef<Map<string, AnalyserNode>>(new Map())
  const audioSourceNodesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map())
  const speakingRafRef = useRef<number | null>(null)
  const localAnalyserRef = useRef<AnalyserNode | null>(null)
  const localAudioCtxRef = useRef<AudioContext | null>(null)
  const localSpeakingRafRef = useRef<number | null>(null)
  const durationTimer = useRef<NodeJS.Timeout | null>(null)
  const initCompleteRef = useRef(false)
  const cleanedUpRef = useRef(false)
  const reactionIdRef = useRef(0)
  const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE_SERVERS)
  const iceRetryCountRef = useRef<Map<string, number>>(new Map())
  const healthAuditTimer = useRef<NodeJS.Timeout | null>(null)
  const proactiveConnectTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Refs that track latest state to avoid stale closures in WebRTC callbacks
  const deafenedRef = useRef(deafened)
  deafenedRef.current = deafened
  const peerVolumesRef = useRef(peerVolumes)
  peerVolumesRef.current = peerVolumes
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  // ─── Signaling helper ─────────────────────────────────────────────────

  function signalFetch(body: object): Promise<Response> {
    return fetch(`${config.apiBase}/api/calls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SIGNAL_TIMEOUT),
    })
  }

  // ─── Peer Connection ──────────────────────────────────────────────────

  function createPeerConnection(peerId: string, peerName: string, peerAvatar: string | null): RTCPeerConnection {
    const peerConn = new RTCPeerConnection({ iceServers: iceServersRef.current, iceTransportPolicy: 'all' })
    const peerData: ConferencePeer = {
      pc: peerConn, stream: null, name: peerName, avatar: peerAvatar,
      iceBuffer: [], remoteDescSet: false,
    }
    peersRef.current.set(peerId, peerData)

    if (localStream.current) {
      const tracks = localStream.current.getTracks()
      if (tracks.length > 0) {
        tracks.forEach(t => peerConn.addTrack(t, localStream.current!))
      } else {
        peerConn.addTransceiver('audio', { direction: 'recvonly' })
      }
    }

    // Always ensure a video transceiver exists so screen share can use
    // replaceTrack() without renegotiation (avoids offer glare when both
    // peers share at the same time).
    if (!peerConn.getTransceivers().some(t => t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video')) {
      peerConn.addTransceiver('video', { direction: 'sendrecv' })
    }

    peerConn.ontrack = e => {
      // Build a single persistent MediaStream per peer
      if (!peerData.stream) peerData.stream = new MediaStream()

      // Replace existing track of same kind if it's a different track
      const existingTrack = peerData.stream.getTracks().find(t => t.kind === e.track.kind)
      if (existingTrack && existingTrack.id !== e.track.id) peerData.stream.removeTrack(existingTrack)
      if (!peerData.stream.getTrackById(e.track.id)) peerData.stream.addTrack(e.track)

      if (e.track.kind === 'audio') {
        let audioEl = audioElementsRef.current.get(peerId)
        if (!audioEl) {
          audioEl = document.createElement('audio')
          audioEl.autoplay = true
          document.body.appendChild(audioEl)
          audioElementsRef.current.set(peerId, audioEl)
        }

        // Direct playback — srcObject straight to the audio element (same as CallWidget)
        audioEl.srcObject = peerData.stream
        audioEl.play().catch(() => {})
        const vol = peerVolumesRef.current.get(peerId) ?? 100
        audioEl.volume = Math.min(vol / 100, 1)
        if (deafenedRef.current) audioEl.muted = true

        // Separate AudioContext pipeline ONLY for speaking detection (analyser)
        if (!audioSourceNodesRef.current.has(peerId)) {
          try {
            if (!sharedAudioCtxRef.current) sharedAudioCtxRef.current = new AudioContext()
            const ctx = sharedAudioCtxRef.current
            if (ctx.state === 'suspended') ctx.resume().catch(() => {})

            const source = ctx.createMediaStreamSource(peerData.stream)
            audioSourceNodesRef.current.set(peerId, source)

            const analyser = ctx.createAnalyser()
            analyser.fftSize = 256
            analyser.smoothingTimeConstant = 0.5
            peerAnalysersRef.current.set(peerId, analyser)

            source.connect(analyser)
          } catch { /* analyser setup failed — audio still plays via direct srcObject */ }
        } else {
          if (sharedAudioCtxRef.current?.state === 'suspended') sharedAudioCtxRef.current.resume().catch(() => {})
        }
      }

      if (mountedRef.current) {
        setPeers(prev => {
          const next = new Map(prev)
          next.set(peerId, { stream: peerData.stream, name: peerData.name, avatar: peerData.avatar })
          return next
        })
      }
    }

    peerConn.onicecandidate = e => {
      if (e.candidate) {
        signalFetch({ action: 'conference-ice', to: peerId, channelId, candidate: e.candidate.toJSON() }).catch(() => {})
      }
    }

    peerConn.oniceconnectionstatechange = () => {
      const state = peerConn.iceConnectionState
      if (mountedRef.current) {
        setPeerConnectionStates(prev => { const next = new Map(prev); next.set(peerId, state); return next })
      }

      if (state === 'disconnected') {
        // Clear any existing timer before setting a new one
        const prev = iceRestartTimers.current.get(peerId)
        if (prev) clearTimeout(prev)
        const retryCount = iceRetryCountRef.current.get(peerId) ?? 0
        const delay = ICE_RESTART_DELAYS[Math.min(retryCount, MAX_ICE_RETRIES - 1)] ?? ICE_RESTART_DELAYS[MAX_ICE_RETRIES - 1]
        iceRestartTimers.current.set(peerId, setTimeout(async () => {
          iceRestartTimers.current.delete(peerId)
          // Re-check state — peer may have recovered
          if (peerConn.iceConnectionState === 'disconnected' && mountedRef.current) {
            try {
              const offer = await peerConn.createOffer({ iceRestart: true })
              await peerConn.setLocalDescription(offer)
              await signalFetch({ action: 'conference-offer', to: peerId, channelId, sdp: offer.sdp })
              iceRetryCountRef.current.set(peerId, retryCount + 1)
            } catch { /* ignore */ }
          }
        }, delay))
      } else if (state === 'connected' || state === 'completed') {
        const timer = iceRestartTimers.current.get(peerId)
        if (timer) { clearTimeout(timer); iceRestartTimers.current.delete(peerId) }
        iceRetryCountRef.current.delete(peerId) // Reset retry count on success
      } else if (state === 'failed') {
        const retryCount = iceRetryCountRef.current.get(peerId) ?? 0
        if (retryCount < MAX_ICE_RETRIES) {
          // Attempt ICE restart
          iceRetryCountRef.current.set(peerId, retryCount + 1)
          peerConn.createOffer({ iceRestart: true }).then(async offer => {
            await peerConn.setLocalDescription(offer)
            await signalFetch({ action: 'conference-offer', to: peerId, channelId, sdp: offer.sdp })
          }).catch(() => {})
        } else {
          // All retries exhausted — full teardown + rebuild
          console.warn(`[Conference] All ICE retries exhausted for ${peerId}, rebuilding connection`)
          rebuildPeerConnection(peerId)
        }
      }
    }

    peerConn.onconnectionstatechange = () => {
      if (peerConn.connectionState === 'closed') removePeer(peerId)
    }

    if (mountedRef.current) {
      setPeers(prev => {
        const next = new Map(prev)
        next.set(peerId, { stream: null, name: peerName, avatar: peerAvatar })
        return next
      })
      // Default video off until peer signals videoOff:false
      setPeerVideoOff(prev => {
        if (prev.has(peerId)) return prev
        const next = new Map(prev); next.set(peerId, true); return next
      })
    }

    return peerConn
  }

  function removePeer(peerId: string) {
    const peer = peersRef.current.get(peerId)
    if (!peer) return

    peer.pc.close()
    peersRef.current.delete(peerId)

    const sourceNode = audioSourceNodesRef.current.get(peerId)
    if (sourceNode) { try { sourceNode.disconnect() } catch {} audioSourceNodesRef.current.delete(peerId) }

    const audioEl = audioElementsRef.current.get(peerId)
    if (audioEl) { audioEl.pause(); audioEl.srcObject = null; audioEl.remove(); audioElementsRef.current.delete(peerId) }

    gainNodesRef.current.delete(peerId)
    peerAnalysersRef.current.delete(peerId)

    // Clear ICE restart timer for this peer
    const iceTimer = iceRestartTimers.current.get(peerId)
    if (iceTimer) { clearTimeout(iceTimer); iceRestartTimers.current.delete(peerId) }

    if (mountedRef.current) {
      setPeers(prev => { const next = new Map(prev); next.delete(peerId); return next })
      setPeerConnectionStates(prev => { const next = new Map(prev); next.delete(peerId); return next })
    }
  }

  async function drainPeerIceBuffer(peerId: string) {
    const peer = peersRef.current.get(peerId)
    if (!peer) return
    peer.remoteDescSet = true
    for (const c of peer.iceBuffer) {
      try { await peer.pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
    }
    peer.iceBuffer = []
  }

  /** Tear down an existing peer connection and create a fresh one with a new offer */
  async function rebuildPeerConnection(peerId: string) {
    const oldPeer = peersRef.current.get(peerId)
    if (!oldPeer) return
    const { name, avatar } = oldPeer

    // Clean up old connection (but keep the UI entry)
    oldPeer.pc.close()
    const sourceNode = audioSourceNodesRef.current.get(peerId)
    if (sourceNode) { try { sourceNode.disconnect() } catch {} audioSourceNodesRef.current.delete(peerId) }
    const audioEl = audioElementsRef.current.get(peerId)
    if (audioEl) { audioEl.pause(); audioEl.srcObject = null; audioEl.remove(); audioElementsRef.current.delete(peerId) }
    gainNodesRef.current.delete(peerId)
    peerAnalysersRef.current.delete(peerId)
    peersRef.current.delete(peerId)
    iceRetryCountRef.current.delete(peerId)

    // Create fresh connection and send offer
    try {
      const peerConn = createPeerConnection(peerId, name, avatar)
      const offer = await peerConn.createOffer()
      await peerConn.setLocalDescription(offer)
      await signalFetch({ action: 'conference-offer', to: peerId, channelId, sdp: offer.sdp })
      console.log(`[Conference] Rebuilt peer connection for ${peerId}`)
    } catch (err) {
      console.error(`[Conference] Failed to rebuild peer connection for ${peerId}:`, err)
      removePeer(peerId)
    }
  }

  // ─── Init & Signaling ─────────────────────────────────────────────────

  async function initConference(ctrl: AbortController) {
    try {
      // Fetch dynamic ICE servers (STUN + self-hosted TURN with time-limited credentials)
      try {
        const iceRes = await fetch(`${config.apiBase}/api/ice-servers`, {
          headers: { Authorization: `Bearer ${config.token}` },
          signal: AbortSignal.timeout(SIGNAL_TIMEOUT),
        })
        if (iceRes.ok) {
          const servers = await iceRes.json()
          if (Array.isArray(servers) && servers.length > 0) {
            iceServersRef.current = servers
            console.log(`[Conference] Using ${servers.length} ICE servers (${servers.some((s: RTCIceServer) => JSON.stringify(s.urls).includes('turn:')) ? 'STUN+TURN' : 'STUN-only'})`)
          }
        }
      } catch (err) {
        console.warn('[Conference] Failed to fetch ICE servers, using STUN-only fallback:', err)
      }

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (err) {
        console.warn('[Conference] getUserMedia failed, using empty stream:', err)
        stream = new MediaStream()
        setMuted(true)
      }
      if (ctrl.signal.aborted) { stream.getTracks().forEach(t => t.stop()); return }
      localStream.current = stream
      listenForConferenceSignals(ctrl)

      // Send offers to all existing participants in parallel
      await Promise.allSettled(initialParticipants.map(async (p) => {
        if (ctrl.signal.aborted) return
        const peerConn = createPeerConnection(p.id, p.name, p.avatar)
        const offer = await peerConn.createOffer()
        await peerConn.setLocalDescription(offer)
        await signalFetch({ action: 'conference-offer', to: p.id, channelId, sdp: offer.sdp })
      }))
      initCompleteRef.current = true
    } catch (err) {
      console.error('[Conference] init failed:', err)
      if (!ctrl.signal.aborted) { cleanupAll(true); onLeave() }
    }
  }

  function listenForConferenceSignals(ctrl: AbortController) {
    const onConfOffer = async (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; fromName?: string; fromAvatar?: string | null; sdp: string; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      const fromId = payload.from
      // Cancel proactive connect timer — their offer arrived
      const pct = proactiveConnectTimers.current.get(fromId)
      if (pct) { clearTimeout(pct); proactiveConnectTimers.current.delete(fromId) }
      let name = payload.fromName ?? fromId, avatar: string | null = payload.fromAvatar ?? null
      const existing = peersRef.current.get(fromId)
      if (existing) {
        if (payload.fromName && existing.name === fromId) { existing.name = payload.fromName; existing.avatar = payload.fromAvatar ?? existing.avatar }
        name = existing.name; avatar = existing.avatar
      }
      const peerConn = existing?.pc ?? createPeerConnection(fromId, name, avatar)
      try {
        const isPolite = auth.userId < fromId
        if (peerConn.signalingState === 'have-local-offer') {
          if (!isPolite) return
          await peerConn.setLocalDescription({ type: 'rollback' })
        }
        await peerConn.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
        await drainPeerIceBuffer(fromId)
        const answer = await peerConn.createAnswer()
        await peerConn.setLocalDescription(answer)
        await signalFetch({ action: 'conference-answer', to: fromId, channelId, sdp: answer.sdp })
      } catch (err) { console.error('[Conference] handling offer from', fromId, err) }
    }

    const onConfAnswer = async (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; fromName?: string; fromAvatar?: string | null; sdp: string; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      const peer = peersRef.current.get(payload.from)
      if (!peer) return
      if (payload.fromName && peer.name === payload.from) { peer.name = payload.fromName; peer.avatar = payload.fromAvatar ?? peer.avatar }
      try {
        await peer.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
        await drainPeerIceBuffer(payload.from)
      } catch (err) { console.error('[Conference] handling answer from', payload.from, err) }
    }

    const onConfIce = async (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; candidate: RTCIceCandidateInit; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      const peer = peersRef.current.get(payload.from)
      if (!peer) return
      if (peer.remoteDescSet) {
        try { await peer.pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch (err) { console.warn('[Conference] addIceCandidate failed for', payload.from, err) }
      } else {
        peer.iceBuffer.push(payload.candidate)
      }
    }

    const onConfJoined = (e: Event) => {
      const payload = (e as CustomEvent<{ userId: string; userName: string; avatar: string | null; channelId: string }>).detail
      if (payload.channelId !== channelId || payload.userId === auth.userId) return
      if (!peersRef.current.has(payload.userId)) {
        setPeers(prev => {
          const next = new Map(prev)
          next.set(payload.userId, { stream: null, name: payload.userName, avatar: payload.avatar })
          return next
        })
      }
      // Proactive connect: if the new joiner's offer doesn't arrive within
      // PROACTIVE_CONNECT_DELAY, we send an offer ourselves. This prevents
      // "deaf peer" when the joiner's offer is lost in transit via SSE.
      const existingTimer = proactiveConnectTimers.current.get(payload.userId)
      if (existingTimer) clearTimeout(existingTimer)
      proactiveConnectTimers.current.set(payload.userId, setTimeout(async () => {
        proactiveConnectTimers.current.delete(payload.userId)
        if (!mountedRef.current) return
        const peer = peersRef.current.get(payload.userId)
        if (peer && (peer.pc.iceConnectionState === 'connected' || peer.pc.iceConnectionState === 'completed')) return // Already connected
        // No connection or connection not established — send offer proactively
        console.log(`[Conference] Proactive connect: sending offer to ${payload.userName} (${payload.userId}) — their offer didn't arrive in time`)
        try {
          const peerConn = peer?.pc ?? createPeerConnection(payload.userId, payload.userName, payload.avatar)
          // Only create offer if we're in a state that allows it
          if (peerConn.signalingState === 'stable' || peerConn.signalingState === 'have-local-offer') {
            if (peerConn.signalingState === 'have-local-offer') {
              await peerConn.setLocalDescription({ type: 'rollback' })
            }
            const offer = await peerConn.createOffer()
            await peerConn.setLocalDescription(offer)
            await signalFetch({ action: 'conference-offer', to: payload.userId, channelId, sdp: offer.sdp })
          }
        } catch (err) { console.error('[Conference] Proactive connect failed for', payload.userId, err) }
      }, PROACTIVE_CONNECT_DELAY))
    }

    const onConfLeft = (e: Event) => {
      const payload = (e as CustomEvent<{ userId: string; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      removePeer(payload.userId)
    }

    const onConfEnded = (e: Event) => {
      const payload = (e as CustomEvent<{ channelId: string }>).detail
      if (payload.channelId !== channelId) return
      cleanupAll(false); onLeave()
    }

    const onConfMute = (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; channelId: string; muted: boolean }>).detail
      if (payload.channelId !== channelId) return
      setPeerMuted(prev => { const next = new Map(prev); next.set(payload.from, payload.muted); return next })
    }

    const onConfDeafen = (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; channelId: string; deafened: boolean }>).detail
      if (payload.channelId !== channelId) return
      setPeerDeafened(prev => { const next = new Map(prev); next.set(payload.from, payload.deafened); return next })
    }

    const onConfVideoOff = (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; channelId: string; videoOff: boolean }>).detail
      if (payload.channelId !== channelId) return
      setPeerVideoOff(prev => { const next = new Map(prev); next.set(payload.from, payload.videoOff); return next })
    }

    const onConfScreenShare = (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; channelId: string; sharing: boolean }>).detail
      if (payload.channelId !== channelId) return
      setPeerScreenSharing(prev => { const next = new Map(prev); next.set(payload.from, payload.sharing); return next })
    }

    const onConfReaction = (e: Event) => {
      const payload = (e as CustomEvent<{ emoji: string; from: string; fromName?: string; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      const id = ++reactionIdRef.current
      setCallReactions(prev => [...prev, { id, emoji: payload.emoji, from: payload.fromName ?? payload.from }])
      setTimeout(() => setCallReactions(prev => prev.filter(r => r.id !== id)), 3000)
    }

    window.addEventListener('bundy-conference-offer', onConfOffer)
    window.addEventListener('bundy-conference-answer', onConfAnswer)
    window.addEventListener('bundy-conference-ice', onConfIce)
    window.addEventListener('bundy-conference-joined', onConfJoined)
    window.addEventListener('bundy-conference-left', onConfLeft)
    window.addEventListener('bundy-conference-ended', onConfEnded)
    window.addEventListener('bundy-conference-mute', onConfMute)
    window.addEventListener('bundy-conference-deafen', onConfDeafen)
    window.addEventListener('bundy-conference-video', onConfVideoOff)
    window.addEventListener('bundy-conference-screen-share', onConfScreenShare)
    window.addEventListener('bundy-conference-reaction', onConfReaction)
    ctrl.signal.addEventListener('abort', () => {
      window.removeEventListener('bundy-conference-offer', onConfOffer)
      window.removeEventListener('bundy-conference-answer', onConfAnswer)
      window.removeEventListener('bundy-conference-ice', onConfIce)
      window.removeEventListener('bundy-conference-joined', onConfJoined)
      window.removeEventListener('bundy-conference-left', onConfLeft)
      window.removeEventListener('bundy-conference-ended', onConfEnded)
      window.removeEventListener('bundy-conference-mute', onConfMute)
      window.removeEventListener('bundy-conference-deafen', onConfDeafen)
      window.removeEventListener('bundy-conference-video', onConfVideoOff)
      window.removeEventListener('bundy-conference-screen-share', onConfScreenShare)
      window.removeEventListener('bundy-conference-reaction', onConfReaction)
    })
  }

  function cleanupAll(sendLeave: boolean) {
    if (cleanedUpRef.current) return
    cleanedUpRef.current = true
    for (const [, peer] of peersRef.current) peer.pc.close()
    peersRef.current.clear()
    for (const [, source] of audioSourceNodesRef.current) { try { source.disconnect() } catch {} }
    audioSourceNodesRef.current.clear()
    for (const [, audioEl] of audioElementsRef.current) { audioEl.pause(); audioEl.srcObject = null; audioEl.remove() }
    audioElementsRef.current.clear()
    sharedAudioCtxRef.current?.close().catch(() => {})
    sharedAudioCtxRef.current = null
    gainNodesRef.current.clear()
    peerAnalysersRef.current.clear()
    if (speakingRafRef.current) cancelAnimationFrame(speakingRafRef.current)
    if (localSpeakingRafRef.current) cancelAnimationFrame(localSpeakingRafRef.current)
    localAudioCtxRef.current?.close().catch(() => {})
    localStream.current?.getTracks().forEach(t => t.stop())
    screenShareStream.current?.getTracks().forEach(t => t.stop())
    if (healthAuditTimer.current) { clearInterval(healthAuditTimer.current); healthAuditTimer.current = null }
    iceRetryCountRef.current.clear()
    for (const t of proactiveConnectTimers.current.values()) clearTimeout(t)
    proactiveConnectTimers.current.clear()
    if (sendLeave) {
      signalFetch({ action: 'conference-leave', channelId }).catch(() => {})
    }
    // Reset all state so a fresh join starts clean
    setMuted(false); setDeafened(false); setVideoActive(false); setVideoOff(false); setScreenSharing(false)
    setPeers(new Map()); setPeerMuted(new Map()); setPeerDeafened(new Map()); setPeerVideoOff(new Map())
    setPeerScreenSharing(new Map()); setPeerVolumes(new Map()); setPeerConnectionStates(new Map())
    setSpeakingPeers(new Set()); setLocalSpeaking(false)
  }

  // ─── Controls ─────────────────────────────────────────────────────────

  // Helper: find video sender reliably (even if track is null after replaceTrack(null))
  function findVideoSender(pc: RTCPeerConnection): RTCRtpSender | undefined {
    // First: sender with a video track
    const direct = pc.getSenders().find(s => s.track?.kind === 'video')
    if (direct) return direct
    // Fallback: find transceiver whose receiver is video (survives replaceTrack(null))
    return pc.getTransceivers().find(t => t.receiver.track?.kind === 'video')?.sender
  }

  async function toggleVideo() {
    if (screenSharing) return // Camera not available while screen sharing
    if (!videoActive) {
      try {
        const vidStream = await navigator.mediaDevices.getUserMedia({ video: true })
        const videoTrack = vidStream.getVideoTracks()[0]
        localStream.current?.addTrack(videoTrack)
        for (const [peerId, peer] of peersRef.current) {
          const existing = findVideoSender(peer.pc)
          if (existing) {
            await existing.replaceTrack(videoTrack)
          } else {
            peer.pc.addTrack(videoTrack, localStream.current!)
            const offer = await peer.pc.createOffer()
            await peer.pc.setLocalDescription(offer)
            await signalFetch({ action: 'conference-offer', to: peerId, channelId, sdp: offer.sdp })
          }
        }
        if (localVideo.current) localVideo.current.srcObject = localStream.current
        setVideoActive(true); setVideoOff(false)
        signalFetch({ action: 'conference-video', channelId, videoOff: false }).catch(() => {})
      } catch (err) { console.error('[Conference] enableVideo failed:', err) }
    } else if (!videoOff) {
      localStream.current?.getVideoTracks().forEach(t => { t.enabled = false })
      setVideoOff(true)
      signalFetch({ action: 'conference-video', channelId, videoOff: true }).catch(() => {})
    } else {
      const camTrack = localStream.current?.getVideoTracks()[0]
      if (camTrack) {
        camTrack.enabled = true
        // Ensure sender has the camera track (may have been swapped by screen share)
        for (const [, peer] of peersRef.current) {
          const sender = findVideoSender(peer.pc)
          if (sender && sender.track !== camTrack) await sender.replaceTrack(camTrack)
        }
      }
      setVideoOff(false)
      signalFetch({ action: 'conference-video', channelId, videoOff: false }).catch(() => {})
    }
  }

  function handleLeave() { cleanupAll(true); onLeave() }

  function toggleMute() {
    const newMuted = !mutedRef.current
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = !newMuted })
    setMuted(newMuted)
    signalFetch({ action: 'conference-mute', channelId, muted: newMuted }).catch(() => {})
  }

  function toggleDeafen() {
    const newDeafened = !deafenedRef.current
    setDeafened(newDeafened)
    for (const [, audioEl] of audioElementsRef.current) audioEl.muted = newDeafened
    signalFetch({ action: 'conference-deafen', channelId, deafened: newDeafened }).catch(() => {})
    if (newDeafened && !mutedRef.current) {
      localStream.current?.getAudioTracks().forEach(t => { t.enabled = false })
      setMuted(true)
      signalFetch({ action: 'conference-mute', channelId, muted: true }).catch(() => {})
    }
  }

  async function toggleScreenShare() {
    if (screenSharing) {
      screenShareStream.current?.getTracks().forEach(t => t.stop())
      screenShareStream.current = null
      for (const [, peer] of peersRef.current) {
        const videoSender = findVideoSender(peer.pc)
        if (videoSender) {
          if (videoActive && !videoOff && localStream.current) {
            const camTrack = localStream.current.getVideoTracks()[0]
            if (camTrack) { await videoSender.replaceTrack(camTrack) }
            else { await videoSender.replaceTrack(null) }
          } else {
            await videoSender.replaceTrack(null)
          }
        }
      }
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
      } catch (err) { console.error('[Conference] getScreenSources failed:', err) }
    }
  }

  async function startScreenShare(sourceId: string) {
    setScreenSources(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } as any,
      })
      screenShareStream.current = stream
      const screenTrack = stream.getVideoTracks()[0]
      screenTrack.onended = () => {
        setScreenSharing(false)
        screenShareStream.current = null
        signalFetch({ action: 'conference-screen-share', channelId, sharing: false }).catch(() => {})
        if (!videoActive || videoOff) {
          signalFetch({ action: 'conference-video', channelId, videoOff: true }).catch(() => {})
        }
      }
      for (const [peerId, peer] of peersRef.current) {
        const existing = findVideoSender(peer.pc)
        if (existing) {
          await existing.replaceTrack(screenTrack)
        } else {
          peer.pc.addTrack(screenTrack, stream)
          const offer = await peer.pc.createOffer()
          await peer.pc.setLocalDescription(offer)
          await signalFetch({ action: 'conference-offer', to: peerId, channelId, sdp: offer.sdp })
        }
      }
      setScreenSharing(true)
      signalFetch({ action: 'conference-video', channelId, videoOff: false }).catch(() => {})
      signalFetch({ action: 'conference-screen-share', channelId, sharing: true }).catch(() => {})
    } catch (err) { console.error('[Conference] screen share failed:', err) }
  }

  function sendReaction(emoji: string) {
    const id = ++reactionIdRef.current
    setCallReactions(prev => [...prev, { id, emoji, from: 'You' }])
    setTimeout(() => setCallReactions(prev => prev.filter(r => r.id !== id)), 3000)
    signalFetch({ action: 'conference-reaction', channelId, emoji }).catch(() => {})
  }

  function setPeerVolume(peerId: string, vol: number) {
    setPeerVolumes(prev => { const next = new Map(prev); next.set(peerId, vol); return next })
    const audioEl = audioElementsRef.current.get(peerId)
    if (audioEl) audioEl.volume = Math.min(vol / 100, 1)
  }

  async function switchAudioInput(deviceId: string, extraConstraints?: Record<string, unknown>) {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId }, ...extraConstraints },
      })
      const newTrack = newStream.getAudioTracks()[0]
      const oldTrack = localStream.current?.getAudioTracks()[0]
      for (const [, peer] of peersRef.current) {
        const sender = peer.pc.getSenders().find(s => s.track?.kind === 'audio')
        if (sender) await sender.replaceTrack(newTrack)
      }
      if (oldTrack) { localStream.current?.removeTrack(oldTrack); oldTrack.stop() }
      localStream.current?.addTrack(newTrack)
      if (mutedRef.current) newTrack.enabled = false
      setupLocalSpeakingDetection()
    } catch (err) { console.error('[Conference] switchAudioInput failed:', err) }
  }

  async function switchAudioOutput(deviceId: string) {
    try {
      for (const [, audioEl] of audioElementsRef.current) {
        if ('setSinkId' in audioEl) await (audioEl as any).setSinkId(deviceId)
      }
    } catch (err) { console.error('[Conference] switchAudioOutput failed:', err) }
  }

  async function switchVideoInput(deviceId: string) {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } })
      const newTrack = newStream.getVideoTracks()[0]
      const oldTrack = localStream.current?.getVideoTracks()[0]
      for (const [, peer] of peersRef.current) {
        const sender = peer.pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) await sender.replaceTrack(newTrack)
      }
      if (oldTrack) { localStream.current?.removeTrack(oldTrack); oldTrack.stop() }
      localStream.current?.addTrack(newTrack)
      if (localVideo.current) localVideo.current.srcObject = localStream.current
      if (videoOff) newTrack.enabled = false
    } catch (err) { console.error('[Conference] switchVideoInput failed:', err) }
  }

  async function loadInviteUsers() {
    try {
      const res = await fetch(`${config.apiBase}/api/channels/${channelId}/members`, {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(SIGNAL_TIMEOUT),
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data = await res.json()
      const inConf = new Set([auth.userId, ...Array.from(peersRef.current.keys())])
      const others = (data.members ?? data ?? []).filter((u: UserInfo) => !inConf.has(u.id))
      setInviteUsers(others)
      setShowInvite(true)
    } catch (err) { console.error('[Conference] loadInviteUsers failed:', err) }
  }

  async function sendInvite(userId: string) {
    await signalFetch({ action: 'conference-invite', to: userId, channelId }).catch(() => {})
    // Also send a DM invite for voice channels
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
      localStream.current?.getAudioTracks().forEach(t => { t.enabled = false })
      setMuted(true)
      signalFetch({ action: 'conference-mute', channelId, muted: true }).catch(() => {})
    }
  }

  // ─── Speaking Detection ───────────────────────────────────────────────

  function setupLocalSpeakingDetection() {
    if (localSpeakingRafRef.current) cancelAnimationFrame(localSpeakingRafRef.current)
    localAudioCtxRef.current?.close().catch(() => {})
    if (!localStream.current) return
    const audioTracks = localStream.current.getAudioTracks()
    if (audioTracks.length === 0) return
    try {
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(localStream.current)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      localAudioCtxRef.current = ctx
      localAnalyserRef.current = analyser
      const data = new Uint8Array(analyser.frequencyBinCount)
      const check = () => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setLocalSpeaking(avg > 15)
        localSpeakingRafRef.current = requestAnimationFrame(check)
      }
      check()
    } catch {}
  }

  function startPeerSpeakingDetection() {
    if (speakingRafRef.current) cancelAnimationFrame(speakingRafRef.current)
    const data = new Uint8Array(128)
    const prevSpeaking = new Map<string, boolean>()
    const check = () => {
      let changed = false
      for (const [peerId, analyser] of peerAnalysersRef.current) {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        const speaking = avg > 15
        if (prevSpeaking.get(peerId) !== speaking) { prevSpeaking.set(peerId, speaking); changed = true }
      }
      for (const pid of prevSpeaking.keys()) {
        if (!peerAnalysersRef.current.has(pid)) { prevSpeaking.delete(pid); changed = true }
      }
      if (changed && mountedRef.current) {
        setSpeakingPeers(() => {
          const next = new Set<string>()
          for (const [pid, s] of prevSpeaking) { if (s) next.add(pid) }
          return next
        })
      }
      speakingRafRef.current = requestAnimationFrame(check)
    }
    check()
  }

  // ─── Effects ──────────────────────────────────────────────────────────

  // Main init/cleanup
  useEffect(() => {
    mountedRef.current = true
    initCompleteRef.current = false
    const ctrl = new AbortController()
    initConference(ctrl)
    durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000)
    return () => {
      mountedRef.current = false
      ctrl.abort()
      cleanupAll(initCompleteRef.current)
      if (durationTimer.current) clearInterval(durationTimer.current)
      for (const t of iceRestartTimers.current.values()) clearTimeout(t)
      iceRestartTimers.current.clear()
    }
  }, [])

  // Heartbeat to keep server conference room alive
  useEffect(() => {
    const interval = setInterval(() => {
      signalFetch({ action: 'conference-heartbeat', channelId }).catch(() => {})
    }, HEARTBEAT_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  // Connection health audit — detect stuck/failed peers and auto-rebuild,
  // AND detect UI-visible peers with no WebRTC connection at all.
  useEffect(() => {
    if (healthAuditTimer.current) clearInterval(healthAuditTimer.current)
    healthAuditTimer.current = setInterval(async () => {
      if (!mountedRef.current || !initCompleteRef.current) return

      // 1. Check existing connections for failed/closed state
      for (const [peerId, peer] of peersRef.current) {
        const state = peer.pc.iceConnectionState
        if (state === 'failed' || state === 'closed') {
          const retryCount = iceRetryCountRef.current.get(peerId) ?? 0
          if (retryCount >= MAX_ICE_RETRIES) {
            console.log(`[Conference] Health audit: rebuilding failed connection to ${peer.name} (${peerId})`)
            iceRetryCountRef.current.delete(peerId) // Reset so rebuild gets fresh retries
            rebuildPeerConnection(peerId)
          }
        }
      }

      // 2. Detect "ghost peers" — visible in UI but no WebRTC connection
      //    This catches cases where the join event arrived but both
      //    the joiner's offer AND our proactive offer were lost.
      try {
        const res = await fetch(`${config.apiBase}/api/calls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'conference-heartbeat', channelId }),
          signal: AbortSignal.timeout(SIGNAL_TIMEOUT),
        })
        if (!res.ok) return
        // Also fetch current room participants to find missing connections
        const roomRes = await fetch(`${config.apiBase}/api/calls/room?channelId=${encodeURIComponent(channelId)}`, {
          headers: { Authorization: `Bearer ${config.token}` },
          signal: AbortSignal.timeout(SIGNAL_TIMEOUT),
        })
        if (roomRes.ok) {
          const data = await roomRes.json()
          const participants: Array<{ id: string; name: string; avatar: string | null }> = data.participants ?? []
          for (const p of participants) {
            if (p.id === auth.userId) continue
            const existing = peersRef.current.get(p.id)
            if (!existing) {
              // No peer connection at all — create one
              console.log(`[Conference] Health audit: no connection to ${p.name} (${p.id}), creating offer`)
              const peerConn = createPeerConnection(p.id, p.name, p.avatar)
              const offer = await peerConn.createOffer()
              await peerConn.setLocalDescription(offer)
              await signalFetch({ action: 'conference-offer', to: p.id, channelId, sdp: offer.sdp })
            } else if (existing.pc.iceConnectionState === 'new') {
              // Connection exists but never progressed (stuck in 'new')
              console.log(`[Conference] Health audit: connection to ${p.name} stuck in 'new', sending offer`)
              if (existing.pc.signalingState === 'stable') {
                const offer = await existing.pc.createOffer()
                await existing.pc.setLocalDescription(offer)
                await signalFetch({ action: 'conference-offer', to: p.id, channelId, sdp: offer.sdp })
              }
            }
          }
        }
      } catch { /* health audit fetch failed — skip this cycle */ }
    }, HEALTH_AUDIT_INTERVAL)
    return () => {
      if (healthAuditTimer.current) { clearInterval(healthAuditTimer.current); healthAuditTimer.current = null }
    }
  }, [])

  // Local speaking detection — start once audio is available
  useEffect(() => {
    if (!localStream.current) return
    setupLocalSpeakingDetection()
    return () => {
      if (localSpeakingRafRef.current) cancelAnimationFrame(localSpeakingRafRef.current)
      localAudioCtxRef.current?.close().catch(() => {})
    }
  }, [callDuration > 0 ? 1 : 0])

  // Peer speaking detection — analyse remote audio locally (more reliable than SSE signals)
  useEffect(() => {
    if (!initCompleteRef.current) return
    startPeerSpeakingDetection()
    return () => {
      if (speakingRafRef.current) { cancelAnimationFrame(speakingRafRef.current); speakingRafRef.current = null }
    }
  }, [callDuration > 0 ? 1 : 0])

  // Broadcast local speaking state to other peers (debounced stop)
  const lastBroadcastSpeaking = useRef(false)
  useEffect(() => {
    if (!initCompleteRef.current) return undefined
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

  // Escape key — dismiss modals
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setScreenSources(null); setShowInvite(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Push-to-talk key bindings
  useEffect(() => {
    if (!pushToTalk) return
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'v' && !e.repeat && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && !(e.target as HTMLElement).isContentEditable) {
        localStream.current?.getAudioTracks().forEach(t => { t.enabled = true })
        setMuted(false)
        signalFetch({ action: 'conference-mute', channelId, muted: false }).catch(() => {})
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'v' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && !(e.target as HTMLElement).isContentEditable) {
        localStream.current?.getAudioTracks().forEach(t => { t.enabled = false })
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
  const totalParticipants = peerList.length + 1

  const screenSharePeers = peerList.filter(([id]) => !!peerScreenSharing.get(id))

  // ─── Return ───────────────────────────────────────────────────────────

  return {
    // State
    peers, peerList, totalParticipants,
    muted, videoActive, videoOff, screenSharing, deafened,
    callDuration, speakingPeers, localSpeaking,
    peerMuted, peerDeafened, peerVideoOff, peerScreenSharing, peerVolumes, peerConnectionStates,
    callReactions, screenSources, screenSharePeers,
    showInvite, inviteUsers,
    pushToTalk,

    // Actions
    toggleMute, toggleDeafen, toggleVideo,
    toggleScreenShare, startScreenShare, dismissScreenSources,
    handleLeave, sendReaction, setPeerVolume,
    loadInviteUsers, sendInvite, closeInvite,
    switchAudioInput, switchAudioOutput, switchVideoInput,
    togglePushToTalk,

    // Refs (for component-specific features that need direct access)
    localStream, localVideo, screenShareStream,
    peersRef, audioElementsRef,
  }
}
