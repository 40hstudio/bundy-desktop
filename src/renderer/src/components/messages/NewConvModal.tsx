import React, { useState, useEffect } from 'react'
import { X, Loader, Check } from 'lucide-react'
import { C, neu } from '../../theme'
import type { Auth, ApiConfig, UserInfo } from '../../types'
import { Avatar } from '../shared/Avatar'

export function NewConvModal({
  config, auth, onClose, onCreated, initialMode = 'dm',
}: {
  config: ApiConfig; auth: Auth
  onClose: () => void; onCreated: (id: string) => void
  initialMode?: 'dm' | 'group' | 'channel'
}) {
  const [mode, setMode] = useState<'dm' | 'group' | 'channel'>(initialMode)
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${config.apiBase}/api/users`, { headers: { Authorization: `Bearer ${config.token}` } })
      .then(r => r.json())
      .then((d: { users: UserInfo[] }) => setUsers(d.users.filter(u => u.id !== auth.userId)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [config, auth.userId])

  const filtered = users.filter(u =>
    (u.alias ?? u.username).toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase())
  )

  async function create() {
    if (mode === 'dm') {
      if (selected.length !== 1) { setError('Pick one person'); return }
      setBusy(true)
      try {
        const res = await fetch(`${config.apiBase}/api/channels`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'dm', partnerId: selected[0] }),
        })
        const d = await res.json() as { channel?: { id: string }; error?: string }
        if (d.channel?.id) { onCreated(d.channel.id); onClose() }
        else setError(d.error ?? 'Failed to create')
      } catch { setError('Failed to create') } finally { setBusy(false) }
    } else {
      if (!name.trim()) { setError('Name is required'); return }
      if (mode === 'group' && selected.length === 0) { setError('Pick at least one member'); return }
      setBusy(true)
      try {
        const res = await fetch(`${config.apiBase}/api/channels`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: mode, name: name.trim(), memberIds: selected }),
        })
        const d = await res.json() as { channel?: { id: string }; error?: string }
        if (d.channel?.id) { onCreated(d.channel.id); onClose() }
        else setError(d.error ?? 'Failed to create')
      } catch { setError('Failed to create') } finally { setBusy(false) }
    }
  }

  const modeLabels = { dm: 'Direct Message', group: 'Group Chat', channel: 'Channel' }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        ...neu(), borderRadius: 8, padding: 20, width: 360,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>New Conversation</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {(['dm', 'group', ...(auth.role === 'admin' ? ['channel'] : [])] as Array<'dm' | 'group' | 'channel'>).map(m => (
            <button key={m} onClick={() => { setMode(m); setSelected([]); setName(''); setError('') }}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: mode === m ? C.accent : C.lgBg,
                color: mode === m ? '#fff' : C.textMuted,
                boxShadow: mode === m ? `0 2px 6px ${C.accent}44` : C.lgShadow,
              }}>
              {modeLabels[m]}
            </button>
          ))}
        </div>

        {(mode === 'group' || mode === 'channel') && (
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder={mode === 'channel' ? 'channel-name' : 'Group name'}
            style={{ ...neu(true), padding: '8px 12px', fontSize: 13, color: C.text, border: 'none', outline: 'none', marginBottom: 10, borderRadius: 8 }} />
        )}

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people…"
          style={{ ...neu(true), padding: '7px 12px', fontSize: 12, color: C.text, border: 'none', outline: 'none', marginBottom: 10, borderRadius: 8 }} />

        {loading ? <div style={{ textAlign: 'center', padding: 20 }}><Loader size={20} /></div> : (
          <div style={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtered.map(u => {
              const isSel = selected.includes(u.id)
              return (
                <button key={u.id}
                  onClick={() => {
                    if (mode === 'dm') setSelected([u.id])
                    else setSelected(prev => isSel ? prev.filter(id => id !== u.id) : [...prev, u.id])
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    background: isSel ? C.accentLight : 'transparent', borderRadius: 8,
                    border: isSel ? `1px solid ${C.accent}` : '1px solid transparent',
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                  <Avatar url={u.avatarUrl} name={u.alias ?? u.username} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{u.alias ?? u.username}</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>@{u.username}</div>
                  </div>
                  {isSel && <Check size={14} color={C.accent} />}
                </button>
              )
            })}
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: C.danger, marginTop: 8 }}>{error}</div>}

        <button onClick={create} disabled={busy || (mode === 'dm' && selected.length === 0)}
          style={{
            marginTop: 12, padding: '10px 0', borderRadius: 4, border: 'none', cursor: 'pointer',
            background: C.accent, color: '#fff', fontWeight: 700, fontSize: 13,
            opacity: busy ? 0.7 : 1,
          }}>
          {busy ? 'Creating…' : `Create ${modeLabels[mode]}`}
        </button>
      </div>
    </div>
  )
}
