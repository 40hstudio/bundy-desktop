import { ArrowLeft, Loader } from 'lucide-react'
import type { ApiConfig, Auth } from '../../types'
import { C } from '../../theme'
import DocumentEditor from './DocumentEditor'
import { iconBtn24 } from './reportShared'
import type { DocDetail } from './useReportDocument'

export type ReportEditorProps = {
  openDoc: DocDetail
  docTitle: string
  docContent: string
  docSaving: boolean
  docLoading: boolean
  config: ApiConfig
  auth: Auth
  selection: { projectId: string } | null

  onTitleChange: (title: string) => void
  onContentChange: (content: string) => void
  onClose: () => void
}

/**
 * Document-editor pane for the Reports tab. The rich-text editor
 * (DocumentEditor) owns its own History toolbar button + slide-out
 * EditHistoryPanel (v1.5.2206) — the old static "Edit History" sidebar
 * was removed in v1.5.2207 to avoid two competing surfaces showing the
 * same data.
 */
export function ReportEditor({
  openDoc, docTitle, docContent, docSaving, docLoading,
  config, auth, selection,
  onTitleChange, onContentChange, onClose,
}: ReportEditorProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Editor toolbar */}
      <div style={{
        padding: '8px 16px', borderBottom: `1px solid ${C.separator}`,
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: C.lgBg,
      }}>
        <button onClick={onClose} style={{ ...iconBtn24, color: C.textMuted }}
          onMouseEnter={e => { e.currentTarget.style.color = C.text }}
          onMouseLeave={e => { e.currentTarget.style.color = C.textMuted }}>
          <ArrowLeft size={16} />
        </button>
        <input value={docTitle}
          onChange={e => onTitleChange(e.target.value)}
          style={{
            flex: 1, fontSize: 14, fontWeight: 600, background: 'transparent',
            border: 'none', outline: 'none', color: C.text, padding: '4px 0',
          }}
          placeholder="Document title..." />
        <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>
          {docSaving ? 'Saving...' : 'Saved'}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {docLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, flex: 1 }}>
            <Loader size={20} style={{ color: C.textMuted, animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <DocumentEditor
            key={openDoc.id}
            content={docContent}
            onUpdate={onContentChange}
            apiBase={config.apiBase}
            token={config.token}
            projectId={selection?.projectId}
            documentId={openDoc.id}
            user={{ id: auth.userId, name: auth.username, avatar: auth.avatarUrl }}
          />
        )}
      </div>
    </div>
  )
}
