import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus, ChevronRight, ChevronDown, FolderOpen, Building2, Briefcase,
  MoreHorizontal, Trash2, Pencil, FileText, Upload, Folder, File,
  ArrowLeft, Loader, Download, User, Grid, List, Columns, Image,
  Link2, X, Clock, RotateCcw, AlertCircle,
} from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig, Auth } from '../../types'
import { AuthImage } from '../messages/Attachments'
import DocumentEditor from './DocumentEditor'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project { id: string; name: string; order: number }
interface Client { id: string; name: string; order: number; projects: Project[] }

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

interface DocDetail {
  id: string; title: string; content: string; folderId: string | null; projectId: string
  createdAt: string; updatedAt: string
  creator: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  edits: { id: string; summary: string | null; createdAt: string; user: { id: string; username: string; alias: string | null; avatarUrl: string | null } }[]
}

interface Selection { clientId: string; projectId: string }

type ViewMode = 'icons' | 'list' | 'columns' | 'gallery'
type DragItem = { type: 'folder' | 'document' | 'file'; id: string }
type SelectableItem = { type: 'folder' | 'document' | 'file'; id: string; name: string }

interface ColumnEntry {
  parentId: string | null
  folders: RFolder[]
  documents: RDocument[]
  files: RFile[]
  selectedId: string | null
}

interface AuditLogEntry {
  id: string; action: string; targetType: string; targetId: string; targetName: string
  details: Record<string, unknown> | null; projectId: string | null; createdAt: string
  projectName: string | null; clientName: string | null
  user: { id: string; username: string; alias: string | null; avatarUrl: string | null }
}

interface RecycleBinItem {
  id: string; type: string; name: string; deletedAt: string; expiresAt: string
  expired: boolean; parent?: string
  parentItemId?: string; parentItemType?: string
  url?: string; mimeType?: string | null; size?: number
  deletedBy: { id: string; username: string; alias: string | null; avatarUrl: string | null } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDEBAR_W = 240
const MAX_FILE_SIZE = 50 * 1024 * 1024
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
  const [clients, setClients] = useState<Client[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selection, setSelection] = useState<Selection | null>(null)
  const [loading, setLoading] = useState(true)

