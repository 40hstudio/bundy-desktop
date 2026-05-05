/**
 * ThreadView — full-screen thread takeover (P3-#7/#8 v2). Replaces the
 * earlier inline expansion. The whole main pane shows the parent message at
 * the top, then all replies below, then the reply composer at the bottom.
 * Back-arrow returns to the conversation.
 */
import { useEffect, useRef } from 'react'
import { ArrowLeft, Loader, MessageCircle } from 'lucide-react'
import { C } from '../../theme'
import { Avatar } from '../shared/Avatar'
import { renderMessageContent } from '../../utils/markdown'
import { formatTime } from '../../utils/format'
import { MessageInput } from './MessageInput'
import type { ApiConfig, Auth, ChatMessage } from '../../types'

interface GroupedReaction {
  emoji: string
  count: number
  users: string[]
  reacted: boolean
}

export function ThreadView({
  config, auth, channelId, parent, replies, replyCount, loading,
  threadInput, setThreadInput, sendReply, sendingReply,
  groupReactions, toggleReaction, usersMap, onClose, onScheduled,
  focusReplyId,
}: {
  config: ApiConfig
  auth: Auth
  channelId: string
  parent: ChatMessage
  replies: ChatMessage[]
  replyCount: number
  loading: boolean
  threadInput: string
  setThreadInput: (v: string) => void
  sendReply: () => void
  sendingReply: boolean
  groupReactions: (reactions: ChatMessage['reactions']) => GroupedReaction[]
  toggleReaction: (messageId: string, emoji: string, isThread: boolean) => void
  usersMap: Record<string, string>
  onClose: () => void
  onScheduled?: () => void
  /** When set, scroll to + briefly highlight this reply once mounted. */
  focusReplyId?: string | null
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const parentName = parent.sender.alias ?? parent.sender.username

  // Auto-scroll to the focused reply (deep-link from search hit) once replies render.
  useEffect(() => {
    if (!focusReplyId || loading || replies.length === 0) return
    const t = setTimeout(() => {
      const el = document.getElementById(`thread-msg-${focusReplyId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.style.background = `${C.accent}22`
        setTimeout(() => { el.style.background = '' }, 2000)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [focusReplyId, loading, replies.length])

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
        <MessageCircle size={16} style={{ color: C.accent }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Thread</span>
        <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 4 }}>
          {replyCount === 0 ? 'No replies' : `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
        </span>
      </div>

      {/* v1.5.2111 — full-width thread pane (was capped at 820px centered).
          Per UX feedback the thread should use the same horizontal real
          estate as the main message pane. */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', width: '100%' }}>
        {/* Parent message */}
        <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${C.separator}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Avatar url={parent.sender.avatarUrl} name={parentName} size={28} />
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{parentName}</span>
            <span style={{ fontSize: 11, color: C.textMuted }}>{formatTime(parent.createdAt)}</span>
          </div>
          <div style={{ fontSize: 14, color: C.text, lineHeight: 1.5, paddingLeft: 38 }}>
            {renderMessageContent(parent.content, false, usersMap)}
          </div>
        </div>

        {/* Replies */}
        {loading && replies.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32, color: C.textMuted }}><Loader size={18} /></div>
        ) : replies.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, padding: 32, opacity: 0.7 }}>
            No replies yet — be the first to respond.
          </div>
        ) : (
          replies.map((reply) => {
            const rName = reply.sender.alias ?? reply.sender.username
            const rIsMe = reply.sender.id === auth.userId
            const rGrouped = groupReactions(reply.reactions ?? [])
            return (
              <div key={reply.id} id={`thread-msg-${reply.id}`}
                style={{ marginBottom: 14, transition: 'background 0.5s', padding: '6px 8px', borderRadius: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Avatar url={reply.sender.avatarUrl} name={rName} size={24} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: rIsMe ? C.accent : C.text }}>{rName}</span>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{formatTime(reply.createdAt)}</span>
                  {reply.editedAt && <span style={{ fontSize: 10, color: C.textMuted, fontStyle: 'italic' }}>(edited)</span>}
                </div>
                <div style={{ paddingLeft: 32, fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                  {renderMessageContent(reply.content, false, usersMap)}
                </div>
                {rGrouped.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, paddingLeft: 32 }}>
                    {rGrouped.map((r) => (
                      <button key={r.emoji} onClick={() => toggleReaction(reply.id, r.emoji, true)}
                        title={r.users.join(', ')}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 10,
                          border: `1px solid ${r.reacted ? C.accent : C.separator}`,
                          background: r.reacted ? C.accentLight : C.bgInput,
                          cursor: 'pointer', fontSize: 12,
                        }}>
                        <span>{r.emoji}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: r.reacted ? C.accent : C.textMuted }}>{r.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Reply composer */}
      <div style={{ borderTop: `1px solid ${C.separator}`, flexShrink: 0 }}>
        <MessageInput
          placeholder="Reply in thread…"
          config={config}
          channelId={channelId}
          onTyping={() => {}}
          input={threadInput}
          setInput={setThreadInput}
          sendFn={sendReply}
          sending={sendingReply}
          onScheduled={onScheduled}
          hideSchedule
        />
      </div>
    </div>
  )
}
