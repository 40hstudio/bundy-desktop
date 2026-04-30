import { create } from 'zustand'

export type CallMode = 'mini' | 'normal' | 'fullscreen'

export type CallState = {
  /** Active call/conference id, or null when not in a call. */
  callId: string | null
  callType: 'audio' | 'video' | 'conference' | null
  windowMode: CallMode
  isMuted: boolean
  isVideoOn: boolean
  isScreenSharing: boolean
  /** Last reported connection quality from LiveKit/mesh. */
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unknown'

  enterCall: (id: string, type: 'audio' | 'video' | 'conference') => void
  leaveCall: () => void
  setWindowMode: (mode: CallMode) => void
  setMuted: (muted: boolean) => void
  setVideoOn: (on: boolean) => void
  setScreenSharing: (on: boolean) => void
  setConnectionQuality: (q: CallState['connectionQuality']) => void
}

/**
 * Active call state shared across CallWidget, ConferenceWidget,
 * FloatingCallOverlay, and VoiceChannelView. Replaces prop drilling
 * and lifted-state-from-Dashboard patterns. Phase 6 wires the call
 * widgets to this store via the `<CallShell>` primitive.
 */
export const useCallStore = create<CallState>((set) => ({
  callId: null,
  callType: null,
  windowMode: 'normal',
  isMuted: false,
  isVideoOn: false,
  isScreenSharing: false,
  connectionQuality: 'unknown',

  enterCall: (id, type) => set({
    callId: id, callType: type,
    windowMode: 'normal',
    isMuted: false, isVideoOn: type === 'video', isScreenSharing: false,
    connectionQuality: 'unknown',
  }),
  leaveCall: () => set({
    callId: null, callType: null,
    windowMode: 'normal',
    isMuted: false, isVideoOn: false, isScreenSharing: false,
    connectionQuality: 'unknown',
  }),
  setWindowMode: (windowMode) => set({ windowMode }),
  setMuted: (isMuted) => set({ isMuted }),
  setVideoOn: (isVideoOn) => set({ isVideoOn }),
  setScreenSharing: (isScreenSharing) => set({ isScreenSharing }),
  setConnectionQuality: (connectionQuality) => set({ connectionQuality }),
}))
