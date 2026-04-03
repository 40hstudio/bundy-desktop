import { useState, useEffect, useRef } from 'react'
import { Users, MicOff, Monitor, PhoneOff, Mic, Video, VideoOff, Headphones, UserPlus2, Volume2, MessageSquare, Wifi, X } from 'lucide-react'
import { ApiConfig, Auth, UserInfo } from '../../types'
import { C } from '../../theme'
import Avatar from '../shared/Avatar'
import { MessageInput } from '../messages/MessageInput'
import { renderMessageContent } from '../../utils/markdown'

// HeadphoneOff fallback
const HeadphoneOff = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11L3 18a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    <path d="M21 11v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h2" />
    <path d="M12 5a9 9 0 0 0-9 9" /><path d="M12 5a9 9 0 0 1 9 9" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

interface ConferencePeer {
  pc: RTCPeerConnection
  stream: MediaStream | null
  name: string
  avatar: string | null
  iceBuffer: RTCIceCandidateInit[]
  remoteDescSet: boolean
}

export default function VoiceChannelView({ config, auth, channelId, channelName, initialParticipants, onLeave }: {
  config: ApiConfig; auth: Auth
  channelId: string; channelName: string
  initialParticipants: Array<{ id: string; name: string; avatar: string | null }>
  onLeave: () => void
}) {
  const [peers, setPeers] = useState<Map<string, { stream: MediaStream | null; name: string; avatar: string | null }>>(new Map())
  const peersRef = useRef<Map<string, ConferencePeer>>(new Map())
  const [muted, setMuted] = useState(false)
  const [videoActive, setVideoActive] = useState(false)
  const [videoOff, setVideoOff] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const durationTimer = useRef<NodeJS.Timeout | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const localVideo = useRef<HTMLVideoElement>(null)
  const mountedRef = useRef(true)
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const iceRestartTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const [screenSharing, setScreenSharing] = useState(false)
  const screenShareStream = useRef<MediaStream | null>(null)
  const [screenSources, setScreenSources] = useState<Array<{ id: string; name: string; thumbnail: string }> | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteUsers, setInviteUsers] = useState<UserInfo[]>([])
  const [peerMuted, setPeerMuted] = useState<Map<string, boolean>>(new Map())
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set())
  const [deafened, setDeafened] = useState(false)
  const [peerVolumes, setPeerVolumes] = useState<Map<string, number>>(new Map())
  const audioContextsRef = useRef<Map<string, AudioContext>>(new Map())
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map())
  const peerAnalysersRef = useRef<Map<string, AnalyserNode>>(new Map())
  const speakingRafRef = useRef<number | null>(null)
  const [localSpeaking, setLocalSpeaking] = useState(false)
  const localAnalyserRef = useRef<AnalyserNode | null>(null)
  const localAudioCtxRef = useRef<AudioContext | null>(null)
  const localSpeakingRafRef = useRef<number | null>(null)
  const [pushToTalk] = useState(false)
  const [callReactions, setCallReactions] = useState<Array<{ id: number; emoji: string; from: string }>>([])
  const reactionIdRef = useRef(0)
  const initCompleteRef = useRef(false)
  const [focusedPeer, setFocusedPeer] = useState<string | null>(null)
  const [volumeMenuPeer, setVolumeMenuPeer] = useState<string | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; content: string; createdAt: string; sender: { id: string; username: string; alias: string | null; avatarUrl: string | null } }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [peerDeafened, setPeerDeafened] = useState<Map<string, boolean>>(new Map())
  const [peerConnectionStates, setPeerConnectionStates] = useState<Map<string, string>>(new Map())

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

  // Listen for external disconnect command (from floating sidebar bar)
  useEffect(() => {
    const onDisconnect = () => handleLeave()
    window.addEventListener('bundy-vc-disconnect', onDisconnect)
    return () => window.removeEventListener('bundy-vc-disconnect', onDisconnect)
  }, [])

  // Listen for toggle commands from the floating sidebar bar
  useEffect(() => {
    const onToggleMute = () => toggleMute()
    const onToggleDeafen = () => toggleDeafen()
    const onToggleScreenshare = () => toggleScreenShare()
    window.addEventListener('bundy-vc-toggle-mute', onToggleMute)
    window.addEventListener('bundy-vc-toggle-deafen', onToggleDeafen)
    window.addEventListener('bundy-vc-toggle-screenshare', onToggleScreenshare)
    return () => {
      window.removeEventListener('bundy-vc-toggle-mute', onToggleMute)
      window.removeEventListener('bundy-vc-toggle-deafen', onToggleDeafen)
      window.removeEventListener('bundy-vc-toggle-screenshare', onToggleScreenshare)
    }
  }, [muted, deafened, screenSharing, videoActive])

  // Broadcast local VC state to floating sidebar bar
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('bundy-vc-state-update', {
      detail: { muted, deafened, screenSharing }
    }))
  }, [muted, deafened, screenSharing])

  // ─── WebRTC Core ──────────────────────────────────────────────────────────

  function createPeerConnection(peerId: string, peerName: string, peerAvatar: string | null): RTCPeerConnection {
    const peerConn = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      ],
      iceTransportPolicy: 'all',
    })
    const peerData: ConferencePeer = { pc: peerConn, stream: null, name: peerName, avatar: peerAvatar, iceBuffer: [], remoteDescSet: false }
    peersRef.current.set(peerId, peerData)

    if (localStream.current) {
      const tracks = localStream.current.getTracks()
      if (tracks.length > 0) {
        tracks.forEach(t => peerConn.addTrack(t, localStream.current!))
      } else {
        peerConn.addTransceiver('audio', { direction: 'recvonly' })
      }
    }

    peerConn.ontrack = e => {
      if (e.streams[0]) {
        peerData.stream = new MediaStream(e.streams[0].getTracks())
      } else {
        const existingTracks = peerData.stream ? peerData.stream.getTracks() : []
        const allTracks = [...existingTracks.filter(t => t.id !== e.track.id), e.track]
        peerData.stream = new MediaStream(allTracks)
      }
      const remoteStream = peerData.stream
      if (e.track.kind === 'audio') {
        let audioEl = audioElementsRef.current.get(peerId)
        if (!audioEl) {
          audioEl = document.createElement('audio')
          audioEl.autoplay = true
          audioElementsRef.current.set(peerId, audioEl)
        }
        try {
          let ctx = audioContextsRef.current.get(peerId)
          if (!ctx) { ctx = new AudioContext(); audioContextsRef.current.set(peerId, ctx) }
          const source = ctx.createMediaStreamSource(remoteStream)
          const gain = ctx.createGain()
          const vol = peerVolumes.get(peerId) ?? 100
          gain.gain.value = vol / 100
          gainNodesRef.current.set(peerId, gain)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 256
          peerAnalysersRef.current.set(peerId, analyser)
          source.connect(gain).connect(analyser)
          const dest = ctx.createMediaStreamDestination()
          analyser.connect(dest)
          audioEl.srcObject = dest.stream
          audioEl.play().catch(() => {})
          if (deafened) audioEl.muted = true
        } catch {
          audioEl.srcObject = remoteStream
          audioEl.play().catch(() => {})
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
        fetch(`${config.apiBase}/api/calls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'conference-ice', to: peerId, channelId, candidate: e.candidate.toJSON() }),
        }).catch(() => {})
      }
    }

    peerConn.oniceconnectionstatechange = () => {
      if (mountedRef.current) {
        setPeerConnectionStates(prev => { const next = new Map(prev); next.set(peerId, peerConn.iceConnectionState); return next })
      }
      if (peerConn.iceConnectionState === 'disconnected') {
        const timer = setTimeout(async () => {
          try {
            const offer = await peerConn.createOffer({ iceRestart: true })
            await peerConn.setLocalDescription(offer)
            await fetch(`${config.apiBase}/api/calls`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'conference-offer', to: peerId, channelId, sdp: offer.sdp }),
            })
          } catch { /* ignore */ }
        }, 3000)
        iceRestartTimers.current.set(peerId, timer)
      } else if (peerConn.iceConnectionState === 'connected' || peerConn.iceConnectionState === 'completed') {
        const timer = iceRestartTimers.current.get(peerId)
        if (timer) { clearTimeout(timer); iceRestartTimers.current.delete(peerId) }
      } else if (peerConn.iceConnectionState === 'failed') {
        removePeer(peerId)
      }
    }

    if (mountedRef.current) {
      setPeers(prev => {
        const next = new Map(prev)
        next.set(peerId, { stream: null, name: peerName, avatar: peerAvatar })
        return next
      })
    }
    return peerConn
  }

  function removePeer(peerId: string) {
    const peer = peersRef.current.get(peerId)
    if (peer) { peer.pc.close(); peersRef.current.delete(peerId) }
    const audioEl = audioElementsRef.current.get(peerId)
    if (audioEl) { audioEl.pause(); audioEl.srcObject = null; audioElementsRef.current.delete(peerId) }
    const ctx = audioContextsRef.current.get(peerId)
    if (ctx) { ctx.close().catch(() => {}); audioContextsRef.current.delete(peerId) }
    gainNodesRef.current.delete(peerId)
    peerAnalysersRef.current.delete(peerId)
    if (mountedRef.current) {
      setPeers(prev => { const next = new Map(prev); next.delete(peerId); return next })
    }
  }

  async function drainPeerIceBuffer(peerId: string) {
    const peer = peersRef.current.get(peerId)
    if (!peer) return
    peer.remoteDescSet = true
    for (const c of peer.iceBuffer) {
      try { await peer.pc.addIceCandidate(new RTCIceCandidate(c)) } catch { /* ignore */ }
    }
    peer.iceBuffer = []
  }

  async function initConference(ctrl: AbortController) {
    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        stream = new MediaStream()
        setMuted(true)
      }
      if (ctrl.signal.aborted) { stream.getTracks().forEach(t => t.stop()); return }
      localStream.current = stream
      listenForConferenceSignals(ctrl)
      for (const p of initialParticipants) {
        if (ctrl.signal.aborted) return
        const peerConn = createPeerConnection(p.id, p.name, p.avatar)
        const offer = await peerConn.createOffer()
        await peerConn.setLocalDescription(offer)
        await fetch(`${config.apiBase}/api/calls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'conference-offer', to: p.id, channelId, sdp: offer.sdp }),
        })
      }
      initCompleteRef.current = true
    } catch (err) {
      console.error('[VoiceChannel] init failed:', err)
      if (!ctrl.signal.aborted) { cleanupAll(true); onLeave() }
    }
  }

  function listenForConferenceSignals(ctrl: AbortController) {
    const onConfOffer = async (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; sdp: string; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      const fromId = payload.from
      let name = fromId, avatar: string | null = null
      const existing = peersRef.current.get(fromId)
      if (existing) { name = existing.name; avatar = existing.avatar }
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
        await fetch(`${config.apiBase}/api/calls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'conference-answer', to: fromId, channelId, sdp: answer.sdp }),
        })
      } catch (err) { console.error('[VoiceChannel] handling offer from', fromId, err) }
    }

    const onConfAnswer = async (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; sdp: string; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      const peer = peersRef.current.get(payload.from)
      if (!peer) return
      try {
        await peer.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
        await drainPeerIceBuffer(payload.from)
      } catch (err) { console.error('[VoiceChannel] handling answer from', payload.from, err) }
    }

    const onConfIce = async (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; candidate: RTCIceCandidateInit; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      const peer = peersRef.current.get(payload.from)
      if (!peer) return
      if (peer.remoteDescSet) {
        try { await peer.pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch { /* ignore */ }
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
    }

    const onConfLeft = (e: Event) => {
      const payload = (e as CustomEvent<{ userId: string; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      removePeer(payload.userId)
      if (focusedPeer === payload.userId) setFocusedPeer(null)
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

    window.addEventListener('bundy-conference-offer', onConfOffer)
    window.addEventListener('bundy-conference-answer', onConfAnswer)
    window.addEventListener('bundy-conference-ice', onConfIce)
    window.addEventListener('bundy-conference-joined', onConfJoined)
    window.addEventListener('bundy-conference-left', onConfLeft)
    window.addEventListener('bundy-conference-ended', onConfEnded)
    window.addEventListener('bundy-conference-mute', onConfMute)
    window.addEventListener('bundy-conference-deafen', onConfDeafen)
    ctrl.signal.addEventListener('abort', () => {
      window.removeEventListener('bundy-conference-offer', onConfOffer)
      window.removeEventListener('bundy-conference-answer', onConfAnswer)
      window.removeEventListener('bundy-conference-ice', onConfIce)
      window.removeEventListener('bundy-conference-joined', onConfJoined)
      window.removeEventListener('bundy-conference-left', onConfLeft)
      window.removeEventListener('bundy-conference-ended', onConfEnded)
      window.removeEventListener('bundy-conference-mute', onConfMute)
      window.removeEventListener('bundy-conference-deafen', onConfDeafen)
    })
  }

  function cleanupAll(sendLeave: boolean) {
    for (const [, peer] of peersRef.current) { peer.pc.close() }
    peersRef.current.clear()
    for (const [, audioEl] of audioElementsRef.current) { audioEl.pause(); audioEl.srcObject = null }
    audioElementsRef.current.clear()
    for (const [, ctx] of audioContextsRef.current) { ctx.close().catch(() => {}) }
    audioContextsRef.current.clear()
    gainNodesRef.current.clear()
    peerAnalysersRef.current.clear()
    if (speakingRafRef.current) cancelAnimationFrame(speakingRafRef.current)
    if (localSpeakingRafRef.current) cancelAnimationFrame(localSpeakingRafRef.current)
    localAudioCtxRef.current?.close().catch(() => {})
    localStream.current?.getTracks().forEach(t => t.stop())
    screenShareStream.current?.getTracks().forEach(t => t.stop())
    if (sendLeave) {
      fetch(`${config.apiBase}/api/calls`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'conference-leave', channelId }),
      }).catch(() => {})
    }
  }

  // ─── Controls ──────────────────────────────────────────────────────────

  async function toggleVideo() {
    if (!videoActive) {
      try {
        const vidStream = await navigator.mediaDevices.getUserMedia({ video: true })
        const videoTrack = vidStream.getVideoTracks()[0]
        localStream.current?.addTrack(videoTrack)
        for (const [peerId, peer] of peersRef.current) {
          peer.pc.addTrack(videoTrack, localStream.current!)
          const offer = await peer.pc.createOffer()
          await peer.pc.setLocalDescription(offer)
          await fetch(`${config.apiBase}/api/calls`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'conference-offer', to: peerId, channelId, sdp: offer.sdp }),
          })
        }
        if (localVideo.current) localVideo.current.srcObject = localStream.current
        setVideoActive(true); setVideoOff(false)
      } catch (err) { console.error('[VoiceChannel] enableVideo failed:', err) }
    } else if (!videoOff) {
      localStream.current?.getVideoTracks().forEach(t => { t.enabled = false })
      setVideoOff(true)
    } else {
      localStream.current?.getVideoTracks().forEach(t => { t.enabled = true })
      setVideoOff(false)
    }
  }

  function handleLeave() { cleanupAll(true); onLeave() }

  function toggleMute() {
    const newMuted = !muted
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = muted })
    setMuted(newMuted)
    fetch(`${config.apiBase}/api/calls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'conference-mute', channelId, muted: newMuted }),
    }).catch(() => {})
  }

  function toggleDeafen() {
    const newDeafened = !deafened
    setDeafened(newDeafened)
    for (const [, audioEl] of audioElementsRef.current) { audioEl.muted = newDeafened }
    // Broadcast deafen state to peers
    fetch(`${config.apiBase}/api/calls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'conference-deafen', channelId, deafened: newDeafened }),
    }).catch(() => {})
    if (newDeafened && !muted) {
      localStream.current?.getAudioTracks().forEach(t => { t.enabled = false })
      setMuted(true)
      fetch(`${config.apiBase}/api/calls`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'conference-mute', channelId, muted: true }),
      }).catch(() => {})
    }
  }

  async function toggleScreenShare() {
    if (screenSharing) {
      screenShareStream.current?.getTracks().forEach(t => t.stop())
      screenShareStream.current = null
      for (const [, peer] of peersRef.current) {
        const videoSender = peer.pc.getSenders().find(s => s.track?.kind === 'video')
        if (videoSender) {
          if (videoActive && localStream.current) {
            const camTrack = localStream.current.getVideoTracks()[0]
            if (camTrack) await videoSender.replaceTrack(camTrack)
          } else {
            await videoSender.replaceTrack(null)
          }
        }
      }
      setScreenSharing(false)
    } else {
      try {
        const sources = await (window as any).electronAPI.getScreenSources()
        if (!sources || sources.length === 0) return
        setScreenSources(sources)
      } catch (err) { console.error('[VoiceChannel] getScreenSources failed:', err) }
    }
  }

  async function startScreenShare(sourceId: string) {
    setScreenSources(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } as any,
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } as any,
      }).catch(() => navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } as any,
      }))
      screenShareStream.current = stream
      const screenTrack = stream.getVideoTracks()[0]
      screenTrack.onended = () => { setScreenSharing(false); screenShareStream.current = null }
      const screenAudioTrack = stream.getAudioTracks()[0]
      for (const [peerId, peer] of peersRef.current) {
        const videoSender = peer.pc.getSenders().find(s => s.track?.kind === 'video')
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack)
        } else {
          peer.pc.addTrack(screenTrack, stream)
          const offer = await peer.pc.createOffer()
          await peer.pc.setLocalDescription(offer)
          await fetch(`${config.apiBase}/api/calls`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'conference-offer', to: peerId, channelId, sdp: offer.sdp }),
          })
        }
        if (screenAudioTrack) peer.pc.addTrack(screenAudioTrack, stream)
      }
      setScreenSharing(true)
      if (!videoActive) { setVideoActive(true); setVideoOff(false) }
    } catch (err) { console.error('[VoiceChannel] screen share failed:', err) }
  }

  function sendReaction(emoji: string) {
    const id = ++reactionIdRef.current
    setCallReactions(prev => [...prev, { id, emoji, from: 'You' }])
    setTimeout(() => setCallReactions(prev => prev.filter(r => r.id !== id)), 3000)
    fetch(`${config.apiBase}/api/calls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'conference-reaction', channelId, emoji }),
    }).catch(() => {})
  }

  function setPeerVolume(peerId: string, vol: number) {
    setPeerVolumes(prev => { const next = new Map(prev); next.set(peerId, vol); return next })
    const gain = gainNodesRef.current.get(peerId)
    if (gain) gain.gain.value = vol / 100
  }

  // ─── Chat functions ────────────────────────────────────────────────────
  const vcId = channelId.replace('vc_', '')

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
      const msg = (e as CustomEvent<{ voiceChannelId: string; id: string; content: string; createdAt: string; sender: { id: string; username: string; alias: string | null; avatarUrl: string | null } }>).detail
      if (msg.voiceChannelId === vcId) {
        setChatMessages(prev => [...prev, { id: msg.id, content: msg.content, createdAt: msg.createdAt, sender: msg.sender }])
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
    }
    window.addEventListener('bundy-vc-message', onVcMsg)
    return () => window.removeEventListener('bundy-vc-message', onVcMsg)
  }, [vcId])

  async function loadInviteUsers() {
    try {
      const res = await fetch(`${config.apiBase}/api/channels/${channelId}/members`, {
        headers: { Authorization: `Bearer ${config.token}` },
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data = await res.json()
      const inConf = new Set([auth.userId, ...Array.from(peersRef.current.keys())])
      const others = (data.members ?? data ?? []).filter((u: UserInfo) => !inConf.has(u.id))
      setInviteUsers(others)
      setShowInvite(true)
    } catch (err) { console.error('[VoiceChannel] loadInviteUsers failed:', err) }
  }

  // ─── Speaking detection ────────────────────────────────────────────────

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
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!localStream.current) return
    setupLocalSpeakingDetection()
    return () => {
      if (localSpeakingRafRef.current) cancelAnimationFrame(localSpeakingRafRef.current)
      localAudioCtxRef.current?.close().catch(() => {})
    }
  }, [callDuration > 0 ? 1 : 0])

  useEffect(() => {
    if (peerAnalysersRef.current.size === 0) { setSpeakingPeers(new Set()); return }
    const data = new Uint8Array(128)
    const detect = () => {
      const speaking = new Set<string>()
      for (const [peerId, analyser] of peerAnalysersRef.current) {
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        if (sum / data.length > 15) speaking.add(peerId)
      }
      setSpeakingPeers(prev => {
        if (prev.size === speaking.size && [...prev].every(id => speaking.has(id))) return prev
        return speaking
      })
      speakingRafRef.current = requestAnimationFrame(detect)
    }
    speakingRafRef.current = requestAnimationFrame(detect)
    return () => { if (speakingRafRef.current) cancelAnimationFrame(speakingRafRef.current) }
  }, [peers.size])

  useEffect(() => {
    const onReaction = (e: Event) => {
      const payload = (e as CustomEvent<{ emoji: string; from: string; fromName: string; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      const id = ++reactionIdRef.current
      setCallReactions(prev => [...prev, { id, emoji: payload.emoji, from: payload.fromName ?? payload.from }])
      setTimeout(() => setCallReactions(prev => prev.filter(r => r.id !== id)), 3000)
    }
    window.addEventListener('bundy-conference-reaction', onReaction)
    return () => window.removeEventListener('bundy-conference-reaction', onReaction)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setScreenSources(null); setShowInvite(false); setFocusedPeer(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Push-to-talk
  useEffect(() => {
    if (!pushToTalk) return
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'v' && !e.repeat && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        localStream.current?.getAudioTracks().forEach(t => { t.enabled = true })
        setMuted(false)
        fetch(`${config.apiBase}/api/calls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'conference-mute', channelId, muted: false }),
        }).catch(() => {})
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'v' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        localStream.current?.getAudioTracks().forEach(t => { t.enabled = false })
        setMuted(true)
        fetch(`${config.apiBase}/api/calls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'conference-mute', channelId, muted: true }),
        }).catch(() => {})
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [pushToTalk])

  // ─── Helpers ───────────────────────────────────────────────────────────

  const peerList = Array.from(peers.entries())
  const totalParticipants = peerList.length + 1
  const formatDuration = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  // Determine if anyone is screen sharing (they'd have a video track)
  const screenSharePeer = peerList.find(([, p]) => {
    if (!p.stream) return false
    const vt = p.stream.getVideoTracks()
    return vt.length > 0 && vt[0].enabled
  })

  // ─── Render ────────────────────────────────────────────────────────────

  function renderParticipantCard(
    id: string, stream: MediaStream | null, name: string, avatar: string | null,
    isSelf: boolean, size: 'large' | 'small' = 'large'
  ) {
    const isMutedPeer = isSelf ? muted : !!peerMuted.get(id)
    const isDeafenedPeer = isSelf ? deafened : !!peerDeafened.get(id)
    const isSpeaking = isSelf ? localSpeaking : speakingPeers.has(id)
    const hasVideo = stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled
    const vol = peerVolumes.get(id) ?? 100
    const isSmall = size === 'small'
    const cardH = isSmall ? 90 : undefined
    // Signal quality for peers
    const connState = isSelf ? 'connected' : (peerConnectionStates.get(id) ?? 'new')
    const signalColor = connState === 'connected' || connState === 'completed' ? '#43B581'
      : connState === 'checking' || connState === 'new' ? '#FAA61A'
      : '#f87171'

    return (
      <div
        key={id}
        style={{
          background: C.bgFloating,
          borderRadius: 12,
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          minHeight: cardH ?? (totalParticipants === 1 ? undefined : 120),
          height: isSmall ? cardH : undefined,
          aspectRatio: !isSmall && totalParticipants <= 2 ? '16 / 9' : undefined,
          outline: isSpeaking ? '3px solid #43B581' : '3px solid transparent',
          outlineOffset: 2,
          transition: 'outline-color 0.15s, transform 0.15s',
          cursor: hasVideo ? 'pointer' : 'default',
        }}
        onClick={() => {
          if (hasVideo && !isSelf) setFocusedPeer(focusedPeer === id ? null : id)
        }}
        onContextMenu={e => {
          if (!isSelf) { e.preventDefault(); setVolumeMenuPeer(volumeMenuPeer === id ? null : id) }
        }}
      >
        {hasVideo ? (
          <video
            autoPlay playsInline muted={isSelf}
            ref={el => { if (el && el.srcObject !== stream) { el.srcObject = stream; el.play().catch(() => {}) } }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: isSmall ? 8 : 16 }}>
            <Avatar url={avatar} name={name} size={isSmall ? 32 : 56} />
            <div style={{
              color: C.text, fontSize: isSmall ? 11 : 13, fontWeight: 600, marginTop: isSmall ? 4 : 8,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isSmall ? 80 : 140,
            }}>
              {isSelf ? 'You' : name}
            </div>
          </div>
        )}
        {/* Signal icon - top right */}
        <div style={{
          position: 'absolute', top: isSmall ? 4 : 6, right: isSmall ? 4 : 6,
          display: 'flex', alignItems: 'center', gap: 3,
        }}>
          <Wifi size={isSmall ? 10 : 12} color={signalColor} />
        </div>
        {/* Overlay info */}
        <div style={{
          position: 'absolute', bottom: isSmall ? 4 : 8, left: isSmall ? 4 : 8, right: isSmall ? 4 : 8,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{
            background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: isSmall ? '2px 6px' : '3px 8px',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ color: '#fff', fontSize: isSmall ? 9 : 11, fontWeight: 500 }}>{isSelf ? 'You' : name}</span>
            {isMutedPeer && <MicOff size={isSmall ? 8 : 10} color="#f87171" />}
            {isDeafenedPeer && <HeadphoneOff size={isSmall ? 8 : 10} />}
          </div>
        </div>
        {/* Volume menu */}
        {!isSelf && volumeMenuPeer === id && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: isSmall ? 22 : 32, left: 8, right: 8,
              background: 'rgba(0,0,0,0.85)', borderRadius: 6, padding: '8px 10px',
              display: 'flex', alignItems: 'center', gap: 8, zIndex: 2,
            }}
          >
            <span style={{ color: '#9ca3af', fontSize: 10, whiteSpace: 'nowrap' }}>Vol</span>
            <input type="range" min={0} max={200} value={vol}
              onChange={e => setPeerVolume(id, Number(e.target.value))}
              style={{ flex: 1, accentColor: '#43B581', height: 4, cursor: 'pointer' }} />
            <span style={{ color: '#9ca3af', fontSize: 10, minWidth: 28, textAlign: 'right' }}>{vol}%</span>
          </div>
        )}
      </div>
    )
  }

  // Focused screen-share view
  if (focusedPeer) {
    const fp = peers.get(focusedPeer)
    if (!fp || !fp.stream || !fp.stream.getVideoTracks().length) {
      // Lost the focused peer or no video — clear focus
      setFocusedPeer(null)
    }
  }

  const showFocusMode = screenSharing || (focusedPeer && peers.get(focusedPeer)?.stream?.getVideoTracks()?.[0]?.enabled)

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
      overflow: 'hidden', background: C.contentBg,
    }}>
      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${C.separator}`, background: C.lgBg, flexShrink: 0,
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Volume2 size={18} color={C.accent} />
        <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{channelName}</span>
        <span style={{ color: C.textMuted, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Users size={12} /> {totalParticipants}
        </span>
        <span style={{ color: C.textMuted, fontSize: 12, marginLeft: 4 }}>{formatDuration(callDuration)}</span>
        <div style={{ flex: 1 }} />
        <button onClick={loadInviteUsers} title="Invite"
          style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: C.text, fontSize: 12 }}>
          <UserPlus2 size={13} /> Invite
        </button>
        <button onClick={() => { setShowChat(!showChat); if (!showChat) loadChatMessages() }} title="Messages"
          style={{ background: showChat ? `${C.accent}30` : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: showChat ? C.accent : C.text, fontSize: 12 }}>
          <MessageSquare size={13} /> Chat
        </button>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {/* Call area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, gap: 12, minHeight: 0, overflow: 'auto' }}>
        {showFocusMode ? (
          /* ─── Focus mode: large video + small cards below ─── */
          <>
            {/* ─── Large screen share / focused video card ─── */}
            <div style={{
              flex: 1, borderRadius: 12, overflow: 'hidden', background: '#000',
              position: 'relative', minHeight: 200, cursor: screenSharing ? 'default' : 'pointer',
            }}
              onClick={() => { if (!screenSharing) setFocusedPeer(null) }}
              title={screenSharing ? 'Your screen share' : 'Click to exit focus view'}
            >
              {screenSharing ? (
                /* Self screen share preview */
                <video
                  autoPlay playsInline muted
                  ref={el => {
                    if (el && screenShareStream.current && el.srcObject !== screenShareStream.current) {
                      el.srcObject = screenShareStream.current; el.play().catch(() => {})
                    }
                  }}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : focusedPeer && peers.get(focusedPeer)?.stream ? (
                /* Focused peer video */
                <video
                  autoPlay playsInline muted={false}
                  ref={el => {
                    const fp = peers.get(focusedPeer!)
                    if (el && fp?.stream && el.srcObject !== fp.stream) { el.srcObject = fp.stream; el.play().catch(() => {}) }
                  }}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : null}
              <div style={{
                position: 'absolute', bottom: 12, left: 12,
                background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '4px 10px',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {screenSharing ? (
                  <>
                    <Monitor size={12} color="#43B581" />
                    <span style={{ color: '#43B581', fontSize: 12, fontWeight: 600 }}>You are sharing your screen</span>
                  </>
                ) : focusedPeer ? (
                  <>
                    <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>
                      {peers.get(focusedPeer)?.name ?? 'Unknown'}
                    </span>
                    {!!peerMuted.get(focusedPeer) && <MicOff size={10} color="#f87171" />}
                    {screenSharePeer && screenSharePeer[0] === focusedPeer && (
                      <span style={{ color: '#43B581', fontSize: 10, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Monitor size={10} /> Sharing
                      </span>
                    )}
                  </>
                ) : null}
              </div>
            </div>
            {/* Small cards row — all participants including self */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, overflowX: 'auto', paddingBottom: 4 }}>
              <div style={{ width: 120, flexShrink: 0 }}>
                {renderParticipantCard(auth.userId, localStream.current, auth.username, auth.avatarUrl, true, 'small')}
              </div>
              {peerList.filter(([id]) => id !== focusedPeer).map(([id, p]) => (
                <div key={id} style={{ width: 120, flexShrink: 0 }}>
                  {renderParticipantCard(id, p.stream, p.name, p.avatar, false, 'small')}
                </div>
              ))}
            </div>
          </>
        ) : (
          /* ─── Grid mode: all as cards ─── */
          <div style={{
            flex: 1, display: 'flex', flexWrap: 'wrap', gap: 16, alignContent: 'center', justifyContent: 'center',
            padding: totalParticipants === 1 ? '0 10%' : undefined,
          }}>
            {/* Calculate card width */}
            {(() => {
              const count = totalParticipants
              const cardWidth = count === 1 ? '100%' : count <= 2 ? 'calc(50% - 8px)' : count <= 4 ? 'calc(50% - 8px)' : 'calc(33.33% - 11px)'
              const cardMinW = count === 1 ? 320 : 200
              const cardMaxW = count === 1 ? 800 : count <= 2 ? 500 : 320
              return (
                <>
                  <div style={{ width: cardWidth, minWidth: cardMinW, maxWidth: cardMaxW }}>
                    {renderParticipantCard(auth.userId, localStream.current, auth.username, auth.avatarUrl, true)}
                  </div>
                  {peerList.map(([id, p]) => (
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
        {showChat && (
          <div style={{
            position: 'absolute', inset: 0, background: C.contentBg,
            display: 'flex', flexDirection: 'column', zIndex: 5,
          }}>
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
              placeholder={`Message #${channelName}…`}
              config={config}
              channelId={channelId}
              onTyping={() => {}}
              input={chatInput}
              setInput={setChatInput}
              sendFn={sendChatMessage}
              sending={chatSending}
            />
          </div>
        )}
      </div>

      {/* PTT indicator */}
      {pushToTalk && muted && (
        <div style={{ padding: '6px 16px', textAlign: 'center', flexShrink: 0 }}>
          <span style={{
            display: 'inline-block', padding: '4px 14px', borderRadius: 6,
            background: 'rgba(88,101,242,0.2)', color: '#5865F2', fontSize: 12, fontWeight: 600,
          }}>
            Push to Talk — Hold <span style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 3, padding: '1px 6px', marginLeft: 4 }}>V</span>
          </span>
        </div>
      )}

      {/* Bottom control bar */}
      <div style={{
        borderTop: `1px solid ${C.separator}`, background: C.lgBg, flexShrink: 0,
        padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        {/* Mic */}
        <ControlBtn
          icon={muted ? <MicOff size={18} /> : <Mic size={18} />}
          label={muted ? 'Unmute' : 'Mute'}
          active={!muted}
          danger={muted}
          onClick={toggleMute}
        />
        {/* Deafen */}
        <ControlBtn
          icon={deafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
          label={deafened ? 'Undeafen' : 'Deafen'}
          active={!deafened}
          danger={deafened}
          onClick={toggleDeafen}
        />
        {/* Video */}
        <ControlBtn
          icon={videoActive && !videoOff ? <Video size={18} /> : <VideoOff size={18} />}
          label={videoActive && !videoOff ? 'Turn Off Camera' : 'Turn On Camera'}
          active={videoActive && !videoOff}
          onClick={toggleVideo}
        />
        {/* Screen Share */}
        <ControlBtn
          icon={<Monitor size={18} />}
          label={screenSharing ? 'Stop Sharing' : 'Share Screen'}
          active={screenSharing}
          highlight={screenSharing}
          onClick={toggleScreenShare}
        />
        {/* Quick Reactions */}
        {['👍', '😂', '🎉', '❤️'].map(emoji => (
          <button key={emoji} onClick={() => sendReaction(emoji)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '4px 2px', borderRadius: 6, transition: 'transform 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.3)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            {emoji}
          </button>
        ))}
        <div style={{ width: 1, height: 24, background: C.separator, margin: '0 4px' }} />
        {/* Leave */}
        <button onClick={handleLeave} title="Leave Voice Channel"
          style={{
            background: '#ED4245', border: 'none', borderRadius: 8, cursor: 'pointer',
            padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6,
            color: '#fff', fontSize: 13, fontWeight: 600, transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#c93b3e' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#ED4245' }}
        >
          <PhoneOff size={16} /> Leave
        </button>
      </div>

      {/* Floating emoji reactions */}
      {callReactions.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 8, pointerEvents: 'none', zIndex: 100,
        }}>
          {callReactions.map(r => (
            <span key={r.id} style={{ fontSize: 32, animation: 'callReactionFloat 3s ease-out forwards' }}>{r.emoji}</span>
          ))}
        </div>
      )}

      {/* Hidden video element for local video */}
      <video ref={localVideo} autoPlay playsInline muted style={{ display: 'none' }} />

      {/* Screen source picker modal */}
      {screenSources && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.bgSecondary, borderRadius: 12, padding: 20, width: 520, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontWeight: 700, color: '#fff', marginBottom: 14, fontSize: 15 }}>Choose what to share</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {screenSources.map(src => (
                <button key={src.id} onClick={() => startScreenShare(src.id)}
                  style={{ background: '#080808', border: '2px solid #333333', borderRadius: 8, cursor: 'pointer', padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <img src={src.thumbnail} alt={src.name} style={{ width: '100%', borderRadius: 4, aspectRatio: '16/9', objectFit: 'cover', background: '#000' }} />
                  <span style={{ color: '#cccccc', fontSize: 11, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{src.name}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setScreenSources(null)} style={{ marginTop: 16, width: '100%', padding: '8px 0', background: '#282828', border: 'none', borderRadius: 8, color: '#cccccc', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.bgSecondary, borderRadius: 12, padding: 20, width: 340, maxHeight: '60vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontWeight: 700, color: '#fff', marginBottom: 14, fontSize: 15 }}>Invite to Voice Channel</div>
            {inviteUsers.length === 0 ? (
              <div style={{ color: '#6b6b6b', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No users available to invite</div>
            ) : inviteUsers.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #333333' }}>
                <Avatar url={u.avatarUrl ?? null} name={u.alias ?? u.username} size={32} />
                <span style={{ flex: 1, color: '#cccccc', fontSize: 13 }}>{u.alias ?? u.username}</span>
                <button onClick={async () => {
                  await fetch(`${config.apiBase}/api/calls`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'conference-invite', to: u.id, channelId }),
                  }).catch(() => {})
                  setInviteUsers(prev => prev.filter(x => x.id !== u.id))
                }} style={{ background: C.accent, border: 'none', borderRadius: 6, color: '#fff', padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Invite</button>
              </div>
            ))}
            <button onClick={() => setShowInvite(false)} style={{ marginTop: 16, width: '100%', padding: '8px 0', background: '#282828', border: 'none', borderRadius: 8, color: '#cccccc', cursor: 'pointer', fontSize: 13 }}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Simple control button component ─────────────────────────────────────────

function ControlBtn({ icon, label, active, danger, highlight, onClick }: {
  icon: React.ReactNode; label: string
  active?: boolean; danger?: boolean; highlight?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick} title={label}
      style={{
        background: danger ? 'rgba(237,66,69,0.15)' : highlight ? 'rgba(67,181,129,0.2)' : 'rgba(255,255,255,0.06)',
        border: 'none', borderRadius: 8, cursor: 'pointer',
        width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: danger ? '#f87171' : highlight ? '#43B581' : active ? '#fff' : '#9ca3af',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'rgba(237,66,69,0.3)' : 'rgba(255,255,255,0.12)' }}
      onMouseLeave={e => { e.currentTarget.style.background = danger ? 'rgba(237,66,69,0.15)' : highlight ? 'rgba(67,181,129,0.2)' : 'rgba(255,255,255,0.06)' }}
    >
      {icon}
    </button>
  )
}
