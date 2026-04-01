import React, { useState } from 'react'
import { Hash, Phone, X } from 'lucide-react'
import { C } from '../../theme'
import type { Conversation } from '../../types'
import { Avatar } from '../shared/Avatar'

export function ConvRow({
  conv, selected, typingUsers, hasActiveCall, isMentioned,
  onClick, onClose, getPresence, getTrackerStatus,
}: {
  conv: Conversation; selected: boolean; auth?: never
  typingUsers: string[]; hasActiveCall?: boolean; isMentioned?: boolean
  onClick: () => void; onClose?: () => void
  getPresence?: (userId: string) => 'active' | 'recent' | 'away'
  getTrackerStatus?: (userId: string) => string | null
}) {
  const [hovered, setHovered] = useState(false)
  const hasUnread = (conv.unread ?? 0) > 0
  const partnerId = conv.type === 'dm' ? conv.partnerId : undefined
  const presence = partnerId && getPresence ? getPresence(partnerId) : 'away'
  const presenceDotColor = presence === 'active' ? C.success : presence === 'recent' ? C.warning : C.textMuted
  const trackerStatus = partnerId && getTrackerStatus ? getTrackerStatus(partnerId) : null
  const trackerLabel = trackerStatus === 'CHECK_IN' || trackerStatus === 'BACK' ? 'In'
    : trackerStatus === 'BREAK' ? 'Break'
    : trackerStatus === 'CLOCK_OUT' ? 'Out'
    : null
  const trackerColor = trackerStatus === 'CHECK_IN' || trackerStatus === 'BACK' ? C.success
    : trackerStatus === 'BREAK' ? C.warning
    : trackerStatus === 'CLOCK_OUT' ? C.textMuted
    : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '1px 8px', borderRadius: 6, overflow: 'hidden' }}>
      <button
        onClick={onClick}
        onMouseEnter={e => { setHovered(true); if (!selected) (e.currentTarget as HTMLButtonElement).style.background = C.sidebarHover }}
        onMouseLeave={e => { setHovered(false); if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 10px', border: 'none', textAlign: 'left',
          background: selected
            ? 'linear-gradient(90deg, rgba(0, 0, 255, 0.22) 0%, rgba(0, 0, 255, 0.12) 50%, rgba(0, 0, 255, 0.08) 100%)'
            : 'transparent',
          boxShadow: selected ? 'inset 0 0 0 1px rgba(0, 0, 255, 0.16)' : 'none',
          backdropFilter: selected ? 'blur(12px)' : 'none',
          WebkitBackdropFilter: selected ? 'blur(12px)' : 'none',
          cursor: 'pointer', borderRadius: 0, minWidth: 0,
        }}
      >
        {conv.type === 'dm' ? (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar url={conv.avatar} name={conv.name} size={22} />
            <div style={{
              position: 'absolute', bottom: -1, right: -1,
              width: 9, height: 9, borderRadius: '50%',
              background: presenceDotColor,
              border: `2px solid ${selected ? '#1e2a3a' : C.lgBg}`,
            }} />
          </div>
        ) : conv.type === 'group' ? (
          <div style={{ position: 'relative', flexShrink: 0, width: 22, height: 22 }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 16, height: 16, borderRadius: 4, background: C.bgInput, border: `1.5px solid ${C.lgBg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: C.textMuted, zIndex: 1 }}>
              {(conv.members?.[0]?.user?.alias?.[0] ?? conv.name[0] ?? '?').toUpperCase()}
            </div>
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, borderRadius: 4, background: C.fillSecondary, border: `1.5px solid ${C.lgBg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: C.textMuted, zIndex: 2 }}>
              {(conv.members?.[1]?.user?.alias?.[0] ?? '?').toUpperCase()}
            </div>
          </div>
        ) : null}

        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
          {conv.type === 'channel' && (
            <Hash size={14} color={hasUnread ? C.sidebarTextActive : C.sidebarText} style={{ marginRight: 4, flexShrink: 0 }} />
          )}
          <span style={{
            fontSize: 14, fontWeight: hasUnread ? 700 : 400,
            color: hasUnread || selected ? C.sidebarTextActive : C.sidebarText,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {conv.type === 'channel' ? conv.name.replace(/^#/, '') : conv.name}
          </span>
          {typingUsers.length > 0 && (
            <span style={{ fontSize: 11, color: C.accent, fontStyle: 'italic', marginLeft: 6, flexShrink: 0 }}>typing…</span>
          )}
          {trackerLabel && trackerColor && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: trackerColor, marginLeft: 6,
              padding: '1px 5px', borderRadius: 3, flexShrink: 0,
              background: `${trackerColor}20`, lineHeight: '14px', letterSpacing: 0.3,
            }}>{trackerLabel}</span>
          )}
        </div>

        {hasActiveCall && (
          <Phone size={13} color={C.success} style={{ flexShrink: 0, animation: 'pulse 2s infinite' }} />
        )}
        {hasUnread && !selected && (
          <div style={{
            minWidth: 18, height: 18, borderRadius: 9,
            background: isMentioned ? C.danger : C.textMuted,
            color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
            flexShrink: 0,
          }}>
            {conv.unread}
          </div>
        )}
        {selected && hovered && onClose && (
          <button onClick={e => { e.stopPropagation(); onClose() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sidebarText, padding: 2, flexShrink: 0, display: 'flex', alignItems: 'center', borderRadius: 4 }}>
            <X size={14} />
          </button>
        )}
      </button>
    </div>
  )
}
