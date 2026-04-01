import { useState } from 'react'
import { X, Layers, Edit2, Trash2, Plus, Loader, Check } from 'lucide-react'
import { ApiConfig, TaskSection } from '../../types'
import { C, neu } from '../../theme'

export default function ManageSectionsModal({ config, projectId, projectName, sections: initialSections, onClose, onUpdated }: {
  config: ApiConfig
  projectId: string
  projectName: string
  sections: TaskSection[]
  onClose: () => void
  onUpdated: (sections: TaskSection[]) => void
}) {
  const [secs, setSecs] = useState<TaskSection[]>(initialSections)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function createSection() {
    if (!newName.trim()) return
    setCreating(true); setError(null)
    try {
      const res = await fetch(`${config.apiBase}/api/tasks/sections`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), projectId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json() as { section: TaskSection }
      const newSecs = [...secs, d.section]
      setSecs(newSecs)
      setNewName('')
      onUpdated(newSecs)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to create section') } finally { setCreating(false) }
  }

  async function renameSection(id: string) {
    const trimmed = editName.trim()
    if (!trimmed) { setEditingId(null); return }
    try {
      const res = await fetch(`${config.apiBase}/api/tasks/sections/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const newSecs = secs.map(s => s.id === id ? { ...s, name: trimmed } : s)
      setSecs(newSecs)
      setEditingId(null)
      onUpdated(newSecs)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to rename section') }
  }

  async function deleteSection(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`${config.apiBase}/api/tasks/sections/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const newSecs = secs.filter(s => s.id !== id)
      setSecs(newSecs)
      onUpdated(newSecs)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to delete section') } finally { setDeletingId(null) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }}>
      <div style={{ width: 420, maxHeight: '75vh', background: C.lgBg, borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${C.separator}`, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Manage Sections</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{projectName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}><X size={16} /></button>
        </div>
        {error && <div style={{ padding: '8px 18px', fontSize: 12, color: C.danger, fontWeight: 600, background: C.danger + '10', flexShrink: 0 }}>{error}</div>}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {secs.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, fontSize: 12, color: C.textMuted, opacity: 0.5 }}>No sections yet. Add one below.</div>
          )}
          {secs.map(sec => (
            <div key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', borderBottom: `1px solid ${C.separator}` }}>
              <Layers size={14} color={C.accent} style={{ flexShrink: 0 }} />
              {editingId === sec.id ? (
                <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                  onBlur={() => renameSection(sec.id)}
                  onKeyDown={e => { if (e.key === 'Enter') renameSection(sec.id); if (e.key === 'Escape') setEditingId(null) }}
                  style={{ flex: 1, ...neu(true), padding: '4px 8px', fontSize: 12, color: C.text, border: 'none', outline: 'none', fontFamily: 'inherit' }}
                />
              ) : (
                <span style={{ flex: 1, fontSize: 13, color: C.text }}>{sec.name}</span>
              )}
              {editingId === sec.id ? (
                <button onClick={() => renameSection(sec.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.success, padding: 4 }}>
                  <Check size={14} />
                </button>
              ) : (
                <button onClick={() => { setEditingId(sec.id); setEditName(sec.name) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, opacity: 0.5 }}>
                  <Edit2 size={13} />
                </button>
              )}
              <button onClick={() => deleteSection(sec.id)} disabled={deletingId === sec.id}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 4, opacity: deletingId === sec.id ? 0.4 : 0.6 }}>
                {deletingId === sec.id ? <Loader size={13} /> : <Trash2 size={13} />}
              </button>
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.separator}`, display: 'flex', gap: 8, flexShrink: 0 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New section name…"
            onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) createSection() }}
            style={{ flex: 1, ...neu(true), padding: '7px 10px', fontSize: 12, color: C.text, border: 'none', outline: 'none', fontFamily: 'inherit' }}
          />
          <button onClick={createSection} disabled={creating || !newName.trim()}
            style={{ ...neu(), padding: '7px 12px', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, opacity: !newName.trim() ? 0.4 : 1 }}>
            {creating ? <Loader size={12} /> : <Plus size={12} />}
          </button>
        </div>
      </div>
    </div>
  )
}