  // inline editing
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ type: 'folder' | 'document' | 'file', id: string, x: number, y: number, name: string, item?: any } | null>(null)

  // content state
  const [folders, setFolders] = useState<RFolder[]>([])
  const [documents, setDocuments] = useState<RDocument[]>([])
  const [files, setFiles] = useState<RFile[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState<{ id: string | null; name: string }[]>([])
  const [contentLoading, setContentLoading] = useState(false)

  // document editor
  const [openDoc, setOpenDoc] = useState<DocDetail | null>(null)
  const [docLoading, setDocLoading] = useState(false)
  const [docSaving, setDocSaving] = useState(false)
  const [docTitle, setDocTitle] = useState('')
  const [docContent, setDocContent] = useState('')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // file upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // view mode
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'icons' } catch { return 'icons' }
  })

  // drag-and-drop upload
  const [dragOver, setDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  // drag-to-move
  const [draggingItem, setDraggingItem] = useState<DragItem | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [dropColIdx, setDropColIdx] = useState<number | null>(null)

  // share link
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // column view
  const [subColumns, setSubColumns] = useState<ColumnEntry[]>([])
  const [col0Selected, setCol0Selected] = useState<string | null>(null)
  const [colPreview, setColPreview] = useState<RFile | null>(null)
  const columnsRef = useRef<HTMLDivElement>(null)

  // gallery view
  const [galleryIdx, setGalleryIdx] = useState(0)

  // lightbox
  const [lightboxFile, setLightboxFile] = useState<RFile | null>(null)

  // Activity Log & Recycle Bin panels
  const [showActivityLog, setShowActivityLog] = useState(false)
  const [activityLogs, setActivityLogs] = useState<AuditLogEntry[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityPage, setActivityPage] = useState(1)
  const [activityTotal, setActivityTotal] = useState(0)

  const [showRecycleBin, setShowRecycleBin] = useState(false)
  const [recycleBinItems, setRecycleBinItems] = useState<RecycleBinItem[]>([])
  const [recycleBinLoading, setRecycleBinLoading] = useState(false)
  const [recycleBinExpanded, setRecycleBinExpanded] = useState<Set<string>>(new Set())

  // Confirmation dialog
  const [confirmDelete, setConfirmDelete] = useState<{ name: string; action: () => void } | null>(null)

  // Multi-select
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectableItem>>(new Map())
  const [rubberBand, setRubberBand] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const contentAreaRef = useRef<HTMLDivElement>(null)

  // ── API helper ──────────────────────────────────────────────────────────

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

  // ── Load clients ────────────────────────────────────────────────────────

  const loadClients = useCallback(async () => {
    const res = await apiFetch('/api/report/clients')
    if (res.ok) {
      const data = await res.json()
      setClients(data.clients)
    }
    setLoading(false)
  }, [apiFetch])

  useEffect(() => { loadClients() }, [loadClients])

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

  // ── Activity Log ────────────────────────────────────────────────────────

  const loadActivityLogs = useCallback(async (page = 1) => {
    setActivityLoading(true)
    const res = await apiFetch(`/api/report/audit-log?page=${page}&limit=50`)
    if (res.ok) {
      const data = await res.json()
      setActivityLogs(data.logs)
      setActivityTotal(data.total)
      setActivityPage(data.page)
    }
    setActivityLoading(false)
  }, [apiFetch])

  // ── Recycle Bin ─────────────────────────────────────────────────────────

  const loadRecycleBin = useCallback(async () => {
    setRecycleBinLoading(true)
    const res = await apiFetch('/api/report/recycle-bin')
    if (res.ok) {
      const data = await res.json()
      setRecycleBinItems(data.items)
    }
    setRecycleBinLoading(false)
  }, [apiFetch])

  const restoreItem = useCallback(async (id: string, type: string) => {
    const res = await apiFetch('/api/report/recycle-bin', {
      method: 'POST', body: JSON.stringify({ id, type }),
    })
    if (res.ok) {
      loadRecycleBin() // reload to reflect cascade restore of children
      loadClients() // refresh sidebar
      if (selection) loadContents(selection.projectId, currentFolderId)
    }
  }, [apiFetch, loadClients, loadRecycleBin, selection, currentFolderId]) // eslint-disable-line

  const permanentDeleteItem = useCallback(async (id: string, type: string) => {
    const res = await apiFetch(`/api/report/recycle-bin?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`, { method: 'DELETE' })
    if (res.ok) {
      loadRecycleBin() // reload to reflect cascade deletion of children
    }
  }, [apiFetch])

  // ── Load project contents ────────────────────────────────────────────────

  const loadContents = useCallback(async (projectId: string, folderId: string | null) => {
    setContentLoading(true)
    const qs = folderId ? `?folderId=${folderId}` : ''
    const res = await apiFetch(`/api/report/projects/${projectId}/contents${qs}`)
    if (res.ok) {
      const data = await res.json()
      setFolders(data.folders)
      setDocuments(data.documents)
      setFiles(data.files)
    }
    setContentLoading(false)
  }, [apiFetch])

  useEffect(() => {
    if (selection) {
      setOpenDoc(null)
      setCurrentFolderId(null)
      setFolderPath([])
      loadContents(selection.projectId, null)
    }
  }, [selection?.projectId]) // eslint-disable-line

  // ── Client CRUD ─────────────────────────────────────────────────────────

  async function addClient() {
    const res = await apiFetch('/api/report/clients', {
      method: 'POST', body: JSON.stringify({ name: 'New Client' }),
    })
    if (res.ok) {
      const { client } = await res.json()
      setClients(prev => [...prev, { ...client, projects: [] }])
      setExpanded(prev => ({ ...prev, [client.id]: true }))
      setEditingId(client.id)
      setEditingValue('New Client')
    }
  }

  async function renameClient(clientId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) { setEditingId(null); return }
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, name: trimmed } : c))
    setEditingId(null)
    await apiFetch(`/api/report/clients/${clientId}`, {
      method: 'PATCH', body: JSON.stringify({ name: trimmed }),
    })
  }

  async function deleteClient(clientId: string) {
    setClients(prev => prev.filter(c => c.id !== clientId))
    if (selection?.clientId === clientId) setSelection(null)
    setMenuId(null)
    await apiFetch(`/api/report/clients/${clientId}`, { method: 'DELETE' })
  }

  // ── Project CRUD ────────────────────────────────────────────────────────

  async function addProject(clientId: string) {
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
    const res = await apiFetch(`/api/report/projects/${selection.projectId}/contents`, {
      method: 'POST', body: JSON.stringify({ type: 'document', title: 'Untitled', folderId: currentFolderId }),
    })
    if (res.ok) {
      const { document: doc } = await res.json()
      setDocuments(prev => [...prev, { ...doc, edits: [] }])
    }
  }

  async function openDocument(docId: string) {
    setDocLoading(true)
    const res = await apiFetch(`/api/report/documents/${docId}`)
    if (res.ok) {
      const { document: doc } = await res.json()
      setOpenDoc(doc)
      setDocTitle(doc.title)
      setDocContent(doc.content)
    }
    setDocLoading(false)
  }

  function handleDocContentChange(newContent: string) {
    setDocContent(newContent)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => saveDocument(newContent), 1500)
  }

  function handleDocTitleChange(newTitle: string) {
    setDocTitle(newTitle)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => saveDocument(undefined, newTitle), 1500)
  }

  async function saveDocument(content?: string, title?: string) {
    if (!openDoc) return
    setDocSaving(true)
    const body: Record<string, string> = {}
    if (content !== undefined) body.content = content
    if (title !== undefined) body.title = title
    const res = await apiFetch(`/api/report/documents/${openDoc.id}`, {
      method: 'PATCH', body: JSON.stringify(body),
    })
    if (res.ok) {
      const { document: doc } = await res.json()
      setOpenDoc(doc)
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, title: doc.title, updatedAt: doc.updatedAt, edits: doc.edits } : d))
    }
    setDocSaving(false)
  }

  async function deleteDocument(docId: string) {
    setDocuments(prev => prev.filter(d => d.id !== docId))
    setSubColumns(prev => prev.map(sc => ({ ...sc, documents: sc.documents.filter(d => d.id !== docId) })))
    if (openDoc?.id === docId) setOpenDoc(null)
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

  // ── File upload ─────────────────────────────────────────────────────────

  async function deleteFile(fileId: string) {
    setFiles(prev => prev.filter(f => f.id !== fileId))
    setSubColumns(prev => prev.map(sc => ({ ...sc, files: sc.files.filter(f => f.id !== fileId) })))
    setMenuId(null)
    setCtxMenu(null)
    await apiFetch(`/api/report/files/${fileId}`, { method: 'DELETE' })
  }

  // ── Drag-and-drop file upload ───────────────────────────────────────────

  async function uploadFileObj(file: globalThis.File) {
    if (!selection) return
    if (file.size > MAX_FILE_SIZE) { alert('File must be under 50MB'); return }
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file as Blob)
    if (currentFolderId) formData.append('folderId', currentFolderId)
    const res = await apiFetch(`/api/report/projects/${selection.projectId}/upload`, {
      method: 'POST', body: formData,
    })
    if (res.ok) {
      const { file: uploaded } = await res.json()
      setFiles(prev => [uploaded, ...prev])
    }
    setUploading(false)
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) setDragOver(true)
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setDragOver(false)
  }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.stopPropagation() }
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation()
    setDragOver(false); dragCounterRef.current = 0
    const droppedFiles = Array.from(e.dataTransfer.files)
    for (const f of droppedFiles) await uploadFileObj(f)
  }

  // ── Drag-to-move items ──────────────────────────────────────────────────

  function onItemDragStart(e: React.DragEvent, item: DragItem) {
    setDraggingItem(item)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify(item))
  }
  function onItemDragEnd() { setDraggingItem(null); setDropTargetId(null); setDropColIdx(null) }

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
        const formData = new FormData()
        formData.append('file', f as Blob)
        formData.append('folderId', targetFolderId)
        const res = await apiFetch(`/api/report/projects/${selection.projectId}/upload`, { method: 'POST', body: formData })
        if (res.ok) { /* item goes into subfolder, no need to update current list */ }
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

  function buildSharePath(itemType: 'project' | 'folder' | 'document' | 'file', itemId?: string) {
    if (!selection) return ''
    if (itemType === 'project') return `/report/${selection.clientId}/${selection.projectId}`
    return `/report/${selection.clientId}/${selection.projectId}/${itemType}/${itemId}`
  }

  async function copyShareLink(itemType: 'project' | 'folder' | 'document' | 'file', itemId?: string) {
    const path = buildSharePath(itemType, itemId)
    if (!path) return
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

  // ── Multi-select ─────────────────────────────────────────────────────

  const selKey = (type: string, id: string) => `${type}-${id}`

  function handleItemClick(e: React.MouseEvent, item: SelectableItem) {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault()
      e.stopPropagation()
      setSelectedItems(prev => {
        const next = new Map(prev)
        const k = selKey(item.type, item.id)
        if (next.has(k)) next.delete(k); else next.set(k, item)
        return next
      })
      return true // handled
    }
    // If we have multi-selection and click without Cmd, clear
    if (selectedItems.size > 0) {
      setSelectedItems(new Map())
    }
    return false // not handled — do normal action
  }

  function isItemSelected(type: string, id: string) {
    return selectedItems.has(selKey(type, id))
  }

  // Clear multi-select on navigation/view change
  useEffect(() => { setSelectedItems(new Map()) }, [selection?.projectId, currentFolderId, viewMode])

  // Rubber-band selection
  function onContentMouseDown(e: React.MouseEvent) {
    // Only start rubber band on left click, no Cmd (Cmd+click is for toggle)
    if (e.button !== 0 || e.metaKey || e.ctrlKey) return
    // Don't start if clicking on an interactive element
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('[draggable="true"]')) return
    const rect = contentAreaRef.current?.getBoundingClientRect()
    if (!rect) return
    const startX = e.clientX
    const startY = e.clientY
    setRubberBand({ startX, startY, x: startX, y: startY })
    setSelectedItems(new Map())

    const onMouseMove = (ev: MouseEvent) => {
      setRubberBand({ startX, startY, x: ev.clientX, y: ev.clientY })
      // Hit-test items
      if (!contentAreaRef.current) return
      const itemEls = contentAreaRef.current.querySelectorAll('[data-sel-type]')
      const next = new Map<string, SelectableItem>()
      const rx = Math.min(startX, ev.clientX), ry = Math.min(startY, ev.clientY)
      const rw = Math.abs(ev.clientX - startX), rh = Math.abs(ev.clientY - startY)
      itemEls.forEach(el => {
        const r = el.getBoundingClientRect()
        if (r.right > rx && r.left < rx + rw && r.bottom > ry && r.top < ry + rh) {
          const type = el.getAttribute('data-sel-type') as 'folder' | 'document' | 'file'
          const id = el.getAttribute('data-sel-id')!
          const name = el.getAttribute('data-sel-name')!
          next.set(selKey(type, id), { type, id, name })
        }
      })
      setSelectedItems(next)
    }
    const onMouseUp = () => {
      setRubberBand(null)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

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
          }
        }
        setSelectedItems(new Map())
      },
    })
  }

  // ── View mode ───────────────────────────────────────────────────────────

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode)
    try { localStorage.setItem(VIEW_MODE_KEY, mode) } catch { /* */ }
  }

  // ── Column view management ──────────────────────────────────────────────

  // Reset column/gallery state when navigation changes
  useEffect(() => {
    setSubColumns([]); setCol0Selected(null); setColPreview(null); setGalleryIdx(0)
  }, [selection?.projectId, currentFolderId])

  async function handleColumnSelect(colIdx: number, type: 'folder' | 'document' | 'file', id: string, file?: RFile) {
    if (type === 'document') { openDocument(id); return }

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
    const entry: ColumnEntry = { parentId: id, folders: data.folders, documents: data.documents, files: data.files, selectedId: null }

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

  // ── Helpers ─────────────────────────────────────────────────────────────

  function toggleExpand(clientId: string) {
    setExpanded(prev => ({ ...prev, [clientId]: !prev[clientId] }))
  }

  const selectedClient = selection ? clients.find(c => c.id === selection.clientId) : null
  const selectedProject = selectedClient?.projects.find(p => p.id === selection?.projectId)

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
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
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
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: 0.2 }}>Client Report</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button onClick={() => { setShowActivityLog(true); loadActivityLogs(1) }} title="Activity Log" style={{ ...iconBtn24, color: C.textMuted }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
              <Clock size={14} />
            </button>
            {auth.role === 'admin' && (
              <button onClick={() => { setShowRecycleBin(true); loadRecycleBin() }} title="Recycle Bin" style={{ ...iconBtn24, color: C.textMuted }}
                onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
                <Trash2 size={14} />
              </button>
            )}
            <button onClick={addClient} title="Add Client" style={{ ...iconBtn24, color: C.textMuted }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
              <Plus size={16} />
            </button>
          </div>
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
              <p style={{ fontSize: 12, lineHeight: 1.5 }}>No clients yet</p>
              <button onClick={addClient} style={{
                marginTop: 10, padding: '5px 12px', borderRadius: 6, border: 'none',
                background: C.accent, color: '#fff', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <Plus size={12} /> Add Client
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
                      onDelete={() => { setMenuId(null); setConfirmDelete({ name: client.name, action: () => deleteClient(client.id) }) }} onClose={() => setMenuId(null)} />
                  )}
                </div>

                {isExpanded && (
                  <div style={{ marginLeft: 18 }}>
                    {client.projects.length === 0 && (
                      <div style={{ padding: '4px 8px 4px 22px', fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>No projects</div>
                    )}
                    {client.projects.map(project => {
                      const isSelected = selection?.projectId === project.id
                      return (
                        <div key={project.id}
                          onClick={() => setSelection({ clientId: client.id, projectId: project.id })}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '4px 8px 4px 22px', margin: '0 6px', borderRadius: 6,
                            cursor: 'pointer', position: 'relative',
                            background: isSelected ? C.sidebarActive : menuId === project.id ? C.bgHover : 'transparent',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={e => { if (!isSelected && menuId !== project.id) e.currentTarget.style.background = C.bgHover }}
                          onMouseLeave={e => { if (!isSelected && menuId !== project.id) e.currentTarget.style.background = 'transparent' }}>
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
                              onDelete={() => { setMenuId(null); setConfirmDelete({ name: project.name, action: () => deleteProject(client.id, project.id) }) }} onClose={() => setMenuId(null)} />
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
          /* ── Document Editor ──────────────────────────────────────────── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Editor toolbar */}
            <div style={{
              padding: '8px 16px', borderBottom: `1px solid ${C.separator}`,
              display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: C.lgBg,
            }}>
              <button onClick={() => {
                if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null }
                setOpenDoc(null)
                if (selection) loadContents(selection.projectId, currentFolderId)
              }} style={{ ...iconBtn24, color: C.textMuted }}
                onMouseEnter={e => { e.currentTarget.style.color = C.text }}
                onMouseLeave={e => { e.currentTarget.style.color = C.textMuted }}>
                <ArrowLeft size={16} />
              </button>
              <input value={docTitle}
                onChange={e => handleDocTitleChange(e.target.value)}
                style={{
                  flex: 1, fontSize: 14, fontWeight: 600, background: 'transparent',
                  border: 'none', outline: 'none', color: C.text, padding: '4px 0',
                }}
                placeholder="Document title..." />
              <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>
                {docSaving ? 'Saving...' : 'Saved'}
              </span>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* Rich text editor */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {docLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 40, flex: 1 }}>
                    <Loader size={20} style={{ color: C.textMuted, animation: 'spin 1s linear infinite' }} />
                  </div>
                ) : (
                  <DocumentEditor
                    content={docContent}
                    onUpdate={handleDocContentChange}
                    apiBase={config.apiBase}
                    token={config.token}
                    projectId={selection?.projectId}
                  />
                )}
              </div>

              {/* Edit history sidebar */}
              <div style={{
                width: 220, flexShrink: 0, borderLeft: `1px solid ${C.separator}`,
                background: C.lgBg, overflowY: 'auto', padding: '12px 0',
              }}>
                <div style={{ padding: '0 12px 8px', fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Edit History
                </div>
                {openDoc.edits.length === 0 && (
                  <div style={{ padding: '8px 12px', fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>No edits yet</div>
                )}
                {openDoc.edits.map(edit => (
                  <div key={edit.id} style={{ padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <User size={12} style={{ color: C.textMuted, flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>{displayName(edit.user)}</div>
                      <div style={{ fontSize: 10, color: C.textMuted }}>{timeAgo(edit.createdAt)}</div>
                      {edit.summary && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{edit.summary}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
                  <p style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>50MB max per file</p>
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div style={{
              padding: '10px 16px', borderBottom: `1px solid ${C.separator}`,
              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: C.lgBg,
            }}>
              {/* Breadcrumb */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' }}>
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

                        {files.map(file => (
                          <div key={file.id} data-sel-type="file" data-sel-id={file.id} data-sel-name={file.name}
                            draggable onDragStart={e => onItemDragStart(e, { type: 'file', id: file.id })} onDragEnd={onItemDragEnd}
                            onClick={e => { if (handleItemClick(e, { type: 'file', id: file.id, name: file.name })) return; if (isImageFile(file)) setLightboxFile(file) }}
                            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ type: 'file', id: file.id, x: e.clientX, y: e.clientY, name: file.name, item: file }); setMenuId(null) }}
                            style={{
                              width: 110, padding: '12px 8px', borderRadius: 8, textAlign: 'center', cursor: isImageFile(file) ? 'pointer' : 'default', position: 'relative',
                              background: isItemSelected('file', file.id) ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
                              border: isItemSelected('file', file.id) ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid transparent',
                              transition: 'background 0.1s', opacity: draggingItem?.id === file.id ? 0.4 : 1,
                            }}
                            onMouseEnter={e => { if (!isItemSelected('file', file.id)) e.currentTarget.style.background = C.bgHover }}
                            onMouseLeave={e => { if (!isItemSelected('file', file.id)) e.currentTarget.style.background = 'transparent' }}>
                            {isImageFile(file) ? (
                              <div style={{ width: 60, height: 48, margin: '0 auto 6px', borderRadius: 6, overflow: 'hidden', background: C.bgHover }}>
                                <AuthImage src={`${config.apiBase}${file.url}`} config={config} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                            ) : (
                              <File size={36} style={{ color: C.textSecondary, marginBottom: 6 }} />
                            )}
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

                      {files.map(file => (
                        <div key={file.id} data-sel-type="file" data-sel-id={file.id} data-sel-name={file.name}
                          draggable onDragStart={e => onItemDragStart(e, { type: 'file', id: file.id })} onDragEnd={onItemDragEnd}
                          onClick={e => { if (handleItemClick(e, { type: 'file', id: file.id, name: file.name })) return; if (isImageFile(file)) setLightboxFile(file) }}
                          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ type: 'file', id: file.id, x: e.clientX, y: e.clientY, name: file.name, item: file }); setMenuId(null) }}
                          style={{ ...rowStyle, position: 'relative', opacity: draggingItem?.id === file.id ? 0.4 : 1, cursor: isImageFile(file) ? 'pointer' : 'default', background: isItemSelected('file', file.id) ? 'rgba(59, 130, 246, 0.18)' : 'transparent' }}
                          onMouseEnter={e => { if (!isItemSelected('file', file.id)) e.currentTarget.style.background = C.bgHover }}
                          onMouseLeave={e => { if (!isItemSelected('file', file.id)) e.currentTarget.style.background = 'transparent' }}>
                          <File size={16} style={{ color: C.textSecondary, flexShrink: 0 }} />
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
                      { folders, documents, files, selectedId: col0Selected },
                      ...subColumns.map(sc => ({ folders: sc.folders, documents: sc.documents, files: sc.files, selectedId: sc.selectedId })),
                    ]
                    return (
                      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
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
                              {col.files.map(file => {
                                const isSel = col.selectedId === file.id
                                const mSel = isItemSelected('file', file.id)
                                return (
                                  <div key={file.id}
                                    data-sel-type="file" data-sel-id={file.id} data-sel-name={file.name}
                                    onClick={e => { if (handleItemClick(e, { type: 'file', id: file.id, name: file.name })) return; handleColumnSelect(colIdx, 'file', file.id, file) }}
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
                                      <File size={14} style={{ color: isSel ? '#fff' : C.textSecondary, flexShrink: 0 }} />
                                    )}
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                  </div>
                                )
                              })}
                              {col.folders.length === 0 && col.documents.length === 0 && col.files.length === 0 && (
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
                            {isImageFile(colPreview) ? (
                              <div style={{ width: '100%', borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}
                                onClick={() => setLightboxFile(colPreview)}>
                                <AuthImage src={`${config.apiBase}${colPreview.url}`} config={config}
                                  style={{ width: '100%', objectFit: 'contain', maxHeight: 200, display: 'block' }} />
                              </div>
                            ) : (
                              <File size={48} style={{ color: C.textSecondary, opacity: 0.4 }} />
                            )}
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
                    type GItem = { kind: 'folder'; data: RFolder } | { kind: 'document'; data: RDocument } | { kind: 'file'; data: RFile }
                    const items: GItem[] = [
                      ...folders.map(f => ({ kind: 'folder' as const, data: f })),
                      ...documents.map(d => ({ kind: 'document' as const, data: d })),
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
                              {sel && sel.kind === 'file' && (
                                isImageFile(sel.data as RFile) ? (
                                  <div style={{ maxWidth: '100%', maxHeight: '100%', padding: 12, cursor: 'pointer' }}
                                    onClick={() => setLightboxFile(sel.data as RFile)}>
                                    <AuthImage src={`${config.apiBase}${(sel.data as RFile).url}`} config={config}
                                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4, display: 'block' }} />
                                  </div>
                                ) : (
                                  <div style={{ textAlign: 'center' }}>
                                    <File size={80} style={{ color: C.textSecondary, opacity: 0.5 }} />
                                    <div style={{ fontSize: 14, color: C.text, marginTop: 8, fontWeight: 500 }}>{(sel.data as RFile).name}</div>
                                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{formatSize((sel.data as RFile).size)}</div>
                                  </div>
                                )
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
                                      else if (item.kind === 'file' && isImageFile(item.data as RFile)) setLightboxFile(item.data as RFile)
                                    }}
                                    onContextMenu={e => {
                                      e.preventDefault(); e.stopPropagation()
                                      const name = item.kind === 'folder' ? (item.data as RFolder).name : item.kind === 'document' ? (item.data as RDocument).title : (item.data as RFile).name
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
                                    {item.kind === 'file' && (
                                      isImageFile(item.data as RFile) ? (
                                        <AuthImage src={`${config.apiBase}${(item.data as RFile).url}`} config={config}
                                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      ) : (
                                        <File size={24} style={{ color: C.textSecondary }} />
                                      )
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
                  <button onClick={() => { downloadFile(ctxMenu.item); setCtxMenu(null) }} style={menuItemStyle}
                    onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <Download size={13} /> Download
                  </button>
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
            <AuthImage src={`${config.apiBase}${lightboxFile.url}`} config={config}
              style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 6 }} />
            <div style={{ textAlign: 'center', marginTop: 8, color: '#fff', fontSize: 13, opacity: 0.8 }}>
              {lightboxFile.name}
              <span style={{ marginLeft: 10, opacity: 0.5 }}>{formatSize(lightboxFile.size)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Dialog ─────────────────────────────────── */}
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
    </div>
  )
}

// ─── Shared components & styles ───────────────────────────────────────────────

const iconBtn24: React.CSSProperties = {
  width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', transition: 'all 0.15s',
}

const iconBtnSmall: React.CSSProperties = {
  background: 'none', border: 'none', padding: 2, cursor: 'pointer',
  color: C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 4, flexShrink: 0,
}

const iconBtnTiny: React.CSSProperties = {
  background: 'rgba(0,0,0,0.5)', border: 'none', padding: 3, cursor: 'pointer',
  color: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 4, flexShrink: 0, transition: 'opacity 0.15s',
}

const toolbarBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
  borderRadius: 6, border: 'none', background: 'transparent',
  color: C.textSecondary, fontSize: 12, cursor: 'pointer', transition: 'background 0.1s',
  whiteSpace: 'nowrap',
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px',
  cursor: 'default', transition: 'background 0.1s',
}

const menuItemStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 10px', borderRadius: 6, border: 'none',
  background: 'transparent', color: C.text, fontSize: 12,
  cursor: 'pointer', textAlign: 'left',
}

function isImageFile(file: { mimeType: string | null; name: string }) {
  if (file.mimeType?.startsWith('image/')) return true
  return /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp)$/i.test(file.name)
}

function InlineInput({ value, onChange, onConfirm, onCancel }: {
  value: string; onChange: (v: string) => void; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
      <input autoFocus value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel() }}
        onBlur={onConfirm}
        style={{
          flex: 1, fontSize: 12, padding: '2px 6px', borderRadius: 4,
          border: `1px solid ${C.accent}`, background: C.bgInput, color: C.text,
          outline: 'none', minWidth: 0,
        }} />
    </div>
  )
}

function ContextMenu({ onRename, onDelete, onShare, onClose }: {
  onRename: () => void; onDelete: () => void; onShare?: () => void; onClose: () => void
}) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div style={{
        position: 'absolute', right: 0, top: '100%', zIndex: 100,
        background: C.bgFloating, border: `1px solid ${C.separator}`,
        borderRadius: 8, padding: 4, minWidth: 140, boxShadow: C.shadowHigh,
      }}>
        <button onClick={onRename} style={menuItemStyle}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <Pencil size={13} /> Rename
        </button>
        {onShare && (
          <button onClick={onShare} style={menuItemStyle}
            onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
            <Link2 size={13} /> Copy Link
          </button>
        )}
        <button onClick={onDelete} style={{ ...menuItemStyle, color: C.danger }}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </>
  )
}

function FileMenu({ onDownload, onShare, onDelete, onClose }: {
  onDownload: () => void; onShare?: () => void; onDelete: () => void; onClose: () => void
}) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div style={{
        position: 'absolute', right: 0, top: '100%', zIndex: 100,
        background: C.bgFloating, border: `1px solid ${C.separator}`,
        borderRadius: 8, padding: 4, minWidth: 140, boxShadow: C.shadowHigh,
      }}>
        <button onClick={onDownload} style={menuItemStyle}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <Download size={13} /> Download
        </button>
        {onShare && (
          <button onClick={onShare} style={menuItemStyle}
            onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
            <Link2 size={13} /> Copy Link
          </button>
        )}
        <button onClick={onDelete} style={{ ...menuItemStyle, color: C.danger }}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </>
  )
}

// ─── Activity Log Helpers ─────────────────────────────────────────────────────

function actionColor(action: string) {
  switch (action) {
    case 'create': return 'rgba(74,222,128,0.15)'
    case 'delete': return 'rgba(239,68,68,0.15)'
    case 'rename': return 'rgba(96,165,250,0.15)'
    case 'move': return 'rgba(168,85,247,0.15)'
    case 'upload': return 'rgba(59,130,246,0.15)'
    case 'edit': return 'rgba(251,191,36,0.15)'
    case 'restore': return 'rgba(45,212,191,0.15)'
    default: return 'rgba(255,255,255,0.06)'
  }
}

function actionIcon(action: string) {
  const s = 13
  const style: React.CSSProperties = {}
  switch (action) {
    case 'create': return <Plus size={s} style={{ ...style, color: '#4ade80' }} />
    case 'delete': return <Trash2 size={s} style={{ ...style, color: '#ef4444' }} />
    case 'rename': return <Pencil size={s} style={{ ...style, color: '#60a5fa' }} />
    case 'move': return <ArrowLeft size={s} style={{ ...style, color: '#a855f7', transform: 'rotate(180deg)' }} />
    case 'upload': return <Upload size={s} style={{ ...style, color: '#3b82f6' }} />
    case 'edit': return <FileText size={s} style={{ ...style, color: '#fbbf24' }} />
    case 'restore': return <RotateCcw size={s} style={{ ...style, color: '#2dd4bf' }} />
    default: return <Clock size={s} style={{ ...style, color: C.textMuted }} />
  }
}

function actionLabel(action: string) {
  switch (action) {
    case 'create': return 'created'
    case 'delete': return 'deleted'
    case 'rename': return 'renamed'
    case 'move': return 'moved'
    case 'upload': return 'uploaded'
    case 'edit': return 'edited'
    case 'restore': return 'restored'
    default: return action
  }
}

function actionTextColor(action: string) {
  switch (action) {
    case 'create': return '#4ade80'
    case 'delete': return '#ef4444'
    case 'rename': return '#60a5fa'
    case 'move': return '#a855f7'
    case 'upload': return '#3b82f6'
    case 'edit': return '#fbbf24'
    case 'restore': return '#2dd4bf'
    default: return C.textMuted
  }
}

function actionTargetIcon(targetType: string) {
  const s = 11
  const style: React.CSSProperties = { opacity: 0.6, verticalAlign: 'middle', marginRight: 2 }
  switch (targetType) {
    case 'client': return <Building2 size={s} style={{ ...style, color: '#fbbf24' }} />
    case 'project': return <Briefcase size={s} style={{ ...style, color: '#60a5fa' }} />
    case 'folder': return <Folder size={s} style={{ ...style, color: '#3b82f6' }} />
    case 'document': return <FileText size={s} style={{ ...style, color: '#a855f7' }} />
    case 'file': return <File size={s} style={{ ...style, color: '#6b7280' }} />
    default: return null
  }
}

function formatTimeDetailed(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (diffDays === 0) return `Today at ${time}`
  if (diffDays === 1) return `Yesterday at ${time}`
  if (diffDays < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} at ${time}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`
}

// ─── Recycle Bin Helpers ──────────────────────────────────────────────────────

function recycleTypeColor(type: string) {
  switch (type) {
    case 'client': return 'rgba(251,191,36,0.12)'
    case 'project': return 'rgba(96,165,250,0.12)'
    case 'folder': return 'rgba(59,130,246,0.12)'
    case 'document': return 'rgba(168,85,247,0.12)'
    case 'file': return 'rgba(107,114,128,0.12)'
    default: return 'rgba(255,255,255,0.06)'
  }
}

function recycleTypeIcon(type: string) {
  const s = 15
  switch (type) {
    case 'client': return <Building2 size={s} style={{ color: '#fbbf24' }} />
    case 'project': return <Briefcase size={s} style={{ color: '#60a5fa' }} />
    case 'folder': return <Folder size={s} style={{ color: '#3b82f6' }} />
    case 'document': return <FileText size={s} style={{ color: '#a855f7' }} />
    case 'file': return <File size={s} style={{ color: '#6b7280' }} />
    default: return <File size={s} style={{ color: C.textMuted }} />
  }
}