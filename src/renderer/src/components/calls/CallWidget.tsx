import React, { useState, useEffect, useRef } from 'react'
import { X, Monitor, Move } from 'lucide-react'
import { ApiConfig, Auth } from '../../types'
import { C } from '../../theme'
import Avatar from '../shared/Avatar'
import CallControls from './CallControls'

const DEMO_MODE = false

export default function CallWidget({ config, auth: _auth, targetUser, callType, onEnd, offerSdp, bufferedIce }: {
  config: ApiConfig; auth: Auth
  targetUser: { id: string; name: string; avatar: string | null }
  callType: 'audio' | 'video'
  onEnd: () => void
  offerSdp?: string
  bufferedIce?: RTCIceCandidateInit[]
}) {
  const isReceiver = !!offerSdp
  const [status, setStatus] = useState<'calling' | 'connecting' | 'connected' | 'ended'>('calling')
  const statusRef = useRef<'calling' | 'connecting' | 'connected' | 'ended'>('calling')
  const [muted, setMuted] = useState(false)
  const [videoActive, setVideoActive] = useState(callType === 'video')
  const [videoOff, setVideoOff] = useState(false)
  const [windowMode, setWindowMode] = useState<'mini' | 'normal' | 'fullscreen'>('normal')
  const [floatingOnDesktop, setFloatingOnDesktop] = useState(false)
  const [position, setPosition] = useState({ x: window.innerWidth - 320, y: window.innerHeight - 240 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const [callDuration, setCallDuration] = useState(0)
  const durationTimer = useRef<NodeJS.Timeout | null>(null)
  const localVideo = useRef<HTMLVideoElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioEl = useRef<HTMLAudioElement | null>(null)
  const pc = useRef<RTCPeerConnection | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const iceBuffer = useRef<RTCIceCandidateInit[]>(bufferedIce ? [...bufferedIce] : [])
  const remoteDescSet = useRef(false)
  const [showControls, setShowControls] = useState(true)
  const hideTimer = useRef<NodeJS.Timeout | null>(null)
  const renegotiating = useRef(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const screenShareStream = useRef<MediaStream | null>(null)
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'fair' | 'poor' | 'disconnected'>('good')
  const [screenSources, setScreenSources] = useState<Array<{ id: string; name: string; thumbnail: string }> | null>(null)
  const [remoteHasVideo, setRemoteHasVideo] = useState(false)
  const iceRestartTimer = useRef<NodeJS.Timeout | null>(null)
  const callingAudioRef = useRef<HTMLAudioElement | null>(null)
  const [deafened, setDeafened] = useState(false)
  const [remoteSpeaking, setRemoteSpeaking] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const speakingRafRef = useRef<number | null>(null)
  const [localSpeaking, setLocalSpeaking] = useState(false)
  const localAnalyserRef = useRef<AnalyserNode | null>(null)
  const localAudioCtxRef = useRef<AudioContext | null>(null)
  const localSpeakingRafRef = useRef<number | null>(null)
  const [noiseSuppression, setNoiseSuppression] = useState(true)
  const [backgroundBlur, setBackgroundBlur] = useState(false)
  const [pushToTalk, setPushToTalk] = useState(false)
  const [callReactions, setCallReactions] = useState<Array<{ id: number; emoji: string }>>([])
  const reactionIdRef = useRef(0)

  useEffect(() => {
    if (DEMO_MODE) {
      setStatus('connected')
      statusRef.current = 'connected'
      durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000)
      return () => { if (durationTimer.current) clearInterval(durationTimer.current) }
    }
    const ctrl = new AbortController()
    listenForSignals(ctrl)
    if (isReceiver) {
      answerCall()
    } else {
      startCall()
    }
    let callingAudio: HTMLAudioElement | null = null
    if (!isReceiver) {
      callingAudio = new Audio('sounds/calling-idle.mp3')
      callingAudio.loop = true
      callingAudio.volume = 0.5
      callingAudio.play().catch(() => {})
      callingAudioRef.current = callingAudio
    }
    let timeout: NodeJS.Timeout | undefined
    if (!isReceiver) {
      timeout = setTimeout(() => {
        if (statusRef.current === 'calling') {
          window.dispatchEvent(new CustomEvent('bundy-missed-call', { detail: { userId: targetUser.id, userName: targetUser.name, callType, reason: 'no-answer' } }))
          const endAudio = new Audio('sounds/call-end.mp3')
          endAudio.volume = 0.4
          endAudio.play().catch(() => {})
          cleanup(true); setStatus('ended'); onEnd()
        }
      }, 30000)
    }
    return () => { ctrl.abort(); cleanup(false); if (timeout) clearTimeout(timeout); if (durationTimer.current) clearInterval(durationTimer.current); if (iceRestartTimer.current) clearTimeout(iceRestartTimer.current); if (callingAudio) { callingAudio.pause(); callingAudio.src = '' } }
  }, [])

  useEffect(() => {
    if (status === 'connected' && !durationTimer.current) {
      durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000)
      const connAudio = new Audio('sounds/call-connected.mp3')
      connAudio.volume = 0.4
      connAudio.play().catch(() => {})
    }
    return () => { if (status === 'ended' && durationTimer.current) { clearInterval(durationTimer.current); durationTimer.current = null } }
  }, [status])

  useEffect(() => {
    const audio = document.createElement('audio')
    audio.autoplay = true
    remoteAudioEl.current = audio
    return () => { audio.pause(); audio.srcObject = null; remoteAudioEl.current = null }
  }, [])

  useEffect(() => {
    if (remoteStreamRef.current && remoteVideo.current) {
      remoteVideo.current.srcObject = remoteStreamRef.current
      remoteVideo.current.play().catch(() => {})
    }
    if (localStream.current && localVideo.current && videoActive) {
      localVideo.current.srcObject = localStream.current
      localVideo.current.play().catch(() => {})
    }
  }, [windowMode, videoActive])

  useEffect(() => {
    if (remoteHasVideo && remoteStreamRef.current && remoteVideo.current) {
      remoteVideo.current.srcObject = remoteStreamRef.current
      remoteVideo.current.play().catch(() => {})
    }
  }, [remoteHasVideo])

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

  const handleSetWindowMode = (mode: 'mini' | 'normal' | 'fullscreen') => {
    if (mode === 'mini') {
      const state = { userName: targetUser.name, userAvatar: targetUser.avatar, status, duration: callDuration, muted, videoActive }
      if (window.electronAPI?.openCallFloat) {
        setFloatingOnDesktop(true)
        window.electronAPI.openCallFloat(state)
      } else {
        setPosition({ x: window.innerWidth - 320, y: window.innerHeight - 120 })
        setWindowMode('mini')
      }
    } else {
      setWindowMode(mode)
    }
  }

  useEffect(() => {
    if (!floatingOnDesktop) return
    const state = { userName: targetUser.name, userAvatar: targetUser.avatar, status, duration: callDuration, muted, videoActive }
    window.electronAPI?.updateCallFloat?.(state)
  }, [floatingOnDesktop, status, callDuration, muted, videoActive])

  const floatActionsRef = useRef({ toggleMute: () => {}, hangup: () => {} })
  useEffect(() => { floatActionsRef.current = { toggleMute, hangup } })
  useEffect(() => {
    if (!floatingOnDesktop) return
    if (!window.electronAPI?.onCallFloatAction) return
    const unsub = window.electronAPI.onCallFloatAction((action) => {
      const act = (action as { action: string }).action
      if (act === 'expand') { setFloatingOnDesktop(false); setWindowMode('normal') }
      else if (act === 'mute' || act === 'unmute') floatActionsRef.current.toggleMute()
      else if (act === 'hangup') { setFloatingOnDesktop(false); window.electronAPI?.closeCallFloat?.(); floatActionsRef.current.hangup() }
    })
    return unsub
  }, [floatingOnDesktop])

  useEffect(() => {
    if (status === 'ended' && floatingOnDesktop) { setFloatingOnDesktop(false); window.electronAPI?.closeCallFloat?.() }
  }, [status, floatingOnDesktop])

  async function setupPeer(stream: MediaStream) {
    const peerConn = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      ],
      iceTransportPolicy: 'all',
    })
    pc.current = peerConn
    const tracks = stream.getTracks()
    if (tracks.length > 0) {
      tracks.forEach(t => peerConn.addTrack(t, stream))
    } else {
      // No mic — add recvonly audio transceiver so we can still receive audio
      peerConn.addTransceiver('audio', { direction: 'recvonly' })
    }
    peerConn.ontrack = e => {
      let remoteStream = e.streams[0]
      if (!remoteStream) {
        if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream()
        remoteStreamRef.current.addTrack(e.track)
        remoteStream = remoteStreamRef.current
      } else {
        remoteStreamRef.current = remoteStream
      }
      const hasVid = remoteStream.getVideoTracks().length > 0
      setRemoteHasVideo(hasVid)
      if (hasVid && remoteVideo.current) { remoteVideo.current.srcObject = remoteStream; remoteVideo.current.play().catch(() => {}) }
      if (remoteAudioEl.current) { remoteAudioEl.current.srcObject = remoteStream; remoteAudioEl.current.play().catch(() => {}) }
    }
    peerConn.onconnectionstatechange = () => {
      const state = peerConn.connectionState
      if (state === 'connected') { setStatus('connected'); statusRef.current = 'connected'; if (callingAudioRef.current) { callingAudioRef.current.pause(); callingAudioRef.current.src = ''; callingAudioRef.current = null } }
    }
    peerConn.oniceconnectionstatechange = () => {
      const state = peerConn.iceConnectionState
      if (state === 'checking' && statusRef.current === 'calling') { setStatus('connecting'); statusRef.current = 'connecting' }
      if (state === 'connected' || state === 'completed') { setStatus('connected'); statusRef.current = 'connected'; if (callingAudioRef.current) { callingAudioRef.current.pause(); callingAudioRef.current.src = ''; callingAudioRef.current = null } }
      else if (state === 'disconnected') {
        if (iceRestartTimer.current) clearTimeout(iceRestartTimer.current)
        iceRestartTimer.current = setTimeout(async () => {
          if (peerConn.iceConnectionState === 'disconnected' && statusRef.current !== 'ended') {
            try {
              const offer = await peerConn.createOffer({ iceRestart: true })
              await peerConn.setLocalDescription(offer)
              await fetch(`${config.apiBase}/api/calls`, { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reoffer', to: targetUser.id, sdp: offer.sdp }) })
            } catch { /* ignore */ }
          }
        }, 5000)
      }
      else if (state === 'failed') {
        peerConn.createOffer({ iceRestart: true }).then(async offer => {
          await peerConn.setLocalDescription(offer)
          await fetch(`${config.apiBase}/api/calls`, { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reoffer', to: targetUser.id, sdp: offer.sdp }) })
        }).catch(() => { cleanup(true); setStatus('ended'); onEnd() })
      }
    }
    peerConn.onicecandidate = e => {
      if (e.candidate) fetch(`${config.apiBase}/api/calls`, { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ice', to: targetUser.id, candidate: e.candidate }) }).catch(() => {})
    }
    return peerConn
  }

  async function drainIceBuffer(peerConn: RTCPeerConnection) {
    remoteDescSet.current = true
    for (const c of iceBuffer.current) {
      try { await peerConn.addIceCandidate(new RTCIceCandidate(c)) } catch { /* ignore */ }
    }
    iceBuffer.current = []
  }

  async function getMediaWithFallback(video: boolean): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video })
    } catch {
      // No microphone — join with empty stream so user can still listen
      const stream = new MediaStream()
      if (video) {
        try {
          const vidStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
          vidStream.getVideoTracks().forEach(t => stream.addTrack(t))
        } catch { /* no camera either */ }
      }
      setMuted(true)
      return stream
    }
  }

  async function startCall() {
    try {
      const stream = await getMediaWithFallback(callType === 'video')
      localStream.current = stream
      if (localVideo.current && callType === 'video') localVideo.current.srcObject = stream
      const peerConn = await setupPeer(stream)
      const offer = await peerConn.createOffer()
      await peerConn.setLocalDescription(offer)
      await fetch(`${config.apiBase}/api/calls`, { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'offer', to: targetUser.id, sdp: offer.sdp, callType }) })
    } catch { cleanup(true); onEnd() }
  }

  async function answerCall() {
    try {
      const stream = await getMediaWithFallback(callType === 'video')
      localStream.current = stream
      if (localVideo.current && callType === 'video') localVideo.current.srcObject = stream
      const peerConn = await setupPeer(stream)
      await peerConn.setRemoteDescription({ type: 'offer', sdp: offerSdp! })
      await drainIceBuffer(peerConn)
      const answer = await peerConn.createAnswer()
      await peerConn.setLocalDescription(answer)
      await fetch(`${config.apiBase}/api/calls`, { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'answer', to: targetUser.id, sdp: answer.sdp }) })
    } catch { cleanup(true); onEnd() }
  }

  function listenForSignals(ctrl: AbortController) {
    const onAnswer = async (e: Event) => {
      const payload = (e as CustomEvent<{ sdp?: string }>).detail
      if (!isReceiver && pc.current) {
        try {
          await pc.current.setRemoteDescription({ type: 'answer', sdp: payload.sdp! })
          await drainIceBuffer(pc.current)
          if (statusRef.current === 'calling') { setStatus('connected'); statusRef.current = 'connected'; if (callingAudioRef.current) { callingAudioRef.current.pause(); callingAudioRef.current.src = ''; callingAudioRef.current = null } }
        } catch { /* ignore */ }
      }
    }
    const onIce = async (e: Event) => {
      const payload = (e as CustomEvent<{ candidate?: RTCIceCandidateInit }>).detail
      if (!payload.candidate) return
      if (remoteDescSet.current && pc.current) {
        try { await pc.current.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch { /* ignore */ }
      } else iceBuffer.current.push(payload.candidate)
    }
    const onCallEnd = () => {
      const endAudio = new Audio('sounds/call-end.mp3'); endAudio.volume = 0.4; endAudio.play().catch(() => {})
      cleanup(false); setStatus('ended'); setTimeout(onEnd, 1000)
    }
    const onReoffer = async (e: Event) => {
      const payload = (e as CustomEvent<{ sdp?: string }>).detail
      if (!payload.sdp || !pc.current) return
      try {
        renegotiating.current = true
        await pc.current.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
        const answer = await pc.current.createAnswer(); await pc.current.setLocalDescription(answer)
        await fetch(`${config.apiBase}/api/calls`, { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reanswer', to: targetUser.id, sdp: answer.sdp }) })
        renegotiating.current = false
      } catch { renegotiating.current = false }
    }
    const onReanswer = async (e: Event) => {
      const payload = (e as CustomEvent<{ sdp?: string }>).detail
      if (!payload.sdp || !pc.current) return
      try { await pc.current.setRemoteDescription({ type: 'answer', sdp: payload.sdp }); renegotiating.current = false } catch { renegotiating.current = false }
    }
    window.addEventListener('bundy-call-answer', onAnswer)
    window.addEventListener('bundy-call-ice', onIce)
    window.addEventListener('bundy-call-end', onCallEnd)
    window.addEventListener('bundy-call-reoffer', onReoffer)
    window.addEventListener('bundy-call-reanswer', onReanswer)
    ctrl.signal.addEventListener('abort', () => {
      window.removeEventListener('bundy-call-answer', onAnswer)
      window.removeEventListener('bundy-call-ice', onIce)
      window.removeEventListener('bundy-call-end', onCallEnd)
      window.removeEventListener('bundy-call-reoffer', onReoffer)
      window.removeEventListener('bundy-call-reanswer', onReanswer)
    })
  }

  function cleanup(sendEnd: boolean) {
    pc.current?.close()
    localStream.current?.getTracks().forEach(t => t.stop())
    screenShareStream.current?.getTracks().forEach(t => t.stop())
    if (speakingRafRef.current) cancelAnimationFrame(speakingRafRef.current)
    audioContextRef.current?.close().catch(() => {})
    if (localSpeakingRafRef.current) cancelAnimationFrame(localSpeakingRafRef.current)
    localAudioCtxRef.current?.close().catch(() => {})
    if (sendEnd) fetch(`${config.apiBase}/api/calls`, { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'end', to: targetUser.id }) }).catch(() => {})
  }

  function toggleMute() { localStream.current?.getAudioTracks().forEach(t => { t.enabled = muted }); setMuted(!muted) }
  function toggleDeafen() {
    const newDeafened = !deafened; setDeafened(newDeafened)
    if (remoteAudioEl.current) remoteAudioEl.current.muted = newDeafened
    if (newDeafened && !muted) { localStream.current?.getAudioTracks().forEach(t => { t.enabled = false }); setMuted(true) }
  }

  async function switchAudioInput(deviceId: string) {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId }, noiseSuppression } as any })
      const newTrack = newStream.getAudioTracks()[0]; const oldTrack = localStream.current?.getAudioTracks()[0]
      if (oldTrack && pc.current) { const sender = pc.current.getSenders().find(s => s.track?.kind === 'audio'); if (sender) await sender.replaceTrack(newTrack); localStream.current?.removeTrack(oldTrack); oldTrack.stop() }
      localStream.current?.addTrack(newTrack); if (muted) newTrack.enabled = false; setupLocalSpeakingDetection()
    } catch { /* ignore */ }
  }

  async function switchAudioOutput(deviceId: string) {
    try { if (remoteAudioEl.current && 'setSinkId' in remoteAudioEl.current) await (remoteAudioEl.current as any).setSinkId(deviceId) } catch { /* ignore */ }
  }

  async function switchVideoInput(deviceId: string) {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } })
      const newTrack = newStream.getVideoTracks()[0]; const oldTrack = localStream.current?.getVideoTracks()[0]
      if (oldTrack && pc.current) { const sender = pc.current.getSenders().find(s => s.track?.kind === 'video'); if (sender) await sender.replaceTrack(newTrack); localStream.current?.removeTrack(oldTrack); oldTrack.stop() }
      localStream.current?.addTrack(newTrack); if (localVideo.current) localVideo.current.srcObject = localStream.current
      if (videoOff) newTrack.enabled = false
    } catch { /* ignore */ }
  }

  async function toggleNoiseSuppression() {
    const newVal = !noiseSuppression; setNoiseSuppression(newVal)
    const audioTrack = localStream.current?.getAudioTracks()[0]
    if (audioTrack) try { await audioTrack.applyConstraints({ noiseSuppression: newVal }) } catch { /* not supported */ }
  }

  async function toggleBackgroundBlur() {
    const newVal = !backgroundBlur; setBackgroundBlur(newVal)
    const videoTrack = localStream.current?.getVideoTracks()[0]
    if (videoTrack) try { await videoTrack.applyConstraints({ backgroundBlur: newVal } as any) } catch { /* not supported */ }
  }

  function togglePushToTalk() {
    const newPtt = !pushToTalk; setPushToTalk(newPtt)
    if (newPtt) { localStream.current?.getAudioTracks().forEach(t => { t.enabled = false }); setMuted(true) }
  }

  useEffect(() => {
    if (!pushToTalk || status !== 'connected') return
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'v' && !e.repeat && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') { localStream.current?.getAudioTracks().forEach(t => { t.enabled = true }); setMuted(false) }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'v' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') { localStream.current?.getAudioTracks().forEach(t => { t.enabled = false }); setMuted(true) }
    }
    window.addEventListener('keydown', onDown); window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [pushToTalk, status])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setScreenSources(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function sendReaction(emoji: string) {
    const id = ++reactionIdRef.current; setCallReactions(prev => [...prev, { id, emoji }]); setTimeout(() => setCallReactions(prev => prev.filter(r => r.id !== id)), 3000)
    fetch(`${config.apiBase}/api/calls`, { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'call-reaction', to: targetUser.id, emoji }) }).catch(() => {})
  }

  useEffect(() => {
    const onReaction = (e: Event) => {
      const { emoji } = (e as CustomEvent<{ emoji: string }>).detail
      const id = ++reactionIdRef.current; setCallReactions(prev => [...prev, { id, emoji }]); setTimeout(() => setCallReactions(prev => prev.filter(r => r.id !== id)), 3000)
    }
    window.addEventListener('bundy-call-reaction', onReaction)
    return () => window.removeEventListener('bundy-call-reaction', onReaction)
  }, [])

  function setupLocalSpeakingDetection() {
    if (localSpeakingRafRef.current) cancelAnimationFrame(localSpeakingRafRef.current)
    localAudioCtxRef.current?.close().catch(() => {})
    if (!localStream.current || localStream.current.getAudioTracks().length === 0) return
    try {
      const ctx = new AudioContext(); const source = ctx.createMediaStreamSource(localStream.current)
      const analyser = ctx.createAnalyser(); analyser.fftSize = 256; source.connect(analyser)
      localAudioCtxRef.current = ctx; localAnalyserRef.current = analyser
      const data = new Uint8Array(analyser.frequencyBinCount)
      const check = () => { analyser.getByteFrequencyData(data); setLocalSpeaking(data.reduce((a, b) => a + b, 0) / data.length > 15); localSpeakingRafRef.current = requestAnimationFrame(check) }
      check()
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (status !== 'connected' || !localStream.current) return
    setupLocalSpeakingDetection()
    return () => { if (localSpeakingRafRef.current) cancelAnimationFrame(localSpeakingRafRef.current); localAudioCtxRef.current?.close().catch(() => {}) }
  }, [status])

  useEffect(() => {
    if (status !== 'connected' || !remoteStreamRef.current) return
    const audioTracks = remoteStreamRef.current.getAudioTracks()
    if (audioTracks.length === 0) return
    try {
      const ctx = new AudioContext(); const source = ctx.createMediaStreamSource(remoteStreamRef.current)
      const analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.5; source.connect(analyser)
      audioContextRef.current = ctx; analyserRef.current = analyser
      const data = new Uint8Array(analyser.frequencyBinCount); let lastSpeaking = false
      const detect = () => { analyser.getByteFrequencyData(data); const avg = data.reduce((a, b) => a + b, 0) / data.length; const speaking = avg > 15; if (speaking !== lastSpeaking) { lastSpeaking = speaking; setRemoteSpeaking(speaking) }; speakingRafRef.current = requestAnimationFrame(detect) }
      speakingRafRef.current = requestAnimationFrame(detect)
    } catch { /* ignore */ }
    return () => { if (speakingRafRef.current) cancelAnimationFrame(speakingRafRef.current); audioContextRef.current?.close().catch(() => {}); audioContextRef.current = null; analyserRef.current = null }
  }, [status, remoteHasVideo])

  async function toggleVideo() {
    if (!pc.current) return
    if (!videoActive) {
      try {
        const vidStream = await navigator.mediaDevices.getUserMedia({ video: true })
        const videoTrack = vidStream.getVideoTracks()[0]; localStream.current?.addTrack(videoTrack); pc.current.addTrack(videoTrack, localStream.current!)
        if (localVideo.current) localVideo.current.srcObject = localStream.current
        setVideoActive(true); setVideoOff(false)
        renegotiating.current = true
        const offer = await pc.current.createOffer(); await pc.current.setLocalDescription(offer)
        await fetch(`${config.apiBase}/api/calls`, { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reoffer', to: targetUser.id, sdp: offer.sdp }) })
      } catch { /* ignore */ }
    } else if (!videoOff) {
      localStream.current?.getVideoTracks().forEach(t => { t.enabled = false }); setVideoOff(true)
    } else {
      localStream.current?.getVideoTracks().forEach(t => { t.enabled = true }); setVideoOff(false)
    }
  }

  function hangup() {
    const endAudio = new Audio('sounds/call-end.mp3'); endAudio.volume = 0.4; endAudio.play().catch(() => {})
    cleanup(true); setStatus('ended'); onEnd()
  }

  async function toggleScreenShare() {
    if (!pc.current) return
    if (screenSharing) {
      screenShareStream.current?.getTracks().forEach(t => t.stop()); screenShareStream.current = null
      const senders = pc.current.getSenders(); const videoSender = senders.find(s => s.track?.kind === 'video')
      if (videoSender) { if (videoActive && localStream.current) { const camTrack = localStream.current.getVideoTracks()[0]; if (camTrack) await videoSender.replaceTrack(camTrack) } else await videoSender.replaceTrack(null) }
      setScreenSharing(false)
    } else {
      try {
        const sources = await (window as any).electronAPI.getScreenSources()
        if (!sources || sources.length === 0) return
        setScreenSources(sources.map((s: any) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail ?? '' })))
      } catch { /* ignore */ }
    }
  }

  async function startScreenShare(sourceId: string) {
    if (!pc.current) return
    setScreenSources(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } as any, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } as any }).catch(() => navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } as any }))
      screenShareStream.current = stream; const screenTrack = stream.getVideoTracks()[0]
      screenTrack.onended = () => { setScreenSharing(false); screenShareStream.current = null }
      const senders = pc.current.getSenders(); const videoSender = senders.find(s => s.track?.kind === 'video')
      if (videoSender) { await videoSender.replaceTrack(screenTrack) } else {
        pc.current.addTrack(screenTrack, stream); renegotiating.current = true
        const offer = await pc.current.createOffer(); await pc.current.setLocalDescription(offer)
        await fetch(`${config.apiBase}/api/calls`, { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reoffer', to: targetUser.id, sdp: offer.sdp }) })
      }
      const screenAudioTrack = stream.getAudioTracks()[0]; if (screenAudioTrack && pc.current) pc.current.addTrack(screenAudioTrack, stream)
      setScreenSharing(true); if (!videoActive) { setVideoActive(true); setVideoOff(false) }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (status !== 'connected' || !pc.current) return
    const interval = setInterval(async () => {
      if (!pc.current) return
      try {
        const stats = await pc.current.getStats()
        let packetsLost = 0, packetsReceived = 0, currentRoundTrip = 0
        stats.forEach((report: any) => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio') { packetsLost = report.packetsLost || 0; packetsReceived = report.packetsReceived || 0 }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') currentRoundTrip = report.currentRoundTripTime || 0
        })
        const total = packetsLost + packetsReceived; const lossRate = total > 0 ? packetsLost / total : 0
        if (lossRate > 0.1 || currentRoundTrip > 0.5) setConnectionQuality('poor')
        else if (lossRate > 0.03 || currentRoundTrip > 0.2) setConnectionQuality('fair')
        else setConnectionQuality('good')
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [status])

  const handleDragStart = (e: React.MouseEvent) => { dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y }; setIsDragging(true) }
  const showVideo = videoActive || remoteHasVideo
  const fmtDur = () => `${Math.floor(callDuration / 60)}:${(callDuration % 60).toString().padStart(2, '0')}`

  if (screenSources !== null) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#080808', borderRadius: 8, padding: 24, maxWidth: 560, width: '90%', maxHeight: '80vh', overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Share Screen</span>
            <button onClick={() => setScreenSources(null)} style={{ background: 'none', border: 'none', color: '#6b6b6b', cursor: 'pointer' }}><X size={18} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {screenSources.map(src => (
              <button key={src.id} onClick={() => startScreenShare(src.id)}
                style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid transparent', borderRadius: 4, padding: 8, cursor: 'pointer', textAlign: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#007acc')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
                {src.thumbnail ? (
                  <img src={src.thumbnail} alt={src.name} style={{ width: '100%', borderRadius: 6, display: 'block', marginBottom: 6 }} />
                ) : (
                  <div style={{ width: '100%', aspectRatio: '16/9', background: C.bgFloating, borderRadius: 6, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Monitor size={28} color="#5865F2" />
                  </div>
                )}
                <span style={{ color: '#fff', fontSize: 11, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (floatingOnDesktop) {
    return (
      <div style={{ position: 'fixed', left: -9999, top: -9999, width: 0, height: 0, overflow: 'hidden' }}>
        <video ref={localVideo} autoPlay playsInline muted />
        <video ref={remoteVideo} autoPlay playsInline />
      </div>
    )
  }

  if (windowMode === 'mini') {
    return (
      <div style={{ position: 'fixed', left: position.x, top: position.y, zIndex: 9998, width: 300, height: showVideo ? 220 : 100, background: '#080808', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div onMouseDown={handleDragStart} onDoubleClick={() => setWindowMode('normal')}
          style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: isDragging ? 'grabbing' : 'grab', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <Move size={10} color="#94a3b8" />
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{targetUser.name}</span>
          <span style={{ color: status === 'connected' ? '#43B581' : '#6b6b6b', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
            {status === 'calling' ? 'Calling…' : status === 'connecting' ? 'Connecting…' : status === 'connected' ? fmtDur() : 'Ended'}
          </span>
        </div>
        {showVideo ? (
          <div style={{ flex: 1, position: 'relative', background: '#000', minHeight: 0 }}>
            <video ref={remoteVideo} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: remoteHasVideo ? 'block' : 'none' }} />
            {!remoteHasVideo && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Avatar url={targetUser.avatar} name={targetUser.name} size={24} />
                <span style={{ color: status === 'connected' ? '#43B581' : '#6b6b6b', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                  {status === 'calling' ? 'Calling…' : status === 'connecting' ? 'Connecting…' : `Connected · ${fmtDur()}`}
                </span>
              </div>
            )}
            {videoActive && <video ref={localVideo} autoPlay playsInline muted style={{ position: 'absolute', bottom: 4, right: 4, width: 70, height: 52, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.3)' }} />}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 0 }}>
            <div style={{ borderRadius: '50%', padding: 2, border: remoteSpeaking ? '2px solid #43B581' : '2px solid transparent', transition: 'border-color 0.15s' }}>
              <Avatar url={targetUser.avatar} name={targetUser.name} size={32} />
            </div>
            <span style={{ color: status === 'connected' ? '#43B581' : '#6b6b6b', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              {status === 'calling' ? 'Calling…' : status === 'connecting' ? 'Connecting…' : `Connected · ${fmtDur()}`}
            </span>
          </div>
        )}
        <div style={{ padding: '6px 10px', display: 'flex', justifyContent: 'center', flexShrink: 0, background: 'rgba(0,0,0,0.3)' }}>
          <CallControls muted={muted} onToggleMute={toggleMute} deafened={deafened} onToggleDeafen={toggleDeafen} videoOff={videoOff} onToggleVideo={toggleVideo} videoActive={videoActive} windowMode="mini" onSetWindowMode={handleSetWindowMode} onHangup={hangup} callDuration={status === 'connected' ? callDuration : undefined} screenSharing={screenSharing} onToggleScreenShare={toggleScreenShare} connectionQuality={connectionQuality} onSwitchAudioInput={switchAudioInput} onSwitchAudioOutput={switchAudioOutput} onSwitchVideoInput={switchVideoInput} localSpeaking={localSpeaking} noiseSuppression={noiseSuppression} onToggleNoiseSuppression={toggleNoiseSuppression} backgroundBlur={backgroundBlur} onToggleBackgroundBlur={toggleBackgroundBlur} onReaction={sendReaction} pushToTalk={pushToTalk} onTogglePushToTalk={togglePushToTalk} />
        </div>
        {!showVideo && <video ref={localVideo} autoPlay playsInline muted style={{ display: 'none' }} />}
      </div>
    )
  }

  const isFs = windowMode === 'fullscreen'
  return (
    <div style={{ position: 'fixed', inset: 0, background: isFs ? '#000' : 'rgba(0,0,0,0.85)', zIndex: 9998, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: isFs ? 0 : 20 }}>
      {showVideo ? (
        <div style={{ position: 'relative', width: isFs ? '100%' : 640, height: isFs ? '100%' : 420, borderRadius: isFs ? 0 : 16, overflow: 'hidden', background: '#000', flex: isFs ? 1 : undefined }}>
          <video ref={remoteVideo} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: isFs ? 'contain' : 'cover' }} />
          {videoActive && <video ref={localVideo} autoPlay playsInline muted style={{ position: 'absolute', bottom: isFs ? 20 : 12, right: isFs ? 20 : 12, width: isFs ? 200 : 150, height: isFs ? 150 : 112, borderRadius: 8, objectFit: 'cover', border: '2px solid rgba(255,255,255,0.4)' }} />}
          {(status === 'calling' || status === 'connecting') && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ display: 'inline-block', borderRadius: '50%', animation: 'callingPulse 1.5s ease-out infinite' }}><Avatar url={targetUser.avatar} name={targetUser.name} size={64} /></div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginTop: 8 }}>{targetUser.name}</div>
                <div style={{ color: '#6b6b6b', fontSize: 13, marginTop: 8 }}>{status === 'connecting' ? 'Connecting…' : 'Calling…'}</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block', borderRadius: '50%', padding: 3, border: remoteSpeaking ? '3px solid #43B581' : '3px solid transparent', transition: 'border-color 0.15s' }}>
            <Avatar url={targetUser.avatar} name={targetUser.name} size={80} />
          </div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, marginTop: 12 }}>{targetUser.name}</div>
          <div style={{ color: status === 'connected' ? '#43B581' : '#6b6b6b', fontSize: 13, marginTop: 8 }}>
            {status === 'calling' ? 'Calling…' : status === 'connecting' ? 'Connecting…' : status === 'connected' ? `Connected · ${fmtDur()}` : 'Call ended'}
          </div>
          <video ref={localVideo} autoPlay playsInline muted style={{ display: 'none' }} />
        </div>
      )}
      {pushToTalk && muted && status === 'connected' && (
        <div style={{ padding: '6px 16px', borderRadius: 6, background: 'rgba(88,101,242,0.2)', color: '#5865F2', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
          Push to Talk — Hold <span style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 3, padding: '1px 6px', marginLeft: 4 }}>V</span>
        </div>
      )}
      <div style={{ ...(isFs ? { position: 'absolute' as const, bottom: 30, left: '50%', transform: 'translateX(-50%)', opacity: showControls ? 1 : 0, transition: 'opacity 0.3s' } : {}), padding: '10px 20px', borderRadius: 8, background: isFs ? 'rgba(0,0,0,0.6)' : 'transparent' }}>
        <CallControls muted={muted} onToggleMute={toggleMute} deafened={deafened} onToggleDeafen={toggleDeafen} videoOff={videoOff} onToggleVideo={toggleVideo} videoActive={videoActive} windowMode={windowMode} onSetWindowMode={handleSetWindowMode} onHangup={hangup} screenSharing={screenSharing} onToggleScreenShare={toggleScreenShare} connectionQuality={connectionQuality} onSwitchAudioInput={switchAudioInput} onSwitchAudioOutput={switchAudioOutput} onSwitchVideoInput={switchVideoInput} localSpeaking={localSpeaking} noiseSuppression={noiseSuppression} onToggleNoiseSuppression={toggleNoiseSuppression} backgroundBlur={backgroundBlur} onToggleBackgroundBlur={toggleBackgroundBlur} onReaction={sendReaction} pushToTalk={pushToTalk} onTogglePushToTalk={togglePushToTalk} />
      </div>
      {callReactions.length > 0 && (
        <div style={{ position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, pointerEvents: 'none', zIndex: 100 }}>
          {callReactions.map(r => <span key={r.id} style={{ fontSize: 32, animation: 'callReactionFloat 3s ease-out forwards' }}>{r.emoji}</span>)}
        </div>
      )}
    </div>
  )
}
