/**
 * v1.5.2208 — top-level overlay that surfaces every in-flight upload.
 *
 * Renders a stacked list of toasts (one per active upload) at the bottom-
 * right of the app. Each toast shows the filename, current %, and a
 * progress bar. Auto-dismisses on success after a short delay (handled
 * by the store). Errors stick around until the user dismisses them so
 * the failure isn't silent.
 */

import { useUploadProgressStore } from '../../stores/uploadProgressStore'
import { CheckCircle2, AlertCircle, X, Loader, Upload } from 'lucide-react'
import { C } from '../../theme'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function UploadProgressOverlay() {
  const uploads = useUploadProgressStore((s) => s.uploads)
  const remove = useUploadProgressStore((s) => s.remove)

  const list = Object.values(uploads).sort((a, b) => b.startedAt - a.startedAt)
  if (list.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
      maxWidth: 360, pointerEvents: 'none',
    }}>
      {list.map((u) => {
        const isDone = u.status === 'success'
        const isErr = u.status === 'error'
        return (
          <div key={u.id}
            style={{
              pointerEvents: 'auto',
              background: C.bgFloating,
              border: `1px solid ${isErr ? '#ef4444' : isDone ? '#22c55e' : C.separator}`,
              borderRadius: 10,
              padding: '10px 12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              minWidth: 280,
              fontFamily: 'inherit',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {isErr
                ? <AlertCircle size={14} color="#ef4444" />
                : isDone
                  ? <CheckCircle2 size={14} color="#22c55e" />
                  : <Loader size={14} style={{ color: C.accent, animation: 'spin 1s linear infinite' }} />}
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.name}
              </span>
              {(isErr || isDone) && (
                <button onClick={() => remove(u.id)}
                  title="Dismiss"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: C.textMuted, padding: 2, display: 'flex',
                  }}>
                  <X size={12} />
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textMuted }}>
              <Upload size={11} />
              <span style={{ flex: 1 }}>
                {isErr
                  ? (u.error ?? 'Upload failed')
                  : isDone
                    ? 'Uploaded'
                    : `${formatSize(u.loaded)} / ${formatSize(u.total)} · ${u.percent}%`}
              </span>
              <span style={{ fontWeight: 600, color: isErr ? '#ef4444' : isDone ? '#22c55e' : C.accent }}>
                {isErr ? '!' : isDone ? '✓' : `${u.percent}%`}
              </span>
            </div>
            <div style={{
              marginTop: 6, height: 4, borderRadius: 2,
              background: C.bgInput, overflow: 'hidden',
            }}>
              <div style={{
                width: `${isErr ? 100 : u.percent}%`,
                height: '100%',
                background: isErr ? '#ef4444' : isDone ? '#22c55e' : C.accent,
                transition: 'width 0.15s ease-out',
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
