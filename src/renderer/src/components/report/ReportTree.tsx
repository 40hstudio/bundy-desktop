import {
  Plus, ChevronRight, ChevronDown, Building2, Briefcase,
  MoreHorizontal, Trash2, Clock, Loader,
} from 'lucide-react'
import { C } from '../../theme'
import { iconBtn24, iconBtnSmall, InlineInput, ContextMenu } from './reportShared'
import type { TreeClient, TreeSelection } from './useReportTree'
import type { SearchHit } from './useReportSearch'

const SIDEBAR_W = 240

export type ReportTreeProps = {
  // Auth (for admin-only recycle-bin button)
  authRole: string

  // Tree state from useReportTree
  clients: TreeClient[]
  expanded: Record<string, boolean>
  selection: TreeSelection | null
  loading: boolean
  toggleExpand: (clientId: string) => void
  setSelection: (s: TreeSelection | null) => void

  // Search state from useReportSearch
  searchTerm: string
  setSearchTerm: (s: string) => void
  searchHits: SearchHit[] | null
  onSearchHitOpen: (hit: SearchHit) => void

  // Inline-editing state owned by parent (still inline because it's
  // shared with the content-area rename flows)
  editingId: string | null
  setEditingId: (id: string | null) => void
  editingValue: string
  setEditingValue: (v: string) => void
  menuId: string | null
  setMenuId: (id: string | null) => void

  // Activity log + recycle bin overlay openers (state lives in hooks, but
  // their setters + initial loaders are passed in)
  onOpenActivityLog: () => void
  onOpenRecycleBin: () => void

  // CRUD handlers — stay in parent because they touch the broader
  // contents/selection state.
  addClient: () => void
  addProject: (clientId: string) => void
  renameClient: (clientId: string, name: string) => void
  renameProject: (clientId: string, projectId: string, name: string) => void
  onConfirmDelete: (payload: { name: string; action: () => void }) => void
  deleteClient: (clientId: string) => void
  deleteProject: (clientId: string, projectId: string) => void

  // Cross-project drag-and-drop. The active drop target id is owned by
  // the parent so visual feedback can sync with content-area drag state.
  draggingItemId: string | null
  treeDropTargetId: string | null
  setTreeDropTargetId: (id: string | null) => void
  onProjectDrop: (clientId: string, projectId: string) => void
}

