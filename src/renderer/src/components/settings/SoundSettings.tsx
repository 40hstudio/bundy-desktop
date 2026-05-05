/**
 * Sound preferences card for the Settings panel.
 *
 * Surfaces a master mute, master volume slider, per-event mute toggles
 * grouped by category, and a "preview" button per event so the user can
 * audit which sound fires for which event without leaving Settings.
 *
 * State is persisted to localStorage by the sounds.ts module so prefs
 * survive restarts.
 */

import React, { useState } from 'react'
import { Volume2, VolumeX, Play, ChevronDown } from 'lucide-react'
import { C, neu } from '../../theme'
import {
  SOUND_MAP, playSound, getSoundPrefs,
  setSoundMuted, setSoundVolume, setEventMuted,
  type SoundEvent,
} from '../../utils/sounds'

const GROUPS: Array<{ label: string; events: Array<{ event: SoundEvent; label: string }> }> = [
  { label: 'Messaging', events: [
    { event: 'message.dm.in',            label: 'Inbound DM (1:1)' },
    { event: 'message.group.in',         label: 'Inbound group message' },
    { event: 'message.channel.in',       label: 'Inbound channel message' },
    { event: 'message.task.in',          label: 'Task discussion message' },
    { event: 'message.send',             label: 'Outbound message sent' },
    { event: 'message.mention',          label: '@mention (you)' },
    { event: 'message.broadcast',        label: '@here / @channel' },
    { event: 'message.thread-reply',     label: 'Reply in your thread' },
    { event: 'message.reaction',         label: 'Reaction on your message' },
    { event: 'message.pin',              label: 'Pin added' },
    { event: 'message.failed',           label: 'Message failed' },
    { event: 'message.queue-replayed',   label: 'Queued message synced' },
  ]},
  { label: 'Calls', events: [
    { event: 'call.incoming',       label: 'Incoming call' },
    { event: 'call.connected',      label: 'Call connected' },
    { event: 'call.ended',          label: 'Call ended' },
    { event: 'call.missed',         label: 'Call missed' },
    { event: 'call.declined',       label: 'Call declined' },
  ]},
  { label: 'Tasks', events: [
    { event: 'task.assigned',       label: 'Assigned to you' },
    { event: 'task.status-change',  label: 'Status changed' },
    { event: 'task.done',           label: 'Marked done' },
    { event: 'task.comment',        label: 'New comment' },
    { event: 'task.subtask-added',  label: 'Subtask added' },
    { event: 'task.mention',        label: '@mention in task' },
    { event: 'task.due-soon',       label: 'Due ≤24h' },
    { event: 'task.overdue',        label: 'Overdue' },
  ]},
  { label: 'Reports', events: [
    { event: 'report.feedback-pin',     label: 'Feedback pin landed' },
    { event: 'report.feedback-comment', label: 'Feedback comment' },
    { event: 'report.submitted',        label: 'Daily report submitted' },
    { event: 'report.reminder',         label: 'Daily report reminder' },
    { event: 'report.missing',          label: 'Daily report missing' },
  ]},
  { label: 'Time tracking', events: [
    { event: 'time.clock-in',       label: 'Clock in' },
    { event: 'time.clock-out',      label: 'Clock out' },
    { event: 'time.break-start',    label: 'Break start' },
    { event: 'time.break-end',      label: 'Break end' },
    { event: 'time.idle-warn',      label: 'Idle warning' },
    { event: 'time.overtime',       label: 'Overtime warning' },
  ]},
  { label: 'System', events: [
    { event: 'system.online',          label: 'Server reachable again' },
    { event: 'system.offline',         label: 'Server unreachable' },
    { event: 'system.update-available',label: 'Update available' },
    { event: 'system.update-ready',    label: 'Update ready to install' },
    { event: 'system.token-expired',   label: 'Login expired' },
    { event: 'system.queue-failed',    label: 'Queued action failed' },
    { event: 'system.force-logout',    label: 'Force-logout (admin)' },
  ]},
]

export function SoundSettings(): JSX.Element {
  const [, force] = useState(0)
  const prefs = getSoundPrefs()
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const refresh = () => force((n) => n + 1)

  return (
    <div style={{ ...card() }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: C.textMuted, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        Notification sounds
      </div>

      {/* Master row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <button
          onClick={() => { setSoundMuted(!prefs.muted); refresh() }}
          style={{ width: 32, height: 32, ...neu(), border: 'none', cursor: 'pointer', color: prefs.muted ? C.danger : C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title={prefs.muted ? 'Unmute all' : 'Mute all'}
        >
          {prefs.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Master volume</div>
          <input
            type="range" min={0} max={1} step={0.05}
            value={prefs.volume}
            disabled={prefs.muted}
            onChange={(e) => { setSoundVolume(parseFloat(e.target.value)); refresh() }}
            style={{ width: '100%' }}
          />
        </div>
        <span style={{ fontSize: 11, color: C.textMuted, fontFamily: 'ui-monospace, Menlo, monospace', minWidth: 30, textAlign: 'right' }}>
          {Math.round(prefs.volume * 100)}%
        </span>
      </div>

      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>
        Sounds: Material Design Sound Resources (CC-BY 4.0)
      </div>

      {/* Per-event groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {GROUPS.map((g) => {
          const open = openGroup === g.label
          return (
            <div key={g.label} style={{ borderBottom: `1px solid ${C.separator}` }}>
              <button
                onClick={() => setOpenGroup(open ? null : g.label)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 4px', background: 'transparent', border: 'none',
                  cursor: 'pointer', color: C.text, fontSize: 12, fontWeight: 600, textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <ChevronDown size={12} style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s', color: C.textMuted }} />
                {g.label}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: C.textMuted, fontWeight: 400 }}>
                  {g.events.length} events
                </span>
              </button>
              {open && (
                <div style={{ padding: '4px 0 10px 18px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {g.events.map(({ event, label }) => {
                    const muted = !!prefs.perEventMuted[event]
                    const file = SOUND_MAP[event]
                    return (
                      <div key={event} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 8, padding: '4px 4px' }}>
                        <div>
                          <div style={{ fontSize: 12, color: muted ? C.textMuted : C.text }}>{label}</div>
                          <div style={{ fontSize: 10, color: C.textMuted, fontFamily: 'ui-monospace, Menlo, monospace' }}>{file}.ogg</div>
                        </div>
                        <button
                          onClick={() => playSound(event)}
                          title="Preview"
                          style={{ width: 26, height: 26, ...neu(), border: 'none', cursor: 'pointer', color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Play size={12} />
                        </button>
                        <button
                          onClick={() => { setEventMuted(event, !muted); refresh() }}
                          title={muted ? 'Unmute this event' : 'Mute this event'}
                          style={{ width: 26, height: 26, ...neu(), border: 'none', cursor: 'pointer', color: muted ? C.danger : C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function card(): React.CSSProperties {
  return {
    background: C.bgSecondary,
    border: `1px solid ${C.separator}`,
    borderRadius: 12,
    padding: 18,
  }
}
