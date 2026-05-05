/**
 * CallPurposePrompt — small, dismissable prompt shown after the user
 * leaves a call lasting longer than CALL_TAG_THRESHOLD_SECONDS.
 *
 * Light-touch self-tagging — the user picks a category (Work, Standup,
 * 1:1, Planning, Social, Other) and optionally adds a note. Submits to
 * /api/conferences/tag, which writes the values onto the existing
 * ConferenceParticipantSession row.
 *
 * Skipping is fine — if the user dismisses without picking, the row
 * stays untagged. The admin Calls Review surface treats "no tag"
 * differently from "tagged as social", so silence isn't punished.
 */

import { useState, useEffect } from 'react'
import { X, Send } from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig } from '../../types'

const CALL_TAG_THRESHOLD_SECONDS = 5 * 60 // only prompt after 5+ minute calls

interface RecentParticipation {
  sessionId: string
  channelId: string
  durationSeconds: number
  purposeTag: string | null
}

const TAGS: Array<{ key: string; label: string; emoji: string }> = [
  { key: 'work',     label: 'Work',     emoji: '🛠' },
  { key: 'standup',  label: 'Standup',  emoji: '☕' },
  { key: '1on1',     label: '1:1',      emoji: '🤝' },
  { key: 'planning', label: 'Planning', emoji: '🗺' },
  { key: 'social',   label: 'Social',   emoji: '🎈' },
  { key: 'other',    label: 'Other',    emoji: '✏️' },
]

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

/** Mounts globally, polls /api/conferences/recent every time a
 *  bundy-conference-ended event fires. If the most recent row is
 *  long enough and untagged, shows the prompt. */
export function CallPurposePromptHost({ config }: { config: ApiConfig }) {
  const [pending, setPending] = useState<RecentParticipation | null>(null)

  useEffect(() => {
    function onConferenceEnded() {
      // Wait a moment for the leave write to land in DB, then ask.
      setTimeout(() => {
        void check()
      }, 1500)
    }
    async function check() {
      try {
        const res = await fetch(`${config.apiBase}/api/conferences/recent`, {
          headers: { Authorization: `Bearer ${config.token}` },
        })
        if (!res.ok) return
        const data = (await res.json()) as { participation: RecentParticipation | null }
        if (!data.participation) return
        if (data.participation.purposeTag) return // already tagged
        if (data.participation.durationSeconds < CALL_TAG_THRESHOLD_SECONDS) return
        setPending(data.participation)
      } catch { /* offline / not logged in / etc — silent */ }
    }
    // Listen for any conference-ending signal.
    window.addEventListener('bundy-conference-ended', onConferenceEnded)
    window.addEventListener('bundy-conference-left', onConferenceEnded)
    window.addEventListener('bundy-call-end', onConferenceEnded)
    return () => {
      window.removeEventListener('bundy-conference-ended', onConferenceEnded)
      window.removeEventListener('bundy-conference-left', onConferenceEnded)
      window.removeEventListener('bundy-call-end', onConferenceEnded)
    }
  }, [config])

  if (!pending) return null
  return <CallPurposePrompt config={config} participation={pending} onClose={() => setPending(null)} />
}

function CallPurposePrompt({
  config, participation, onClose,
}: {
  config: ApiConfig
  participation: RecentParticipation
  onClose: () => void
}) {
  const [tag, setTag] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  async function submit() {
    if (!tag) return
    setSending(true)
    try {
      await fetch(`${config.apiBase}/api/conferences/tag`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: participation.sessionId, purposeTag: tag, purposeNote: note.trim() || undefined }),
      })
    } catch { /* swallow — user can retry by joining + leaving again, or skip */ }
    finally {
      setSending(false)
      onClose()
    }
  }

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
      width: 340,
      background: C.bgSecondary,
      border: `1px solid ${C.separator}`,
      borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      padding: 16,
      animation: 'bundy-purpose-slide 0.2s ease-out',
    }}>
      <style>{`
        @keyframes bundy-purpose-slide {
          from { transform: translateY(20px); opacity: 0 }
          to   { transform: translateY(0);    opacity: 1 }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>
            What was that call about?
          </div>
          <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>
            {fmtDuration(participation.durationSeconds)} · helps the daily summary
          </div>
        </div>
        <button onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4 }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 8 }}>
        {TAGS.map((t) => {
          const active = tag === t.key
          return (
            <button key={t.key} onClick={() => setTag(t.key)}
              style={{
                padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                background: active ? `${C.accent}33` : C.bgInput,
                border: `1px solid ${active ? C.accent : C.separator}`,
                color: active ? C.accent : C.text,
                fontSize: 11, fontWeight: active ? 700 : 500,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
              <span style={{ fontSize: 16 }}>{t.emoji}</span>
              {t.label}
            </button>
          )
        })}
      </div>
      {tag && (
        <input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note…" maxLength={280}
          style={{
            width: '100%', padding: '6px 10px', fontSize: 12, marginBottom: 8,
            background: C.bgInput, color: C.text,
            border: `1px solid ${C.separator}`, borderRadius: 6,
            outline: 'none', boxSizing: 'border-box',
          }} />
      )}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button onClick={onClose}
          style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent', color: C.textMuted, fontSize: 12 }}>
          Skip
        </button>
        <button onClick={submit} disabled={!tag || sending}
          style={{
            padding: '6px 12px', borderRadius: 6, border: 'none',
            background: tag ? C.accent : C.bgInput,
            color: tag ? '#fff' : C.textMuted,
            cursor: tag ? 'pointer' : 'not-allowed',
            fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
          <Send size={11} /> {sending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
