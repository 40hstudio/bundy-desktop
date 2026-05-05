/**
 * InlineThread — thread expansion that renders directly below its parent
 * message in the main message list (P3-#7), modelled on the task discussion
 * inline-comments UX rather than a right-pane sidebar.
 *
 * The parent message itself is rendered by the surrounding list — this
 * component only owns the replies + reply composer.
 */
import { CornerDownRight, X, Loader } from 'lucide-react'
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

export function InlineThread({
  config, auth, channelId, replies, replyCount, loading,
  threadInput, setThreadInput, sendReply, sendingReply,
  groupReactions, toggleReaction, usersMap, onClose, onScheduled,
}: {
  config: ApiConfig
  auth: Auth
  channelId: string
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
}) {
  return (
    <div style={{
      marginLeft: 36, marginTop: 6, marginBottom: 8,
      borderLeft: `2px solid ${C.accent}`,
      background: C.bgInput, borderRadius: 8, paddingLeft: 12, paddingRight: 8, paddingTop: 8, paddingBottom: 4,
    }}>
      {/* Inline thread header: count + collapse */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <CornerDownRight size={12} color={C.accent} />
        <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Thread {replyCount > 0 ? `· ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}` : ''}
        </span>
        <button onClick={onClose} title="Collapse thread"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2, display: 'flex' }}>
          <X size={12} />
        </button>
      </div>

      {/* Replies */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
        {loading && replies.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 12, color: C.textMuted }}>
            <Loader size={14} />
          </div>
        ) : replies.length === 0 ? (
          <div style={{ fontSize: 11, color: C.textMuted, fontStyle: 'italic', padding: '4px 0' }}>
            No replies yet — be the first.
          </div>
        ) : (
          replies.map((reply) => {
            const rName = reply.sender.alias ?? reply.sender.username
            const rIsMe = reply.sender.id === auth.userId
            const rGrouped = groupReactions(reply.reactions ?? [])
            return (
              <div key={reply.id} id={`thread-msg-${reply.id}`}
                style={{ transition: 'background 0.5s', padding: '4px 4px', borderRadius: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Avatar url={reply.sender.avatarUrl} name={rName} size={20} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: rIsMe ? C.accent : C.text }}>{rName}</span>
                  <span style={{ fontSize: 10, color: C.textMuted }}>{formatTime(reply.createdAt)}</span>
                  {reply.editedAt && <span style={{ fontSize: 9, color: C.textMuted, fontStyle: 'italic' }}>(edited)</span>}
                </div>
                <div style={{ paddingLeft: 26, fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                  {renderMessageContent(reply.content, false, usersMap)}
                </div>
                {rGrouped.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4, paddingLeft: 26 }}>
                    {rGrouped.map((r) => (
                      <button key={r.emoji} onClick={() => toggleReaction(reply.id, r.emoji, true)}
                        title={r.users.join(', ')}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 2, padding: '1px 5px', borderRadius: 8,
                          border: `1px solid ${r.reacted ? C.accent : C.separator}`,
                          background: r.reacted ? C.accentLight : C.bgInput,
                          cursor: 'pointer', fontSize: 11,
                        }}>
                        <span>{r.emoji}</span>
                        <span style={{ fontSize: 9, fontWeight: 600, color: r.reacted ? C.accent : C.textMuted }}>{r.count}</span>
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
        hideGifs
        hideSchedule
      />
    </div>
  )
}
