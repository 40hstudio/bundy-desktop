import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronRight, ChevronDown, FolderOpen, Building2, Briefcase,
  MoreHorizontal, Trash2, Pencil, FileText, Upload, Folder, File,
  ArrowLeft, Loader, Download, User, Grid, List, Columns, Image,
  Link2, X, Clock, RotateCcw, AlertCircle, Globe, ExternalLink,
} from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig, Auth } from '../../types'
import { AuthImage } from '../messages/Attachments'
import FeedbackViewer from './FeedbackViewer'
import {
  iconBtn24, iconBtnSmall, iconBtnTiny, toolbarBtn, rowStyle, menuItemStyle,
  isImageFile, isVideoFile, isAudioFile, isPdfFile, isPreviewableFile,
  FileThumbnail, fileTypeAccent,
  InlineInput, ContextMenu, FileMenu,
  actionColor, actionLabel, actionTextColor, actionTargetIcon,
  formatTimeDetailed, recycleTypeColor, recycleTypeIcon,
} from './reportShared'
import { useActivityLog } from './useActivityLog'
import { useRecycleBin } from './useRecycleBin'
import { useReportMembers } from './useReportMembers'
import { useReportTree } from './useReportTree'
import { useReportSearch } from './useReportSearch'
import { useReportDrag } from './useReportDrag'
import { useReportMultiSelect } from './useReportMultiSelect'
import { tryDirectR2Upload } from '../../api/r2Upload'
import { xhrUploadJson } from '../../api/xhrUpload'
import { trackUpload } from '../../stores/uploadProgressStore'
import { useReportDocument } from './useReportDocument'
import { track } from '../../utils/eventLogger'
import { ReportTree } from './ReportTree'
import { ReportEditor } from './ReportEditor'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RFolder {
  id: string; name: string; parentId: string | null; order: number; createdAt: string
  _count: { children: number; documents: number; files: number }
}
interface RDocument {
  id: string; title: string; folderId: string | null; order: number
  createdAt: string; updatedAt: string
  creator: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  edits: { id: string; summary: string | null; createdAt: string; user: { id: string; username: string; alias: string | null; avatarUrl: string | null } }[]
}
interface RFile {
  id: string; name: string; url: string; mimeType: string | null; size: number
  folderId: string | null; createdAt: string
  uploader: { id: string; username: string; alias: string | null; avatarUrl: string | null }
}

interface RLink {
  id: string; url: string; title: string; folderId: string | null; order: number
  createdAt: string; updatedAt: string
  creator: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  _count: { pins: number }
}

type ViewMode = 'icons' | 'list' | 'columns' | 'gallery'

interface ColumnEntry {
  parentId: string | null
  folders: RFolder[]
  documents: RDocument[]
  files: RFile[]
  links: RLink[]
  selectedId: string | null
}

interface RecycleBinItem {
  id: string; type: string; name: string; deletedAt: string; expiresAt: string
  expired: boolean; parent?: string
  parentItemId?: string; parentItemType?: string
  url?: string; mimeType?: string | null; size?: number
  deletedBy: { id: string; username: string; alias: string | null; avatarUrl: string | null } | null
}

// P3.25 — search results across the report tree.
type SearchHit =
  | { kind: 'client'; id: string; label: string; clientId: string }
  | { kind: 'project'; id: string; label: string; clientId: string }
  | { kind: 'folder'; id: string; label: string; projectId: string }
  | { kind: 'document'; id: string; label: string; projectId: string; folderId: string | null; snippet?: string }
  | { kind: 'file'; id: string; label: string; projectId: string; folderId: string | null }
  | { kind: 'link'; id: string; label: string; projectId: string; folderId: string | null }

// ─── Constants ────────────────────────────────────────────────────────────────

// v1.5.2208 — bumped from 50MB to 500MB. R2 multipart cap is 5GB; the
// signed-upload route streams direct-to-R2 so we don't pay for the
// bandwidth twice.
const MAX_FILE_SIZE = 500 * 1024 * 1024
const VIEW_MODE_KEY = 'report-view-mode'

// ─── Types for pending report navigation ──────────────────────────────────────

interface PendingReport {
  clientId: string
  projectId: string
  itemType?: string | null
  itemId?: string | null
}

// ─── ReportPanel ──────────────────────────────────────────────────────────────

