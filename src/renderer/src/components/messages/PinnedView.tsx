/**
 * PinnedView — full-screen view of pinned messages for a channel.
 *
 * Replaces the old right-pane sidebar (P3-#8). Mounted in place of the
 * scrolling message list, with a back button to return to messages.
 */
import { Pin, ArrowLeft } from 'lucide-react'
import { C } from '../../theme'
import { Avatar } from '../shared/Avatar'
import { renderMessageContent } from '../../utils/markdown'
import { formatTime } from '../../utils/format'
import type { ChatMessage } from '../../types'

export function PinnedView({
  pinnedMessages, onClose, usersMap, onJump,
}: {
  pinnedMessages: ChatMessage[]
  onClose: () => void
  usersMap: Record<string, string>
  /** Click a pinned message → jump to its position in the main conversation. */
  onJump?: (messageId: string) => void
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: C.lgBg }}>
      <div style={{
        padding: '12px 16px', borderBottom: `1px solid ${C.separator}`,
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <button onClick={onClose} title="Back to messages"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, display: 'flex' }}>
          <ArrowLeft size={18} />
        </button>
        <Pin size={16} style={{ color: C.accent }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Pinned messages</span>
        <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 4 }}>{pinnedMessages.length}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, maxWidth: 720, margin: '0 auto', width: '100%' }}>
        {pinnedMessages.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, padding: 60 }}>
            <Pin size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div>No pinned messages yet.</div>
            <div style={{ fontSize: 11, marginTop: 6, opacity: 0.7 }}>
              Pin important messages so they're easy to find later.
            </div>
          </div>
        ) : (
          pinnedMessages.map((pm) => (
            <div key={pm.id}
              onClick={() => onJump?.(pm.id)}
              style={{
                padding: 14, borderRadius: 10, background: C.bgInput,
                border: `1px solid ${C.separator}`, marginBottom: 12,
                cursor: onJump ? 'pointer' : 'default',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => { if (onJump) e.currentTarget.style.borderColor = C.accent }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.separator }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Avatar url={pm.sender.avatarUrl} name={pm.sender.alias ?? pm.sender.username} size={22} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>{pm.sender.alias ?? pm.sender.username}</span>
                <span style={{ fontSize: 11, color: C.textMuted }}>{formatTime(pm.createdAt)}</span>
              </div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                {renderMessageContent(pm.content, false, usersMap)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
