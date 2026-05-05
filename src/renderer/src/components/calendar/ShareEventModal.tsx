/**
 * Share-event modal — picks a channel/DM and posts the event share URL
 * as a message. The recipient sees a CalendarEventLinkCard inline (the
 * URL pattern `/calendar/event/<id>` is recognised by the message
 * renderer) and clicking it deep-links them into the calendar tab with
 * the event detail open.
 *
 * The modal renders a search box + list of all the user's channels
 * (DMs first, then groups, then public). Selecting one fires a single
 * POST /api/channels/:id/messages with the share URL as the body and
 * closes.
 */

import { useEffect, useMemo, useState } from 'react'
import { Search, Send, Copy, Check } from 'lucide-react'
import { ApiConfig, Auth, Conversation } from '../../types'
import { C } from '../../theme'
import { Modal, Button, Input, Spinner } from '../shared'
import { Avatar } from '../shared/Avatar'
import { apiFetch } from '../../api/client'
import type { CalendarEvent } from './types'

/** Raw `/api/channels` row shape — name is the DB-stored value, which for
 *  DMs is an auto-generated `dm-<id>-<id>` key (not user-facing). The
 *  renderer transforms this into a display name based on `members`. */
interface RawChannel {
  id: string
  type: string
  name: string | null
  members?: { userId: string; user: { alias: string | null; username: string; avatarUrl: string | null } }[]
  createdBy?: string
  taskId?: string | null
}

/** Mirror MessagesPanel's display-name + avatar resolution so the share
 *  modal lists "Rifkie" instead of "dm-cmn6zuc7…". For DMs we pick the
 *  *other* participant; for everything else we use the channel's own
 *  name (with `#` prefix on public channels). */
function toConversation(ch: RawChannel, currentUserId: string): Conversation {
  let name = ch.name ?? ''
  let avatar: string | null = null
  let partnerId: string | undefined
  const members = ch.members ?? []
  if (ch.type === 'dm') {
    const other = members.find((m) => m.userId !== currentUserId)
    name = other?.user.alias ?? other?.user.username ?? 'Direct message'
    avatar = other?.user.avatarUrl ?? null
    partnerId = other?.userId
  } else if (ch.type === 'group') {
    name = ch.name ?? 'Group'
  } else if (ch.type === 'task') {
    name = ch.name ?? 'Discussion'
  } else {
    name = `#${ch.name ?? 'channel'}`
  }
  return {
    id: ch.id,
    type: ch.type as Conversation['type'],
    name,
    avatar,
    partnerId,
    members: members as unknown as Conversation['members'],
    createdBy: ch.createdBy,
    taskId: ch.taskId ?? null,
  }
}

export default function ShareEventModal({
  config: _config, auth, event, shareUrl, onClose,
}: {
  config: ApiConfig
  auth: Auth
  event: CalendarEvent
  shareUrl: string
  onClose: () => void
}) {
  void _config
  const [channels, setChannels] = useState<Conversation[] | null>(null)
  const [query, setQuery] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    apiFetch<{ channels: RawChannel[] }>('/api/channels')
      .then((d) => setChannels(d.channels.map((ch) => toConversation(ch, auth.userId))))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load channels'))
  }, [auth.userId])

  async function copyLink() {
    // See EventDetailDrawer — Electron clipboard IPC is reliable; the
    // browser-style navigator.clipboard.writeText was no-op'ing.
    try {
      window.electronAPI.writeClipboard(shareUrl)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1800)
    } catch { /* clipboard not always available */ }
  }

  const filtered = useMemo(() => {
    if (!channels) return [] as Conversation[]
    const q = query.trim().toLowerCase()
    if (!q) return channels
    return channels.filter((c) => c.name.toLowerCase().includes(q))
  }, [channels, query])

  // Sort: DMs → groups → public channels → tasks. Within each, alpha.
  const sorted = useMemo(() => {
    const order: Record<Conversation['type'], number> = { dm: 0, group: 1, channel: 2, task: 3 }
    return [...filtered].sort((a, b) => {
      const pri = (order[a.type] ?? 9) - (order[b.type] ?? 9)
      return pri !== 0 ? pri : a.name.localeCompare(b.name)
    })
  }, [filtered])

  async function shareTo(channelId: string) {
    setSending(channelId); setError(null)
    try {
      // Compose the message: optional user note on top, then the URL on
      // its own line so the link card surfaces below the text.
      const body = note.trim()
        ? `${note.trim()}\n${shareUrl}`
        : shareUrl
      await apiFetch(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        body: { content: body },
      })
      setSentTo(channelId)
      // Auto-close after a beat so the user sees the success state.
      setTimeout(() => onClose(), 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(null)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Share "${event.title}"`}
      width={460}
      footer={
        <Button onClick={onClose}>Close</Button>
      }
    >
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>
        Pick a conversation to send the event link, or copy the link directly.
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
        padding: '8px 10px', borderRadius: 6,
        background: C.bgInput, border: `1px solid ${C.separator}`,
      }}>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'SF Mono, Menlo, monospace',
          color: C.textSecondary,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{shareUrl}</span>
        <Button onClick={copyLink} title={linkCopied ? 'Copied!' : 'Copy link'}>
          {linkCopied ? <Check size={14} /> : <Copy size={14} />}
          <span style={{ marginLeft: 4 }}>{linkCopied ? 'Copied' : 'Copy'}</span>
        </Button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Input
          placeholder="Add a note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textMuted }} />
        <Input
          placeholder="Search conversations…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ paddingLeft: 32 }}
        />
      </div>
      {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 8 }}>{error}</div>}
      <div style={{
        maxHeight: 320, overflowY: 'auto',
        border: `1px solid ${C.separator}`, borderRadius: 6, background: C.bgInput,
      }}>
        {channels === null ? (
          <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: C.textMuted, textAlign: 'center' }}>
            {query ? 'No matches' : 'No conversations'}
          </div>
        ) : sorted.map((c) => {
          const busy = sending === c.id
          const sent = sentTo === c.id
          return (
            <button
              key={c.id}
              onClick={() => !busy && !sent && shareTo(c.id)}
              disabled={busy || sent}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '8px 12px', textAlign: 'left',
                background: sent ? 'rgba(67,181,129,0.12)' : 'transparent',
                border: 'none', borderBottom: `1px solid ${C.separator}`,
                color: C.text, cursor: busy || sent ? 'default' : 'pointer',
                fontSize: 13,
              }}
            >
              <Avatar name={c.name} url={c.avatar ?? null} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted }}>
                  {c.type === 'dm' ? 'Direct message' : c.type === 'group' ? 'Group' : c.type === 'channel' ? 'Channel' : 'Task discussion'}
                </div>
              </div>
              {sent ? (
                <span style={{ fontSize: 11, color: C.success, fontWeight: 600 }}>Sent</span>
              ) : busy ? (
                <Spinner />
              ) : (
                <Send size={14} style={{ color: C.textMuted }} />
              )}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