export default function ReportPanel({ config, auth, pendingReport, onPendingReportHandled }: {
  config: ApiConfig
  auth: Auth
  pendingReport?: PendingReport | null
  onPendingReportHandled?: () => void
}) {
  // ── API helper (defined first; hooks below depend on it) ────────────────
  const apiFetch = useCallback(async (path: string, opts?: RequestInit) => {
    const res = await fetch(`${config.apiBase}${path}`, {
      ...opts,
      headers: {
        ...(opts?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${config.token}`,
        ...opts?.headers,
      },
    })
    return res
  }, [config])

  // Sidebar tree (clients/projects/expand/selection) lives in a hook —
  // see useReportTree.ts. Same identifiers preserved via destructure.
  const {
    clients, setClients,
    expanded, setExpanded,
    selection, setSelection,
    loading,
    load: loadClients,
    toggleExpand,
  } = useReportTree(apiFetch)

  // inline editing
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ type: 'folder' | 'document' | 'file' | 'link', id: string, x: number, y: number, name: string, item?: any } | null>(null)

  // content state
  const [folders, setFolders] = useState<RFolder[]>([])
  const [documents, setDocuments] = useState<RDocument[]>([])
  const [files, setFiles] = useState<RFile[]>([])
  const [links, setLinks] = useState<RLink[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState<{ id: string | null; name: string }[]>([])
  const [contentLoading, setContentLoading] = useState(false)
  // Surfaced when /contents returns non-2xx OR throws. Without this the folder
  // click looked silent — spinner cleared, view stayed on the old folder.
  const [contentError, setContentError] = useState<string | null>(null)

  // Document/link viewer state lives in useReportDocument. The parent
  // wires onDocumentSaved → patches its `documents` list with the
  // fresh title/updatedAt/edits the server returned.
  const {
    openDoc, setOpenDoc,
    openLinkId, setOpenLinkId,
    linkUrlInput, setLinkUrlInput,
    docLoading, docSaving, docTitle, docContent,
    openDocument,
    handleDocContentChange, handleDocTitleChange,
    closeIfOpen: closeDocIfOpen,
    closeDoc,
  } = useReportDocument(apiFetch, (doc) => {
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, title: doc.title, updatedAt: doc.updatedAt, edits: doc.edits } : d))
  })

  // file upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // view mode
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'icons' } catch { return 'icons' }
  })

  // drag/drop state + stateless handlers — see useReportDrag.ts. The drop
  // handlers (handleDrop / onFolderDrop / onColumnDrop) stay inline since
  // they need the parent's content state.
  const {
    dragOver,
    draggingItem, setDraggingItem,
    dropTargetId, setDropTargetId,
    dropColIdx, setDropColIdx,
    handleDragEnter, handleDragLeave, handleDragOver,
    onItemDragStart, onItemDragEnd,
    resetDragOver,
  } = useReportDrag()

  // share link
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Cross-project drop target highlighted in the tree (lives here so we
  // can clear it from drop handlers without prop-drilling further).
  const [treeDropTargetId, setTreeDropTargetId] = useState<string | null>(null)

  // column view
  const [subColumns, setSubColumns] = useState<ColumnEntry[]>([])
  const [col0Selected, setCol0Selected] = useState<string | null>(null)
  const [colPreview, setColPreview] = useState<RFile | null>(null)
  const columnsRef = useRef<HTMLDivElement>(null)

  // gallery view
  const [galleryIdx, setGalleryIdx] = useState(0)

  // search (P3.25) — debounced search + hits live in useReportSearch
  const {
    term: searchTerm, setTerm: setSearchTerm,
    hits: searchHits,
  } = useReportSearch(apiFetch)

  // lightbox
  const [lightboxFile, setLightboxFile] = useState<RFile | null>(null)

  // Activity Log + Recycle Bin + Members panels — extracted into hooks
  // (P1-1 follow-up). Renamed-in-place via destructuring so the rest of
  // this file's JSX keeps using the same identifiers.

  // Confirmation dialog
  const [confirmDelete, setConfirmDelete] = useState<{ name: string; action: () => void } | null>(null)

  // Multi-select state + Cmd-click + rubber-band — see useReportMultiSelect.
  const {
    selectedItems, setSelectedItems,
    rubberBand,
    contentAreaRef,
    isItemSelected, handleItemClick, onContentMouseDown,
  } = useReportMultiSelect({
    selectionId: selection?.projectId,
    folderId: currentFolderId,
    viewMode,
  })

  // Load clients on mount (the hook owns clients state; this just triggers it).
  useEffect(() => { loadClients() }, [loadClients])

  const handleSearchHitOpen = useCallback((hit: SearchHit) => {
    if (hit.kind === 'client') {
      setExpanded((prev) => ({ ...prev, [hit.clientId]: true }))
      return
    }
    if (hit.kind === 'project') {
      const client = clients.find((c) => c.id === hit.clientId)
      if (!client) return
      setExpanded((prev) => ({ ...prev, [hit.clientId]: true }))
      setSelection({ clientId: hit.clientId, projectId: hit.id })
      loadContents(hit.id, null)
      return
    }
    // folder / document / file / link — find owning client/project, then navigate.
    const project = clients.flatMap((c) => c.projects.map((p) => ({ ...p, clientId: c.id }))).find((p) => p.id === hit.projectId)
    if (!project) return
    setExpanded((prev) => ({ ...prev, [project.clientId]: true }))
    setSelection({ clientId: project.clientId, projectId: project.id })
    if (hit.kind === 'folder') {
      loadContents(project.id, hit.id)
    } else {
      loadContents(project.id, hit.folderId)
    }
  }, [clients])

  // SSE-driven refresh: react to `bundy-report-tree-update` events emitted
  // when any user creates / renames / moves / deletes a tree node. Replaces
  // the 5s polling we used to do here. We still keep a slow keepalive poll
  // (60s) as a safety net for missed events / SSE disconnects.
  useEffect(() => {
    const onTreeUpdate = () => { loadClients() }
    window.addEventListener('bundy-report-tree-update', onTreeUpdate)
    const keepalive = setInterval(loadClients, 60_000)
    return () => {
      window.removeEventListener('bundy-report-tree-update', onTreeUpdate)
      clearInterval(keepalive)
    }
  }, [loadClients])

  // ── Handle pending report deep-link ─────────────────────────────────────

  useEffect(() => {
    if (!pendingReport || loading || clients.length === 0) return

    const { clientId, projectId, itemType, itemId } = pendingReport
    onPendingReportHandled?.()

    // Find the client that owns this project
    const client = clients.find(c => c.id === clientId)
    if (!client) return
    const project = client.projects.find(p => p.id === projectId)
    if (!project) return

    // Expand client and select project
    setExpanded(prev => ({ ...prev, [clientId]: true }))
    setSelection({ clientId, projectId })

    // If there's a specific item, navigate after contents load
    if (itemType && itemId) {
      if (itemType === 'document') {
        // Open the document directly
        setTimeout(() => openDocument(itemId), 400)
      } else if (itemType === 'folder') {
        // Fetch the folder's ancestor path, then navigate into it
        ;(async () => {
          const res = await apiFetch(`/api/report/folders/${itemId}`)
          if (!res.ok) return
          const data = await res.json()
          const ancestors: { id: string; name: string }[] = data.ancestors || []
          const folder = data.folder as { id: string; name: string }
          // Build the full path including the target folder
          const fullPath = [...ancestors, { id: folder.id, name: folder.name }]
          setCurrentFolderId(folder.id)
          setFolderPath(fullPath.map(f => ({ id: f.id, name: f.name })))
          loadContents(projectId, folder.id)
        })()
      } else if (itemType === 'file') {
        // For files, we could navigate to its parent folder
        // For now just select the project — the file will be visible if at root
      }
    }
  }, [pendingReport, loading, clients]) // eslint-disable-line

  // ── Activity Log + Recycle Bin + Members hooks (P1-1 follow-up) ────────

  const {
    show: showActivityLog, setShow: setShowActivityLog,
    logs: activityLogs, loading: activityLoading,
    page: activityPage, total: activityTotal,
    load: loadActivityLogs,
  } = useActivityLog(apiFetch)

  const {
    show: showRecycleBin, setShow: setShowRecycleBin,
    items: recycleBinItems, loading: recycleBinLoading,
    expanded: recycleBinExpanded, setExpanded: setRecycleBinExpanded,
    load: loadRecycleBin,
    restore: restoreItem,
    permanentDelete: permanentDeleteItem,
  } = useRecycleBin(apiFetch, () => {
    loadClients() // refresh sidebar
    if (selection) loadContents(selection.projectId, currentFolderId)
  })

  const {
    show: showMembers, setShow: setShowMembers,
    members, allUsers, loading: membersLoading,
    load: loadMembers, add: addMember, remove: removeMember,
  } = useReportMembers(apiFetch)

  // ── Load project contents ────────────────────────────────────────────────

  const loadContents = useCallback(async (projectId: string, folderId: string | null) => {
    setContentLoading(true)
    setContentError(null)
    const qs = folderId ? `?folderId=${folderId}` : ''
    try {
      const res = await apiFetch(`/api/report/projects/${projectId}/contents${qs}`)
      if (res.ok) {
        const data = await res.json()
        setFolders(data.folders)
        setDocuments(data.documents)
        setFiles(data.files)
        setLinks(data.links || [])
      } else {
        setContentError(`Failed to load (HTTP ${res.status})`)
      }
    } catch (err) {
      setContentError(err instanceof Error ? err.message : 'Failed to load contents')
    } finally {
      setContentLoading(false)
    }
  }, [apiFetch])

  useEffect(() => {
    if (selection) {
      setOpenDoc(null)
      setOpenLinkId(null)
      setCurrentFolderId(null)
      setFolderPath([])
      loadContents(selection.projectId, null)
    }
  }, [selection?.projectId]) // eslint-disable-line

  // ── Client CRUD ─────────────────────────────────────────────────────────

  async function addClient() {
    track('box:playground:add')
    const res = await apiFetch('/api/report/clients', {
      method: 'POST', body: JSON.stringify({ name: 'New Playground' }),
    })
    if (res.ok) {
      const { client } = await res.json()
      setClients(prev => [...prev, { ...client, projects: [] }])
      setExpanded(prev => ({ ...prev, [client.id]: true }))
      setEditingId(client.id)
      setEditingValue('New Playground')
    }
  }

  async function renameClient(clientId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) { setEditingId(null); return }
    track('box:playground:rename', { clientId, name: trimmed })
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, name: trimmed } : c))
    setEditingId(null)
    await apiFetch(`/api/report/clients/${clientId}`, {
      method: 'PATCH', body: JSON.stringify({ name: trimmed }),
    })
  }

  async function deleteClient(clientId: string) {
    track('box:playground:delete', { clientId })
    setClients(prev => prev.filter(c => c.id !== clientId))
    if (selection?.clientId === clientId) setSelection(null)
    setMenuId(null)
    await apiFetch(`/api/report/clients/${clientId}`, { method: 'DELETE' })
  }

  // ── Project CRUD ────────────────────────────────────────────────────────

  async function addProject(clientId: string) {
    track('box:project:add', { clientId })
    const res = await apiFetch(`/api/report/clients/${clientId}/projects`, {
      method: 'POST', body: JSON.stringify({ name: 'New Project' }),
    })
    if (res.ok) {
      const { project } = await res.json()
      setClients(prev => prev.map(c => {
        if (c.id !== clientId) return c
        return { ...c, projects: [...c.projects, project] }
      }))
      setExpanded(prev => ({ ...prev, [clientId]: true }))
      setEditingId(project.id)
      setEditingValue('New Project')
    }
  }

  async function renameProject(clientId: string, projectId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) { setEditingId(null); return }
    track('box:project:rename', { clientId, projectId, name: trimmed })
    setClients(prev => prev.map(c => {
      if (c.id !== clientId) return c
      return { ...c, projects: c.projects.map(p => p.id === projectId ? { ...p, name: trimmed } : p) }
    }))
    setEditingId(null)
    await apiFetch(`/api/report/projects/${projectId}`, {
      method: 'PATCH', body: JSON.stringify({ name: trimmed }),
    })
  }

  async function deleteProject(clientId: string, projectId: string) {
    track('box:project:delete', { clientId, projectId })
    setClients(prev => prev.map(c => {
      if (c.id !== clientId) return c
      return { ...c, projects: c.projects.filter(p => p.id !== projectId) }
    }))
    if (selection?.projectId === projectId) setSelection(null)
    setMenuId(null)
    await apiFetch(`/api/report/projects/${projectId}`, { method: 'DELETE' })
  }

  // ── Folder CRUD ─────────────────────────────────────────────────────────

  async function createFolder() {
    if (!selection) return
    track('box:folder:create', { projectId: selection.projectId, parentFolderId: currentFolderId })
    // In column view, create inside the deepest selected folder
    let targetFolderId = currentFolderId
    if (viewMode === 'columns') {
      // Walk subColumns from the end to find the deepest folder that's selected
      let deepest: string | null = null
      for (let i = subColumns.length - 1; i >= 0; i--) {
        if (subColumns[i].parentId) { deepest = subColumns[i].parentId; break }
      }
      if (!deepest && col0Selected && folders.some(f => f.id === col0Selected)) {
        deepest = col0Selected
      }
      if (deepest) targetFolderId = deepest
    }
    const res = await apiFetch(`/api/report/projects/${selection.projectId}/contents`, {
      method: 'POST', body: JSON.stringify({ type: 'folder', name: 'New Folder', folderId: targetFolderId }),
    })
    if (res.ok) {
      const { folder } = await res.json()
      const newFolder = { ...folder, _count: { children: 0, documents: 0, files: 0 } }
      if (viewMode === 'columns' && targetFolderId && targetFolderId !== currentFolderId) {
        // Add to the correct sub-column
        const colIdx = subColumns.findIndex(sc => sc.parentId === targetFolderId)
        if (colIdx >= 0) {
          setSubColumns(prev => prev.map((sc, i) => i === colIdx ? { ...sc, folders: [...sc.folders, newFolder] } : sc))
        }
      } else {
        setFolders(prev => [...prev, newFolder])
      }
      setEditingId(folder.id)
      setEditingValue('New Folder')
    }
  }

  async function renameFolder(folderId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) { setEditingId(null); return }
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: trimmed } : f))
    setSubColumns(prev => prev.map(sc => ({ ...sc, folders: sc.folders.map(f => f.id === folderId ? { ...f, name: trimmed } : f) })))
    setEditingId(null)
    await apiFetch(`/api/report/folders/${folderId}`, {
      method: 'PATCH', body: JSON.stringify({ name: trimmed }),
    })
  }

  async function deleteFolder(folderId: string) {
    track('box:folder:delete', { folderId })
    setFolders(prev => prev.filter(f => f.id !== folderId))
    // In column view, also truncate sub-columns that were showing this folder's contents
    if (col0Selected === folderId) {
      setCol0Selected(null)
      setSubColumns([])
      setColPreview(null)
    } else {
      setSubColumns(prev => {
        const idx = prev.findIndex(sc => sc.parentId === folderId)
        if (idx >= 0) {
          // Truncate from this column onward, and remove the folder from its parent column
          return prev.slice(0, idx).map(sc => ({ ...sc, folders: sc.folders.filter(f => f.id !== folderId), selectedId: sc.selectedId === folderId ? null : sc.selectedId }))
        }
        return prev.map(sc => ({ ...sc, folders: sc.folders.filter(f => f.id !== folderId) }))
      })
      setColPreview(prev => prev && subColumns.some(sc => sc.parentId === folderId) ? null : prev)
    }
    setMenuId(null)
    setCtxMenu(null)
    await apiFetch(`/api/report/folders/${folderId}`, { method: 'DELETE' })
  }

  function navigateToFolder(folderId: string, folderName: string) {
    if (!selection) return
    track('box:folder:open', { folderId, name: folderName })
    setCurrentFolderId(folderId)
    setFolderPath(prev => [...prev, { id: folderId, name: folderName }])
    loadContents(selection.projectId, folderId)
  }

  function navigateUp() {
    if (!selection) return
    const newPath = [...folderPath]
    newPath.pop()
    const parentId = newPath.length > 0 ? newPath[newPath.length - 1].id : null
    setCurrentFolderId(parentId)
    setFolderPath(newPath)
    loadContents(selection.projectId, parentId)
  }

  function navigateToBreadcrumb(index: number) {
    if (!selection) return
    if (index === -1) {
      setCurrentFolderId(null)
      setFolderPath([])
      loadContents(selection.projectId, null)
    } else {
      const newPath = folderPath.slice(0, index + 1)
      const folderId = newPath[newPath.length - 1].id
      setCurrentFolderId(folderId)
      setFolderPath(newPath)
      loadContents(selection.projectId, folderId)
    }
  }

  // ── Document CRUD ───────────────────────────────────────────────────────

  async function createDocument() {
    if (!selection) return
    track('box:document:create', { projectId: selection.projectId, folderId: currentFolderId })
    const res = await apiFetch(`/api/report/projects/${selection.projectId}/contents`, {
      method: 'POST', body: JSON.stringify({ type: 'document', title: 'Untitled', folderId: currentFolderId }),
    })
    if (res.ok) {
      const { document: doc } = await res.json()
      setDocuments(prev => [...prev, { ...doc, edits: [] }])
    }
  }

  // openDocument / handleDocContentChange / handleDocTitleChange / saveDocument
  // live in useReportDocument.

  async function deleteDocument(docId: string) {
    track('box:document:delete', { docId })
    setDocuments(prev => prev.filter(d => d.id !== docId))
    setSubColumns(prev => prev.map(sc => ({ ...sc, documents: sc.documents.filter(d => d.id !== docId) })))
    closeDocIfOpen(docId)
    setMenuId(null)
    setCtxMenu(null)
    await apiFetch(`/api/report/documents/${docId}`, { method: 'DELETE' })
  }

  async function renameDocument(docId: string, title: string) {
    const trimmed = title.trim() || 'Untitled'
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, title: trimmed } : d))
    setSubColumns(prev => prev.map(sc => ({ ...sc, documents: sc.documents.map(d => d.id === docId ? { ...d, title: trimmed } : d) })))
    setEditingId(null)
    await apiFetch(`/api/report/documents/${docId}`, {
      method: 'PATCH', body: JSON.stringify({ title: trimmed }),
    })
  }

  // ── Feedback link CRUD ──────────────────────────────────────────────────

  function createLink() {
    if (!selection) return
    setLinkUrlInput('')
  }

  async function submitLinkUrl() {
    if (!selection || !linkUrlInput?.trim()) return
    const url = linkUrlInput.trim()
    setLinkUrlInput(null)
    const res = await apiFetch(`/api/report/projects/${selection.projectId}/contents`, {
      method: 'POST', body: JSON.stringify({ type: 'link', url, folderId: currentFolderId }),
    })
    if (res.ok) {
      const { link } = await res.json()
      setLinks(prev => [...prev, { ...link, _count: { pins: 0 } }])
    }
  }

  function openFeedbackLink(linkId: string) {
    track('box:feedback:open', { linkId })
    // Open feedback viewer in the system browser with auto-login
    // Always use the public domain for browser URLs (config.apiBase may be localhost in dev)
    const publicBase = 'https://bundy.40h.studio'
    const bridgeUrl = `${publicBase}/api/auth/desktop-bridge?token=${encodeURIComponent(config.token)}&redirect=${encodeURIComponent(`/report/feedback/${linkId}`)}`
    window.electronAPI.openExternal(bridgeUrl)
  }

  async function deleteLink(linkId: string) {
    setLinks(prev => prev.filter(l => l.id !== linkId))
    if (openLinkId === linkId) setOpenLinkId(null)
    setMenuId(null)
    setCtxMenu(null)
    await apiFetch(`/api/report/links/${linkId}`, { method: 'DELETE' })
  }

  async function renameLink(linkId: string, title: string) {
    const trimmed = title.trim() || 'Untitled'
    setLinks(prev => prev.map(l => l.id === linkId ? { ...l, title: trimmed } : l))
    setEditingId(null)
    await apiFetch(`/api/report/links/${linkId}`, {
      method: 'PATCH', body: JSON.stringify({ title: trimmed }),
    })
  }

  // ── File upload ─────────────────────────────────────────────────────────

  async function deleteFile(fileId: string) {
    track('box:file:delete', { fileId })
    setFiles(prev => prev.filter(f => f.id !== fileId))
    setSubColumns(prev => prev.map(sc => ({ ...sc, files: sc.files.filter(f => f.id !== fileId) })))
    setMenuId(null)
    setCtxMenu(null)
    await apiFetch(`/api/report/files/${fileId}`, { method: 'DELETE' })
  }

  // ── Drag-and-drop file upload ───────────────────────────────────────────

  async function uploadFileObj(file: globalThis.File) {
    if (!selection) return
    if (file.size > MAX_FILE_SIZE) { alert('File must be under 500MB'); return }
    track('box:file:upload:start', { name: file.name, size: file.size, mime: file.type, projectId: selection.projectId, folderId: currentFolderId })
    setUploading(true)
    const tracker = trackUpload({ name: file.name, surface: 'report', total: file.size })
    // Phase 3 — try direct-to-R2 first; fall back to multipart on 501 / error.
    const r2 = await tryDirectR2Upload({
      signEndpoint: `/api/report/projects/${selection.projectId}/upload/sign`,
      signBody: { folderId: currentFolderId ?? null },
      file,
      onProgress: (pct) => tracker.onProgress(pct),
    })
    if (r2.ok) {
      const uploaded = (r2.data as { file: RFile }).file
      setFiles(prev => [uploaded, ...prev])
      tracker.success()
      setUploading(false)
      track('box:file:upload:done', { name: file.name, path: 'r2-direct', fileId: uploaded.id })
      return
    }
    // Multipart fallback — XHR so we can keep reporting progress.
    try {
      const uploaded = await xhrUploadJson<{ file: RFile }>(
        `${config.apiBase}/api/report/projects/${selection.projectId}/upload`,
        config.token,
        (() => {
          const fd = new FormData()
          fd.append('file', file as Blob)
          if (currentFolderId) fd.append('folderId', currentFolderId)
          return fd
        })(),
        (loaded, total) => tracker.onProgress(total > 0 ? (loaded / total) * 100 : 0),
      )
      setFiles(prev => [uploaded.file, ...prev])
      tracker.success()
      track('box:file:upload:done', { name: file.name, path: 'multipart', fileId: uploaded.file.id })
    } catch (err) {
      tracker.fail(err instanceof Error ? err.message : String(err))
      track('box:file:upload:fail', { name: file.name, error: err instanceof Error ? err.message : String(err) })
    }
    setUploading(false)
  }

  // handleDragEnter/Leave/Over + onItemDragStart/End live in useReportDrag.
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation()
    resetDragOver()
    const droppedFiles = Array.from(e.dataTransfer.files)
    for (const f of droppedFiles) await uploadFileObj(f)
  }

  // ── Drag-to-move items ──────────────────────────────────────────────────

  // P3.24 — Reorder a sibling list. Called when an item is dropped onto another
  // item of the SAME kind in the same folder/project. If kinds differ or the
  // ids are scoped differently, the caller should fall back to the move handler.
  async function reorderSibling(kind: 'folder' | 'document' | 'file' | 'link', draggedId: string, targetId: string) {
    if (draggedId === targetId) return false
    const list = kind === 'folder' ? folders
      : kind === 'document' ? documents
      : kind === 'file' ? files
      : links
    const fromIdx = list.findIndex((x) => x.id === draggedId)
    const toIdx = list.findIndex((x) => x.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return false
    const next = [...list]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    if (kind === 'folder') setFolders(next as RFolder[])
    else if (kind === 'document') setDocuments(next as RDocument[])
    else if (kind === 'file') setFiles(next as RFile[])
    else setLinks(next as RLink[])
    // Server persists the new order in one shot.
    await apiFetch('/api/report/reorder', {
      method: 'POST',
      body: JSON.stringify({ kind, ids: next.map((x) => x.id) }),
    })
    return true
  }

  // Move the currently-dragging item to another playground/project's root.
  // Backend supports projectId on PATCH for files, folders, and documents
  // (see bundy/src/app/api/report/{files,folders,documents}/[id]/route.ts).
  async function moveToProject(targetClientId: string, targetProjectId: string) {
    if (!draggingItem) return
    const item = draggingItem
    setDraggingItem(null)
    setTreeDropTargetId(null)
    if (!selection || targetProjectId === selection.projectId) return
    if (item.type === 'link') return // links aren't supported across projects yet
    track('box:item:move-cross-project', { type: item.type, id: item.id, fromProjectId: selection.projectId, toProjectId: targetProjectId, toClientId: targetClientId })

    // Optimistic — remove from current view
    if (item.type === 'folder') setFolders(prev => prev.filter(f => f.id !== item.id))
    else if (item.type === 'document') setDocuments(prev => prev.filter(d => d.id !== item.id))
    else if (item.type === 'file') setFiles(prev => prev.filter(f => f.id !== item.id))
    setSubColumns(prev => prev.map(sc => ({
      ...sc,
      folders: item.type === 'folder' ? sc.folders.filter(f => f.id !== item.id) : sc.folders,
      documents: item.type === 'document' ? sc.documents.filter(d => d.id !== item.id) : sc.documents,
      files: item.type === 'file' ? sc.files.filter(f => f.id !== item.id) : sc.files,
    })))

    const path =
      item.type === 'folder' ? `/api/report/folders/${item.id}` :
      item.type === 'document' ? `/api/report/documents/${item.id}` :
      `/api/report/files/${item.id}`
    const res = await apiFetch(path, {
      method: 'PATCH',
      body: JSON.stringify({ projectId: targetProjectId, folderId: null }),
    })
    if (!res.ok) {
      // Reload to revert optimistic remove on failure.
      if (selection) loadContents(selection.projectId, currentFolderId)
      return
    }
    // Open the destination project so the user sees the result.
    setExpanded(prev => ({ ...prev, [targetClientId]: true }))
    setSelection({ clientId: targetClientId, projectId: targetProjectId })
  }

  function onFolderDragOver(e: React.DragEvent, folderId: string) {
    e.preventDefault(); e.stopPropagation()
    if (draggingItem && draggingItem.id !== folderId) {
      e.dataTransfer.dropEffect = 'move'
      setDropTargetId(folderId)
    }
  }
  function onFolderDragLeave(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation()
    setDropTargetId(null)
  }
  async function onFolderDrop(e: React.DragEvent, targetFolderId: string) {
    e.preventDefault(); e.stopPropagation()
    setDropTargetId(null)

    // If dropping files from OS
    if (e.dataTransfer.files.length > 0 && !draggingItem) {
      // Upload directly into the target folder
      for (const f of Array.from(e.dataTransfer.files)) {
        if (!selection || f.size > MAX_FILE_SIZE) continue
        const tracker = trackUpload({ name: f.name, surface: 'report', total: f.size })
        // Phase 3 — try direct-to-R2 first; fall back to multipart on 501 / error.
        const r2 = await tryDirectR2Upload({
          signEndpoint: `/api/report/projects/${selection.projectId}/upload/sign`,
          signBody: { folderId: targetFolderId },
          file: f,
          onProgress: (pct) => tracker.onProgress(pct),
        })
        if (r2.ok) { tracker.success(); continue }
        try {
          const fd = new FormData()
          fd.append('file', f as Blob)
          fd.append('folderId', targetFolderId)
          await xhrUploadJson<{ file: RFile }>(
            `${config.apiBase}/api/report/projects/${selection.projectId}/upload`,
            config.token, fd,
            (loaded, total) => tracker.onProgress(total > 0 ? (loaded / total) * 100 : 0),
          )
          tracker.success()
        } catch (err) {
          tracker.fail(err instanceof Error ? err.message : String(err))
        }
      }
      return
    }

    if (!draggingItem || draggingItem.id === targetFolderId) return
    const { type, id } = draggingItem
    setDraggingItem(null)

    const countKey: 'children' | 'documents' | 'files' = type === 'folder' ? 'children' : type === 'document' ? 'documents' : 'files'

    // Find which column the item is coming from, to decrement its parent folder count
    let sourceFolderId: string | null = null
    if ((type === 'folder' && folders.some(f => f.id === id))
      || (type === 'document' && documents.some(d => d.id === id))
      || (type === 'file' && files.some(f => f.id === id))) {
      sourceFolderId = currentFolderId
    } else {
      for (let i = 0; i < subColumns.length; i++) {
        const sc = subColumns[i]
        if ((type === 'folder' && sc.folders.some(f => f.id === id))
          || (type === 'document' && sc.documents.some(d => d.id === id))
          || (type === 'file' && sc.files.some(f => f.id === id))) {
          sourceFolderId = sc.parentId
          break
        }
      }
    }

    // Helper to update a folder count across col0 and subColumns
    const updateCount = (fId: string, delta: number) => {
      setFolders(prev => prev.map(f => f.id === fId ? { ...f, _count: { ...f._count, [countKey]: Math.max(0, f._count[countKey] + delta) } } : f))
      setSubColumns(prev => prev.map(sc => ({
        ...sc,
        folders: sc.folders.map(f => f.id === fId ? { ...f, _count: { ...f._count, [countKey]: Math.max(0, f._count[countKey] + delta) } } : f),
      })))
    }

    // Remove item from col0 and all subColumns
    if (type === 'folder') setFolders(prev => prev.filter(f => f.id !== id))
    else if (type === 'document') setDocuments(prev => prev.filter(d => d.id !== id))
    else if (type === 'file') setFiles(prev => prev.filter(f => f.id !== id))
    setSubColumns(prev => prev.map(sc => ({
      ...sc,
      folders: type === 'folder' ? sc.folders.filter(f => f.id !== id) : sc.folders,
      documents: type === 'document' ? sc.documents.filter(d => d.id !== id) : sc.documents,
      files: type === 'file' ? sc.files.filter(f => f.id !== id) : sc.files,
    })))

    // Decrement source, increment target
    if (sourceFolderId) updateCount(sourceFolderId, -1)
    updateCount(targetFolderId, 1)

    if (type === 'folder') {
      await apiFetch(`/api/report/folders/${id}`, { method: 'PATCH', body: JSON.stringify({ parentId: targetFolderId }) })
    } else if (type === 'document') {
      await apiFetch(`/api/report/documents/${id}`, { method: 'PATCH', body: JSON.stringify({ folderId: targetFolderId }) })
    } else if (type === 'file') {
      await apiFetch(`/api/report/files/${id}`, { method: 'PATCH', body: JSON.stringify({ folderId: targetFolderId }) })
    }
  }

  // ── Share link ──────────────────────────────────────────────────────────

  function buildSharePath(itemType: 'project' | 'folder' | 'document' | 'file' | 'link', itemId?: string) {
    if (!selection) return ''
    if (itemType === 'project') return `/report/${selection.clientId}/${selection.projectId}`
    return `/report/${selection.clientId}/${selection.projectId}/${itemType}/${itemId}`
  }

  async function copyShareLink(itemType: 'project' | 'folder' | 'document' | 'file' | 'link', itemId?: string) {
    const path = buildSharePath(itemType, itemId)
    if (!path) return
    track('box:share:copy', { itemType, itemId })
    const link = `${config.apiBase}${path}`
    try {
      if (window.electronAPI?.writeClipboard) {
        window.electronAPI.writeClipboard(link)
      } else {
        await navigator.clipboard.writeText(link)
      }
    } catch {
      // last-resort fallback
      const ta = document.createElement('textarea')
      ta.value = link
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopiedId(itemId || 'project')
    setTimeout(() => setCopiedId(null), 2000)
    setMenuId(null)
  }

  // selKey + handleItemClick + isItemSelected + onContentMouseDown live in
  // useReportMultiSelect. bulkDeleteSelected stays here because it needs
  // the per-type delete handlers below.
  async function bulkDeleteSelected() {
    const items = [...selectedItems.values()]
    if (items.length === 0) return
    setConfirmDelete({
      name: `${items.length} item${items.length > 1 ? 's' : ''}`,
      action: async () => {
        for (const item of items) {
          switch (item.type) {
            case 'folder': await deleteFolder(item.id); break
            case 'document': await deleteDocument(item.id); break
            case 'file': await deleteFile(item.id); break
            case 'link': await deleteLink(item.id); break
          }
        }
        setSelectedItems(new Map())
      },
    })
  }

  // ── View mode ───────────────────────────────────────────────────────────

  async function changeViewMode(mode: ViewMode) {
    const prevMode = viewMode
    setViewMode(mode)
    try { localStorage.setItem(VIEW_MODE_KEY, mode) } catch { /* */ }

    // v1.5.2111 — when switching INTO Columns view from elsewhere while
    // we're drilled into nested folders, reset col0 to project root and
    // pre-populate subColumns with the path back to the current folder
    // so the Finder-style cascade reflects the full structure.
    if (mode === 'columns' && prevMode !== 'columns' && selection && folderPath.length > 0) {
      const path = [...folderPath]
      // Reset breadcrumb / current folder to root.
      // Skip the reset-effect that would otherwise wipe the populated cols.
      skipNextColumnResetRef.current = true
      setCurrentFolderId(null)
      setFolderPath([])
      // Load root contents into col0.
      await loadContents(selection.projectId, null)
      // Walk the path, fetching each level's children.
      const builtSubCols: ColumnEntry[] = []
      for (const crumb of path) {
        if (!crumb.id) continue
        const res = await apiFetch(`/api/report/projects/${selection.projectId}/contents?folderId=${crumb.id}`)
        if (!res.ok) break
        const data = await res.json()
        builtSubCols.push({
          parentId: crumb.id,
          folders: data.folders || [],
          documents: data.documents || [],
          files: data.files || [],
          links: data.links || [],
          selectedId: null,
        })
      }
      setSubColumns(builtSubCols)
      // Mark each column's selection as the next folder down so the
      // visual breadcrumb-of-selections is preserved.
      setCol0Selected(path[0]?.id ?? null)
    }
  }

  // ── Column view management ──────────────────────────────────────────────

  // v1.5.2111 — guard for the changeViewMode→Columns flow which deliberately
  // populates subColumns and would otherwise be wiped by the reset effect.
  const skipNextColumnResetRef = useRef(false)
  // Reset column/gallery state when navigation changes
  useEffect(() => {
    if (skipNextColumnResetRef.current) {
      skipNextColumnResetRef.current = false
      return
    }
    setSubColumns([]); setCol0Selected(null); setColPreview(null); setGalleryIdx(0)
  }, [selection?.projectId, currentFolderId])

  async function handleColumnSelect(colIdx: number, type: 'folder' | 'document' | 'file' | 'link', id: string, file?: RFile) {
    if (type === 'document') { openDocument(id); return }
    if (type === 'link') { openFeedbackLink(id); return }

    if (type === 'file') {
      if (colIdx === 0) { setCol0Selected(id); setSubColumns([]) }
      else {
        const si = colIdx - 1
        setSubColumns(prev => prev.slice(0, si + 1).map((sc, i) => i === si ? { ...sc, selectedId: id } : sc))
      }
      setColPreview(file || null)
      return
    }

    // folder – fetch contents and add sub-column
    if (!selection) return
    const res = await apiFetch(`/api/report/projects/${selection.projectId}/contents?folderId=${id}`)
    if (!res.ok) return
    const data = await res.json()
    const entry: ColumnEntry = { parentId: id, folders: data.folders, documents: data.documents, files: data.files, links: data.links || [], selectedId: null }

    if (colIdx === 0) {
      setCol0Selected(id)
      setSubColumns([entry])
    } else {
      const si = colIdx - 1
      setSubColumns(prev => [...prev.slice(0, si).map(sc => sc), { ...prev[si], selectedId: id }, entry])
    }
    setColPreview(null)
    setTimeout(() => { columnsRef.current?.scrollTo({ left: columnsRef.current.scrollWidth, behavior: 'smooth' }) }, 50)
  }

  // Drop item onto a column background (move out of subfolder into that column's folder)
  async function onColumnDrop(e: React.DragEvent, colIdx: number) {
    e.preventDefault(); e.stopPropagation()
    setDropTargetId(null)
    if (!draggingItem || !selection) return
    const { type, id } = draggingItem
    setDraggingItem(null)

    // Determine the target folderId for this column
    const targetFolderId = colIdx === 0 ? currentFolderId : subColumns[colIdx - 1].parentId

    // Determine which column the item is coming FROM (to update source folder counts)
    let sourceColIdx = -1
    if (type === 'folder' && folders.some(f => f.id === id)) sourceColIdx = 0
    else if (type === 'document' && documents.some(d => d.id === id)) sourceColIdx = 0
    else if (type === 'file' && files.some(f => f.id === id)) sourceColIdx = 0
    if (sourceColIdx < 0) {
      for (let i = 0; i < subColumns.length; i++) {
        const sc = subColumns[i]
        if ((type === 'folder' && sc.folders.some(f => f.id === id))
          || (type === 'document' && sc.documents.some(d => d.id === id))
          || (type === 'file' && sc.files.some(f => f.id === id))) {
          sourceColIdx = i + 1
          break
        }
      }
    }
    const sourceFolderId = sourceColIdx === 0 ? currentFolderId : sourceColIdx > 0 ? subColumns[sourceColIdx - 1].parentId : null
    const countKey = type === 'folder' ? 'children' : type === 'document' ? 'documents' : 'files'

    // Helper to update a folder count across col0 and subColumns
    const updateFolderCount = (fId: string, key: string, delta: number) => {
      setFolders(prev => prev.map(f => f.id === fId ? { ...f, _count: { ...f._count, [key]: Math.max(0, f._count[key as keyof typeof f._count] + delta) } } : f))
      setSubColumns(prev => prev.map(sc => ({
        ...sc,
        folders: sc.folders.map(f => f.id === fId ? { ...f, _count: { ...f._count, [key]: Math.max(0, f._count[key as keyof typeof f._count] + delta) } } : f),
      })))
    }

    // Optimistically remove item from whichever column it was in
    if (type === 'folder') setFolders(prev => prev.filter(f => f.id !== id))
    else if (type === 'document') setDocuments(prev => prev.filter(d => d.id !== id))
    else if (type === 'file') setFiles(prev => prev.filter(f => f.id !== id))
    setSubColumns(prev => prev.map(sc => ({
      ...sc,
      folders: type === 'folder' ? sc.folders.filter(f => f.id !== id) : sc.folders,
      documents: type === 'document' ? sc.documents.filter(d => d.id !== id) : sc.documents,
      files: type === 'file' ? sc.files.filter(f => f.id !== id) : sc.files,
    })))

    // Decrement source folder count, increment target folder count
    if (sourceFolderId) updateFolderCount(sourceFolderId, countKey, -1)
    if (targetFolderId) updateFolderCount(targetFolderId, countKey, 1)

    // Persist the move
    if (type === 'folder') {
      await apiFetch(`/api/report/folders/${id}`, { method: 'PATCH', body: JSON.stringify({ parentId: targetFolderId }) })
    } else if (type === 'document') {
      await apiFetch(`/api/report/documents/${id}`, { method: 'PATCH', body: JSON.stringify({ folderId: targetFolderId }) })
    } else if (type === 'file') {
      await apiFetch(`/api/report/files/${id}`, { method: 'PATCH', body: JSON.stringify({ folderId: targetFolderId }) })
    }

    // Reload only the target column to show the moved item
    const resFolderId = colIdx === 0 ? currentFolderId : subColumns[colIdx - 1].parentId
    const qs = resFolderId ? `?folderId=${resFolderId}` : ''
    const res = await apiFetch(`/api/report/projects/${selection.projectId}/contents${qs}`)
    if (res.ok) {
      const data = await res.json()
      if (colIdx === 0) {
        setFolders(data.folders); setDocuments(data.documents); setFiles(data.files)
      } else {
        setSubColumns(prev => prev.map((sc, i) => i === colIdx - 1
          ? { ...sc, folders: data.folders, documents: data.documents, files: data.files }
          : sc
        ))
      }
    }
  }

  // Auth-aware file download
  async function downloadFile(file: RFile) {
    const res = await apiFetch(file.url)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = file.name; a.click()
    URL.revokeObjectURL(url)
  }

  // P3.29 — open the file in the default browser. Uses the desktop-bridge so
  // the user is auto-authenticated on the web side, otherwise the /uploads
  // route would 401 in the browser.
  function openFileInBrowser(file: RFile) {
    track('box:file:open-external', { fileId: file.id, name: file.name })
    const publicBase = config.apiBase
    const target = file.url
    const bridgeUrl = `${publicBase}/api/auth/desktop-bridge?token=${encodeURIComponent(config.token)}&redirect=${encodeURIComponent(target)}`
    window.electronAPI.openExternal(bridgeUrl)
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  const selectedClient = useMemo(
    () => (selection ? clients.find(c => c.id === selection.clientId) ?? null : null),
    [clients, selection],
  )
  const selectedProject = useMemo(
    () => selectedClient?.projects.find(p => p.id === selection?.projectId) ?? null,
    [selectedClient, selection],
  )

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function timeAgo(dateStr: string, future = false) {
    const diff = future
      ? new Date(dateStr).getTime() - Date.now()
      : Date.now() - new Date(dateStr).getTime()
    if (diff < 0) return future ? 'expired' : 'just now'
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return future ? 'in < 1m' : 'just now'
    if (mins < 60) return future ? `in ${mins}m` : `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return future ? `in ${hrs}h` : `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return future ? `in ${days}d` : `${days}d ago`
  }

  function displayName(u: { username: string; alias: string | null }) {
    return u.alias || u.username
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: '100%' }}>

      <ReportTree
        authRole={auth.role}
        clients={clients}
        expanded={expanded}
        selection={selection}
        loading={loading}
        toggleExpand={toggleExpand}
        setSelection={setSelection}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        searchHits={searchHits}
        onSearchHitOpen={handleSearchHitOpen}
        editingId={editingId}
        setEditingId={setEditingId}
        editingValue={editingValue}
        setEditingValue={setEditingValue}
        menuId={menuId}
        setMenuId={setMenuId}
        onOpenActivityLog={() => { setShowActivityLog(true); loadActivityLogs(1) }}
        onOpenRecycleBin={() => { setShowRecycleBin(true); loadRecycleBin() }}
        addClient={addClient}
        addProject={addProject}
        renameClient={renameClient}
        renameProject={renameProject}
        onConfirmDelete={setConfirmDelete}
        deleteClient={deleteClient}
        deleteProject={deleteProject}
        draggingItemId={draggingItem?.id ?? null}
        treeDropTargetId={treeDropTargetId}
        setTreeDropTargetId={setTreeDropTargetId}
        onProjectDrop={moveToProject}
      />

      {/* ── Content area ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', background: C.contentBg }}>
        {!selection ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted }}>
            <div style={{ textAlign: 'center' }}>
              <FolderOpen size={40} strokeWidth={1} style={{ opacity: 0.3, marginBottom: 10 }} />
              <p style={{ fontSize: 13 }}>Select a project to view reports</p>
            </div>
          </div>
        ) : openDoc ? (
          <ReportEditor
            openDoc={openDoc}
            docTitle={docTitle}
            docContent={docContent}
            docSaving={docSaving}
            docLoading={docLoading}
            config={config}
            auth={auth}
            selection={selection}
            onTitleChange={handleDocTitleChange}
            onContentChange={handleDocContentChange}
            onClose={() => {
              closeDoc()
              if (selection) loadContents(selection.projectId, currentFolderId)
            }}
          />
        ) : openLinkId ? (
          /* ── Feedback Link Viewer ─────────────────────────────────────── */
          <FeedbackViewer linkId={openLinkId} config={config} onBack={() => { setOpenLinkId(null); if (selection) loadContents(selection.projectId, currentFolderId) }} />
        ) : (
          /* ── Project Browser ──────────────────────────────────────────── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
            onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>

            {/* Drop overlay */}
            {dragOver && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 50,
                background: 'rgba(59, 130, 246, 0.08)', border: '2px dashed rgba(59, 130, 246, 0.5)',
                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{ textAlign: 'center', color: C.accent }}>
                  <Upload size={32} strokeWidth={1.5} style={{ marginBottom: 8, opacity: 0.7 }} />
                  <p style={{ fontSize: 14, fontWeight: 600 }}>Drop files to upload</p>
                  <p style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>500MB max per file</p>
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div style={{
              padding: '10px 16px', borderBottom: `1px solid ${C.separator}`,
              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: C.lgBg,
              // v1.5.2111 — allow toolbar to scroll horizontally on small screens
              // so action buttons stay reachable instead of being clipped.
              overflowX: 'auto', overflowY: 'visible', whiteSpace: 'nowrap',
            }}>
              {/* Breadcrumb */}
              <div style={{ flex: '1 1 auto', minWidth: 80, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                <button onClick={() => navigateToBreadcrumb(-1)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: folderPath.length > 0 ? C.accent : C.text, fontSize: 13, fontWeight: 600, padding: 0, whiteSpace: 'nowrap' }}>
                  {selectedProject?.name}
                </button>
                {folderPath.map((crumb, i) => (
                  <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ChevronRight size={12} style={{ color: C.textMuted }} />
                    <button onClick={() => navigateToBreadcrumb(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: i === folderPath.length - 1 ? C.text : C.accent, fontSize: 13, fontWeight: i === folderPath.length - 1 ? 600 : 400, padding: 0, whiteSpace: 'nowrap' }}>
                      {crumb.name}
                    </button>
                  </span>
                ))}
              </div>

              {/* View mode toggles */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 1, background: C.bgHover, borderRadius: 6, padding: 2 }}>
                {([['icons', Grid], ['list', List], ['columns', Columns], ['gallery', Image]] as const).map(([mode, Icon]) => (
                  <button key={mode} onClick={() => changeViewMode(mode)} title={mode[0].toUpperCase() + mode.slice(1)}
                    style={{
                      width: 26, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 4, border: 'none', cursor: 'pointer', transition: 'all 0.1s',
                      background: viewMode === mode ? C.accent : 'transparent',
                      color: viewMode === mode ? '#fff' : C.textMuted,
                    }}>
                    <Icon size={13} />
                  </button>
                ))}
              </div>

              {/* v1.5.2111 — Export CSV button removed from top bar per UX feedback. */}

              {/* Members modal trigger (P3.26) */}
              <button onClick={() => {
                if (!selection || !selectedProject) return
                setShowMembers({ projectId: selection.projectId, projectName: selectedProject.name })
                loadMembers(selection.projectId)
              }}
                title="Manage Members"
                style={toolbarBtn}
                onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <User size={14} /> <span>Members</span>
              </button>

              {/* Share project link */}
              <button onClick={() => copyShareLink('project')}
                title="Copy Project Link"
                style={toolbarBtn}
                onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <Link2 size={14} /> <span>{copiedId === 'project' ? 'Copied!' : 'Share'}</span>
              </button>

              {/* Action buttons */}
              <button onClick={createFolder} title="New Folder" style={toolbarBtn}
                onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <Folder size={14} /> <span>Folder</span>
              </button>
              <button onClick={createDocument} title="New Document" style={toolbarBtn}
                onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <FileText size={14} /> <span>Document</span>
              </button>
              <button onClick={createLink} title="New Feedback Link" style={toolbarBtn}
                onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <Globe size={14} /> <span>Feedback Link</span>
              </button>
              <button onClick={() => fileInputRef.current?.click()} title="Upload File" style={toolbarBtn}
                onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                {uploading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />}
                <span>Upload</span>
              </button>
              <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={async e => {
                const fls = Array.from(e.target.files || [])
                for (const f of fls) await uploadFileObj(f)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }} />
            </div>

            {/* Content area */}
            <div ref={contentAreaRef} onMouseDown={onContentMouseDown} style={{
              flex: 1, minHeight: 0, position: 'relative',
              overflowY: viewMode === 'columns' || viewMode === 'gallery' ? 'hidden' : 'auto',
              padding: viewMode === 'icons' ? '12px 16px' : viewMode === 'columns' || viewMode === 'gallery' ? 0 : '8px 0',
              display: viewMode === 'columns' || viewMode === 'gallery' ? 'flex' : 'block',
              flexDirection: 'column',
            }}>
              {contentLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                  <Loader size={20} style={{ color: C.textMuted, animation: 'spin 1s linear infinite' }} />
                </div>
              ) : contentError ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 40, color: C.textMuted, fontSize: 12 }}>
                  <AlertCircle size={20} style={{ color: C.danger }} />
                  <div>{contentError}</div>
                  <button
                    onClick={() => selection && loadContents(selection.projectId, currentFolderId)}
                    style={{ marginTop: 4, padding: '4px 12px', border: `1px solid ${C.separator}`, borderRadius: 6, background: 'transparent', color: C.textSecondary, fontSize: 11, cursor: 'pointer' }}>
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  {/* Back button (list/columns mode) */}
                  {currentFolderId && viewMode !== 'icons' && viewMode !== 'gallery' && (
                    <div onClick={navigateUp} style={{ ...rowStyle, color: C.textMuted }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <ArrowLeft size={16} />
                      <span style={{ fontSize: 12 }}>Back</span>
                    </div>
                  )}

                  {/* ── ICONS VIEW ──────────────────────────────────────── */}
                  {viewMode === 'icons' && (
                    <div>
                      {currentFolderId && (
                        <div onClick={navigateUp} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', color: C.textMuted, fontSize: 12, marginBottom: 8 }}
                          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                          <ArrowLeft size={14} /> Back
                        </div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {folders.map(folder => (
                          <div key={folder.id} data-sel-type="folder" data-sel-id={folder.id} data-sel-name={folder.name}
                            draggable onDragStart={e => onItemDragStart(e, { type: 'folder', id: folder.id })} onDragEnd={onItemDragEnd}
                            onDragOver={e => onFolderDragOver(e, folder.id)} onDragLeave={onFolderDragLeave}
                            onDrop={e => onFolderDrop(e, folder.id)}
                            onClick={e => handleItemClick(e, { type: 'folder', id: folder.id, name: folder.name })}
                            onDoubleClick={() => navigateToFolder(folder.id, folder.name)}
                            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ type: 'folder', id: folder.id, x: e.clientX, y: e.clientY, name: folder.name }); setMenuId(null) }}
                            style={{
                              width: 110, padding: '12px 8px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', position: 'relative',
                              background: isItemSelected('folder', folder.id) ? 'rgba(59, 130, 246, 0.18)' : dropTargetId === folder.id ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                              border: isItemSelected('folder', folder.id) ? '1px solid rgba(59, 130, 246, 0.5)' : dropTargetId === folder.id ? '1px dashed rgba(59, 130, 246, 0.5)' : '1px solid transparent',
                              transition: 'all 0.15s', opacity: draggingItem?.id === folder.id ? 0.4 : 1,
                            }}
                            onMouseEnter={e => { if (dropTargetId !== folder.id && !isItemSelected('folder', folder.id)) e.currentTarget.style.background = C.bgHover }}
                            onMouseLeave={e => { if (dropTargetId !== folder.id && !isItemSelected('folder', folder.id)) e.currentTarget.style.background = 'transparent' }}>
                            <Folder size={36} style={{ color: C.accent, marginBottom: 6 }} />
                            {editingId === folder.id ? (
                              <InlineInput value={editingValue} onChange={setEditingValue}
                                onConfirm={() => renameFolder(folder.id, editingValue)} onCancel={() => setEditingId(null)} />
                            ) : (
                              <div style={{ fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</div>
                            )}
                            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{folder._count.children + folder._count.documents + folder._count.files} items</div>
                            <button onClick={e => { e.stopPropagation(); setMenuId(menuId === folder.id ? null : folder.id) }}
                              style={{ ...iconBtnTiny, position: 'absolute', top: 4, right: 4, opacity: 0 }}
                              onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = '0' }}>
                              <MoreHorizontal size={12} />
                            </button>
                            {menuId === folder.id && (
                              <ContextMenu
                                onRename={() => { setEditingId(folder.id); setEditingValue(folder.name); setMenuId(null) }}
                                onDelete={() => { setMenuId(null); setConfirmDelete({ name: folder.name, action: () => deleteFolder(folder.id) }) }}
                                onShare={() => copyShareLink('folder', folder.id)}
                                onClose={() => setMenuId(null)} />
                            )}
                          </div>
                        ))}

                        {documents.map(doc => (
                          <div key={doc.id} data-sel-type="document" data-sel-id={doc.id} data-sel-name={doc.title}
                            draggable onDragStart={e => onItemDragStart(e, { type: 'document', id: doc.id })} onDragEnd={onItemDragEnd}
                            onDragOver={e => {
                              if (draggingItem?.type === 'document' && draggingItem.id !== doc.id) { e.preventDefault(); e.stopPropagation() }
                            }}
                            onDrop={e => {
                              if (draggingItem?.type === 'document' && draggingItem.id !== doc.id) {
                                e.preventDefault(); e.stopPropagation()
                                void reorderSibling('document', draggingItem.id, doc.id)
                              }
                            }}
                            onClick={e => handleItemClick(e, { type: 'document', id: doc.id, name: doc.title })}
                            onDoubleClick={() => openDocument(doc.id)}
                            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ type: 'document', id: doc.id, x: e.clientX, y: e.clientY, name: doc.title }); setMenuId(null) }}
                            style={{
                              width: 110, padding: '12px 8px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', position: 'relative',
                              background: isItemSelected('document', doc.id) ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
                              border: isItemSelected('document', doc.id) ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid transparent',
                              transition: 'background 0.1s', opacity: draggingItem?.id === doc.id ? 0.4 : 1,
                            }}
                            onMouseEnter={e => { if (!isItemSelected('document', doc.id)) e.currentTarget.style.background = C.bgHover }}
                            onMouseLeave={e => { if (!isItemSelected('document', doc.id)) e.currentTarget.style.background = 'transparent' }}>
                            <FileText size={36} style={{ color: C.accent, marginBottom: 6 }} />
                            {editingId === doc.id ? (
                              <InlineInput value={editingValue} onChange={setEditingValue}
                                onConfirm={() => renameDocument(doc.id, editingValue)} onCancel={() => setEditingId(null)} />
                            ) : (
                              <div style={{ fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
                            )}
                            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{timeAgo(doc.updatedAt)}</div>
                            <button onClick={e => { e.stopPropagation(); setMenuId(menuId === doc.id ? null : doc.id) }}
                              style={{ ...iconBtnTiny, position: 'absolute', top: 4, right: 4, opacity: 0 }}
                              onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = '0' }}>
                              <MoreHorizontal size={12} />
                            </button>
                            {menuId === doc.id && (
                              <ContextMenu
                                onRename={() => { setEditingId(doc.id); setEditingValue(doc.title); setMenuId(null) }}
                                onDelete={() => { setMenuId(null); setConfirmDelete({ name: doc.title, action: () => deleteDocument(doc.id) }) }}
                                onShare={() => copyShareLink('document', doc.id)}
                                onClose={() => setMenuId(null)} />
                            )}
                          </div>
                        ))}

                        {links.map(link => (
                          <div key={link.id} data-sel-type="link" data-sel-id={link.id} data-sel-name={link.title || link.url}
                            draggable onDragStart={e => onItemDragStart(e, { type: 'link', id: link.id })} onDragEnd={onItemDragEnd}
                            onDragOver={e => {
                              if (draggingItem?.type === 'link' && draggingItem.id !== link.id) { e.preventDefault(); e.stopPropagation() }
                            }}
                            onDrop={e => {
                              if (draggingItem?.type === 'link' && draggingItem.id !== link.id) {
                                e.preventDefault(); e.stopPropagation()
                                void reorderSibling('link', draggingItem.id, link.id)
                              }
                            }}
                            onClick={e => handleItemClick(e, { type: 'link', id: link.id, name: link.title || link.url })}
                            onDoubleClick={() => openFeedbackLink(link.id)}
                            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ type: 'link', id: link.id, x: e.clientX, y: e.clientY, name: link.title || link.url }); setMenuId(null) }}
                            style={{
                              width: 110, padding: '12px 8px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', position: 'relative',
                              background: isItemSelected('link', link.id) ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
                              border: isItemSelected('link', link.id) ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid transparent',
                              transition: 'background 0.1s', opacity: draggingItem?.id === link.id ? 0.4 : 1,
                            }}
                            onMouseEnter={e => { if (!isItemSelected('link', link.id)) e.currentTarget.style.background = C.bgHover }}
                            onMouseLeave={e => { if (!isItemSelected('link', link.id)) e.currentTarget.style.background = 'transparent' }}>
                            <Globe size={36} style={{ color: '#a78bfa', marginBottom: 6 }} />
                            {editingId === link.id ? (
                              <InlineInput value={editingValue} onChange={setEditingValue}
                                onConfirm={() => renameLink(link.id, editingValue)} onCancel={() => setEditingId(null)} />
                            ) : (
                              <div style={{ fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.title || new URL(link.url).hostname}</div>
                            )}
                            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{link._count.pins} pin{link._count.pins !== 1 ? 's' : ''}</div>
                            <button onClick={e => { e.stopPropagation(); setMenuId(menuId === link.id ? null : link.id) }}
                              style={{ ...iconBtnTiny, position: 'absolute', top: 4, right: 4, opacity: 0 }}
                              onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = '0' }}>
                              <MoreHorizontal size={12} />
                            </button>
                            {menuId === link.id && (
                              <ContextMenu
                                onRename={() => { setEditingId(link.id); setEditingValue(link.title || link.url); setMenuId(null) }}
                                onDelete={() => { setMenuId(null); setConfirmDelete({ name: link.title || link.url, action: () => deleteLink(link.id) }) }}
                                onShare={() => copyShareLink('link', link.id)}
                                onClose={() => setMenuId(null)} />
                            )}
                          </div>
                        ))}

                        {files.map(file => (
                          <div key={file.id} data-sel-type="file" data-sel-id={file.id} data-sel-name={file.name}
                            draggable onDragStart={e => onItemDragStart(e, { type: 'file', id: file.id })} onDragEnd={onItemDragEnd}
                            onClick={e => { handleItemClick(e, { type: 'file', id: file.id, name: file.name }) }}
                            onDoubleClick={() => {
                              if (isPreviewableFile(file)) { track('box:file:open', { fileId: file.id, name: file.name, mime: file.mimeType }); setLightboxFile(file) }
                              else { track('box:file:download', { fileId: file.id, name: file.name }); downloadFile(file) }
                            }}
                            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ type: 'file', id: file.id, x: e.clientX, y: e.clientY, name: file.name, item: file }); setMenuId(null) }}
                            style={{
                              width: 110, padding: '12px 8px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', position: 'relative',
                              background: isItemSelected('file', file.id) ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
                              border: isItemSelected('file', file.id) ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid transparent',
                              transition: 'background 0.1s', opacity: draggingItem?.id === file.id ? 0.4 : 1,
                            }}
                            onMouseEnter={e => { if (!isItemSelected('file', file.id)) e.currentTarget.style.background = C.bgHover }}
                            onMouseLeave={e => { if (!isItemSelected('file', file.id)) e.currentTarget.style.background = 'transparent' }}>
                            <div style={{ width: 60, height: 48, margin: '0 auto 6px' }}>
                              <FileThumbnail file={file} config={config} size={60} height={48} />
                            </div>
                            <div style={{ fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{formatSize(file.size)}</div>
                            <button onClick={e => { e.stopPropagation(); setMenuId(menuId === file.id ? null : file.id) }}
                              style={{ ...iconBtnTiny, position: 'absolute', top: 4, right: 4, opacity: 0 }}
                              onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = '0' }}>
                              <MoreHorizontal size={12} />
                            </button>
                            {menuId === file.id && (
                              <FileMenu
                                onDownload={() => downloadFile(file)}
                                onShare={() => copyShareLink('file', file.id)}
                                onDelete={() => { setMenuId(null); setConfirmDelete({ name: file.name, action: () => deleteFile(file.id) }) }}
                                onClose={() => setMenuId(null)} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── LIST VIEW ───────────────────────────────────────── */}
                  {viewMode === 'list' && (
                    <>
                      {folders.map(folder => (
                        <div key={folder.id} data-sel-type="folder" data-sel-id={folder.id} data-sel-name={folder.name}
                          draggable onDragStart={e => onItemDragStart(e, { type: 'folder', id: folder.id })} onDragEnd={onItemDragEnd}
                          onDragOver={e => onFolderDragOver(e, folder.id)} onDragLeave={onFolderDragLeave}
                          onDrop={e => onFolderDrop(e, folder.id)}
                          onClick={e => handleItemClick(e, { type: 'folder', id: folder.id, name: folder.name })}
                          onDoubleClick={() => navigateToFolder(folder.id, folder.name)}
                          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ type: 'folder', id: folder.id, x: e.clientX, y: e.clientY, name: folder.name }); setMenuId(null) }}
                          style={{
                            ...rowStyle, position: 'relative',
                            background: isItemSelected('folder', folder.id) ? 'rgba(59, 130, 246, 0.18)' : dropTargetId === folder.id ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                            opacity: draggingItem?.id === folder.id ? 0.4 : 1,
                          }}
                          onMouseEnter={e => { if (dropTargetId !== folder.id && !isItemSelected('folder', folder.id)) e.currentTarget.style.background = C.bgHover }}
                          onMouseLeave={e => { if (dropTargetId !== folder.id && !isItemSelected('folder', folder.id)) e.currentTarget.style.background = 'transparent' }}>
                          <Folder size={16} style={{ color: C.accent, flexShrink: 0 }} />
                          {editingId === folder.id ? (
                            <InlineInput value={editingValue} onChange={setEditingValue}
                              onConfirm={() => renameFolder(folder.id, editingValue)} onCancel={() => setEditingId(null)} />
                          ) : (
                            <span onClick={() => navigateToFolder(folder.id, folder.name)}
                              style={{ flex: 1, fontSize: 13, color: C.text, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {folder.name}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>
                            {folder._count.children + folder._count.documents + folder._count.files} items
                          </span>
                          <button onClick={e => { e.stopPropagation(); setMenuId(menuId === folder.id ? null : folder.id) }}
                            style={iconBtnSmall}
                            onMouseEnter={e => { e.currentTarget.style.color = C.text }}
                            onMouseLeave={e => { e.currentTarget.style.color = C.textMuted }}>
                            <MoreHorizontal size={14} />
                          </button>
                          {menuId === folder.id && (
                            <ContextMenu
                              onRename={() => { setEditingId(folder.id); setEditingValue(folder.name); setMenuId(null) }}
                              onDelete={() => { setMenuId(null); setConfirmDelete({ name: folder.name, action: () => deleteFolder(folder.id) }) }}
                              onShare={() => copyShareLink('folder', folder.id)}
                              onClose={() => setMenuId(null)} />
                          )}
                        </div>
                      ))}

                      {documents.map(doc => (
                        <div key={doc.id} data-sel-type="document" data-sel-id={doc.id} data-sel-name={doc.title}
                          draggable onDragStart={e => onItemDragStart(e, { type: 'document', id: doc.id })} onDragEnd={onItemDragEnd}
                          onClick={e => handleItemClick(e, { type: 'document', id: doc.id, name: doc.title })}
                          onDoubleClick={() => openDocument(doc.id)}
                          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ type: 'document', id: doc.id, x: e.clientX, y: e.clientY, name: doc.title }); setMenuId(null) }}
                          style={{ ...rowStyle, position: 'relative', opacity: draggingItem?.id === doc.id ? 0.4 : 1, background: isItemSelected('document', doc.id) ? 'rgba(59, 130, 246, 0.18)' : 'transparent' }}
                          onMouseEnter={e => { if (!isItemSelected('document', doc.id)) e.currentTarget.style.background = C.bgHover }}
                          onMouseLeave={e => { if (!isItemSelected('document', doc.id)) e.currentTarget.style.background = 'transparent' }}>
                          <FileText size={16} style={{ color: C.accent, flexShrink: 0 }} />
                          {editingId === doc.id ? (
                            <InlineInput value={editingValue} onChange={setEditingValue}
                              onConfirm={() => renameDocument(doc.id, editingValue)} onCancel={() => setEditingId(null)} />
                          ) : (
                            <span onClick={() => openDocument(doc.id)}
                              style={{ flex: 1, fontSize: 13, color: C.text, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.title}
                            </span>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            {doc.edits[0] && (
                              <span style={{ fontSize: 10, color: C.textMuted }}>{displayName(doc.edits[0].user)} · {timeAgo(doc.edits[0].createdAt)}</span>
                            )}
                            <button onClick={e => { e.stopPropagation(); setMenuId(menuId === doc.id ? null : doc.id) }}
                              style={iconBtnSmall}
                              onMouseEnter={e => { e.currentTarget.style.color = C.text }}
                              onMouseLeave={e => { e.currentTarget.style.color = C.textMuted }}>
                              <MoreHorizontal size={14} />
                            </button>
                          </div>
                          {menuId === doc.id && (
                            <ContextMenu
                              onRename={() => { setEditingId(doc.id); setEditingValue(doc.title); setMenuId(null) }}
                              onDelete={() => { setMenuId(null); setConfirmDelete({ name: doc.title, action: () => deleteDocument(doc.id) }) }}
                              onShare={() => copyShareLink('document', doc.id)}
                              onClose={() => setMenuId(null)} />
                          )}
                        </div>
                      ))}

                      {links.map(link => (
                        <div key={link.id} data-sel-type="link" data-sel-id={link.id} data-sel-name={link.title || link.url}
                          onClick={e => handleItemClick(e, { type: 'link', id: link.id, name: link.title || link.url })}
                          onDoubleClick={() => openFeedbackLink(link.id)}
                          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ type: 'link', id: link.id, x: e.clientX, y: e.clientY, name: link.title || link.url }); setMenuId(null) }}
                          style={{ ...rowStyle, position: 'relative', background: isItemSelected('link', link.id) ? 'rgba(59, 130, 246, 0.18)' : 'transparent' }}
                          onMouseEnter={e => { if (!isItemSelected('link', link.id)) e.currentTarget.style.background = C.bgHover }}
                          onMouseLeave={e => { if (!isItemSelected('link', link.id)) e.currentTarget.style.background = 'transparent' }}>
                          <Globe size={16} style={{ color: '#a78bfa', flexShrink: 0 }} />
                          {editingId === link.id ? (
                            <InlineInput value={editingValue} onChange={setEditingValue}
                              onConfirm={() => renameLink(link.id, editingValue)} onCancel={() => setEditingId(null)} />
                          ) : (
                            <span onClick={() => openFeedbackLink(link.id)}
                              style={{ flex: 1, fontSize: 13, color: C.text, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {link.title || new URL(link.url).hostname}
                            </span>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <span style={{ fontSize: 10, color: C.textMuted }}>{link._count.pins} pin{link._count.pins !== 1 ? 's' : ''}</span>
                            <button onClick={e => { e.stopPropagation(); setMenuId(menuId === link.id ? null : link.id) }}
                              style={iconBtnSmall}
                              onMouseEnter={e => { e.currentTarget.style.color = C.text }}
                              onMouseLeave={e => { e.currentTarget.style.color = C.textMuted }}>
                              <MoreHorizontal size={14} />
                            </button>
                          </div>
                          {menuId === link.id && (
                            <ContextMenu
                              onRename={() => { setEditingId(link.id); setEditingValue(link.title || link.url); setMenuId(null) }}
                              onDelete={() => { setMenuId(null); setConfirmDelete({ name: link.title || link.url, action: () => deleteLink(link.id) }) }}
                              onShare={() => copyShareLink('link', link.id)}
                              onClose={() => setMenuId(null)} />
                          )}
                        </div>
                      ))}

                      {files.map(file => (
                        <div key={file.id} data-sel-type="file" data-sel-id={file.id} data-sel-name={file.name}
                          draggable onDragStart={e => onItemDragStart(e, { type: 'file', id: file.id })} onDragEnd={onItemDragEnd}
                          onClick={e => { handleItemClick(e, { type: 'file', id: file.id, name: file.name }) }}
                          onDoubleClick={() => {
                              if (isPreviewableFile(file)) { track('box:file:open', { fileId: file.id, name: file.name, mime: file.mimeType }); setLightboxFile(file) }
                              else { track('box:file:download', { fileId: file.id, name: file.name }); downloadFile(file) }
                            }}
                          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ type: 'file', id: file.id, x: e.clientX, y: e.clientY, name: file.name, item: file }); setMenuId(null) }}
                          style={{ ...rowStyle, position: 'relative', opacity: draggingItem?.id === file.id ? 0.4 : 1, cursor: 'pointer', background: isItemSelected('file', file.id) ? 'rgba(59, 130, 246, 0.18)' : 'transparent' }}
                          onMouseEnter={e => { if (!isItemSelected('file', file.id)) e.currentTarget.style.background = C.bgHover }}
                          onMouseLeave={e => { if (!isItemSelected('file', file.id)) e.currentTarget.style.background = 'transparent' }}>
                          {isImageFile(file) ? (
                            <div style={{ width: 18, height: 18, borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                              <AuthImage src={`${config.apiBase}${file.url}`} config={config} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                          ) : (
                            <File size={16} style={{ color: fileTypeAccent(file), flexShrink: 0 }} />
                          )}
                          <span style={{ flex: 1, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <span style={{ fontSize: 10, color: C.textMuted }}>{formatSize(file.size)}</span>
                            <span style={{ fontSize: 10, color: C.textMuted }}>{displayName(file.uploader)}</span>
                            <button onClick={e => { e.stopPropagation(); downloadFile(file) }}
                              style={{ ...iconBtnSmall, color: C.textMuted }}
                              onMouseEnter={e => { e.currentTarget.style.color = C.text }}
                              onMouseLeave={e => { e.currentTarget.style.color = C.textMuted }}>
                              <Download size={13} />
                            </button>
                            <button onClick={e => { e.stopPropagation(); setMenuId(menuId === file.id ? null : file.id) }}
                              style={iconBtnSmall}
                              onMouseEnter={e => { e.currentTarget.style.color = C.text }}
                              onMouseLeave={e => { e.currentTarget.style.color = C.textMuted }}>
                              <MoreHorizontal size={14} />
                            </button>
                          </div>
                          {menuId === file.id && (
                            <FileMenu
                              onDownload={() => downloadFile(file)}
                              onShare={() => copyShareLink('file', file.id)}
                              onDelete={() => { setMenuId(null); setConfirmDelete({ name: file.name, action: () => deleteFile(file.id) }) }}
                              onClose={() => setMenuId(null)} />
                          )}
                        </div>
                      ))}
                    </>
                  )}

                  {/* ── COLUMNS VIEW (Finder-style) ───────────────────── */}
                  {viewMode === 'columns' && (() => {
                    const allCols = [
                      { folders, documents, files, links, selectedId: col0Selected },
                      ...subColumns.map(sc => ({ folders: sc.folders, documents: sc.documents, files: sc.files, links: sc.links || [], selectedId: sc.selectedId })),
                    ]
                    return (
                      // v1.5.2111 — minWidth: 0 lets the inner scroller actually scroll
                      // when the outer flex parent is narrow.
                      <div style={{ display: 'flex', height: '100%', minWidth: 0, overflow: 'hidden' }}>
                        {/* Back button for root navigation */}
                        {currentFolderId && (
                          <div onClick={navigateUp}
                            style={{
                              position: 'absolute', top: 8, left: 8, zIndex: 10,
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                              color: C.textMuted, fontSize: 11, background: C.bgHover,
                            }}>
                            <ArrowLeft size={12} /> Back
                          </div>
                        )}
                        {/* Scrollable columns */}
                        <div ref={columnsRef} style={{ flex: 1, display: 'flex', overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}>
                          {allCols.map((col, colIdx) => (
                            <div key={colIdx}
                              onDragOver={e => { if (draggingItem) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDropColIdx(colIdx) } }}
                              onDragLeave={e => { if (dropColIdx === colIdx && !e.currentTarget.contains(e.relatedTarget as Node)) setDropColIdx(null) }}
                              onDrop={e => { onColumnDrop(e, colIdx); setDropColIdx(null) }}
                              style={{
                              width: 220, minWidth: 220, flexShrink: 0,
                              borderRight: `1px solid ${C.separator}`,
                              overflowY: 'auto',
                              position: 'relative',
                              background: colIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                            }}>
                              {/* Drop overlay */}
                              {draggingItem && dropColIdx === colIdx && !dropTargetId && (
                                <div style={{
                                  position: 'absolute', inset: 0, zIndex: 5,
                                  background: 'rgba(59, 130, 246, 0.08)',
                                  border: '2px dashed rgba(59, 130, 246, 0.4)',
                                  borderRadius: 6,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  pointerEvents: 'none',
                                }}>
                                  <span style={{ fontSize: 11, color: C.accent, fontWeight: 600, opacity: 0.8 }}>Drop here to move</span>
                                </div>
                              )}
                              {col.folders.map(folder => {
                                const isSel = col.selectedId === folder.id
                                const mSel = isItemSelected('folder', folder.id)
                                return (
                                  <div key={folder.id}
                                    data-sel-type="folder" data-sel-id={folder.id} data-sel-name={folder.name}
                                    onClick={e => { if (handleItemClick(e, { type: 'folder', id: folder.id, name: folder.name })) return; if (editingId !== folder.id) handleColumnSelect(colIdx, 'folder', folder.id) }}
                                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ type: 'folder', id: folder.id, x: e.clientX, y: e.clientY, name: folder.name }); setMenuId(null) }}
                                    draggable onDragStart={e => onItemDragStart(e, { type: 'folder', id: folder.id })} onDragEnd={onItemDragEnd}
                                    onDragOver={e => { onFolderDragOver(e, folder.id); setDropColIdx(null) }} onDragLeave={onFolderDragLeave}
                                    onDrop={e => onFolderDrop(e, folder.id)}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                                      cursor: 'pointer', fontSize: 12,
                                      background: mSel ? 'rgba(59, 130, 246, 0.18)' : isSel ? C.accent : dropTargetId === folder.id ? 'rgba(59,130,246,0.25)' : 'transparent',
                                      color: isSel && !mSel ? '#fff' : dropTargetId === folder.id ? C.accent : C.text,
                                      outline: mSel ? `1px solid ${C.accent}` : dropTargetId === folder.id ? `2px solid ${C.accent}` : 'none',
                                      outlineOffset: -2,
                                      borderRadius: mSel ? 4 : dropTargetId === folder.id ? 4 : 0,
                                      transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={e => { if (!isSel && !mSel && dropTargetId !== folder.id) e.currentTarget.style.background = C.bgHover }}
                                    onMouseLeave={e => { if (!isSel && !mSel && dropTargetId !== folder.id) e.currentTarget.style.background = 'transparent' }}>
                                    <Folder size={14} style={{ color: isSel ? '#5ba8e6' : C.accent, flexShrink: 0 }} />
                                    {editingId === folder.id ? (
                                      <InlineInput value={editingValue} onChange={setEditingValue}
                                        onConfirm={() => renameFolder(folder.id, editingValue)} onCancel={() => setEditingId(null)} />
                                    ) : (
                                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                                    )}
                                    {editingId !== folder.id && (
                                      <>
                                        <span style={{ fontSize: 10, opacity: 0.5, flexShrink: 0, marginRight: 2 }}>{folder._count.children + folder._count.documents + folder._count.files}</span>
                                        <ChevronRight size={12} style={{ flexShrink: 0, opacity: 0.4 }} />
                                      </>
                                    )}
                                  </div>
                                )
                              })}
                              {col.documents.map(doc => {
                                const isSel = col.selectedId === doc.id
                                const mSel = isItemSelected('document', doc.id)
                                return (
                                  <div key={doc.id}
                                    data-sel-type="document" data-sel-id={doc.id} data-sel-name={doc.title}
                                    onClick={e => { if (handleItemClick(e, { type: 'document', id: doc.id, name: doc.title })) return; if (editingId !== doc.id) handleColumnSelect(colIdx, 'document', doc.id) }}
                                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ type: 'document', id: doc.id, x: e.clientX, y: e.clientY, name: doc.title }); setMenuId(null) }}
                                    draggable onDragStart={e => onItemDragStart(e, { type: 'document', id: doc.id })} onDragEnd={onItemDragEnd}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                                      cursor: 'pointer', fontSize: 12,
                                      background: mSel ? 'rgba(59, 130, 246, 0.18)' : isSel ? C.accent : 'transparent',
                                      color: isSel && !mSel ? '#fff' : C.text,
                                      outline: mSel ? `1px solid ${C.accent}` : 'none',
                                      outlineOffset: -2,
                                      borderRadius: mSel ? 4 : 0,
                                      transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={e => { if (!isSel && !mSel) e.currentTarget.style.background = C.bgHover }}
                                    onMouseLeave={e => { if (!isSel && !mSel) e.currentTarget.style.background = 'transparent' }}>
                                    <FileText size={14} style={{ color: isSel ? '#fff' : C.accent, flexShrink: 0 }} />
                                    {editingId === doc.id ? (
                                      <InlineInput value={editingValue} onChange={setEditingValue}
                                        onConfirm={() => renameDocument(doc.id, editingValue)} onCancel={() => setEditingId(null)} />
                                    ) : (
                                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
                                    )}
                                  </div>
                                )
                              })}
                              {(col.links || []).map(link => {
                                const isSel = col.selectedId === link.id
                                const mSel = isItemSelected('link', link.id)
                                return (
                                  <div key={link.id}
                                    data-sel-type="link" data-sel-id={link.id} data-sel-name={link.title || link.url}
                                    onClick={e => { if (handleItemClick(e, { type: 'link', id: link.id, name: link.title || link.url })) return; handleColumnSelect(colIdx, 'link', link.id) }}
                                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ type: 'link', id: link.id, x: e.clientX, y: e.clientY, name: link.title || link.url }); setMenuId(null) }}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                                      cursor: 'pointer', fontSize: 12,
                                      background: mSel ? 'rgba(59, 130, 246, 0.18)' : isSel ? C.accent : 'transparent',
                                      color: isSel && !mSel ? '#fff' : C.text,
                                      outline: mSel ? `1px solid ${C.accent}` : 'none',
                                      outlineOffset: -2,
                                      borderRadius: mSel ? 4 : 0,
                                      transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={e => { if (!isSel && !mSel) e.currentTarget.style.background = C.bgHover }}
                                    onMouseLeave={e => { if (!isSel && !mSel) e.currentTarget.style.background = 'transparent' }}>
                                    <Globe size={14} style={{ color: isSel ? '#fff' : '#a78bfa', flexShrink: 0 }} />
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.title || new URL(link.url).hostname}</span>
                                  </div>
                                )
                              })}
                              {col.files.map(file => {
                                const isSel = col.selectedId === file.id
                                const mSel = isItemSelected('file', file.id)
                                return (
                                  <div key={file.id}
                                    data-sel-type="file" data-sel-id={file.id} data-sel-name={file.name}
                                    onClick={e => { if (handleItemClick(e, { type: 'file', id: file.id, name: file.name })) return; handleColumnSelect(colIdx, 'file', file.id, file) }}
                                    onDoubleClick={() => {
                              if (isPreviewableFile(file)) { track('box:file:open', { fileId: file.id, name: file.name, mime: file.mimeType }); setLightboxFile(file) }
                              else { track('box:file:download', { fileId: file.id, name: file.name }); downloadFile(file) }
                            }}
                                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ type: 'file', id: file.id, x: e.clientX, y: e.clientY, name: file.name, item: file }); setMenuId(null) }}
                                    draggable onDragStart={e => onItemDragStart(e, { type: 'file', id: file.id })} onDragEnd={onItemDragEnd}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                                      cursor: 'pointer', fontSize: 12,
                                      background: mSel ? 'rgba(59, 130, 246, 0.18)' : isSel ? C.accent : 'transparent',
                                      color: isSel && !mSel ? '#fff' : C.text,
                                      outline: mSel ? `1px solid ${C.accent}` : 'none',
                                      outlineOffset: -2,
                                      borderRadius: mSel ? 4 : 0,
                                      transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={e => { if (!isSel && !mSel) e.currentTarget.style.background = C.bgHover }}
                                    onMouseLeave={e => { if (!isSel && !mSel) e.currentTarget.style.background = 'transparent' }}>
                                    {isImageFile(file) ? (
                                      <div style={{ width: 14, height: 14, borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                                        <AuthImage src={`${config.apiBase}${file.url}`} config={config}
                                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      </div>
                                    ) : (
                                      <File size={14} style={{ color: isSel ? '#fff' : fileTypeAccent(file), flexShrink: 0 }} />
                                    )}
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                  </div>
                                )
                              })}
                              {col.folders.length === 0 && col.documents.length === 0 && col.files.length === 0 && (col.links || []).length === 0 && (
                                <div style={{ padding: '16px 8px', textAlign: 'center', color: C.textMuted, fontSize: 11 }}>Empty</div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Preview pane */}
                        {colPreview && (
                          <div style={{
                            width: 260, flexShrink: 0, borderLeft: `1px solid ${C.separator}`,
                            background: C.lgBg, overflowY: 'auto', padding: '20px 16px',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                          }}>
                            {/* v1.5.2111 — file preview now branches on
                                MIME so videos / audio / PDFs render inline
                                instead of falling back to a generic icon. */}
                            {(() => {
                              const mime = (colPreview.mimeType || '').toLowerCase()
                              const url = `${config.apiBase}${colPreview.url}`
                              if (isImageFile(colPreview)) {
                                return (
                                  <div style={{ width: '100%', borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}
                                    onClick={() => setLightboxFile(colPreview)}>
                                    <AuthImage src={url} config={config}
                                      style={{ width: '100%', objectFit: 'contain', maxHeight: 200, display: 'block' }} />
                                  </div>
                                )
                              }
                              if (mime.startsWith('video/')) {
                                return (
                                  <video controls preload="metadata"
                                    src={url}
                                    style={{ width: '100%', maxHeight: 200, borderRadius: 8, background: '#000' }} />
                                )
                              }
                              if (mime.startsWith('audio/')) {
                                return (
                                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                    <File size={36} style={{ color: C.textSecondary, opacity: 0.4 }} />
                                    <audio controls src={url} style={{ width: '100%' }} />
                                  </div>
                                )
                              }
                              if (mime === 'application/pdf') {
                                return (
                                  <div style={{ width: '100%', height: 200, borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                                    <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }} title={colPreview.name} />
                                  </div>
                                )
                              }
                              return <File size={48} style={{ color: C.textSecondary, opacity: 0.4 }} />
                            })()}
                            <div style={{ width: '100%' }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, wordBreak: 'break-word', textAlign: 'center' }}>
                                {colPreview.name}
                              </div>
                              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {[
                                  ['Kind', colPreview.mimeType || 'Unknown'],
                                  ['Size', formatSize(colPreview.size)],
                                  ['Created', new Date(colPreview.createdAt).toLocaleDateString()],
                                  ['Uploaded by', displayName(colPreview.uploader)],
                                ].map(([label, val]) => (
                                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                    <span style={{ color: C.textMuted }}>{label}</span>
                                    <span style={{ color: C.text, textAlign: 'right', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                                  </div>
                                ))}
                              </div>
                              <button onClick={() => downloadFile(colPreview)}
                                style={{
                                  marginTop: 16, width: '100%', padding: '6px 0', borderRadius: 6,
                                  border: `1px solid ${C.separator}`, background: C.bgHover,
                                  color: C.text, fontSize: 12, cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = C.bgActive }}
                                onMouseLeave={e => { e.currentTarget.style.background = C.bgHover }}>
                                <Download size={13} /> Download
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* ── GALLERY VIEW (Finder-style preview + filmstrip) ── */}
                  {viewMode === 'gallery' && (() => {
                    type GItem = { kind: 'folder'; data: RFolder } | { kind: 'document'; data: RDocument } | { kind: 'file'; data: RFile } | { kind: 'link'; data: RLink }
                    const items: GItem[] = [
                      ...folders.map(f => ({ kind: 'folder' as const, data: f })),
                      ...documents.map(d => ({ kind: 'document' as const, data: d })),
                      ...links.map(l => ({ kind: 'link' as const, data: l })),
                      ...files.map(f => ({ kind: 'file' as const, data: f })),
                    ]
                    const safeIdx = items.length > 0 ? Math.min(galleryIdx, items.length - 1) : -1
                    const sel = safeIdx >= 0 ? items[safeIdx] : null

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                        {/* Back */}
                        {currentFolderId && (
                          <div onClick={navigateUp}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 16px', cursor: 'pointer', color: C.textMuted, fontSize: 12, flexShrink: 0 }}
                            onMouseEnter={e => { e.currentTarget.style.color = C.text }}
                            onMouseLeave={e => { e.currentTarget.style.color = C.textMuted }}>
                            <ArrowLeft size={14} /> Back
                          </div>
                        )}

                        {items.length === 0 ? (
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted }}>
                            <div style={{ textAlign: 'center' }}>
                              <FolderOpen size={36} strokeWidth={1} style={{ opacity: 0.3, marginBottom: 10 }} />
                              <p style={{ fontSize: 13 }}>This folder is empty</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Large preview area */}
                            <div style={{
                              flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'rgba(0,0,0,0.25)', borderRadius: 8, margin: '8px 16px',
                              overflow: 'hidden', position: 'relative',
                            }}>
                              {sel && sel.kind === 'folder' && (
                                <div style={{ textAlign: 'center', cursor: 'pointer' }}
                                  onDoubleClick={() => navigateToFolder(sel.data.id, (sel.data as RFolder).name)}>
                                  <Folder size={80} style={{ color: C.accent, opacity: 0.7 }} />
                                  <div style={{ fontSize: 14, color: C.text, marginTop: 8, fontWeight: 500 }}>{(sel.data as RFolder).name}</div>
                                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                                    {(sel.data as RFolder)._count.children + (sel.data as RFolder)._count.documents + (sel.data as RFolder)._count.files} items
                                  </div>
                                </div>
                              )}
                              {sel && sel.kind === 'document' && (
                                <div style={{ textAlign: 'center', cursor: 'pointer' }}
                                  onDoubleClick={() => openDocument(sel.data.id)}>
                                  <FileText size={80} style={{ color: C.accent, opacity: 0.7 }} />
                                  <div style={{ fontSize: 14, color: C.text, marginTop: 8, fontWeight: 500 }}>{(sel.data as RDocument).title}</div>
                                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                                    {displayName((sel.data as RDocument).creator)} · {timeAgo((sel.data as RDocument).updatedAt)}
                                  </div>
                                </div>
                              )}
                              {sel && sel.kind === 'file' && (() => {
                                const f = sel.data as RFile
                                if (isImageFile(f)) return (
                                  <div style={{ maxWidth: '100%', maxHeight: '100%', padding: 12, cursor: 'pointer' }}
                                    onClick={() => setLightboxFile(f)}>
                                    <AuthImage src={`${config.apiBase}${f.url}`} config={config}
                                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4, display: 'block' }} />
                                  </div>
                                )
                                if (isPreviewableFile(f)) return (
                                  <div style={{ maxWidth: '100%', maxHeight: '100%', padding: 12, cursor: 'pointer', textAlign: 'center' }}
                                    onClick={() => setLightboxFile(f)}>
                                    <File size={80} style={{ color: C.accent, opacity: 0.7 }} />
                                    <div style={{ fontSize: 14, color: C.text, marginTop: 8, fontWeight: 500 }}>{f.name}</div>
                                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Click to preview · {formatSize(f.size)}</div>
                                  </div>
                                )
                                return (
                                  <div style={{ textAlign: 'center' }}>
                                    <File size={80} style={{ color: C.textSecondary, opacity: 0.5 }} />
                                    <div style={{ fontSize: 14, color: C.text, marginTop: 8, fontWeight: 500 }}>{f.name}</div>
                                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{formatSize(f.size)}</div>
                                  </div>
                                )
                              })()}
                              {sel && sel.kind === 'link' && (
                                <div style={{ textAlign: 'center', cursor: 'pointer' }}
                                  onDoubleClick={() => openFeedbackLink(sel.data.id)}>
                                  <Globe size={80} style={{ color: '#a78bfa', opacity: 0.7 }} />
                                  <div style={{ fontSize: 14, color: C.text, marginTop: 8, fontWeight: 500 }}>{(sel.data as RLink).title || new URL((sel.data as RLink).url).hostname}</div>
                                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                                    {(sel.data as RLink)._count.pins} pin{(sel.data as RLink)._count.pins !== 1 ? 's' : ''} · Double-click to open
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Filmstrip thumbnails */}
                            <div style={{
                              flexShrink: 0, padding: '8px 16px 12px',
                              overflowX: 'auto', overflowY: 'hidden',
                              display: 'flex', gap: 4, alignItems: 'center',
                              borderTop: `1px solid ${C.separator}`, background: C.lgBg,
                            }}>
                              {items.map((item, i) => {
                                const isActive = i === safeIdx
                                return (
                                  <div key={item.data.id}
                                    onClick={() => setGalleryIdx(i)}
                                    onDoubleClick={() => {
                                      if (item.kind === 'folder') navigateToFolder(item.data.id, (item.data as RFolder).name)
                                      else if (item.kind === 'document') openDocument(item.data.id)
                                      else if (item.kind === 'link') openFeedbackLink(item.data.id)
                                      else if (item.kind === 'file' && isPreviewableFile(item.data as RFile)) setLightboxFile(item.data as RFile)
                                    }}
                                    onContextMenu={e => {
                                      e.preventDefault(); e.stopPropagation()
                                      const name = item.kind === 'folder' ? (item.data as RFolder).name : item.kind === 'document' ? (item.data as RDocument).title : item.kind === 'link' ? ((item.data as RLink).title || (item.data as RLink).url) : (item.data as RFile).name
                                      setCtxMenu({ type: item.kind, id: item.data.id, x: e.clientX, y: e.clientY, name, item: item.kind === 'file' ? item.data : undefined })
                                      setMenuId(null)
                                    }}
                                    draggable
                                    onDragStart={e => onItemDragStart(e, { type: item.kind, id: item.data.id })}
                                    onDragEnd={onItemDragEnd}
                                    onDragOver={item.kind === 'folder' ? (e => onFolderDragOver(e, item.data.id)) : undefined}
                                    onDragLeave={item.kind === 'folder' ? onFolderDragLeave : undefined}
                                    onDrop={item.kind === 'folder' ? (e => onFolderDrop(e, item.data.id)) : undefined}
                                    style={{
                                      width: 64, height: 52, flexShrink: 0, borderRadius: 6,
                                      border: isActive ? `2px solid ${C.accent}` : '2px solid transparent',
                                      background: C.bgHover, overflow: 'hidden', cursor: 'pointer',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      transition: 'border-color 0.15s',
                                      opacity: draggingItem?.id === item.data.id ? 0.4 : 1,
                                    }}>
                                    {item.kind === 'folder' && <Folder size={24} style={{ color: C.accent }} />}
                                    {item.kind === 'document' && <FileText size={24} style={{ color: C.accent }} />}
                                    {item.kind === 'link' && <Globe size={24} style={{ color: '#a78bfa' }} />}
                                    {item.kind === 'file' && (
                                      <FileThumbnail file={item.data as RFile} config={config} size={64} height={52} />
                                    )}
                                  </div>
                                )
                              })}
                            </div>

                            {/* Info bar */}
                            {sel && (
                              <div style={{
                                flexShrink: 0, padding: '6px 16px', borderTop: `1px solid ${C.separator}`,
                                display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: C.textMuted,
                              }}>
                                <span style={{ fontWeight: 500, color: C.text }}>
                                  {sel.kind === 'folder' ? (sel.data as RFolder).name : sel.kind === 'document' ? (sel.data as RDocument).title : (sel.data as RFile).name}
                                </span>
                                {sel.kind === 'file' && <span>{formatSize((sel.data as RFile).size)}</span>}
                                {sel.kind === 'file' && <span>{(sel.data as RFile).mimeType}</span>}
                                <span style={{ marginLeft: 'auto' }}>{safeIdx + 1} of {items.length}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })()}

                  {/* Empty state */}
                  {viewMode !== 'gallery' && folders.length === 0 && documents.length === 0 && files.length === 0 && (
                    <div style={{ padding: '48px 16px', textAlign: 'center', color: C.textMuted }}>
                      <FolderOpen size={36} strokeWidth={1} style={{ opacity: 0.3, marginBottom: 10 }} />
                      <p style={{ fontSize: 13 }}>This folder is empty</p>
                      <p style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>Create a folder, document, upload a file, or drag and drop files here</p>
                    </div>
                  )}

                  {/* Rubber band selection rectangle */}
                  {rubberBand && Math.abs(rubberBand.x - rubberBand.startX) + Math.abs(rubberBand.y - rubberBand.startY) > 5 && (
                    <div style={{
                      position: 'fixed',
                      left: Math.min(rubberBand.startX, rubberBand.x),
                      top: Math.min(rubberBand.startY, rubberBand.y),
                      width: Math.abs(rubberBand.x - rubberBand.startX),
                      height: Math.abs(rubberBand.y - rubberBand.startY),
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      borderRadius: 2,
                      pointerEvents: 'none',
                      zIndex: 100,
                    }} />
                  )}

                  {/* Multi-select floating action bar */}
                  {selectedItems.size > 0 && (
                    <div style={{
                      position: 'sticky', bottom: 12, left: 0, right: 0,
                      display: 'flex', justifyContent: 'center', zIndex: 50, pointerEvents: 'none',
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '8px 16px', borderRadius: 10,
                        background: 'rgba(28, 28, 30, 0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                        border: `1px solid rgba(255,255,255,0.1)`,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        pointerEvents: 'auto',
                      }}>
                        <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>
                          {selectedItems.size} selected
                        </span>
                        <div style={{ width: 1, height: 16, background: C.separator }} />
                        <button onClick={bulkDeleteSelected}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '5px 12px', borderRadius: 6, border: 'none',
                            background: 'rgba(239,68,68,0.15)', color: C.danger,
                            fontSize: 12, fontWeight: 500, cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.25)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)' }}>
                          <Trash2 size={13} /> Delete
                        </button>
                        <button onClick={() => setSelectedItems(new Map())}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 24, height: 24, borderRadius: 6, border: 'none',
                            background: 'transparent', color: C.textMuted, cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = C.text }}
                          onMouseLeave={e => { e.currentTarget.style.color = C.textMuted }}>
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Right-click context menu overlay ────────────────────────── */}
      {ctxMenu && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null) }} />
          <div style={{
            position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 151,
            background: 'rgba(20, 20, 20, 0.35)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            border: `1px solid rgba(255,255,255,0.08)`,
            borderRadius: 8, padding: 4, minWidth: 160, boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          }}>
            {ctxMenu.type === 'folder' && (
              <>
                <button onClick={() => { navigateToFolder(ctxMenu.id, ctxMenu.name); setCtxMenu(null) }} style={menuItemStyle}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <FolderOpen size={13} /> Open
                </button>
                <button onClick={() => { setEditingId(ctxMenu.id); setEditingValue(ctxMenu.name); setCtxMenu(null) }} style={menuItemStyle}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <Pencil size={13} /> Rename
                </button>
                <button onClick={() => { copyShareLink('folder', ctxMenu.id); setCtxMenu(null) }} style={menuItemStyle}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <Link2 size={13} /> Copy Link
                </button>
                <div style={{ height: 1, background: C.separator, margin: '4px 0' }} />
                <button onClick={() => { const id = ctxMenu.id, name = ctxMenu.name; setCtxMenu(null); setConfirmDelete({ name, action: () => deleteFolder(id) }) }} style={{ ...menuItemStyle, color: C.danger }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <Trash2 size={13} /> Delete
                </button>
              </>
            )}
            {ctxMenu.type === 'document' && (
              <>
                <button onClick={() => { openDocument(ctxMenu.id); setCtxMenu(null) }} style={menuItemStyle}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <FileText size={13} /> Open
                </button>
                <button onClick={() => { setEditingId(ctxMenu.id); setEditingValue(ctxMenu.name); setCtxMenu(null) }} style={menuItemStyle}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <Pencil size={13} /> Rename
                </button>
                <button onClick={() => { copyShareLink('document', ctxMenu.id); setCtxMenu(null) }} style={menuItemStyle}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <Link2 size={13} /> Copy Link
                </button>
                <div style={{ height: 1, background: C.separator, margin: '4px 0' }} />
                <button onClick={() => { const id = ctxMenu.id, name = ctxMenu.name; setCtxMenu(null); setConfirmDelete({ name, action: () => deleteDocument(id) }) }} style={{ ...menuItemStyle, color: C.danger }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <Trash2 size={13} /> Delete
                </button>
              </>
            )}
            {ctxMenu.type === 'file' && (
              <>
                {ctxMenu.item && (
                  <>
                    <button onClick={() => { openFileInBrowser(ctxMenu.item!); setCtxMenu(null) }} style={menuItemStyle}
                      onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <ExternalLink size={13} /> Open in browser
                    </button>
                    <button onClick={() => { downloadFile(ctxMenu.item); setCtxMenu(null) }} style={menuItemStyle}
                      onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <Download size={13} /> Download
                    </button>
                  </>
                )}
                <button onClick={() => { copyShareLink('file', ctxMenu.id); setCtxMenu(null) }} style={menuItemStyle}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <Link2 size={13} /> Copy Link
                </button>
                <div style={{ height: 1, background: C.separator, margin: '4px 0' }} />
                <button onClick={() => { const id = ctxMenu.id, name = ctxMenu.name; setCtxMenu(null); setConfirmDelete({ name, action: () => deleteFile(id) }) }} style={{ ...menuItemStyle, color: C.danger }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <Trash2 size={13} /> Delete
                </button>
              </>
            )}
            {ctxMenu.type === 'link' && (
              <>
                <button onClick={() => { openFeedbackLink(ctxMenu.id); setCtxMenu(null) }} style={menuItemStyle}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <Globe size={13} /> Open
                </button>
                <button onClick={() => { setEditingId(ctxMenu.id); setEditingValue(ctxMenu.name); setCtxMenu(null) }} style={menuItemStyle}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <Pencil size={13} /> Rename
                </button>
                <div style={{ height: 1, background: C.separator, margin: '4px 0' }} />
                <button onClick={() => { const id = ctxMenu.id, name = ctxMenu.name; setCtxMenu(null); setConfirmDelete({ name, action: () => deleteLink(id) }) }} style={{ ...menuItemStyle, color: C.danger }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <Trash2 size={13} /> Delete
                </button>
              </>
            )}
          </div>
        </>,
        document.body
      )}

      {/* ── Activity Log Overlay ──────────────────────────────────── */}
      {showActivityLog && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 180, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
            onClick={() => setShowActivityLog(false)} />
          <div style={{
            position: 'fixed', top: '5%', right: '5%', bottom: '5%', width: 460, zIndex: 181,
            background: 'rgba(28, 28, 30, 0.92)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
            border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 12,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          }}>
            {/* Header */}
            <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${C.separator}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={16} style={{ color: C.accent }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Activity Log</span>
                {activityTotal > 0 && <span style={{ fontSize: 11, color: C.textMuted }}>({activityTotal})</span>}
              </div>
              <button onClick={() => setShowActivityLog(false)} style={{ ...iconBtn24, color: C.textMuted }}
                onMouseEnter={e => { e.currentTarget.style.color = C.text }}
                onMouseLeave={e => { e.currentTarget.style.color = C.textMuted }}>
                <X size={16} />
              </button>
            </div>
            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {activityLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                  <Loader size={20} style={{ color: C.textMuted, animation: 'spin 1s linear infinite' }} />
                </div>
              ) : activityLogs.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: C.textMuted, fontSize: 12 }}>No activity yet</div>
              ) : (
                activityLogs.map(log => (
                  <div key={log.id} style={{ padding: '10px 20px', display: 'flex', gap: 10, alignItems: 'flex-start', borderBottom: `1px solid rgba(255,255,255,0.03)` }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    {/* User avatar */}
                    <div style={{ width: 32, height: 32, borderRadius: 16, flexShrink: 0, overflow: 'hidden', background: C.bgHover, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      {log.user.avatarUrl ? (
                        <AuthImage src={`${config.apiBase}${log.user.avatarUrl}`} config={config} style={{ width: 32, height: 32, objectFit: 'cover' }} />
                      ) : (
                        <User size={14} style={{ color: C.textMuted }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Main action line */}
                      <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 600 }}>{log.user.alias || log.user.username}</span>
                        {' '}<span style={{ color: C.textMuted }}>{actionLabel(log.action)}</span>{' '}
                        {actionTargetIcon(log.targetType)}
                        <span style={{ fontWeight: 500, marginLeft: 2 }}>{log.targetName}</span>
                      </div>
                      {/* Project / Client breadcrumb */}
                      {(log.clientName || log.projectName) && (
                        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                          {log.clientName && <><Building2 size={9} style={{ opacity: 0.6 }} /> <span>{log.clientName}</span></>}
                          {log.clientName && log.projectName && <ChevronRight size={8} style={{ opacity: 0.4 }} />}
                          {log.projectName && <><Briefcase size={9} style={{ opacity: 0.6 }} /> <span>{log.projectName}</span></>}
                        </div>
                      )}
                      {/* Detail line for specific actions */}
                      {log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0 && (
                        <div style={{ fontSize: 10, color: C.textSecondary, marginTop: 3, padding: '3px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 4, display: 'inline-block' }}>
                          {'oldName' in log.details && 'newName' in log.details && (
                            <span>Renamed: <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{String(log.details.oldName)}</span> → <span style={{ fontWeight: 500 }}>{String(log.details.newName)}</span></span>
                          )}
                          {'fromFolder' in log.details && (
                            <span>Moved {log.details.fromFolder ? 'from another folder' : 'from root'} → {log.details.toFolder ? 'into folder' : 'to root'}</span>
                          )}
                        </div>
                      )}
                      {/* Timestamp */}
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={9} style={{ opacity: 0.5 }} />
                        <span>{formatTimeDetailed(log.createdAt)}</span>
                      </div>
                    </div>
                    {/* Action badge */}
                    <div style={{
                      padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
                      background: actionColor(log.action), color: actionTextColor(log.action), flexShrink: 0, marginTop: 2,
                    }}>
                      {log.action}
                    </div>
                  </div>
                ))
              )}
            </div>
            {/* Pagination */}
            {activityTotal > 50 && (
              <div style={{ padding: '10px 20px', borderTop: `1px solid ${C.separator}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexShrink: 0 }}>
                <button disabled={activityPage <= 1} onClick={() => loadActivityLogs(activityPage - 1)}
                  style={{ ...toolbarBtn, opacity: activityPage <= 1 ? 0.3 : 1 }}>
                  ← Prev
                </button>
                <span style={{ fontSize: 11, color: C.textMuted }}>Page {activityPage} of {Math.ceil(activityTotal / 50)}</span>
                <button disabled={activityPage >= Math.ceil(activityTotal / 50)} onClick={() => loadActivityLogs(activityPage + 1)}
                  style={{ ...toolbarBtn, opacity: activityPage >= Math.ceil(activityTotal / 50) ? 0.3 : 1 }}>
                  Next →
                </button>
              </div>
            )}
          </div>
        </>,
        document.body
      )}

      {/* ── Recycle Bin Overlay (Admin only) ────────────────────────── */}
      {showRecycleBin && auth.role === 'admin' && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 180, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
            onClick={() => setShowRecycleBin(false)} />
          <div style={{
            position: 'fixed', top: '5%', left: '50%', bottom: '5%', width: 520, marginLeft: -260, zIndex: 181,
            background: 'rgba(28, 28, 30, 0.92)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
            border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 12,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          }}>
            {/* Header */}
            <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${C.separator}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Trash2 size={16} style={{ color: C.danger }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Recycle Bin</span>
                {recycleBinItems.length > 0 && <span style={{ fontSize: 11, color: C.textMuted }}>({recycleBinItems.length})</span>}
              </div>
              <button onClick={() => setShowRecycleBin(false)} style={{ ...iconBtn24, color: C.textMuted }}
                onMouseEnter={e => { e.currentTarget.style.color = C.text }}
                onMouseLeave={e => { e.currentTarget.style.color = C.textMuted }}>
                <X size={16} />
              </button>
            </div>
            {/* Info banner */}
            <div style={{ padding: '8px 20px', background: 'rgba(255,200,50,0.06)', borderBottom: `1px solid rgba(255,255,255,0.04)`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <AlertCircle size={13} style={{ color: '#e6a817', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: C.textMuted }}>Items are permanently deleted after 30 days</span>
            </div>
            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {recycleBinLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                  <Loader size={20} style={{ color: C.textMuted, animation: 'spin 1s linear infinite' }} />
                </div>
              ) : recycleBinItems.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: C.textMuted }}>
                  <Trash2 size={28} strokeWidth={1.2} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <p style={{ fontSize: 12 }}>Recycle bin is empty</p>
                </div>
              ) : (() => {
                // Build hierarchy: items whose parent is also in the bin are nested
                const itemKey = (i: RecycleBinItem) => `${i.type}-${i.id}`
                const deletedIds = new Set(recycleBinItems.map(i => i.id))
                const childrenMap = new Map<string, RecycleBinItem[]>()
                const topLevel: RecycleBinItem[] = []
                for (const item of recycleBinItems) {
                  if (item.parentItemId && deletedIds.has(item.parentItemId)) {
                    const parentKey = item.parentItemId
                    if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, [])
                    childrenMap.get(parentKey)!.push(item)
                  } else {
                    topLevel.push(item)
                  }
                }
                const renderItem = (item: RecycleBinItem, depth: number) => {
                  const children = childrenMap.get(item.id) || []
                  const hasChildren = children.length > 0
                  const isExpanded = recycleBinExpanded.has(item.id)
                  return (
                    <div key={itemKey(item)}>
                      <div style={{
                        padding: `10px 20px 10px ${20 + depth * 24}px`, display: 'flex', alignItems: 'center', gap: 12,
                        borderBottom: `1px solid rgba(255,255,255,0.03)`,
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                        {/* Expand toggle */}
                        {hasChildren ? (
                          <button onClick={() => setRecycleBinExpanded(prev => {
                            const next = new Set(prev)
                            if (next.has(item.id)) next.delete(item.id); else next.add(item.id)
                            return next
                          })} style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: C.textMuted, padding: 0, flexShrink: 0 }}>
                            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </button>
                        ) : (
                          <div style={{ width: 18, flexShrink: 0 }} />
                        )}
                        {/* Preview thumbnail */}
                        {item.type === 'file' && item.url && item.mimeType?.startsWith('image/') ? (
                          <div style={{ width: 38, height: 38, borderRadius: 7, flexShrink: 0, overflow: 'hidden', background: C.bgHover, border: `1px solid rgba(255,255,255,0.06)` }}>
                            <AuthImage src={`${config.apiBase}${item.url}`} config={config}
                              style={{ width: 38, height: 38, objectFit: 'cover', opacity: 0.7 }} />
                          </div>
                        ) : (
                          <div style={{
                            width: 38, height: 38, borderRadius: 7, flexShrink: 0,
                            background: recycleTypeColor(item.type), display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: `1px solid rgba(255,255,255,0.04)`,
                          }}>
                            {recycleTypeIcon(item.type)}
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {item.name}
                            {hasChildren && (
                              <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 400 }}>({children.length})</span>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            <span style={{
                              padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
                              background: recycleTypeColor(item.type), letterSpacing: 0.3,
                            }}>{item.type}</span>
                            {item.parent && <span>· {item.parent}</span>}
                            {item.size != null && <span>· {formatSize(item.size)}</span>}
                          </div>
                          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {item.deletedBy && (
                              <>
                                <User size={9} style={{ opacity: 0.5 }} />
                                <span>{item.deletedBy.alias || item.deletedBy.username}</span>
                                <span>·</span>
                              </>
                            )}
                            <span>{timeAgo(item.deletedAt)}</span>
                            <span>·</span>
                            <span style={{ color: item.expired ? C.danger : 'rgba(251,191,36,0.8)' }}>
                              {item.expired ? 'Expired' : `Expires ${timeAgo(item.expiresAt, true)}`}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <button onClick={() => restoreItem(item.id, item.type)} title="Restore"
                            style={{ ...iconBtn24, color: '#4ade80' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(74,222,128,0.12)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                            <RotateCcw size={14} />
                          </button>
                          <button onClick={() => permanentDeleteItem(item.id, item.type)} title="Delete Permanently"
                            style={{ ...iconBtn24, color: C.danger }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      {isExpanded && children.map(child => renderItem(child, depth + 1))}
                    </div>
                  )
                }
                return topLevel.map(item => renderItem(item, 0))
              })()}
            </div>
          </div>
        </>,
        document.body
      )}

      {/* ── Lightbox overlay ────────────────────────────────────────── */}
      {lightboxFile && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }} onClick={() => setLightboxFile(null)}>
          {/* Top-right buttons */}
          <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 201, display: 'flex', gap: 8 }}>
            {isPdfFile(lightboxFile) && (
              <button onClick={e => { e.stopPropagation(); openFileInBrowser(lightboxFile) }}
                title="Open in browser"
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}>
                <ExternalLink size={18} />
              </button>
            )}
            <button onClick={e => { e.stopPropagation(); downloadFile(lightboxFile) }}
              style={{
                width: 36, height: 36, borderRadius: 18,
                background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}>
              <Download size={18} />
            </button>
            <button onClick={e => { e.stopPropagation(); setLightboxFile(null) }}
              style={{
                width: 36, height: 36, borderRadius: 18,
                background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}>
              <X size={20} />
            </button>
          </div>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', cursor: 'default' }}>
            <LightboxBody file={lightboxFile} config={config} />
            <div style={{ textAlign: 'center', marginTop: 8, color: '#fff', fontSize: 13, opacity: 0.8 }}>
              {lightboxFile.name}
              <span style={{ marginLeft: 10, opacity: 0.5 }}>{formatSize(lightboxFile.size)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Dialog ─────────────────────────────────── */}
      {linkUrlInput !== null && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
            onClick={() => setLinkUrlInput(null)} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 251,
            background: C.bgFloating, borderRadius: 12, padding: '24px 28px', minWidth: 380, maxWidth: 460,
            boxShadow: C.shadowHigh, border: `1px solid ${C.separator}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(167,139,250,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Globe size={18} style={{ color: '#a78bfa' }} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>Add Feedback Link</div>
            </div>
            <input
              autoFocus
              value={linkUrlInput}
              onChange={e => setLinkUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitLinkUrl(); if (e.key === 'Escape') setLinkUrlInput(null) }}
              placeholder="https://example.com"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.separator}`,
                background: C.bgHover, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box',
                marginBottom: 20,
              }}
              onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
              onBlur={e => { e.currentTarget.style.borderColor = C.separator }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setLinkUrlInput(null)} style={{
                padding: '7px 16px', borderRadius: 8, border: `1px solid ${C.separator}`, background: 'transparent',
                color: C.text, fontSize: 13, cursor: 'pointer', fontWeight: 500,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                Cancel
              </button>
              <button onClick={submitLinkUrl} disabled={!linkUrlInput?.trim()} style={{
                padding: '7px 16px', borderRadius: 8, border: 'none', background: !linkUrlInput?.trim() ? C.bgHover : C.accent,
                color: '#fff', fontSize: 13, cursor: !linkUrlInput?.trim() ? 'default' : 'pointer', fontWeight: 500,
                opacity: !linkUrlInput?.trim() ? 0.5 : 1,
              }}
                onMouseEnter={e => { if (linkUrlInput?.trim()) e.currentTarget.style.opacity = '0.85' }}
                onMouseLeave={e => { if (linkUrlInput?.trim()) e.currentTarget.style.opacity = '1' }}>
                Add Link
              </button>
            </div>
          </div>
        </>,
        document.body
      )}

      {confirmDelete && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
            onClick={() => setConfirmDelete(null)} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 251,
            background: C.bgFloating, borderRadius: 12, padding: '24px 28px', minWidth: 340, maxWidth: 420,
            boxShadow: C.shadowHigh, border: `1px solid ${C.separator}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={18} style={{ color: C.danger }} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>Delete Item</div>
            </div>
            <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5, marginBottom: 20 }}>
              Are you sure you want to delete <strong style={{ color: C.text }}>{confirmDelete.name}</strong>? This item will be moved to the recycle bin.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)} style={{
                padding: '7px 16px', borderRadius: 8, border: `1px solid ${C.separator}`, background: 'transparent',
                color: C.text, fontSize: 13, cursor: 'pointer', fontWeight: 500,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                Cancel
              </button>
              <button onClick={() => { confirmDelete.action(); setConfirmDelete(null) }} style={{
                padding: '7px 16px', borderRadius: 8, border: 'none', background: C.danger,
                color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 500,
              }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
                Delete
              </button>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* ── Project Members Modal (P3.26) ───────────────────────────────── */}
      {showMembers && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 260, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
            onClick={() => setShowMembers(null)} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 261,
            background: C.bgFloating, borderRadius: 12, padding: '20px 24px', width: 480, maxHeight: '70vh',
            boxShadow: C.shadowHigh, border: `1px solid ${C.separator}`, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <User size={18} style={{ color: C.accent }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Members of {showMembers.projectName}</div>
              <button onClick={() => setShowMembers(null)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: C.textMuted, cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12, lineHeight: 1.4 }}>
              A project with no members is world-readable. Add at least one member to make it private; admins always have access.
            </div>
            {membersLoading ? (
              <Loader size={16} style={{ color: C.textMuted, animation: 'spin 1s linear infinite' }} />
            ) : (
              <>
                <div style={{ overflowY: 'auto', flex: 1, marginBottom: 14 }}>
                  {members.length === 0 && (
                    <div style={{ fontSize: 12, color: C.textMuted, padding: '12px 0' }}>No members yet.</div>
                  )}
                  {members.map((m) => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                      {m.user.avatarUrl
                        ? <img src={m.user.avatarUrl} style={{ width: 28, height: 28, borderRadius: '50%' }} alt="" />
                        : <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.bgHover }} />}
                      <div style={{ flex: 1, fontSize: 12, color: C.text }}>
                        {m.user.alias || m.user.username}
                        <span style={{ marginLeft: 8, fontSize: 10, color: C.textMuted }}>{m.role}</span>
                      </div>
                      <button onClick={() => removeMember(m.user.id)} style={{
                        padding: '4px 10px', fontSize: 11, color: C.danger, background: 'transparent',
                        border: `1px solid ${C.separator}`, borderRadius: 6, cursor: 'pointer',
                      }}>Remove</button>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: `1px solid ${C.separator}`, paddingTop: 12 }}>
                  <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>Add member</div>
                  <select
                    onChange={(e) => {
                      const userId = e.target.value
                      if (!userId) return
                      addMember(userId, 'reviewer')
                      e.currentTarget.value = ''
                    }}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 6,
                      border: `1px solid ${C.separator}`, background: C.bgInput, color: C.text, fontSize: 12,
                    }}>
                    <option value="">Pick a user…</option>
                    {allUsers
                      .filter((u) => !members.some((m) => m.user.id === u.id))
                      .map((u) => (
                        <option key={u.id} value={u.id}>{u.alias || u.username}</option>
                      ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

// v1.5.2302 — videos/audio/PDF stream directly from the URL now, letting
// the browser do byte-range requests. The previous implementation
// bearer-fetched the entire blob first, which meant a 500MB video had to
// fully download before playback could even start. report-files live on
// the public-by-obscurity tier of /api/uploads so no auth header is
// needed; images stay on AuthImage because messaging attachments aren't
// always on the same tier.
function LightboxBody({ file, config }: { file: RFile; config: ApiConfig }) {
  const isVideo = isVideoFile(file)
  const isAudio = isAudioFile(file)
  const isPdf = isPdfFile(file)
  const src = `${config.apiBase}${file.url}`

  if (isImageFile(file)) {
    return <AuthImage src={src} config={config}
      style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 6 }} />
  }
  if (isVideo) {
    return <video controls autoPlay preload="metadata" src={src}
      style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 6, background: '#000' }} />
  }
  if (isAudio) {
    return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24 }}>
      <File size={48} style={{ color: '#fff', opacity: 0.6 }} />
      <audio controls autoPlay preload="metadata" src={src} style={{ width: 360, maxWidth: '90vw' }} />
    </div>
  }
  if (isPdf) {
    return <iframe src={src} title={file.name}
      style={{ width: '90vw', height: '85vh', border: 'none', borderRadius: 6, background: '#fff' }} />
  }
  return <div style={{ color: '#fff', padding: 24 }}>No preview available.</div>
}
