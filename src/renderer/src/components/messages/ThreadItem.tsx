import { useState } from 'react'
import { Hash, Users, MessageSquare, Send } from 'lucide-react'
import type { ApiConfig, ThreadActivity } from '../../types'
import { Avatar } from '../shared/Avatar'
import { C } from '../../theme'
import { timeAgo } from '../../utils/format'

export type ThreadReply = {
  content: string
  createdAt: string
  sender: { alias: string | null; username: string; avatarUrl: string | null }
}

export function ThreadItem({ thread, senderName, displayChannelName, replies, config: _config, apiFetch, onOpenThread, onReplySent }: {
  thread: ThreadActivity
  senderName: string
  displayChannelName: string
  replies: ThreadReply[]
  config: ApiConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiFetch: (path: string, opts?: RequestInit) => Promise<any>
  onOpenThread: () => void
  onReplySent: (reply: ThreadReply) => void
}) {
  const [replyInput, setReplyInput] = useState('')
  const [sending, setSending] = useState(false)
  const [hovered, setHovered] = useState(false)

  async function handleSendReply() {
    if (!replyInput.trim() || sending) return
    const content = replyInput.trim()
    setSending(true)
    setReplyInput('')
    try {
      const data = await apiFetch(`/api/channels/${thread.channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, parentMessageId: thread.id }),
      })
      const sender = data?.sender ?? { alias: null, username: 'You', avatarUrl: null }
      onReplySent({ content, createdAt: new Date().toISOString(), sender })
    } catch { /* offline */ } finally { setSending(false) }
  }

  const allRepliesShown = replies.length >= thread.replyCount

  return (
    <div style={{ padding: '0 16px', marginBottom: 10 }}>
      <div
        style={{
          background: hovered ? C.sidebarHover : C.bgSecondary,
          border: `1px solid ${C.separator}`,
          borderRadius: 10,
          padding: '14px 16px',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Channel name header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, cursor: 'pointer' }} onClick={onOpenThread}>
          {thread.channelType === 'channel' ? <Hash size={12} color={C.textMuted} /> : thread.channelType === 'group' ? <Users size={12} color={C.textMuted} /> : <MessageSquare size={12} color={C.textMuted} />}
          <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayChannelName}</span>
        </div>

        {/* Parent message */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }} onClick={onOpenThread}>
          <Avatar url={thread.parentMessage.sender.avatarUrl} name={senderName} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{senderName}</div>
            <div style={{ fontSize: 13, color: C.text, marginTop: 2, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{thread.parentMessage.content}</div>
          </div>
        </div>

        {/* Reply count + time — hidden when all replies are already shown inline */}
        {!allRepliesShown && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 38, marginTop: 6, cursor: 'pointer' }} onClick={onOpenThread}>
            <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>{thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}</span>
            <span style={{ fontSize: 11, color: C.textMuted }}>{timeAgo(thread.lastReply.createdAt)}</span>
            {thread.unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />}
          </div>
        )}

        {/* Recent replies (up to 3) */}
        <div style={{ paddingLeft: 38, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {replies.map((reply, idx) => {
            const name = reply.sender.alias ?? reply.sender.username
            return (
              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', cursor: 'pointer' }} onClick={onOpenThread}>
                <Avatar url={reply.sender.avatarUrl} name={name} size={18} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.textMuted, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                  <span style={{ fontWeight: 600, color: C.sidebarText }}>{name}:</span>{' '}{reply.content}
                </div>
              </div>
            )
          })}
        </div>

        {/* Time indicator when all replies shown */}
        {allRepliesShown && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 38, marginTop: 6, cursor: 'pointer' }} onClick={onOpenThread}>
            <span style={{ fontSize: 11, color: C.textMuted }}>{timeAgo(thread.lastReply.createdAt)}</span>
            {thread.unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />}
          </div>
        )}

        {/* Inline reply input */}
        <div style={{ paddingLeft: 38, marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Reply..."
            value={replyInput}
            onChange={e => setReplyInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply() } }}
            style={{
              flex: 1, padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.separator}`,
              background: C.bgInput, color: C.text, fontSize: 12, outline: 'none',
            }}
          />
          <button
            onClick={handleSendReply}
            disabled={!replyInput.trim() || sending}
            style={{
              padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: replyInput.trim() ? C.accent : 'transparent',
              color: replyInput.trim() ? '#fff' : C.textMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: sending ? 0.5 : 1,
            }}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
