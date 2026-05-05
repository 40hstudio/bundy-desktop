/**
 * MessageLinkCard — preview card for copied message links.
 *
 * When the user pastes a `bundy.40h.studio/messages/{channelId}/{msgId}`
 * URL into a conversation we render this card below the text so the
 * recipient sees who said what without leaving their thread. Click
 * dispatches `bundy-open-message`, which MessagesPanel listens for to
 * switch channels + scroll to the original message.
 */
import { useEffect, useState } from 'react'
import { MessageCircle, ExternalLink } from 'lucide-react'
import { C } from '../../theme'
import { Avatar } from '../shared/Avatar'
import { formatTime } from '../../utils/format'
import type { ApiConfig } from '../../types'

interface MessagePreview {
  id: string
  channelId: string
  channelName: string
  channelType: 'dm' | 'group' | 'channel'
  parentMessageId: string | null
  content: string
  createdAt: string
  sender: { id: string; username: string; alias: string | null; avatarUrl: string | null }
}

const previewCache = new Map<string, MessagePreview | null>()

export function MessageLinkCard({
  channelId, messageId, config,
}: {
  channelId: string
  messageId: string
  config: ApiConfig
}) {
  const cacheKey = `${channelId}/${messageId}`
  const [preview, setPreview] = useState<MessagePreview | null | undefined>(
    previewCache.has(cacheKey) ? previewCache.get(cacheKey) : undefined
  )

  useEffect(() => {
    if (previewCache.has(cacheKey)) return
    let cancelled = false
    const headers = { Authorization: `Bearer ${config.token}` }

    // Try the dedicated preview endpoint first (fast, single message). If
    // it isn't deployed yet, fall back to the `?around=` endpoint which
    // ships with the existing API surface and lets us locate the message
    // in a small window.
    async function load() {
      try {
        const channelRes = await fetch(`${config.apiBase}/api/channels`, {
          headers, signal: AbortSignal.timeout(6000),
        })
        const channelsData = await channelRes.json().catch(() => ({ channels: [] }))
        const channel = (channelsData.channels ?? []).find((c: { id: string }) => c.id === channelId)
        if (!channel) throw new Error('channel-not-found')

        const previewRes = await fetch(
          `${config.apiBase}/api/channels/${channelId}/messages/${messageId}/preview`,
          { headers, signal: AbortSignal.timeout(6000) }
        )
        if (previewRes.ok) {
          const d = await previewRes.json()
          if (!cancelled) {
            previewCache.set(cacheKey, d)
            setPreview(d)
          }
          return
        }

        // Fallback: search `?around=` for the message. Works for top-level
        // hits even on backends that don't yet expose /preview.
        const aroundRes = await fetch(
          `${config.apiBase}/api/channels/${channelId}/messages?around=${messageId}&limit=4`,
          { headers, signal: AbortSignal.timeout(6000) }
        )
        if (!aroundRes.ok) throw new Error('around-failed')
        const aroundData = await aroundRes.json()
        type MsgRow = {
          id: string; content: string; createdAt: string; parentMessageId?: string | null
          sender: { id: string; username: string; alias: string | null; avatarUrl: string | null }
        }
        const found = (aroundData.messages as MsgRow[]).find(m => m.id === messageId)
        if (!found) throw new Error('not-in-window')
        const synth: MessagePreview = {
          id: found.id,
          channelId,
          channelName: channel.name ?? '',
          channelType: channel.type,
          parentMessageId: found.parentMessageId ?? null,
          content: found.content.length > 280 ? found.content.slice(0, 280) + '…' : found.content,
          createdAt: found.createdAt,
          sender: found.sender,
        }
        if (!cancelled) {
          previewCache.set(cacheKey, synth)
          setPreview(synth)
        }
      } catch {
        if (!cancelled) {
          previewCache.set(cacheKey, null)
          setPreview(null)
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [cacheKey, channelId, messageId, config])

  if (preview === undefined) {
    return (
      <div style={{
        padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.separator}`,
        background: `${C.accent}08`, maxWidth: 380, marginTop: 4,
        fontSize: 12, color: C.textMuted,
      }}>Loading message preview…</div>
    )
  }
  if (preview === null) {
    return (
      <div style={{
        padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.separator}`,
        background: 'transparent', maxWidth: 380, marginTop: 4,
        fontSize: 12, color: C.textMuted, fontStyle: 'italic',
      }}>Linked message is unavailable.</div>
    )
  }

  const senderName = preview.sender.alias ?? preview.sender.username
  const channelLabel = preview.channelType === 'channel'
    ? `#${preview.channelName}`
    : preview.channelType === 'group' ? preview.channelName
    : `DM with ${senderName}`

  return (
    <div
      onClick={() => window.dispatchEvent(new CustomEvent('bundy-open-message', {
        detail: { channelId: preview.channelId, messageId: preview.id },
      }))}
      style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '10px 14px', borderRadius: 8,
        border: `1px solid ${C.separator}`, borderLeft: `3px solid ${C.accent}`,
        background: `${C.accent}08`, cursor: 'pointer', maxWidth: 480,
        marginTop: 4, marginBottom: 2, transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${C.accent}15` }}
      onMouseLeave={e => { e.currentTarget.style.background = `${C.accent}08` }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textMuted }}>
        <MessageCircle size={11} color={C.accent} />
        <span style={{ fontWeight: 600, color: C.accent }}>{channelLabel}</span>
        {preview.parentMessageId && <span>· in thread</span>}
        <ExternalLink size={11} style={{ marginLeft: 'auto' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar url={preview.sender.avatarUrl} name={senderName} size={22} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{senderName}</span>
        <span style={{ fontSize: 11, color: C.textMuted }}>{formatTime(preview.createdAt)}</span>
      </div>
      <div style={{
        fontSize: 13, color: C.text, lineHeight: 1.4,
        overflow: 'hidden', textOverflow: 'ellipsis',
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
        wordBreak: 'break-word',
      }}>
        {preview.content || <em style={{ color: C.textMuted }}>(no text)</em>}
      </div>
    </div>
  )
}
