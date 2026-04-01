import React, { useState, useEffect } from 'react'
import { X, UserPlus, LogOut, Trash2 } from 'lucide-react'
import { C, neu } from '../../theme'
import type { Auth, ApiConfig, Conversation, ChannelMember, UserInfo } from '../../types'
import { Avatar } from '../shared/Avatar'

export function ChannelSettingsModal({
  config, auth, conv, onClose,
}: {
  config: ApiConfig; auth: Auth; conv: Conversation; onClose: () => void
}) {
  const [members, setMembers] = useState<ChannelMember[]>(conv.members)
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [busy, setBusy] = useState(false)
  const isCreator = conv.createdBy === auth.userId

  useEffect(() => {
    fetch(`${config.apiBase}/api/users`, { headers: { Authorization: `Bearer ${config.token}` } })
      .then(r => r.json())
      .then((d: { users: UserInfo[] }) => setAllUsers(d.users))
      .catch(() => {})
  }, [config])

  async function addMember(userId: string) {
    setBusy(true)
    try {
      const res = await fetch(`${config.apiBase}/api/channels/${conv.id}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const d = await res.json() as { ok?: boolean; user?: UserInfo }
      if (d.ok && d.user) setMembers(prev => [...prev, { userId, user: d.user! }])
    } catch (err) { console.error('[ChannelSettings] addMember failed:', err) } finally { setBusy(false) }
  }

  async function removeMember(userId: string) {
    setBusy(true)
    try {
      await fetch(`${config.apiBase}/api/channels/${conv.id}/members`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      setMembers(prev => prev.filter(m => m.userId !== userId))
    } catch (err) { console.error('[ChannelSettings] removeMember failed:', err) } finally { setBusy(false) }
  }

  async function leaveChannel() {
    if (!confirm(`Leave "${conv.name}"?`)) return
    setBusy(true)
    try {
      await fetch(`${config.apiBase}/api/channels/${conv.id}/members`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: auth.userId }),
      })
      onClose()
      window.dispatchEvent(new CustomEvent('bundy-channel-left', { detail: { channelId: conv.id } }))
    } catch (err) { console.error('[ChannelSettings] leave failed:', err) } finally { setBusy(false) }
  }

  async function deleteChannel() {
    if (!confirm(`Delete "${conv.name}" permanently? This cannot be undone.`)) return
    setBusy(true)
    try {
      await fetch(`${config.apiBase}/api/channels/${conv.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.token}` },
      })
      onClose()
    } catch (err) { console.error('[ChannelSettings] delete failed:', err) } finally { setBusy(false) }
  }

  const nonMembers = allUsers.filter(u => !members.some(m => m.userId === u.id))

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{ ...neu(), borderRadius: 8, padding: 20, width: 340, maxHeight: '80vh', overflow: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{conv.name} — Members</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}><X size={16} /></button>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Current Members</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {members.map(m => (
            <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar url={m.user.avatarUrl} name={m.user.alias ?? m.user.username} size={28} />
              <span style={{ flex: 1, fontSize: 13, color: C.text }}>{m.user.alias ?? m.user.username}</span>
              {m.userId !== auth.userId && (
                <button onClick={() => removeMember(m.userId)} disabled={busy}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 4 }}>
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        {nonMembers.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Add Members</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {nonMembers.map(u => (
                <button key={u.id} onClick={() => addMember(u.id)} disabled={busy}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
                    background: 'transparent', border: `1px solid ${C.separator}`, cursor: 'pointer', borderRadius: 8, textAlign: 'left',
                  }}>
                  <Avatar url={u.avatarUrl} name={u.alias ?? u.username} size={26} />
                  <span style={{ fontSize: 13, color: C.text }}>{u.alias ?? u.username}</span>
                  <UserPlus size={13} style={{ marginLeft: 'auto', color: C.accent }} />
                </button>
              ))}
            </div>
          </>
        )}

        {conv.type !== 'dm' && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.separator}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!isCreator && (
              <button onClick={leaveChannel} disabled={busy}
                style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.separator}`, background: 'transparent', color: C.warning, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <LogOut size={14} /> Leave {conv.type === 'group' ? 'Group' : 'Channel'}
              </button>
            )}
            {isCreator && (
              <button onClick={deleteChannel} disabled={busy}
                style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.danger}`, background: 'transparent', color: C.danger, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <Trash2 size={14} /> Delete {conv.type === 'group' ? 'Group' : 'Channel'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
