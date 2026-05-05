/**
 * EditHistoryPanel — slides out from the document editor, lists every
 * recorded edit, and renders a per-edit word-level diff between the
 * before / after snapshot pair fetched from the server.
 *
 * v1.5.2206 — addresses issues #10 (see what changed) + #12 (highlight
 * the changes). The schema already had `contentSnapshot` on
 * `ReportDocEdit`; the server-side write was already populating it on
 * every PATCH that changed content. The pieces missing were:
 *  - server endpoint to expose the snapshot pair (now: /diff)
 *  - this panel to render it
 *  - a `diff` library to compute word-level changes
 */

import { useEffect, useState } from 'react'
import { History, X, RotateCcw, Loader } from 'lucide-react'
import { diffWords } from 'diff'
import { C } from '../../theme'
import { Avatar } from '../shared/Avatar'
import { apiFetch } from '../../api/client'
import { formatTime } from '../../utils/format'

type EditMeta = {
  id: string
  summary: string | null
  createdAt: string
  user: { id: string; username: string; alias: string | null; avatarUrl: string | null }
}

type DiffPayload = {
  editId: string
  createdAt: string
  thisSnapshot: { content: string; title: string }
  nextSnapshot: { content: string; title: string }
}

// Strip HTML tags + collapse whitespace for diffing prose. Tiptap stores
// HTML; users care about word changes, not which CSS class wraps them.
function htmlToPlainText(html: string): string {
  if (!html) return ''
  // Replace block-level boundaries with double-newline so paragraphs survive.
  const withBreaks = html
    .replace(/<\/(p|div|li|h\d|tr|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>(\n)?/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return withBreaks
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function EditHistoryPanel({
  documentId,
  edits,
  onClose,
  onRevert,
}: {
  documentId: string
  edits: EditMeta[]
  onClose: () => void
  onRevert?: (editId: string) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(edits[0]?.id ?? null)
  const [payload, setPayload] = useState<DiffPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setPayload(null)
    apiFetch<DiffPayload>(`/api/report/documents/${documentId}/edits/${selectedId}/diff`)
      .then((data) => { if (!cancelled) setPayload(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [documentId, selectedId])

  const wordDiff = payload
    ? diffWords(htmlToPlainText(payload.thisSnapshot.content), htmlToPlainText(payload.nextSnapshot.content))
    : null

  const titleChanged = payload && payload.thisSnapshot.title !== payload.nextSnapshot.title

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 460,
      background: C.lgBg, borderLeft: `1px solid ${C.separator}`,
      display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 24px rgba(0,0,0,0.25)',
      zIndex: 30,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: `1px solid ${C.separator}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <History size={16} style={{ color: C.accent }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Edit history</span>
          <span style={{ fontSize: 12, color: C.textMuted }}>· {edits.length}</span>
        </div>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, display: 'flex' }}>
          <X size={16} />
        </button>
      </div>

      {/* Two-pane: list on left, diff on right */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Edit list */}
        <div style={{ width: 180, borderRight: `1px solid ${C.separator}`, overflowY: 'auto', flexShrink: 0 }}>
          {edits.length === 0 ? (
            <div style={{ padding: 16, color: C.textMuted, fontSize: 12 }}>No edits yet.</div>
          ) : edits.map((e) => {
            const selected = e.id === selectedId
            return (
              <div key={e.id}
                onClick={() => setSelectedId(e.id)}
                style={{
                  padding: '8px 12px', borderBottom: `1px solid ${C.separator}`,
                  cursor: 'pointer',
                  background: selected ? `${C.accent}18` : 'transparent',
                  borderLeft: selected ? `3px solid ${C.accent}` : '3px solid transparent',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Avatar url={e.user.avatarUrl} name={e.user.alias ?? e.user.username} size={16} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.user.alias ?? e.user.username}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>{formatTime(e.createdAt)}</div>
                {e.summary && (
                  <div style={{ fontSize: 11, color: C.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.summary}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Diff pane */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, fontSize: 13, lineHeight: 1.6, color: C.text }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.textMuted }}>
              <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> loading…
            </div>
          )}
          {error && <div style={{ color: '#ef4444' }}>error: {error}</div>}
          {!loading && !error && payload && wordDiff && (
            <>
              {titleChanged && (
                <div style={{
                  marginBottom: 12, padding: 8, borderRadius: 4,
                  background: `${C.accent}10`, fontSize: 12, color: C.textSecondary,
                }}>
                  <div style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Title</div>
                  <span style={{ background: 'rgba(239,68,68,0.18)', color: '#fca5a5', textDecoration: 'line-through', padding: '0 3px', borderRadius: 2 }}>
                    {payload.thisSnapshot.title}
                  </span>
                  {' → '}
                  <span style={{ background: 'rgba(34,197,94,0.18)', color: '#86efac', padding: '0 3px', borderRadius: 2 }}>
                    {payload.nextSnapshot.title}
                  </span>
                </div>
              )}
              {wordDiff.length === 0 || (wordDiff.length === 1 && !wordDiff[0].added && !wordDiff[0].removed) ? (
                <div style={{ color: C.textMuted, fontStyle: 'italic' }}>
                  No content changes in this edit.
                </div>
              ) : (
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {wordDiff.map((part, idx) => {
                    if (part.added) return (
                      <span key={idx} style={{ background: 'rgba(34,197,94,0.18)', color: '#86efac', padding: '0 1px', borderRadius: 2 }}>
                        {part.value}
                      </span>
                    )
                    if (part.removed) return (
                      <span key={idx} style={{ background: 'rgba(239,68,68,0.18)', color: '#fca5a5', textDecoration: 'line-through', padding: '0 1px', borderRadius: 2 }}>
                        {part.value}
                      </span>
                    )
                    return <span key={idx}>{part.value}</span>
                  })}
                </div>
              )}
              {onRevert && (
                <button
                  onClick={() => { if (selectedId) onRevert(selectedId) }}
                  style={{
                    marginTop: 16, display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.separator}`,
                    background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 12,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.bgHover }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                  <RotateCcw size={12} /> Revert to before this edit
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
