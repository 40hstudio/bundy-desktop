import React, { useState, useEffect, useRef } from 'react'
import { Edit2, LogOut, RefreshCw } from 'lucide-react'
import { ApiConfig, Auth } from '../../types'
import { C, card, neu } from '../../theme'
import Avatar from '../shared/Avatar'
import { useAppStore } from '../../store'
import { apiFetch } from '../../utils/api'

const DEMO_MODE = __DEMO_MODE__

function PermRow({ label, granted, onFix }: { label: string; granted: boolean; onFix: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: granted ? C.success : C.danger }} />
        <span style={{ fontSize: 13, color: C.text }}>{label}</span>
      </div>
      {!granted && (
        <button onClick={onFix} style={{ fontSize: 11, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          Open Settings →
        </button>
      )}
    </div>
  )
}

export default function SettingsPanel({ auth, config, onLogout }: { auth: Auth; config: ApiConfig; onLogout: () => void }) {
  const perms = useAppStore((s) => s.permissions)
  const appVersion = useAppStore((s) => s.appVersion)
  const updateVersion = useAppStore((s) => s.updateVersion)
  const downloadPercent = useAppStore((s) => s.downloadPercent)
  const updateDownloaded = useAppStore((s) => s.updateDownloaded)
  const [profile, setProfile] = useState<{ alias: string; email: string; phone: string; userStatus: string; avatarUrl: string | null } | null>(null)
  const [editAlias, setEditAlias] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const avatarFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (DEMO_MODE) {
      setProfile({ alias: 'John Doe', email: 'john.doe@company.com', phone: '+1 (555) 123-4567', userStatus: 'Working on dashboard redesign', avatarUrl: null })
      setEditAlias('John Doe')
      setEditEmail('john.doe@company.com')
      setEditPhone('+1 (555) 123-4567')
      setEditStatus('Working on dashboard redesign')
      return
    }
    apiFetch('/api/user/profile')
      .then(r => r.json()).then((d: { user: typeof profile }) => {
      if (d.user) {
        setProfile(d.user)
        setEditAlias(d.user?.alias ?? '')
        setEditEmail(d.user?.email ?? '')
        setEditPhone(d.user?.phone ?? '')
        setEditStatus(d.user?.userStatus ?? '')
      }
    }).catch(() => {})
  }, [config])

  async function checkPerms() {
    const p = await window.electronAPI.checkPermissions()
    useAppStore.getState().setPermissions(p)
  }

  async function saveProfile() {
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await apiFetch('/api/user/profile', {
        method: 'PATCH',
        body: JSON.stringify({ alias: editAlias, email: editEmail, phone: editPhone, userStatus: editStatus }),
      })
      if (!res.ok) throw new Error('Failed')
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2000)
    } catch { setSaveMsg('Failed to save') } finally { setSaving(false) }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    setSaving(true)
    setSaveMsg('Uploading…')
    try {
      const res = await apiFetch('/api/user/avatar', {
        method: 'POST',
        body: form,
      })
      const d = await res.json() as { user?: { avatarUrl: string } }
      if (d.user?.avatarUrl) {
        setProfile(p => p ? { ...p, avatarUrl: d.user!.avatarUrl } : p)
        setSaveMsg('Avatar updated!')
        setTimeout(() => setSaveMsg(''), 2000)
      } else {
        setSaveMsg('Upload failed')
      }
    } catch { setSaveMsg('Upload failed') } finally { setSaving(false) }
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>Settings</div>

      {/* Profile */}
      <div style={{ ...card() }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.textMuted, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.8 }}>Profile</div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar url={profile?.avatarUrl} name={profile?.alias ?? auth.username} size={60} />
            <button onClick={() => avatarFileRef.current?.click()}
              title="Change avatar"
              style={{
                position: 'absolute', bottom: 0, right: 0, width: 20, height: 20,
                borderRadius: '50%', background: C.accent, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <Edit2 size={10} color="#fff" />
            </button>
            <input ref={avatarFileRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{auth.username}</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>{auth.role}</div>
          </div>
          <button onClick={onLogout}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', ...neu(), border: 'none', cursor: 'pointer', color: C.danger, fontWeight: 600, fontSize: 13 }}>
            <LogOut size={15} /> Log Out
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Display Name', value: editAlias, set: setEditAlias, placeholder: 'Your display name' },
            { label: 'Email', value: editEmail, set: setEditEmail, placeholder: 'email@example.com' },
            { label: 'Phone', value: editPhone, set: setEditPhone, placeholder: '+1234567890' },
            { label: 'Status', value: editStatus, set: setEditStatus, placeholder: 'What are you working on?' },
          ].map(({ label, value, set, placeholder }) => (
            <div key={label}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 4 }}>{label}</div>
              <input
                value={value}
                onChange={e => set(e.target.value)}
                placeholder={placeholder}
                style={{ width: '100%', ...neu(true), padding: '8px 12px', fontSize: 13, color: C.text, border: 'none', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <button onClick={saveProfile} disabled={saving}
              style={{ padding: '8px 20px', ...neu(), border: 'none', background: C.accent, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', borderRadius: 8 }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            {saveMsg && <span style={{ fontSize: 12, color: saveMsg.includes('Failed') ? C.danger : C.success }}>{saveMsg}</span>}
          </div>
        </div>
      </div>

      {/* Permissions */}
      <div style={{ ...card() }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Permissions</div>
          <button onClick={checkPerms} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer' }}><RefreshCw size={13} /></button>
        </div>
        {!perms ? (
          <div style={{ color: C.textMuted, fontSize: 12 }}>Checking permissions…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PermRow label="Screen Recording" granted={perms.screen === 'granted'} onFix={() => window.electronAPI.openScreenRecordingSettings()} />
            <PermRow label="Accessibility" granted={perms.accessibility} onFix={() => window.electronAPI.openAccessibilitySettings()} />
          </div>
        )}
      </div>

      {/* About / Updates */}
      <div style={{ ...card() }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>About</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Bundy Desktop</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>v{appVersion || '…'}</div>
          </div>
          {updateDownloaded ? (
            <button onClick={() => window.electronAPI.installUpdate()}
              style={{ padding: '8px 14px', ...neu(), border: 'none', color: C.success, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              Restart to Update v{updateVersion}
            </button>
          ) : updateVersion ? (
            <div style={{ fontSize: 12, color: C.accent }}>Downloading v{updateVersion}… {downloadPercent ?? 0}%</div>
          ) : (
            <button onClick={() => window.electronAPI.checkForUpdates()}
              style={{ padding: '8px 14px', ...neu(), border: 'none', color: C.textMuted, fontSize: 12, cursor: 'pointer' }}>
              Check for Updates
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
