import { useState, useEffect } from 'react'
import { ApiConfig, Auth, Task, TaskProject, UserInfo } from '../../types'
import { C } from '../../theme'
import { Modal, Button, FormField, Input, Textarea, Select } from '../shared'
import { apiFetch } from '../../api/client'

export default function CreateTaskModal({ config, auth, projects, selectedProjectId, onClose, onCreated }: {
  config: ApiConfig; auth: Auth
  projects: TaskProject[]
  selectedProjectId: string | null
  onClose: () => void
  onCreated: (task: Task) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('todo')
  const [priority, setPriority] = useState('medium')
  const [projectId, setProjectId] = useState(selectedProjectId ?? '')
  const [dueDate, setDueDate] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [users, setUsers] = useState<UserInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ users: UserInfo[] }>('/api/users')
      .then(d => setUsers(d.users))
      .catch(console.error)
  }, [])

  async function handleCreate() {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true); setError(null)
    try {
      const data = await apiFetch<{ task: Task }>('/api/tasks', {
        method: 'POST',
        body: {
          title: title.trim(),
          description: description.trim() || null,
          status, priority,
          projectId: projectId || null,
          dueDate: dueDate || null,
          startDate: startDate || null,
        },
      })
      onCreated(data.task)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally { setSaving(false) }
  }

  void config; void auth; void users

  return (
    <Modal
      open
      onClose={onClose}
      title="New Task"
      width={480}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleCreate} loading={saving} loadingText="Creating…" disabled={!title.trim()}>
          Create Task
        </Button>
      </>}
    >
      {error && <div style={{ fontSize: 12, color: C.danger, fontWeight: 600 }}>{error}</div>}
      <FormField label="Title" required>
        <Input value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="Task title" />
      </FormField>
      <FormField label="Description">
        <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Optional description…" />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <FormField label="Status">
          <Select value={status} onChange={e => setStatus(e.target.value)}>
            {[['todo', 'To Do'], ['in-progress', 'In Progress'], ['review', 'In Review'], ['done', 'Done'], ['blocked', 'Blocked']].map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Priority">
          <Select value={priority} onChange={e => setPriority(e.target.value)}>
            {[['urgent', 'Urgent'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']].map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Project">
          <Select value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">No Project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Start Date">
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ cursor: 'pointer' }} />
        </FormField>
        <FormField label="Due Date">
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ cursor: 'pointer' }} />
        </FormField>
      </div>
    </Modal>
  )
}
