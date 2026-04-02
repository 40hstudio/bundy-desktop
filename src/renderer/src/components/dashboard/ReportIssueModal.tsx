import { useState } from 'react'

interface Props {
  onClose: () => void
}

export function ReportIssueModal({ onClose }: Props): JSX.Element {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '16px'
      }}
    >
      <div
        className="glass-lg"
        style={{
          width: '100%',
          maxWidth: '340px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: '13px' }}>🐛 Report an Issue</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '14px' }}
          >✕</button>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>✅</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Report sent. Thank you!</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Describe what happened or what went wrong. App version and system info will be included automatically.
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What happened? What were you doing when the issue occurred?"
              rows={5}
              className="glass-inset"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '12px',
                color: 'var(--text)',
                resize: 'none',
                boxSizing: 'border-box',
                lineHeight: '1.5'
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="neu-raised"
                onClick={onClose}
                style={{ flex: 1, padding: '8px', fontSize: '12px', border: 'none', cursor: 'pointer' }}
              >Cancel</button>
              <button
                className="neu-raised"
                onClick={async () => {
                  if (!note.trim()) return
                  setSubmitting(true)
                  try {
                    await window.electronAPI.sendCrashReport(note.trim())
                    setSent(true)
                  } catch { /* ignore */ }
                  setSubmitting(false)
                }}
                disabled={!note.trim() || submitting}
                style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--accent)', border: 'none', cursor: 'pointer' }}
              >{submitting ? '…' : 'Send Report'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
