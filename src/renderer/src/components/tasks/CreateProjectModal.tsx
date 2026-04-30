import { useState } from 'react'
import { ApiConfig, TaskProject } from '../../types'
import { C } from '../../theme'
import { Modal, Button, FormField, Input, Textarea } from '../shared'
import { apiFetch } from '../../api/client'

const PRESET_COLORS = ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#0984e3', '#d63031', '#e84393', '#00cec9', '#636e72', '#2d3436']

export default function CreateProjectModal({ config, onClose, onCreated }: {
  config: ApiConfig
  onClose: () => void
  onCreated: (project: TaskProject) => void
}) {
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [color, setColor] = useState('#6c5ce7')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim()) { setError('Project name is required'); return }
    setSaving(true); setError(null)
    try {
      const data = await apiFetch<{ project: TaskProject }>('/api/tasks/projects', {
        method: 'POST',
        body: { name: name.trim(), clientName: clientName.trim() || null, color, description: description.trim() || null },
      })
      onCreated(data.project)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally { setSaving(false) }
  }

  void config

  return (
    <Modal
      open
      onClose={onClose}
      title="New Project"
      width={400}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" bg={color} onClick={handleCreate} loading={saving} loadingText="Creating…" disabled={!name.trim()}>
          Create Project
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
    </Modal>
  )
}
