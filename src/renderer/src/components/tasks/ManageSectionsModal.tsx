import { useState, useEffect } from 'react'
import { Trash2, Edit2, Plus, Check, X } from 'lucide-react'
import { ApiConfig, TaskProject } from '../../types'
import { C } from '../../theme'
import { Modal, Button, FormField, Input, Spinner } from '../shared'
import { apiFetch } from '../../api/client'

type Section = { id: string; name: string; order: number; projectId: string }

/**
 * Restored from the deleted ManageSectionsModal. Admin-only because
 * /api/tasks/sections POST/PATCH/DELETE now require role=admin (see P0.5).
 */
export default function ManageSectionsModal({
  config: _config, project, onClose,
}: {
  config: ApiConfig
  project: TaskProject
  onClose: () => void
}) {
  const [sections, setSections] = useState<Section[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  async function load() {
    try {
      const data = await apiFetch<{ sections: Section[] }>(`/api/tasks/sections?projectId=${project.id}`)
      setSections(data.sections)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sections')
    }
  }
  useEffect(() => { void load() }, [project.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    setBusy(true); setError(null)
    try {
      const data = await apiFetch<{ section: Section }>('/api/tasks/sections', {
        method: 'POST', body: { name, projectId: project.id },
      })
      setSections(s => [...(s ?? []), data.section])
      setNewName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally { setBusy(false) }
  }

  async function handleRename(id: string) {
    const name = editingName.trim()
    if (!name) { setEditingId(null); return }
    setBusy(true); setError(null)
    try {
      await apiFetch(`/api/tasks/sections/${id}`, { method: 'PATCH', body: { name } })
      setSections(s => (s ?? []).map(x => x.id === id ? { ...x, name } : x))
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename')
    } finally { setBusy(false) }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this section? Tasks will lose their section assignment.')) return
    setBusy(true); setError(null)
    try {
      await apiFetch(`/api/tasks/sections/${id}`, { method: 'DELETE' })
      setSections(s => (s ?? []).filter(x => x.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally { setBusy(false) }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Sections — ${project.name}`}
      width={420}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {error && <div style={{ fontSize: 12, color: C.danger, fontWeight: 600 }}>{error}</div>}

      <FormField label="Add section">
        <div style={{ display: 'flex', gap: 6 }}>
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleCreate() }}
            placeholder="e.g. Backlog"
            autoFocus
          />
          <Button variant="primary" onClick={() => void handleCreate()} disabled={!newName.trim() || busy} leftIcon={<Plus size={12} />}>
            Add
          </Button>
        </div>
      </FormField>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>Existing</div>
        {sections === null ? (
          <Spinner label="Loading…" />
        ) : sections.length === 0 ? (
          <div style={{ fontSize: 12, color: C.textMuted, padding: '8px 4px' }}>No sections yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sections.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.separator}` }}>
                {editingId === s.id ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void handleRename(s.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      autoFocus
                    />
                    <button onClick={() => void handleRename(s.id)} disabled={busy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.success, padding: 4 }}>
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4 }}>
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 12, color: C.text }}>{s.name}</span>
                    <button
                      onClick={() => { setEditingId(s.id); setEditingName(s.name) }}
                      title="Rename"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4 }}
                    ><Edit2 size={12} /></button>
                    <button
                      onClick={() => void handleDelete(s.id)}
                      title="Delete"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 4 }}
                    ><Trash2 size={12} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
