import React, { useState, useEffect, useRef } from 'react'
import { Smile } from 'lucide-react'

const CALL_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏']

export { CALL_EMOJIS }

export function EmojiReactionPicker({
  onReaction, iconSize, btnStyle,
}: {
  onReaction: (emoji: string) => void
  iconSize: number
  btnStyle: (active: boolean) => React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={btnStyle(false)} title="Send reaction">
        <Smile size={iconSize} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          background: '#1e1f22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
          padding: 6, display: 'flex', gap: 2, marginBottom: 8, zIndex: 9999,
        }}>
          {CALL_EMOJIS.map(e => (
            <button key={e} onClick={() => { onReaction(e); setOpen(false) }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, padding: '4px 6px', borderRadius: 4 }}
              onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
              onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = 'transparent' }}>
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
