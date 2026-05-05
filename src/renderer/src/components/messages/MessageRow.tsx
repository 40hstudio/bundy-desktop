import React from 'react'
import {
  Pin, Smile, MessageCircle, CornerDownRight, Edit2, Trash2,
  Plus, Check, CheckCheck, Volume2, ChevronRight, Link as LinkIcon,
} from 'lucide-react'
import type { ApiConfig, Auth, ChatMessage, Conversation } from '../../types'
import { Avatar } from '../shared/Avatar'
import { InlineAttachment } from './Attachments'
import { OgPreview } from './OgPreview'
import { ReportLinkCard } from './ReportLinkCard'
import { FeedbackLinkCard } from './FeedbackLinkCard'
import { MessageLinkCard } from './MessageLinkCard'
import { TaskLinkCard } from './TaskLinkCard'
import { CalendarEventLinkCard } from './CalendarEventLinkCard'
import { EmojiPicker } from './EmojiPicker'
import { C } from '../../theme'
import { formatTime } from '../../utils/format'
import {
  renderMessageContent, extractUrls, isImageUrl,
  REPORT_LINK_RE, TASK_LINK_RE, FEEDBACK_LINK_RE, MESSAGE_LINK_RE, CALENDAR_EVENT_LINK_RE,
} from '../../utils/markdown'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🚀']

// Hoisted regex literals — see same pattern in MessagesPanel.tsx.
const REPORT_URL_RE = /\/report\/[a-z0-9]+\/[a-z0-9]+/i
const TASK_URL_RE = /\/tasks\/[a-z0-9]+$/i
const FEEDBACK_URL_RE = /\/report\/feedback\/[a-z0-9]+/i
const MESSAGE_URL_RE = /\/messages\/[a-z0-9]+\/[a-z0-9]+/i
const CALENDAR_EVENT_URL_RE = /\/calendar\/event\/[a-z0-9]+/i

function groupReactions(reactions: NonNullable<ChatMessage['reactions']>, userId: string) {
  const map = new Map<string, { emoji: string; count: number; users: string[]; reacted: boolean }>()
  for (const r of reactions) {
    const existing = map.get(r.emoji)
    if (existing) {
      existing.count++
      existing.users.push(r.user.alias ?? r.user.username)
      if (r.userId === userId) existing.reacted = true
    } else {
      map.set(r.emoji, { emoji: r.emoji, count: 1, users: [r.user.alias ?? r.user.username], reacted: r.userId === userId })
    }
  }
  return Array.from(map.values())
}

export type MessageRowProps = {
  msg: ChatMessage
  prevMsg: ChatMessage | null
  config: ApiConfig
  auth: Auth
  selected: Conversation | null
  usersMap: Record<string, string>

  // Per-row primitive state (changes are localized to one row at a time)
  isEditing: boolean
  editingContent: string
  isHovered: boolean
  showQuickEmojiPicker: boolean
  showFullEmojiPicker: boolean

  // useState setters — already referentially stable
  setHoveredMsgId: (id: string | null) => void
  setEditingMsgId: (id: string | null) => void
  setEditingContent: (s: string) => void
  setEmojiPickerMsgId: (id: string | null) => void
  setFullEmojiPickerMsgId: (id: string | null) => void
  setForwardingMsg: (m: ChatMessage | null) => void
  setLightbox: (l: { url: string; filename: string } | null) => void

  // Handlers — must be useCallback'd at the parent
  onEditMessage: () => void
  onDeleteMessage: (msgId: string) => void
  onToggleReaction: (msgId: string, emoji: string) => void
  onTogglePin: (msgId: string) => void
  onOpenThread: (msg: ChatMessage) => void
  onJoinVoiceChannel: (vcId: string) => void

  // Toast helper from Zustand — already stable
  showToast: (t: { kind: 'success' | 'error' | 'info'; message: string }) => void
}

