import { useState, useEffect, useRef } from 'react'
import { Hash, Users, Move, MicOff, LayoutGrid, LayoutList } from 'lucide-react'
import { ApiConfig, Auth, UserInfo } from '../../types'
import { C } from '../../theme'
import Avatar from '../shared/Avatar'
import CallControls from './CallControls'

interface ConferencePeer {
  pc: RTCPeerConnection
  stream: MediaStream | null
  name: string
  avatar: string | null
  iceBuffer: RTCIceCandidateInit[]
  remoteDescSet: boolean
}

export default function ConferenceWidget({ config, auth, channelId, channelName, initialParticipants, onLeave }: {
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
  const [windowMode, setWindowMode] = useState<'mini' | 'normal' | 'fullscreen'>('normal')
  const [position, setPosition] = useState({ x: window.innerWidth - 320, y: window.innerHeight - 260 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const [callDuration, setCallDuration] = useState(0)
  const durationTimer = useRef<NodeJS.Timeout | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const localVideo = useRef<HTMLVideoElement>(null)
  const [showControls, setShowControls] = useState(true)
  const hideTimer = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const iceRestartTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const [screenSharing, setScreenSharing] = useState(false)
  const screenShareStream = useRef<MediaStream | null>(null)
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'fair' | 'poor' | 'disconnected'>('good')
  const [screenSources, setScreenSources] = useState<Array<{ id: string; name: string; thumbnail: string }> | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteUsers, setInviteUsers] = useState<UserInfo[]>([])
  const [peerMuted, setPeerMuted] = useState<Map<string, boolean>>(new Map())
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set())
  const [deafened, setDeafened] = useState(false)
  const [peerVolumes, setPeerVolumes] = useState<Map<string, number>>(new Map())
  const [volumeMenuPeer, setVolumeMenuPeer] = useState<string | null>(null)
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map())
  const audioContextsRef = useRef<Map<string, AudioContext>>(new Map())
  const peerAnalysersRef = useRef<Map<string, AnalyserNode>>(new Map())
  const speakingRafRef = useRef<number | null>(null)
  const [localSpeaking, setLocalSpeaking] = useState(false)
  const localAnalyserRef = useRef<AnalyserNode | null>(null)
  const localAudioCtxRef = useRef<AudioContext | null>(null)
  const localSpeakingRafRef = useRef<number | null>(null)
  const [noiseSuppression, setNoiseSuppression] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'focus'>('grid')
  const [focusTarget, setFocusTarget] = useState<string | null>(null)
  const [backgroundBlur, setBackgroundBlur] = useState(false)
  const [pushToTalk, setPushToTalk] = useState(false)
  const [callReactions, setCallReactions] = useState<Array<{ id: number; emoji: string; from: string }>>([])
  const reactionIdRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    const ctrl = new AbortController()
    initConference(ctrl)
    durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000)
    return () => {
      mountedRef.current = false
      ctrl.abort()
      cleanupAll(true)
      if (durationTimer.current) clearInterval(durationTimer.current)
      for (const t of iceRestartTimers.current.values()) clearTimeout(t)
      iceRestartTimers.current.clear()
    }
  }, [])

  // Dragging
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      const x = Math.max(0, Math.min(window.innerWidth - 300, e.clientX - dragOffset.current.x))
      const y = Math.max(0, Math.min(window.innerHeight - 80, e.clientY - dragOffset.current.y))
      setPosition({ x, y })
    }
    const onUp = () => setIsDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [isDragging])

  // Fullscreen auto-hide controls
  useEffect(() => {
    if (windowMode !== 'fullscreen') { setShowControls(true); return }
    const onMouseMove = () => {
      setShowControls(true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setShowControls(false), 3000)
    }
    onMouseMove()
    window.addEventListener('mousemove', onMouseMove)
    return () => { window.removeEventListener('mousemove', onMouseMove); if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [windowMode])

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
      localStream.current.getTracks().forEach(t => peerConn.addTrack(t, localStream.current!))
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
          if (!ctx) {
            ctx = new AudioContext()
            audioContextsRef.current.set(peerId, ctx)
          }
          const source = ctx.createMediaStreamSource(remoteStream)
          const gain = ctx.createGain()
          const vol = peerVolumes.get(peerId) ?? 100
          gain.gain.value = vol / 100
          gainNodesRef.current.set(peerId, gain)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 256
          analyser.smoothingTimeConstant = 0.5
          peerAnalysersRef.current.set(peerId, analyser)
          source.connect(gain)
          gain.connect(analyser)
          const dest = ctx.createMediaStreamDestination()
          gain.connect(dest)
          audioEl.srcObject = dest.stream
        } catch {
          audioEl.srcObject = remoteStream
        }
        audioEl.play().catch(() => {})
      }
      if (mountedRef.current) {
        setPeers(prev => {
          const next = new Map(prev)
          next.set(peerId, { stream: remoteStream, name: peerName, avatar: peerAvatar })
          return next
        })
      }
    }

    peerConn.onicecandidate = e => {
      if (e.candidate) {
        fetch(`${config.apiBase}/api/calls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'conference-ice', to: peerId, channelId, candidate: e.candidate }),
        }).catch(() => {})
      }
    }

    peerConn.oniceconnectionstatechange = () => {
      const state = peerConn.iceConnectionState
      if (state === 'disconnected') {
        const prev = iceRestartTimers.current.get(peerId)
        if (prev) clearTimeout(prev)
        iceRestartTimers.current.set(peerId, setTimeout(async () => {
          iceRestartTimers.current.delete(peerId)
          if (peerConn.iceConnectionState === 'disconnected' && mountedRef.current) {
            try {
              const offer = await peerConn.createOffer({ iceRestart: true })
              await peerConn.setLocalDescription(offer)
              await fetch(`${config.apiBase}/api/calls`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'conference-offer', to: peerId, channelId, sdp: offer.sdp }),
              })
            } catch (err) { console.error(`[Conference] peer ${peerId} ICE restart failed:`, err) }
          }
        }, 5000))
      } else if (state === 'failed') {
        peerConn.createOffer({ iceRestart: true }).then(async offer => {
          await peerConn.setLocalDescription(offer)
          await fetch(`${config.apiBase}/api/calls`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'conference-offer', to: peerId, channelId, sdp: offer.sdp }),
          })
        }).catch(() => { removePeer(peerId) })
      }
    }
    peerConn.onconnectionstatechange = () => {
      if (peerConn.connectionState === 'closed') removePeer(peerId)
    }

    return peerConn
  }

  function removePeer(peerId: string) {
    const peer = peersRef.current.get(peerId)
    if (peer) {
      peer.pc.close()
      peersRef.current.delete(peerId)
      const audioEl = audioElementsRef.current.get(peerId)
      if (audioEl) { audioEl.pause(); audioEl.srcObject = null; audioElementsRef.current.delete(peerId) }
      const iceTimer = iceRestartTimers.current.get(peerId)
      if (iceTimer) { clearTimeout(iceTimer); iceRestartTimers.current.delete(peerId) }
      if (mountedRef.current) {
        setPeers(prev => { const next = new Map(prev); next.delete(peerId); return next })
      }
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStream.current = stream
      listenForConferenceSignals(ctrl)
      for (const p of initialParticipants) {
        const peerConn = createPeerConnection(p.id, p.name, p.avatar)
        const offer = await peerConn.createOffer()
        await peerConn.setLocalDescription(offer)
        await fetch(`${config.apiBase}/api/calls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'conference-offer', to: p.id, channelId, sdp: offer.sdp }),
        })
      }
    } catch (err) {
      console.error('[Conference] init failed:', err)
      cleanupAll(true); onLeave()
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
      } catch (err) { console.error('[Conference] handling offer from', fromId, err) }
    }

    const onConfAnswer = async (e: Event) => {
      const payload = (e as CustomEvent<{ from: string; sdp: string; channelId: string }>).detail
      if (payload.channelId !== channelId) return
      const peer = peersRef.current.get(payload.from)
      if (!peer) return
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

    window.addEventListener('bundy-conference-offer', onConfOffer)
    window.addEventListener('bundy-conference-answer', onConfAnswer)
    window.addEventListener('bundy-conference-ice', onConfIce)
    window.addEventListener('bundy-conference-joined', onConfJoined)
    window.addEventListener('bundy-conference-left', onConfLeft)
    window.addEventListener('bundy-conference-ended', onConfEnded)
    window.addEventListener('bundy-conference-mute', onConfMute)
    ctrl.signal.addEventListener('abort', () => {
      window.removeEventListener('bundy-conference-offer', onConfOffer)
      window.removeEventListener('bundy-conference-answer', onConfAnswer)
      window.removeEventListener('bundy-conference-ice', onConfIce)
      window.removeEventListener('bundy-conference-joined', onConfJoined)
      window.removeEventListener('bundy-conference-left', onConfLeft)
      window.removeEventListener('bundy-conference-ended', onConfEnded)
      window.removeEventListener('bundy-conference-mute', onConfMute)
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
      } catch (err) { console.error('[Conference] enableVideo failed:', err) }
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

  async function switchAudioInput(deviceId: string) {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId }, noiseSuppression } })
      const newTrack = newStream.getAudioTracks()[0]
      const oldTrack = localStream.current?.getAudioTracks()[0]
      for (const [, peer] of peersRef.current) {
        const sender = peer.pc.getSenders().find(s => s.track?.kind === 'audio')
        if (sender) await sender.replaceTrack(newTrack)
      }
      if (oldTrack) { localStream.current?.removeTrack(oldTrack); oldTrack.stop() }
      localStream.current?.addTrack(newTrack)
      if (muted) newTrack.enabled = false
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

  async function toggleNoiseSuppression() {
    const newVal = !noiseSuppression
    setNoiseSuppression(newVal)
    const audioTrack = localStream.current?.getAudioTracks()[0]
    if (audioTrack) {
      try { await audioTrack.applyConstraints({ noiseSuppression: newVal }) } catch { /* not supported */ }
    }
  }

  async function toggleBackgroundBlur() {
    const newVal = !backgroundBlur
    setBackgroundBlur(newVal)
    const videoTrack = localStream.current?.getVideoTracks()[0]
    if (videoTrack) {
      try { await videoTrack.applyConstraints({ backgroundBlur: newVal } as any) } catch { /* not supported */ }
    }
  }

  function togglePushToTalk() {
    const newPtt = !pushToTalk
    setPushToTalk(newPtt)
    if (newPtt) {
      localStream.current?.getAudioTracks().forEach(t => { t.enabled = false })
      setMuted(true)
      fetch(`${config.apiBase}/api/calls`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'conference-mute', channelId, muted: true }),
      }).catch(() => {})
    }
  }

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setScreenSources(null); setShowInvite(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  useEffect(() => {
    const onReaction = (e: Event) => {
      const { emoji, from } = (e as CustomEvent<{ emoji: string; from: string }>).detail
      const id = ++reactionIdRef.current
      setCallReactions(prev => [...prev, { id, emoji, from }])
      setTimeout(() => setCallReactions(prev => prev.filter(r => r.id !== id)), 3000)
    }
    window.addEventListener('bundy-conference-reaction', onReaction)
    return () => window.removeEventListener('bundy-conference-reaction', onReaction)
  }, [])

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

  function setPeerVolume(peerId: string, vol: number) {
    setPeerVolumes(prev => { const next = new Map(prev); next.set(peerId, vol); return next })
    const gain = gainNodesRef.current.get(peerId)
    if (gain) gain.gain.value = vol / 100
  }

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
      } catch (err) { console.error('[Conference] getScreenSources failed:', err) }
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
    } catch (err) { console.error('[Conference] screen share failed:', err) }
  }

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
    } catch (err) { console.error('[Conference] loadInviteUsers failed:', err) }
  }

  useEffect(() => {
    if (peersRef.current.size === 0) return
    const interval = setInterval(async () => {
      let worstQuality: 'good' | 'fair' | 'poor' | 'disconnected' = 'good'
      for (const [, peer] of peersRef.current) {
        try {
          const stats = await peer.pc.getStats()
          let packetsLost = 0, packetsReceived = 0, rtt = 0
          stats.forEach((report: any) => {
            if (report.type === 'inbound-rtp' && report.kind === 'audio') {
              packetsLost = report.packetsLost || 0
              packetsReceived = report.packetsReceived || 0
            }
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              rtt = report.currentRoundTripTime || 0
            }
          })
          const total = packetsLost + packetsReceived
          const lossRate = total > 0 ? packetsLost / total : 0
          let q: 'good' | 'fair' | 'poor' = 'good'
          if (lossRate > 0.1 || rtt > 0.5) q = 'poor'
          else if (lossRate > 0.03 || rtt > 0.2) q = 'fair'
          if (q === 'poor' || (q === 'fair' && worstQuality === 'good')) worstQuality = q
        } catch { /* ignore */ }
      }
      setConnectionQuality(worstQuality)
    }, 3000)
    return () => clearInterval(interval)
  }, [peers.size])

  const handleDragStart = (e: React.MouseEvent) => {
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    setIsDragging(true)
  }

  const peerList = Array.from(peers.entries())
  const totalParticipants = peerList.length + 1
  const gridCols = totalParticipants <= 2 ? 1 : totalParticipants <= 4 ? 2 : 3

  function renderParticipantTile(id: string, stream: MediaStream | null, name: string, avatar: string | null, isSelf: boolean) {
    const isMuted = isSelf ? muted : !!peerMuted.get(id)
    const isSpeaking = speakingPeers.has(id)
    const vol = peerVolumes.get(id) ?? 100
    return (
      <div key={id} style={{
        background: C.bgFloating, borderRadius: 8, overflow: 'hidden', position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0,
        outline: isSpeaking ? '2px solid #43B581' : '2px solid transparent',
        transition: 'outline-color 0.15s',
        animation: isSpeaking ? 'speakingGlow 1.5s ease-in-out infinite' : 'none',
      }}
      title={isSelf ? 'You' : name}
      onContextMenu={e => { if (!isSelf) { e.preventDefault(); setVolumeMenuPeer(volumeMenuPeer === id ? null : id) } }}
      >
        {stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled ? (
          <video autoPlay playsInline muted={isSelf} ref={el => { if (el && el.srcObject !== stream) { el.srcObject = stream; el.play().catch(() => {}) } }}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ textAlign: 'center', padding: 12 }}>
            <Avatar url={avatar} name={name} size={windowMode === 'mini' ? 28 : 48} />
            <div style={{ color: '#fff', fontSize: windowMode === 'mini' ? 10 : 12, fontWeight: 600, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
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
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 24, left: 6, right: 6,
              background: 'rgba(0,0,0,0.85)', borderRadius: 6, padding: '8px 10px',
              display: 'flex', alignItems: 'center', gap: 8, zIndex: 2,
            }}
          >
            <span style={{ color: '#9ca3af', fontSize: 10, whiteSpace: 'nowrap' }}>Vol</span>
            <input type="range" min={0} max={200} value={vol} onChange={e => setPeerVolume(id, Number(e.target.value))}
              style={{ flex: 1, accentColor: '#43B581', height: 4, cursor: 'pointer' }} />
            <span style={{ color: '#9ca3af', fontSize: 10, minWidth: 28, textAlign: 'right' }}>{vol}%</span>
          </div>
        )}
      </div>
    )
  }

  const ScreenSourcePicker = ({ onPick, onCancel }: { onPick: (id: string) => void; onCancel: () => void }) => screenSources ? (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.bgSecondary, borderRadius: 12, padding: 20, width: 520, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ fontWeight: 700, color: '#fff', marginBottom: 14, fontSize: 15 }}>Choose what to share</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {screenSources.map(src => (
            <button key={src.id} onClick={() => onPick(src.id)}
              style={{ background: '#080808', border: '2px solid #333333', borderRadius: 8, cursor: 'pointer', padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <img src={src.thumbnail} alt={src.name} style={{ width: '100%', borderRadius: 4, aspectRatio: '16/9', objectFit: 'cover', background: '#000' }} />
              <span style={{ color: '#cccccc', fontSize: 11, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{src.name}</span>
            </button>
          ))}
        </div>
        <button onClick={onCancel} style={{ marginTop: 16, width: '100%', padding: '8px 0', background: '#282828', border: 'none', borderRadius: 8, color: '#cccccc', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
      </div>
    </div>
  ) : null

  const InviteModal = () => showInvite ? (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.bgSecondary, borderRadius: 12, padding: 20, width: 340, maxHeight: '60vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ fontWeight: 700, color: '#fff', marginBottom: 14, fontSize: 15 }}>Invite to call</div>
        {inviteUsers.length === 0 ? (
          <div style={{ color: '#6b6b6b', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>All channel members are already in the call</div>
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
  ) : null

  // ─── Mini mode ───────────────────────────────────────────────────────
  if (windowMode === 'mini') {
    return (
      <>
        <ScreenSourcePicker onPick={startScreenShare} onCancel={() => setScreenSources(null)} />
        <InviteModal />
        <div style={{
          position: 'fixed', left: position.x, top: position.y, zIndex: 9998,
          width: 300, height: 200, background: '#080808', borderRadius: 12,
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div onMouseDown={handleDragStart} onDoubleClick={() => setWindowMode('normal')} style={{
            padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6,
            cursor: isDragging ? 'grabbing' : 'grab', background: 'rgba(255,255,255,0.05)', flexShrink: 0,
          }}>
            <Move size={10} color="#94a3b8" />
            <Hash size={10} color="#94a3b8" />
            <span style={{ color: '#fff', fontSize: 10, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channelName}</span>
            <span style={{ color: '#6b6b6b', fontSize: 10 }}><Users size={10} style={{ verticalAlign: 'middle' }} /> {totalParticipants}</span>
          </div>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${Math.min(gridCols, 2)}, 1fr)`, gap: 2, padding: 2, minHeight: 0 }}>
            {renderParticipantTile(auth.userId, localStream.current, 'You', null, true)}
            {peerList.slice(0, 3).map(([id, p]) => renderParticipantTile(id, p.stream, p.name, p.avatar, false))}
          </div>
          <div style={{ padding: '4px 8px', display: 'flex', justifyContent: 'center', flexShrink: 0, background: 'rgba(0,0,0,0.3)' }}>
            <CallControls muted={muted} onToggleMute={toggleMute} deafened={deafened} onToggleDeafen={toggleDeafen} videoOff={videoOff} onToggleVideo={toggleVideo}
              videoActive={videoActive} windowMode="mini" onSetWindowMode={setWindowMode}
              onHangup={handleLeave} participantCount={totalParticipants} callDuration={callDuration}
              screenSharing={screenSharing} onToggleScreenShare={toggleScreenShare} connectionQuality={connectionQuality}
              onSwitchAudioInput={switchAudioInput} onSwitchAudioOutput={switchAudioOutput} onSwitchVideoInput={switchVideoInput}
              localSpeaking={localSpeaking} noiseSuppression={noiseSuppression} onToggleNoiseSuppression={toggleNoiseSuppression}
              backgroundBlur={backgroundBlur} onToggleBackgroundBlur={toggleBackgroundBlur}
              onReaction={sendReaction} pushToTalk={pushToTalk} onTogglePushToTalk={togglePushToTalk} />
          </div>
          <video ref={localVideo} autoPlay playsInline muted style={{ display: 'none' }} />
        </div>
      </>
    )
  }

  // ─── Normal / fullscreen mode ────────────────────────────────────────
  const isFs = windowMode === 'fullscreen'
  return (
    <>
      <ScreenSourcePicker onPick={startScreenShare} onCancel={() => setScreenSources(null)} />
      <InviteModal />
      <div style={{
        position: 'fixed', inset: 0, background: isFs ? '#000' : 'rgba(0,0,0,0.85)', zIndex: 9998,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          ...(isFs ? { opacity: showControls ? 1 : 0, transition: 'opacity 0.3s' } : {}),
        }}>
          <Hash size={16} color="#94a3b8" />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{channelName}</span>
          <span style={{ color: '#6b6b6b', fontSize: 12 }}><Users size={12} style={{ verticalAlign: 'middle' }} /> {totalParticipants}</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => { setViewMode(viewMode === 'grid' ? 'focus' : 'grid'); if (viewMode === 'grid' && !focusTarget && peerList.length > 0) setFocusTarget(peerList[0][0]) }}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#ccc', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
            title={viewMode === 'grid' ? 'Switch to focus view' : 'Switch to grid view'}>
            {viewMode === 'grid' ? <LayoutGrid size={14} /> : <LayoutList size={14} />}
            {viewMode === 'grid' ? 'Grid' : 'Focus'}
          </button>
        </div>
        {/* Participant grid / focus */}
        {viewMode === 'grid' ? (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: 8, padding: '0 20px', minHeight: 0 }}>
            {renderParticipantTile(auth.userId, localStream.current, 'You', null, true)}
            {peerList.map(([id, p]) => renderParticipantTile(id, p.stream, p.name, p.avatar, false))}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: '0 20px', minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              {(() => {
                const ft = focusTarget
                if (ft === auth.userId || !ft) return renderParticipantTile(auth.userId, localStream.current, 'You', null, true)
                const p = peers.get(ft)
                if (p) return renderParticipantTile(ft, p.stream, p.name, p.avatar, false)
                return renderParticipantTile(auth.userId, localStream.current, 'You', null, true)
              })()}
            </div>
            <div style={{ display: 'flex', gap: 4, height: 80, flexShrink: 0, overflowX: 'auto' }}>
              {(focusTarget !== auth.userId && focusTarget) && (
                <div style={{ width: 100, flexShrink: 0, cursor: 'pointer' }} onClick={() => setFocusTarget(auth.userId)}>
                  {renderParticipantTile(auth.userId, localStream.current, 'You', null, true)}
                </div>
              )}
              {peerList.filter(([id]) => id !== focusTarget).map(([id, p]) => (
                <div key={id} style={{ width: 100, flexShrink: 0, cursor: 'pointer' }} onClick={() => setFocusTarget(id)}>
                  {renderParticipantTile(id, p.stream, p.name, p.avatar, false)}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* PTT indicator */}
        {pushToTalk && muted && (
          <div style={{ padding: '6px 16px', textAlign: 'center' }}>
            <span style={{
              display: 'inline-block', padding: '4px 14px', borderRadius: 6,
              background: 'rgba(88,101,242,0.2)', color: '#5865F2', fontSize: 12, fontWeight: 600,
            }}>
              Push to Talk — Hold <span style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 3, padding: '1px 6px', marginLeft: 4 }}>V</span>
            </span>
          </div>
        )}
        {/* Controls */}
        <div style={{
          padding: '16px 0', display: 'flex', justifyContent: 'center', flexShrink: 0,
          ...(isFs ? { opacity: showControls ? 1 : 0, transition: 'opacity 0.3s' } : {}),
        }}>
          <div style={{ padding: '10px 24px', borderRadius: 8, background: isFs ? 'rgba(0,0,0,0.6)' : 'transparent' }}>
            <CallControls muted={muted} onToggleMute={toggleMute} deafened={deafened} onToggleDeafen={toggleDeafen} videoOff={videoOff} onToggleVideo={toggleVideo}
              videoActive={videoActive} windowMode={windowMode} onSetWindowMode={setWindowMode}
              onHangup={handleLeave} participantCount={totalParticipants} callDuration={callDuration}
              screenSharing={screenSharing} onToggleScreenShare={toggleScreenShare} connectionQuality={connectionQuality}
              onInvite={loadInviteUsers} onSwitchAudioInput={switchAudioInput} onSwitchAudioOutput={switchAudioOutput} onSwitchVideoInput={switchVideoInput}
              localSpeaking={localSpeaking} noiseSuppression={noiseSuppression} onToggleNoiseSuppression={toggleNoiseSuppression}
              backgroundBlur={backgroundBlur} onToggleBackgroundBlur={toggleBackgroundBlur}
              onReaction={sendReaction} pushToTalk={pushToTalk} onTogglePushToTalk={togglePushToTalk} />
          </div>
        </div>
        {/* Floating emoji reactions */}
        {callReactions.length > 0 && (
          <div style={{ position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, pointerEvents: 'none', zIndex: 100 }}>
            {callReactions.map(r => (
              <span key={r.id} style={{ fontSize: 32, animation: 'callReactionFloat 3s ease-out forwards' }}>{r.emoji}</span>
            ))}
          </div>
        )}
        <video ref={localVideo} autoPlay playsInline muted style={{ display: 'none' }} />
      </div>
    </>
  )
}
