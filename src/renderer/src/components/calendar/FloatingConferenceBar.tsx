/**
 * Single floating bar used by all conference types (meeting / VC /
 * DM call). Bottom-right of the viewport; live duration counter +
 * Return + Leave. Mirrors the Google Meet picture-in-picture
 * pattern.
 *
 * The bar is presentational. The actual session (LiveKit room,
 * tracks, etc.) is owned by whichever component is rendering the
 * full conference view (MeetingRoom for meetings, VoiceChannelView
 * for VC/calls). The bar communicates with that view via the
 * provided callbacks.
 *
 * Visual encoding:
 *   - meeting → blue accent + Calendar icon
 *   - vc      → green + Volume icon (VC = persistent room)
 *   - call    → green + Phone icon (1:1 / group ad-hoc)
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { Phone, PhoneOff, Volume2, Calendar as CalendarIcon, GripVertical } from 'lucide-react'
import { C } from '../../theme'
import { Button } from '../shared'

export type ConferenceKind = 'meeting' | 'vc' | 'call'

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

const KIND_META: Record<ConferenceKind, {
  label: string
  icon: React.ReactNode
  accent: string
}> = {
  meeting: { label: 'In meeting', icon: <CalendarIcon size={16} />, accent: C.accent },
  vc:      { label: 'In voice channel', icon: <Volume2 size={16} />, accent: C.success },
  call:    { label: 'In call', icon: <Phone size={16} />, accent: C.success },
}

export default function FloatingConferenceBar({
  kind, title, joinedAt, onReturn, onLeave,
  /** Optional vertical offset — used when stacking multiple bars
   *  (e.g. meeting + VC at the same time, though mutex normally
   *  prevents this). */
  offsetBottom = 16,
}: {
  kind: ConferenceKind
  title: string
  joinedAt: number
  onReturn: () => void
  onLeave: () => void
  offsetBottom?: number
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const meta = KIND_META[kind]

  // v1.5.2111 — draggable widget. Position persists in localStorage so
  // the user's chosen spot survives reloads. Origin (bottom-right corner)
  // is encoded as offset from the bottom-right edge to stay sensible
  // when the window resizes.
  const STORAGE_KEY = 'bundy-floating-conference-bar-pos-v1'
  type Pos = { right: number; bottom: number }
  const initialPos = useCallback((): Pos => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const p = JSON.parse(raw) as Pos
        if (typeof p.right === 'number' && typeof p.bottom === 'number') return p
      }
    } catch { /* ignore */ }
    return { right: 16, bottom: offsetBottom }
  }, [offsetBottom])
  const [pos, setPos] = useState<Pos>(initialPos)
  // Pin pos's bottom to the offsetBottom prop only on first mount; after
  // the user drags, their saved position is the source of truth.
  const dragStateRef = useRef<{
    startMouseX: number; startMouseY: number; startRight: number; startBottom: number
  } | null>(null)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only initiate drag from the grip / icon area, not from buttons
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    dragStateRef.current = {
      startMouseX: e.clientX, startMouseY: e.clientY,
      startRight: pos.right, startBottom: pos.bottom,
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragStateRef.current
    if (!ds) return
    // dx > 0 means moving right → bar's right offset decreases (closer to right edge)
    const dx = e.clientX - ds.startMouseX
    const dy = e.clientY - ds.startMouseY
    const newRight = Math.max(0, Math.min(window.innerWidth - 80, ds.startRight - dx))
    const newBottom = Math.max(0, Math.min(window.innerHeight - 60, ds.startBottom - dy))
    setPos({ right: newRight, bottom: newBottom })
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) return
    dragStateRef.current = null
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)) } catch { /* ignore */ }
  }

  return (
    <div style={{
      position: 'fixed', bottom: pos.bottom, right: pos.right, zIndex: 9500,
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 12,
      background: 'rgba(20, 20, 20, 0.94)',
      border: `1px solid ${meta.accent}55`,
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      maxWidth: 360,
      userSelect: 'none',
    }}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Drag to reposition"
        style={{
          width: 18, height: 32, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: C.textMuted, opacity: 0.5,
          cursor: 'grab', flexShrink: 0,
        }}
      >
        <GripVertical size={14} />
      </div>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: `${meta.accent}30`, color: meta.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {meta.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
        }}>{meta.label} · {formatDuration(now - joinedAt)}</div>
        <div style={{
          fontSize: 13, fontWeight: 600, color: C.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{title}</div>
      </div>
      <Button onClick={onReturn} title="Return">Return</Button>
      <Button onClick={onLeave} title="Leave" style={{ color: C.danger }}>
        <PhoneOff size={14} />
      </Button>
    </div>
  )
}
