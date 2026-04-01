import { useState, useEffect } from 'react'
import { X, Loader } from 'lucide-react'
import { ApiConfig, Auth, TaskProject, TaskSection, UserInfo } from '../../types'
import { C, neu } from '../../theme'

const DEMO_MODE = false

export default function CreateTaskModal({ config, auth, projects, sections, selectedProjectId, onClose, onCreated }: {
  config: ApiConfig; auth: Auth
  projects: TaskProject[]
  sections: TaskSection[]
  selectedProjectId: string | null
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('todo')
  const [priority, setPriority] = useState('medium')
  const [projectId, setProjectId] = useState(selectedProjectId ?? '')
  const [sectionId, setSectionId] = useState('')
  const [assigneeId, setAssigneeId] = useState(auth.userId)
  const [dueDate, setDueDate] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [estimatedHours, setEstimatedHours] = useState('')
  const [users, setUsers] = useState<UserInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projectSections, setProjectSections] = useState<TaskSection[]>(sections)

  useEffect(() => {
    fetch(`${config.apiBase}/api/users`, { headers: { Authorization: `Bearer ${config.token}` } })
      .then(r => r.json())
      .then((d: { users: UserInfo[] }) => setUsers(d.users))
      .catch(console.error)
  }, [config])

  useEffect(() => {
    if (!projectId) { setProjectSections([]); setSectionId(''); return }
    fetch(`${config.apiBase}/api/tasks/sections?projectId=${projectId}`, { headers: { Authorization: `Bearer ${config.token}` } })
      .then(r => r.json())
      .then((d: { sections: TaskSection[] }) => { setProjectSections(d.sections); setSectionId('') })
      .catch(() => { setProjectSections([]); setSectionId('') })
  }, [projectId, config])

  async function handleCreate() {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true); setError(null)
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        status, priority,
        projectId: projectId || null,
        sectionId: sectionId || null,
        assigneeId: assigneeId || null,
        dueDate: dueDate || null,
        startDate: startDate || null,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
      }
      const res = await fetch(`${config.apiBase}/api/tasks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d?.error ?? `HTTP ${res.status}`) }
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally { setSaving(false) }
  }

  const fieldStyle: React.CSSProperties = { ...neu(true), padding: '7px 10px', fontSize: 12, color: C.text, border: 'none', outline: 'none', width: '100%', fontFamily: 'inherit' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }}>
      <div style={{ width: 480, maxHeight: '85vh', background: C.lgBg, borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${C.separator}` }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.text }}>New Task</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ fontSize: 12, color: C.danger, fontWeight: 600 }}>{error}</div>}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>Title *</div>
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
              placeholder="Task title"
              style={fieldStyle}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>Description</div>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Optional description…"
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>Status</div>
              <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
                {[['todo', 'To Do'], ['in_progress', 'In Progress'], ['review', 'In Review'], ['done', 'Done'], ['cancelled', 'Cancelled']].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>Priority</div>
              <select value={priority} onChange={e => setPriority(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
                {[['urgent', 'Urgent'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>Project</div>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
                <option value="">No Project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {projectSections.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>Section</div>
                <select value={sectionId} onChange={e => setSectionId(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
                  <option value="">No Section</option>
                  {projectSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>Assignee</div>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.alias ?? u.username}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>Est. Hours</div>
              <input type="number" min={0} step={0.5} value={estimatedHours} onChange={e => setEstimatedHours(e.target.value)} placeholder="e.g. 4" style={fieldStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>Start Date</div>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>Due Date</div>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderTop: `1px solid ${C.separator}`, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${C.separator}`, background: C.lgBg, color: C.textMuted, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving || !title.trim()} style={{
            padding: '7px 16px', borderRadius: 8, border: 'none', background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            opacity: !title.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {saving ? <><Loader size={12} /> Creating…</> : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}