export function ReportTree({
  authRole,
  clients, expanded, selection, loading, toggleExpand, setSelection,
  searchTerm, setSearchTerm, searchHits, onSearchHitOpen,
  editingId, setEditingId, editingValue, setEditingValue, menuId, setMenuId,
  onOpenActivityLog, onOpenRecycleBin,
  addClient, addProject, renameClient, renameProject,
  onConfirmDelete, deleteClient, deleteProject,
  draggingItemId, treeDropTargetId, setTreeDropTargetId, onProjectDrop,
}: ReportTreeProps) {
  return (
    <div style={{
      width: SIDEBAR_W, flexShrink: 0,
      borderRight: `1px solid ${C.separator}`,
      background: 'rgba(22, 22, 22, 0.5)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px 10px', borderBottom: `1px solid ${C.separator}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: 0.2 }}>Box</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button onClick={onOpenActivityLog} title="Activity Log" style={{ ...iconBtn24, color: C.textMuted }}
            onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
            <Clock size={14} />
          </button>
          {authRole === 'admin' && (
            <button onClick={onOpenRecycleBin} title="Recycle Bin" style={{ ...iconBtn24, color: C.textMuted }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
              <Trash2 size={14} />
            </button>
          )}
          <button onClick={addClient} title="Add Playground" style={{ ...iconBtn24, color: C.textMuted }}
            onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Search bar (P3.25) */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.separator}` }}>
        <input
          type="text"
          placeholder="Search…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%', padding: '6px 10px', fontSize: 12, color: C.text,
            background: C.bgHover, border: `1px solid ${(C as unknown as { border?: string }).border ?? C.separator}`, borderRadius: 6,
            outline: 'none',
          }}
        />
        {searchHits && searchHits.length > 0 && (
          <div style={{
            marginTop: 6, maxHeight: 240, overflowY: 'auto',
            background: (C as unknown as { bgSidebar?: string }).bgSidebar ?? C.bgInput, border: `1px solid ${(C as unknown as { border?: string }).border ?? C.separator}`, borderRadius: 6,
          }}>
            {searchHits.map((h) => (
              <button
                key={`${h.kind}:${h.id}`}
                onClick={() => { onSearchHitOpen(h); setSearchTerm('') }}
                style={{
                  width: '100%', textAlign: 'left', padding: '6px 10px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: 11, color: C.text, display: 'flex', flexDirection: 'column', gap: 2,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = C.bgHover }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 9, color: C.textMuted, textTransform: 'uppercase' }}>{h.kind}</span>
                  <span style={{ fontWeight: 500 }}>{h.label}</span>
                </span>
                {h.kind === 'document' && h.snippet && (
                  <span style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.3 }}>{h.snippet}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Client / Project tree */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {loading && (
          <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
            <Loader size={20} style={{ color: C.textMuted, animation: 'spin 1s linear infinite' }} />
          </div>
        )}

        {!loading && clients.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: C.textMuted }}>
            <Building2 size={28} strokeWidth={1.2} style={{ opacity: 0.35, marginBottom: 8 }} />
            <p style={{ fontSize: 12, lineHeight: 1.5 }}>No playgrounds yet</p>
            <button onClick={addClient} style={{
              marginTop: 10, padding: '5px 12px', borderRadius: 6, border: 'none',
              background: C.accent, color: '#fff', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <Plus size={12} /> Add Playground
            </button>
          </div>
        )}

        {clients.map(client => {
          const isExpanded = expanded[client.id] ?? false
          return (
            <div key={client.id}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 8px', margin: '0 6px', borderRadius: 6,
                cursor: 'pointer', position: 'relative',
                background: menuId === client.id ? C.bgHover : 'transparent',
                transition: 'background 0.1s',
              }}
                onClick={() => toggleExpand(client.id)}
                onMouseEnter={e => { if (menuId !== client.id) e.currentTarget.style.background = C.bgHover }}
                onMouseLeave={e => { if (menuId !== client.id) e.currentTarget.style.background = 'transparent' }}>
                <span style={{ color: C.textMuted, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <Building2 size={14} style={{ color: C.textMuted, flexShrink: 0 }} />
                {editingId === client.id ? (
                  <InlineInput value={editingValue} onChange={setEditingValue}
                    onConfirm={() => renameClient(client.id, editingValue)} onCancel={() => setEditingId(null)} />
                ) : (
                  <span onDoubleClick={e => { e.stopPropagation(); setEditingId(client.id); setEditingValue(client.name) }}
                    style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '24px' }}>
                    {client.name}
                  </span>
                )}
                {editingId !== client.id && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    <button onClick={e => { e.stopPropagation(); addProject(client.id) }} title="Add Project"
                      style={iconBtnSmall} onMouseEnter={e => { e.currentTarget.style.color = C.text }}
                      onMouseLeave={e => { e.currentTarget.style.color = C.textMuted }}>
                      <Plus size={13} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); setMenuId(menuId === client.id ? null : client.id) }}
                      style={iconBtnSmall} onMouseEnter={e => { e.currentTarget.style.color = C.text }}
                      onMouseLeave={e => { e.currentTarget.style.color = C.textMuted }}>
                      <MoreHorizontal size={13} />
                    </button>
                  </div>
                )}
                {menuId === client.id && (
                  <ContextMenu
                    onRename={() => { setEditingId(client.id); setEditingValue(client.name); setMenuId(null) }}
                    onDelete={() => { setMenuId(null); onConfirmDelete({ name: client.name, action: () => deleteClient(client.id) }) }} onClose={() => setMenuId(null)} />
                )}
              </div>

              {isExpanded && (
                <div style={{ marginLeft: 18 }}>
                  {client.projects.length === 0 && (
                    <div style={{ padding: '4px 8px 4px 22px', fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>No projects</div>
                  )}
                  {client.projects.map(project => {
                    const isSelected = selection?.projectId === project.id
                    const isDropTarget = treeDropTargetId === project.id
                    return (
                      <div key={project.id}
                        onClick={() => setSelection({ clientId: client.id, projectId: project.id })}
                        onDragOver={e => {
                          if (!draggingItemId) return
                          e.preventDefault(); e.stopPropagation()
                          e.dataTransfer.dropEffect = 'move'
                          if (treeDropTargetId !== project.id) setTreeDropTargetId(project.id)
                        }}
                        onDragLeave={e => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            if (treeDropTargetId === project.id) setTreeDropTargetId(null)
                          }
                        }}
                        onDrop={e => {
                          if (!draggingItemId) return
                          e.preventDefault(); e.stopPropagation()
                          setTreeDropTargetId(null)
                          onProjectDrop(client.id, project.id)
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '4px 8px 4px 22px', margin: '0 6px', borderRadius: 6,
                          cursor: 'pointer', position: 'relative',
                          background: isDropTarget ? 'rgba(59,130,246,0.22)' : isSelected ? (C as unknown as { sidebarActive?: string }).sidebarActive ?? C.bgActive : menuId === project.id ? C.bgHover : 'transparent',
                          outline: isDropTarget ? `1px dashed rgba(59,130,246,0.6)` : 'none',
                          outlineOffset: -2,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { if (!isSelected && menuId !== project.id && !isDropTarget) e.currentTarget.style.background = C.bgHover }}
                        onMouseLeave={e => { if (!isSelected && menuId !== project.id && !isDropTarget) e.currentTarget.style.background = 'transparent' }}>
                        <Briefcase size={13} style={{ color: isSelected ? C.accent : C.textMuted, flexShrink: 0 }} />
                        {editingId === project.id ? (
                          <InlineInput value={editingValue} onChange={setEditingValue}
                            onConfirm={() => renameProject(client.id, project.id, editingValue)} onCancel={() => setEditingId(null)} />
                        ) : (
                          <span onDoubleClick={() => { setEditingId(project.id); setEditingValue(project.name) }}
                            style={{ flex: 1, fontSize: 12, fontWeight: isSelected ? 600 : 400, color: isSelected ? C.text : C.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '24px' }}>
                            {project.name}
                          </span>
                        )}
                        {editingId !== project.id && (
                          <button onClick={e => { e.stopPropagation(); setMenuId(menuId === project.id ? null : project.id) }}
                            style={{ ...iconBtnSmall, opacity: isSelected || menuId === project.id ? 1 : 0, transition: 'opacity 0.1s' }}
                            onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.opacity = '1' }}
                            onMouseLeave={e => { e.currentTarget.style.color = C.textMuted }}>
                            <MoreHorizontal size={13} />
                          </button>
                        )}
                        {menuId === project.id && (
                          <ContextMenu
                            onRename={() => { setEditingId(project.id); setEditingValue(project.name); setMenuId(null) }}
                            onDelete={() => { setMenuId(null); onConfirmDelete({ name: project.name, action: () => deleteProject(client.id, project.id) }) }} onClose={() => setMenuId(null)} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
