/**
 * Single source of truth for "what conference is the user in right now".
 *
 * Two slots:
 *   - meeting       — set by FullDashboard when activeMeeting is set
 *                     (calendar meetings live in the Calendar tab)
 *   - voiceOrCall   — set by MessagesPanel when myConference is set
 *                     (voice channels + DM/group ad-hoc calls)
 *
 * Both slots are mutually exclusive at the UX layer (mutex enforced
 * at the join-handler call sites), but the schema allows both — so
 * a partial state can't lie.
 *
 * Used for:
 *   1. Mutex: each side rejects entry while the other is set.
 *   2. Cross-tab floating bar: FullDashboard reads `voiceOrCall` to
 *      render a `FloatingConferenceBar` when off the messages tab,
 *      parallel to the existing meeting bar.
 *   3. DM-list "in meeting" pill: see MessagesPanel.
 *
 * Lives outside React state so it can be read from event handlers
 * regardless of which panel is mounted.
 */

import { create } from 'zustand'

export interface ActiveVoiceOrCall {
  /** LiveKit room id — `vc_<voiceChannelId>` for a VC, or the
   *  channelId (DM/group) for an ad-hoc call. */
  channelId: string
  /** User-facing name shown on the floating bar. */
  channelName: string
  /** Wall-clock millis when the user joined; drives the duration counter. */
  joinedAt: number
  /** 'vc' for persistent voice channels, 'call' for ad-hoc DM/group. */
  kind: 'vc' | 'call'
}

interface ConferenceLockState {
  /** Boolean shorthand — kept for backwards compat with mutex sites. */
  inMeeting: boolean
  inVoiceOrCall: boolean
  /** Full info (only present when in a VC/call). */
  voiceOrCall: ActiveVoiceOrCall | null

  setInMeeting: (v: boolean) => void
  setInVoiceOrCall: (v: ActiveVoiceOrCall | null) => void
}

export const useConferenceLockStore = create<ConferenceLockState>((set) => ({
  inMeeting: false,
  inVoiceOrCall: false,
  voiceOrCall: null,
  setInMeeting: (v) => set({ inMeeting: v }),
  setInVoiceOrCall: (v) => set({
    inVoiceOrCall: !!v,
    voiceOrCall: v,
  }),
}))

/** Imperative read for non-React contexts (event handlers, callbacks). */
export function readConferenceLock(): {
  inMeeting: boolean
  inVoiceOrCall: boolean
  voiceOrCall: ActiveVoiceOrCall | null
} {
  const s = useConferenceLockStore.getState()
  return { inMeeting: s.inMeeting, inVoiceOrCall: s.inVoiceOrCall, voiceOrCall: s.voiceOrCall }
}
