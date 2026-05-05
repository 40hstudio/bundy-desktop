/**
 * Single source of truth for notification sounds. Maps semantic event
 * names → Material Design sound files. Use `playSound('event-name')`
 * everywhere instead of `new Audio('sounds/foo.mp3').play()`.
 *
 * Adding a new sound:
 *   1. Drop the file in `src/renderer/public/sounds/material/`
 *   2. Add a key here
 *
 * Pack: Google Material Design Sound Resources (CC-BY 4.0)
 *   https://archive.org/details/material-design-sound-resources
 */

const BASE = 'sounds/material/'

// Each event maps to exactly one file. Reuses are intentional — events
// in the same family share a sound (e.g. all reactions get a pop), so
// users learn the family rather than memorize 60 individual sounds.
export const SOUND_MAP = {
  // 1. Messaging
  'message.dm.in':            'notification_simple-01',
  'message.group.in':         'notification_simple-02',
  'message.channel.in':       'notification_ambient',
  'message.task.in':          'notification_decorative-01',
  'message.send':             'ui_tap-variant-01',
  'message.mention':          'notification_high-intensity',
  'message.broadcast':        'alert_high-intensity',
  'message.thread-reply':     'navigation_forward-selection',
  'message.reaction':         'navigation_hover-tap',
  'message.pin':              'ui_lock',
  'message.first-dm':         'hero_simple-celebration-03',
  'message.added-to-channel': 'state-change_confirm-up',
  'message.scheduled-fire':   'ui_refresh-feed',
  'message.failed':           'alert_error-03',
  'message.queue-replayed':   'ui_loading',

  // 2. Calls
  'call.incoming':       'ringtone_minimal',
  'call.connected':      'state-change_confirm-up',
  'call.ended':          'state-change_confirm-down',
  'call.missed':         'alert_error-01',
  'call.declined':       'navigation-cancel',
  'call.reaction':       'navigation_hover-tap',
  'call.mute':           'ui_lock',
  'call.unmute':         'ui_unlock',
  'call.screenshare-on':  'state-change_confirm-up',
  'call.screenshare-off': 'state-change_confirm-down',

  // 3. Voice channels & conferences
  'vc.invite':                 'notification_high-intensity',
  'vc.self-joined':            'navigation_forward-selection',
  'vc.self-left':              'navigation_backward-selection',
  'vc.peer-joined':            'navigation_forward-selection-minimal',
  'vc.peer-left':              'navigation_backward-selection-minimal',
  'vc.message':                'notification_simple-02',
  'vc.reaction':               'navigation_hover-tap',

  // 4. Tasks
  'task.assigned':       'notification_decorative-02',
  'task.status-change':  'state-change_confirm-up',
  'task.done':           'hero_simple-celebration-02',
  'task.comment':        'notification_decorative-01',
  'task.subtask-added':  'ui_tap-variant-02',
  'task.mention':        'notification_high-intensity',
  'task.due-soon':       'alarm_gentle',
  'task.overdue':        'alert_simple',
  'task.moved':          'ui_tap-variant-03',
  'task.project-new':    'notification_ambient',

  // 5. Reports / feedback
  'report.feedback-pin':       'ui_camera-shutter',
  'report.feedback-comment':   'notification_decorative-02',
  'report.submitted':          'hero_simple-celebration-03',
  'report.reminder':           'alert_simple',
  'report.missing':            'alarm_gentle',
  'report.plan-update':        'ui_tap-variant-04',
  'report.collab-joined':      'ui_loading',

  // 6. Time tracking
  'time.clock-in':       'hero_simple-celebration-01',
  'time.clock-out':      'hero_decorative-celebration-01',
  'time.break-start':    'state-change_confirm-down',
  'time.break-end':      'state-change_confirm-up',
  'time.idle-warn':      'navigation_unavailable-selection',
  'time.overtime':       'alarm_gentle',
  'time.manual-approved':'hero_simple-celebration-03',
  'time.manual-rejected':'alert_error-01',
  'time.screenshot':     'ui_camera-shutter',

  // 7. Notifications inbox
  'inbox.new':           'notification_simple-01',
  'inbox.mark-all-read': 'ui_refresh-feed',

  // 8. System / app lifecycle
  'system.update-available': 'notification_ambient',
  'system.update-ready':     'hero_simple-celebration-01',
  'system.token-expired':    'alert_error-02',
  'system.offline':          'navigation_unavailable-selection',
  'system.online':           'state-change_confirm-up',
  'system.queue-failed':     'alert_error-02',
  'system.permission-denied':'navigation-cancel',
  'system.force-logout':     'alert_high-intensity',

  // 9. UI micro-interactions
  'ui.send':           'ui_tap-variant-01',
  'ui.slash-cmd':      'ui_tap-variant-01',
  'ui.emoji-pick':     'navigation_hover-tap',
  'ui.upload-ok':      'state-change_confirm-up',
  'ui.upload-fail':    'alert_error-01',
  'ui.copy':           'ui_tap-variant-04',
} as const

export type SoundEvent = keyof typeof SOUND_MAP

const STORAGE_KEY = 'bundy.sound.prefs.v1'

interface SoundPrefs {
  /** Master mute. */
  muted: boolean
  /** 0–1. */
  volume: number
  /** Per-event mute (default: not muted). */
  perEventMuted: Partial<Record<SoundEvent, boolean>>
}

function readPrefs(): SoundPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { muted: false, volume: 0.7, perEventMuted: {} }
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>
    return {
      muted: !!parsed.muted,
      volume: typeof parsed.volume === 'number' ? parsed.volume : 0.7,
      perEventMuted: parsed.perEventMuted ?? {},
    }
  } catch {
    return { muted: false, volume: 0.7, perEventMuted: {} }
  }
}

let prefs = readPrefs()

export function setSoundMuted(muted: boolean): void {
  prefs = { ...prefs, muted }
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
}
export function setSoundVolume(volume: number): void {
  prefs = { ...prefs, volume: Math.max(0, Math.min(1, volume)) }
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
}
export function setEventMuted(event: SoundEvent, muted: boolean): void {
  prefs = { ...prefs, perEventMuted: { ...prefs.perEventMuted, [event]: muted } }
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
}
export function getSoundPrefs(): Readonly<SoundPrefs> { return prefs }

// Throttle: don't fire the same event more than once per 250ms (avoids
// the awful flurry when 5 SSE events arrive in a tick).
const lastPlayedAt: Partial<Record<SoundEvent, number>> = {}
const MIN_GAP_MS = 250

/**
 * Play the sound mapped to `event`. Silent on missing event, on master
 * mute, on per-event mute, or when throttled.
 */
export function playSound(event: SoundEvent, opts: { volume?: number } = {}): void {
  if (prefs.muted) return
  if (prefs.perEventMuted[event]) return
  const now = Date.now()
  if ((lastPlayedAt[event] ?? 0) > now - MIN_GAP_MS) return
  lastPlayedAt[event] = now
  const file = SOUND_MAP[event]
  if (!file) return
  try {
    const audio = new Audio(`${BASE}${file}.ogg`)
    audio.volume = opts.volume !== undefined ? Math.max(0, Math.min(1, opts.volume)) : prefs.volume
    void audio.play().catch(() => { /* autoplay gesture missing or asset 404 — silent */ })
  } catch { /* construction failed — silent */ }
}