function MessageRowImpl({
  msg, prevMsg, config, auth, selected, usersMap,
  isEditing, editingContent, isHovered, showQuickEmojiPicker, showFullEmojiPicker,
  setHoveredMsgId, setEditingMsgId, setEditingContent,
  setEmojiPickerMsgId, setFullEmojiPickerMsgId, setForwardingMsg, setLightbox,
  onEditMessage, onDeleteMessage, onToggleReaction, onTogglePin, onOpenThread, onJoinVoiceChannel,
  showToast,
}: MessageRowProps) {
  const isMe = msg.sender.id === auth.userId
  const timeDiff = prevMsg ? new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() : Infinity
  const showHeader = !prevMsg || prevMsg.sender.id !== msg.sender.id || timeDiff > 5 * 60 * 1000
  const senderName = msg.sender.alias ?? msg.sender.username
  const isAttachment = /^\[📎\s[^\]]+?\]\(https?:\/\/\S+?\)\s*$/.test(msg.content)
  const fwdMatch = msg.content.match(/^<!--fwd:(\{.*?\})-->\n([\s\S]*)$/)
  const fwdMeta = fwdMatch ? (() => { try { return JSON.parse(fwdMatch[1]) as { s: string; t: string; c: string; ct?: string } } catch { return null } })() : null
  const fwdContent = fwdMatch ? fwdMatch[2] : null
  const allUrls = isAttachment ? [] : extractUrls(msg.content)
  const plainUrls = allUrls.filter(u => !isImageUrl(u) && !FEEDBACK_URL_RE.test(u) && !REPORT_URL_RE.test(u) && !TASK_URL_RE.test(u) && !MESSAGE_URL_RE.test(u) && !CALENDAR_EVENT_URL_RE.test(u))
  const feedbackLinks = allUrls.map(u => FEEDBACK_LINK_RE.exec(u)).filter(Boolean) as RegExpExecArray[]
  const reportLinks = allUrls.filter(u => !FEEDBACK_URL_RE.test(u)).map(u => REPORT_LINK_RE.exec(u)).filter(Boolean) as RegExpExecArray[]
  const taskLinks = allUrls.map(u => TASK_LINK_RE.exec(u)).filter(Boolean) as RegExpExecArray[]
  const messageLinks = allUrls.map(u => MESSAGE_LINK_RE.exec(u)).filter(Boolean) as RegExpExecArray[]
  const calendarEventLinks = allUrls.map(u => CALENDAR_EVENT_LINK_RE.exec(u)).filter(Boolean) as RegExpExecArray[]
  const grouped = groupReactions(msg.reactions ?? [], auth.userId)
  const msgDate = new Date(msg.createdAt)
  const prevDate = prevMsg ? new Date(prevMsg.createdAt) : null
  const showDateSep = !prevDate || msgDate.toDateString() !== prevDate.toDateString()
  const todayDate = new Date()
  const yesterdayDate = new Date(todayDate); yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  let dateLabel = msgDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  if (msgDate.toDateString() === todayDate.toDateString()) dateLabel = 'Today'
  else if (msgDate.toDateString() === yesterdayDate.toDateString()) dateLabel = 'Yesterday'

  return (
    <div id={`msg-${msg.id}`}>
      {showDateSep && (
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 16px 8px', gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: C.separator }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.textSecondary, whiteSpace: 'nowrap', padding: '2px 12px', border: `1px solid ${C.separator}`, borderRadius: 12, background: C.lgBg }}>{dateLabel}</span>
          <div style={{ flex: 1, height: 1, background: C.separator }} />
        </div>
      )}
      {msg.isPinned && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 56, marginBottom: 2 }}>
          <Pin size={10} color={C.accent} />
          <span style={{ fontSize: 10, color: C.accent, fontWeight: 600 }}>Pinned</span>
        </div>
      )}
      <div
        onMouseEnter={() => setHoveredMsgId(msg.id)}
        onMouseLeave={() => { setHoveredMsgId(null); if (showQuickEmojiPicker && !showFullEmojiPicker) setEmojiPickerMsgId(null) }}
        style={{
          display: 'flex', padding: showHeader ? '8px 20px 4px' : '1px 20px',
          position: 'relative', gap: 8,
          background: isHovered ? `${C.text}0a` : 'transparent',
          borderTop: isHovered ? `1px solid ${C.text}08` : '1px solid transparent',
          borderBottom: isHovered ? `1px solid ${C.text}08` : '1px solid transparent',
          marginTop: showHeader ? 0 : -1,
        }}
      >
        {/* Top-right read indicator */}
        {!isEditing && isMe && (() => {
          const otherReads = (msg.reads ?? []).filter(r => r.userId !== auth.userId)
          const isRead = otherReads.length > 0
          const fmtOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }
          const sentTime = msgDate.toLocaleString('en-US', fmtOpts)
          const readTime = isRead && otherReads[0]?.readAt
            ? new Date(otherReads[0].readAt).toLocaleString('en-US', fmtOpts)
            : null
          const Icon = isRead ? CheckCheck : Check
          const iconColor = isRead ? C.accent : C.textMuted
          const isGroupOrChannel = selected?.type === 'group' || selected?.type === 'channel'
          const totalOthers = isGroupOrChannel ? (selected.members?.filter(m => m.userId !== auth.userId).length ?? 0) : 0
          const memberMap = new Map((selected?.members ?? []).map(m => [m.userId, m.user.alias ?? m.user.username]))
          const readerNames = otherReads.map(r => memberMap.get(r.userId) ?? 'Unknown')
          return (
            <span
              style={{ position: 'absolute', top: 6, right: 12, display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'default', zIndex: 1 }}
              onMouseEnter={e => {
                const tip = e.currentTarget.querySelector('[data-tip]') as HTMLElement
                if (tip) tip.style.opacity = '1'
              }}
              onMouseLeave={e => {
                const tip = e.currentTarget.querySelector('[data-tip]') as HTMLElement
                if (tip) tip.style.opacity = '0'
              }}>
              <Icon size={13} color={iconColor} />
              {isGroupOrChannel && isRead && showHeader && (
                <span style={{ fontSize: 10, color: C.textMuted }}>
                  {otherReads.length === totalOthers ? 'Read by all' : `Read by ${otherReads.length}`}
                </span>
              )}
              <span data-tip="" style={{
                position: 'absolute', top: '100%', right: 0,
                marginTop: 6, padding: '6px 10px', borderRadius: 6,
                background: C.bgInput, border: `1px solid ${C.separator}`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                fontSize: 11, fontWeight: 500, color: C.text,
                whiteSpace: 'nowrap', pointerEvents: 'none',
                opacity: 0, transition: 'opacity 0.15s',
                zIndex: 50, display: 'flex', flexDirection: 'column', gap: 2,
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={11} color={C.textMuted} />Sent {sentTime}</span>
                {isRead && readTime && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CheckCheck size={11} color={iconColor} />Read {readTime}</span>}
                {isGroupOrChannel && readerNames.length > 0 && (
                  <span style={{ borderTop: `1px solid ${C.separator}`, paddingTop: 3, marginTop: 1, fontSize: 10, color: C.textMuted }}>
                    {readerNames.join(', ')}
                  </span>
                )}
              </span>
            </span>
          )
        })()}
        {showHeader ? (
          <div style={{ width: 36, flexShrink: 0 }}>
            <Avatar url={msg.sender.avatarUrl} name={senderName} size={36} />
          </div>
        ) : (
          <div style={{ width: 36, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            {isHovered && (
              <span style={{ fontSize: 10, color: C.textMuted, lineHeight: '20px', whiteSpace: 'nowrap' }}>
                {msgDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </span>
            )}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {showHeader && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{senderName}</span>
              <span style={{ fontSize: 11, color: C.textMuted }}>
                {msgDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </span>
              {msg.editedAt && <span style={{ fontSize: 10, color: C.textMuted }}>(edited)</span>}
            </div>
          )}
          {isEditing ? (
            <div style={{ padding: '6px 10px', borderRadius: 4, background: C.bgInput, border: `2px solid ${C.accent}` }}>
              <textarea
                value={editingContent}
                onChange={e => setEditingContent(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditMessage() }
                  if (e.key === 'Escape') { setEditingMsgId(null); setEditingContent('') }
                }}
                autoFocus
                style={{ width: '100%', minHeight: 36, fontSize: 14, color: C.text, background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                <button onClick={() => { setEditingMsgId(null); setEditingContent('') }}
                  style={{ fontSize: 11, color: C.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                <button onClick={onEditMessage}
                  style={{ fontSize: 11, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Save</button>
              </div>
            </div>
          ) : isAttachment ? (
            <InlineAttachment content={msg.content} isMe={isMe} config={config} onImageClick={(url, fn) => setLightbox({ url, filename: fn })} />
          ) : fwdMeta && fwdContent !== null ? (
            <div style={{ borderRadius: 6, background: C.bgInput, padding: '8px 12px', marginTop: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <CornerDownRight size={12} color={C.accent} />
                <span style={{ fontSize: 11, fontWeight: 700, color: C.accent }}>Forwarded</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{fwdMeta.s}</span>
                <span style={{ fontSize: 10, color: C.textMuted }}>{formatTime(fwdMeta.t)}</span>
                {fwdMeta.c && (
                  <>
                    <span style={{ fontSize: 10, color: C.textMuted }}>·</span>
                    <span style={{ fontSize: 10, color: C.textMuted }}>{fwdMeta.ct === 'channel' ? '#' : ''}{fwdMeta.c}</span>
                  </>
                )}
              </div>
              <div style={{ fontSize: 14, color: C.text, lineHeight: 1.46, wordBreak: 'break-word', overflowWrap: 'break-word', userSelect: 'text', WebkitUserSelect: 'text' }}>
                {renderMessageContent(fwdContent, false, usersMap)}
              </div>
            </div>
          ) : (() => {
            // Check for VC invite embed
            const vcInviteMatch = msg.content.match(/^\[vc-invite:([^:]+):(.+)\]$/)
            if (vcInviteMatch) {
              const [, vcId, vcName] = vcInviteMatch
              const isMeLocal = msg.sender.id === auth.userId
              return (
                <div style={{ background: C.bgInput, border: `1px solid ${C.separator}`, borderRadius: 10, padding: 14, maxWidth: 380, marginTop: 2 }}>
                  <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>
                    {isMeLocal ? 'You sent an invite to join a voice channel' : `${msg.sender.alias ?? msg.sender.username} sent an invite to join a voice channel`}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: C.cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Volume2 size={20} color={C.accent} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{vcName}</div>
                      <div style={{ fontSize: 11, color: C.textMuted }}>Voice Channel</div>
                    </div>
                    <button
                      onClick={() => onJoinVoiceChannel(vcId)}
                      style={{ background: C.success, border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, padding: '8px 16px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                    >
                      Join Voice
                    </button>
                  </div>
                </div>
              )
            }
            return (
              <div style={{ fontSize: 14, color: C.text, lineHeight: 1.46, wordBreak: 'break-word', overflowWrap: 'break-word', userSelect: 'text', WebkitUserSelect: 'text' }}>
                {renderMessageContent(msg.content, false, usersMap)}
              </div>
            )
          })()}
          {!isEditing && !showHeader && msg.editedAt && (
            <span style={{ fontSize: 10, color: C.textMuted }}>(edited)</span>
          )}
          {plainUrls.map((url, ui) => <OgPreview key={ui} url={url} config={config} />)}
          {feedbackLinks.map((m, fi) => {
            const matchedUrl = allUrls.find(u => FEEDBACK_LINK_RE.test(u)) || ''
            return <FeedbackLinkCard key={`f${fi}`} linkId={m[1]} pinId={m[2] || null} fullUrl={matchedUrl} config={config} />
          })}
          {reportLinks.map((m, ri) => <ReportLinkCard key={`r${ri}`} clientId={m[1]} projectId={m[2]} itemType={m[3] || null} itemId={m[4] || null} config={config} />)}
          {messageLinks.map((m, mi) => <MessageLinkCard key={`m${mi}`} channelId={m[1]} messageId={m[2]} config={config} />)}
          {taskLinks.map((m, ti) => {
            // Extract optional ?comment=xxx so the card can deep-link to a comment.
            let commentId: string | null = null
            try {
              const url = new URL(m[0].startsWith('http') ? m[0] : `https://x.example${m[0]}`)
              commentId = url.searchParams.get('comment')
            } catch { /* ignore parse failure */ }
            return <TaskLinkCard key={`t${ti}`} taskId={m[1]} commentId={commentId} config={config} />
          })}
          {calendarEventLinks.map((m, ci) => (
            <CalendarEventLinkCard key={`c${ci}`} eventId={m[1]} config={config} />
          ))}
          {grouped.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {grouped.map(r => (
                <button key={r.emoji} onClick={() => onToggleReaction(msg.id, r.emoji)} title={r.users.join(', ')}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 12, border: `1px solid ${r.reacted ? C.accent : C.separator}`, background: r.reacted ? C.accentLight : C.bgInput, cursor: 'pointer', fontSize: 12 }}>
                  <span>{r.emoji}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: r.reacted ? C.accent : C.textMuted }}>{r.count}</span>
                </button>
              ))}
            </div>
          )}
          {(msg.replyCount ?? 0) > 0 && (
            <button onClick={() => onOpenThread(msg)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, background: 'transparent', border: '1px solid transparent', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, width: '100%', transition: 'background 0.15s, border-color 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgInput; e.currentTarget.style.borderColor = C.separator }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}>
              {(msg.replySenders?.length ?? 0) > 0 ? (
                <div style={{ display: 'flex', flexShrink: 0 }}>
                  {msg.replySenders!.slice(0, 3).map((rs, ri) => (
                    <div key={rs.id} style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${C.bgPrimary}`, marginLeft: ri === 0 ? 0 : -8, zIndex: 3 - ri, position: 'relative', overflow: 'hidden', background: C.bgInput }}>
                      <Avatar url={rs.avatarUrl} name={rs.alias ?? rs.username} size={18} />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ width: 20, height: 20, borderRadius: 4, background: C.accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MessageCircle size={11} color={C.accent} />
                </div>
              )}
              <span style={{ color: C.accent, fontSize: 12, fontWeight: 700 }}>{msg.replyCount} {msg.replyCount === 1 ? 'reply' : 'replies'}</span>
              <span style={{ color: C.textMuted, fontSize: 11 }}>View thread</span>
              <ChevronRight size={14} color={C.textMuted} style={{ marginLeft: 'auto' }} />
            </button>
          )}
        </div>

        {/* Hover toolbar */}
        {isHovered && !isEditing && (
          <div style={{ position: 'absolute', top: -16, right: 24, display: 'flex', gap: 0, background: C.bgInput, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.25)', border: `1px solid ${C.separator}`, padding: '1px 2px', zIndex: 10 }}>
            {[{
              icon: <Smile size={16} />, title: 'React',
              onClick: () => setEmojiPickerMsgId(showQuickEmojiPicker ? null : msg.id), color: C.textSecondary,
            }, {
              icon: <MessageCircle size={16} />, title: 'Reply in thread',
              onClick: () => onOpenThread(msg), color: C.textSecondary,
            }, {
              icon: <CornerDownRight size={16} />, title: 'Forward',
              onClick: () => setForwardingMsg(msg), color: C.textSecondary,
            }, {
              icon: <LinkIcon size={16} />, title: 'Copy message link',
              onClick: () => {
                const url = `https://bundy.40h.studio/messages/${selected?.id ?? ''}/${msg.id}`
                const ok = (m: string) => showToast({ kind: 'success', message: m })
                const native = (window.electronAPI as { writeClipboard?: (s: string) => void } | undefined)?.writeClipboard
                const tryNavigator = () => navigator.clipboard.writeText(url)
                  .then(() => ok('Message link copied'))
                  .catch(() => {
                    if (native) { native(url); ok('Message link copied') }
                    else showToast({ kind: 'error', message: "Couldn't copy link" })
                  })
                if (native) { native(url); ok('Message link copied') }
                else void tryNavigator()
              },
              color: C.textSecondary,
            }, {
              icon: <Pin size={16} />, title: msg.isPinned ? 'Unpin' : 'Pin',
              onClick: () => onTogglePin(msg.id), color: msg.isPinned ? C.accent : C.textSecondary,
            }, ...(isMe ? [{
              icon: <Edit2 size={16} />, title: 'Edit',
              onClick: () => { setEditingMsgId(msg.id); setEditingContent(msg.content) },
              color: C.textSecondary,
              show: (Date.now() - new Date(msg.createdAt).getTime()) < 12 * 60 * 60 * 1000,
            }, {
              icon: <Trash2 size={16} />, title: 'Delete',
              onClick: () => onDeleteMessage(msg.id), color: C.danger, show: true,
            }] : [])].filter((b: { show?: boolean }) => b.show !== false).map((btn, bi) => (
              <button key={bi} onClick={btn.onClick} title={btn.title}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${C.text}12` }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '5px 7px', color: btn.color, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.1s' }}>
                {btn.icon}
              </button>
            ))}
          </div>
        )}

        {/* Quick emoji picker popup */}
        {showQuickEmojiPicker && !showFullEmojiPicker && (
          <div style={{ position: 'absolute', top: -44, right: 24, display: 'flex', gap: 2, background: C.bgInput, borderRadius: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', border: `1px solid ${C.separator}`, padding: '4px 6px', zIndex: 20 }}>
            {QUICK_EMOJIS.map(e => (
              <button key={e} onClick={() => onToggleReaction(msg.id, e)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '2px 4px', borderRadius: 6 }}
                onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
                onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = 'none' }}>
                {e}
              </button>
            ))}
            <button onClick={() => setFullEmojiPickerMsgId(msg.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 6px', borderRadius: 6, color: C.textMuted, display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
              title="More emojis">
              <Plus size={14} />
            </button>
          </div>
        )}
        {/* Full emoji picker for reactions */}
        {showFullEmojiPicker && (
          <div style={{ position: 'relative' }}>
            <EmojiPicker
              onSelect={(emoji) => { onToggleReaction(msg.id, emoji); setFullEmojiPickerMsgId(null); setEmojiPickerMsgId(null) }}
              onClose={() => { setFullEmojiPickerMsgId(null); setEmojiPickerMsgId(null) }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// React.memo skips re-renders when props are referentially equal. The
// per-row primitive booleans (isHovered, isEditing, etc.) only flip for
// the affected row, so editing/hovering one message no longer re-walks
// the rest of the list. The handlers from MessagesPanel must be
// useCallback'd for this to work — see the wrappers there.
export const MessageRow = React.memo(MessageRowImpl)
