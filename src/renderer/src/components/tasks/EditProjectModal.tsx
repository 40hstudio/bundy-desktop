import { useState } from 'react'
import { ApiConfig, TaskProject } from '../../types'
import { C } from '../../theme'
import { Modal, Button, FormField, Input, Textarea } from '../shared'
import { apiFetch } from '../../api/client'

const PRESET_COLORS = ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#0984e3', '#d63031', '#e84393', '#00cec9', '#636e72', '#2d3436']

export default function EditProjectModal({ config, project, onClose, onUpdated, onDeleted }: {
  config: ApiConfig
  project: TaskProject
  onClose: () => void
  onUpdated: (project: TaskProject) => void
  onDeleted: (id: string) => void
}) {
  const [name, setName] = useState(project.name)
  const [clientName, setClientName] = useState(project.clientName ?? '')
  const [color, setColor] = useState(project.color ?? '#6c5ce7')
  const [description, setDescription] = useState(project.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSave() {
    if (!name.trim()) { setError('Project name is required'); return }
    setSaving(true); setError(null)
    try {
      const data = await apiFetch<{ project: TaskProject }>(`/api/tasks/projects/${project.id}`, {
        method: 'PATCH',
        body: { name: name.trim(), clientName: clientName.trim() || null, color, description: description.trim() || null },
      })
      onUpdated(data.project)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await apiFetch(`/api/tasks/projects/${project.id}`, { method: 'DELETE' })
      onDeleted(project.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project')
      setDeleting(false)
    }
  }

  void config

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Project"
      width={400}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" bg={color} onClick={handleSave} loading={saving} loadingText="Saving…" disabled={!name.trim()}>
          Save Changes
        </Button>
      </>}
    >
      {error && <div style={{ fontSize: 12, color: C.danger, fontWeight: 600 }}>{error}</div>}
      <FormField label="Client Name">
        <Input value={clientName} onChange={e => setClientName(e.target.value)} autoFocus placeholder="e.g. Acme Corp" />
      </FormField>
      <FormField label="Project Name" required>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Website Redesign" />
      </FormField>
      <FormField label="Description">
        <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Optional…" />
      </FormField>
      <FormField label="Color">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: color === c ? `3px solid ${C.text}` : `2px solid transparent`, cursor: 'pointer', boxSizing: 'border-box', padding: 0 }}
            />
          ))}
        </div>
      </FormField>
      {confirmDelete ? (
        <div style={{ padding: 12, borderRadius: 10, background: C.danger + '12', border: `1px solid ${C.danger}33` }}>
          <div style={{ fontSize: 12, color: C.danger, fontWeight: 600, marginBottom: 4 }}>Delete this project?</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10 }}>Tasks will not be deleted, but will lose their project assignment.</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting} loadingText="Deleting…">
              Confirm Delete
            </Button>
            <Button size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          onClick={() => setConfirmDelete(true)}
          style={{ alignSelf: 'flex-start', color: C.danger, border: `1px solid ${C.danger}44`, background: 'transparent', fontWeight: 600 }}
        >
          Delete Project
        </Button>
      )}
    </Modal>
  )
}
