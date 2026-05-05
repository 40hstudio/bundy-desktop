import { useState, useRef, useCallback } from 'react'
import { track } from '../../utils/eventLogger'

export interface DocDetail {
  id: string
  title: string
  content: string
  folderId: string | null
  projectId: string
  createdAt: string
  updatedAt: string
  creator: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  edits: { id: string; summary: string | null; createdAt: string; user: { id: string; username: string; alias: string | null; avatarUrl: string | null } }[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiFetch = (path: string, opts?: RequestInit) => Promise<any>

/**
 * Document/link viewer state for ReportPanel — open document with
 * debounced auto-save, plus the open-feedback-link state. Owns 7
 * useStates and the save debounce ref.
 *
 * Per-list mutations (deleteDocument / deleteLink / renameLink that
 * mutate the parent's documents/links arrays) deliberately stay in the
 * parent. The hook just notifies via `onDocumentSaved` so the parent
 * can patch its document list with the fresh title/updatedAt/edits.
 */
export function useReportDocument(
  apiFetch: ApiFetch,
  onDocumentSaved: (doc: DocDetail) => void,
) {
  const [openDoc, setOpenDoc] = useState<DocDetail | null>(null)
  const [openLinkId, setOpenLinkId] = useState<string | null>(null)
  const [linkUrlInput, setLinkUrlInput] = useState<string | null>(null)
  const [docLoading, setDocLoading] = useState(false)
  const [docSaving, setDocSaving] = useState(false)
  const [docTitle, setDocTitle] = useState('')
  const [docContent, setDocContent] = useState('')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs so callbacks below stay referentially stable.
  const openDocRef = useRef<DocDetail | null>(null)
  openDocRef.current = openDoc
  const onSavedRef = useRef(onDocumentSaved)
  onSavedRef.current = onDocumentSaved

  const openDocument = useCallback(async (docId: string) => {
    track('box:document:open', { docId })
    setDocLoading(true)
    setOpenLinkId(null)
    const res = await apiFetch(`/api/report/documents/${docId}`)
    if (res.ok) {
      const { document: doc } = await res.json()
      setOpenDoc(doc)
      setDocTitle(doc.title)
      setDocContent(doc.content)
    }
    setDocLoading(false)
  }, [apiFetch])

  const saveDocument = useCallback(async (content?: string, title?: string) => {
    const cur = openDocRef.current
    if (!cur) return
    setDocSaving(true)
    const body: Record<string, string> = {}
    if (content !== undefined) body.content = content
    if (title !== undefined) body.title = title
    const res = await apiFetch(`/api/report/documents/${cur.id}`, {
      method: 'PATCH', body: JSON.stringify(body),
    })
    if (res.ok) {
      const { document: doc } = await res.json()
      setOpenDoc(doc)
      onSavedRef.current(doc)
      track('box:document:save', { docId: cur.id, titleChanged: title !== undefined, contentChanged: content !== undefined })
    } else {
      track('box:document:save:fail', { docId: cur.id, status: res.status })
    }
    setDocSaving(false)
  }, [apiFetch])

  const handleDocContentChange = useCallback((newContent: string) => {
    setDocContent(newContent)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => saveDocument(newContent), 1500)
  }, [saveDocument])

  const handleDocTitleChange = useCallback((newTitle: string) => {
    setDocTitle(newTitle)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => saveDocument(undefined, newTitle), 1500)
  }, [saveDocument])

  // Called by per-document delete in parent — clears the viewer if the
  // doc currently open just got deleted.
  const closeIfOpen = useCallback((docId: string) => {
    setOpenDoc(prev => (prev?.id === docId ? null : prev))
  }, [])

  // Used by the "close document" button — cancels any pending debounced
  // auto-save so we don't get a write hitting the server after the user
  // already navigated away.
  const closeDoc = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    setOpenDoc(null)
  }, [])

  return {
    openDoc, setOpenDoc,
    openLinkId, setOpenLinkId,
    linkUrlInput, setLinkUrlInput,
    docLoading,
    docSaving,
    docTitle,
    docContent,
    openDocument,
    handleDocContentChange,
    handleDocTitleChange,
    saveDocument,
    closeIfOpen,
    closeDoc,
  }
}
