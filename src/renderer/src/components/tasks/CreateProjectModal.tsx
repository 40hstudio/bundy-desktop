import { useState } from 'react'
import { X, Loader } from 'lucide-react'
import { ApiConfig } from '../../types'
import { C, neu } from '../../theme'

const DEMO_MODE = false

const PRESET_COLORS = ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#0984e3', '#d63031', '#e84393', '#00cec9', '#636e72', '#2d3436']

export default function CreateProjectModal({ config, onClose, onCreated }: {
  config: ApiConfig
  onClose: () => void
  onCreated: () => void
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
      const res = await fetch(`${config.apiBase}/api/tasks/projects`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), clientName: clientName.trim() || null, color, description: description.trim() || null }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d?.error ?? `HTTP ${res.status}`) }
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally { setSaving(false) }
  }

  const fieldStyle: React.CSSProperties = { ...neu(true), padding: '7px 10px', fontSize: 12, color: C.text, border: 'none', outline: 'none', width: '100%', fontFamily: 'inherit' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }}>
      <div style={{ width: 400, background: C.lgBg, borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${C.separator}` }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.text }}>New Project</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}><X size={16} /></button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ fontSize: 12, color: C.danger, fontWeight: 600 }}>{error}</div>}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>Client Name</div>
            <input value={clientName} onChange={e => setClientName(e.target.value)} autoFocus placeholder="e.g. Acme Corp" style={fieldStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>Project Name *</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Website Redesign" style={fieldStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>Description</div>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Optional…" style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>Color</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: color === c ? `3px solid ${C.text}` : `2px solid transparent`, cursor: 'pointer', boxSizing: 'border-box', padding: 0 }}
                />
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderTop: `1px solid ${C.separator}`, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${C.separator}`, background: C.lgBg, color: C.textMuted, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving || !name.trim()} style={{
            padding: '7px 16px', borderRadius: 8, border: 'none', background: color, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            opacity: !name.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {saving ? <><Loader size={12} /> Creating…</> : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
