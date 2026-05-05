import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import FontFamily from '@tiptap/extension-font-family'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { FontSize } from './FontSizeExtension'
import { useCallback, useRef, useEffect, useState, useMemo } from 'react'
import { useImageUpload } from '../../hooks/useImageUpload'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List as ListIcon, ListOrdered, ListChecks,
  Heading1, Heading2, Heading3,
  Quote, Minus, Link as LinkIcon, Image as ImageIcon,
  Table as TableIcon, Undo2, Redo2, Highlighter,
  Type, ChevronDown, Subscript as SubIcon, Superscript as SupIcon,
  Printer, Pilcrow, RemoveFormatting, TableCellsMerge, Plus, Trash2,
  Upload, History,
} from 'lucide-react'
import { C } from '../../theme'
import { EditHistoryPanel } from './EditHistoryPanel'
import { apiFetch } from '../../api/client'

// ─── Props ────────────────────────────────────────────────────────────────────

interface DocumentEditorProps {
  content: string
  onUpdate: (html: string) => void
  editable?: boolean
  apiBase?: string
  token?: string
  projectId?: string
  /** When set, the editor sends a Report-document presence beacon every 10s
   *  and tags the activity heartbeat with this id (P1.11 + P2.16). Also
   *  becomes the default Y.js sync key. */
  documentId?: string
  /** Override the Y.js doc-name used for live sync. Defaults to `documentId`.
   *  Set explicitly when reusing this editor for non-Report-document surfaces
   *  (e.g. `task-{id}` for the task drawer's description). When `collabKey`
   *  is provided WITHOUT `documentId`, the presence beacon + heartbeat tag
   *  are skipped (those are Report-doc-specific). */
  collabKey?: string
  /** Current user — surfaced as the live-cursor name + colour in collab mode (P4.31). */
  user?: { id: string; name: string; avatar?: string | null }
}

// P4.31 — Stable colour per userId so each collaborator gets a consistent
// cursor / selection highlight across reconnects. Picks from a curated palette
// that contrasts well with both light and dark theme backgrounds.
const COLLAB_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899',
  '#06b6d4', '#84cc16', '#f97316', '#10b981', '#8b5cf6',
] as const
function colorForUserId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length]
}

// ─── Font sizes ───────────────────────────────────────────────────────────────

const FONT_SIZES = ['10px', '11px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px']
const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Sans Serif', value: 'Inter, system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, Times New Roman, serif' },
  { label: 'Monospace', value: 'SF Mono, Menlo, monospace' },
]

const TEXT_COLORS = [
  '#ffffff', '#cccccc', '#999999', '#666666', '#333333', '#000000',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
  '#ec4899', '#06b6d4', '#14b8a6', '#84cc16', '#6366f1', '#d946ef',
]

const HIGHLIGHT_COLORS = [
  'transparent', '#fef08a', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fecdd3',
  '#fed7aa', '#ccfbf1', '#ddd6fe', '#fbcfe8',
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function DocumentEditor({ content, onUpdate, editable = true, apiBase, token, projectId, documentId, collabKey, user }: DocumentEditorProps) {
  // The y-websocket doc name. Prefer explicit `collabKey`, fall back to `documentId`.
  const collabDocName = collabKey ?? documentId ?? null
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  // P4.31 — Collaborative editing via Y.js.
  //
  // Default WS URL is the production tunnel `wss://bundy-yjs.40h.studio`
  // (provisioned via cloudflared → localhost:1234 on the bot host).
  // Override with `localStorage.setItem('bundy.collab.wsUrl', '…')` for
  // local dev or alt deployments. Set to the literal string `"off"` to
  // disable collab and keep the plain HTML-saving editor.
  //
  // Y.Doc still works locally if the WS handshake fails — peers just won't
  // see each other's edits until reconnect.
  const DEFAULT_COLLAB_WS = 'wss://bundy-yjs.40h.studio'
  const collabPref = (typeof window !== 'undefined' && collabDocName) ? window.localStorage.getItem('bundy.collab.wsUrl') : null
  const collabWsUrl = collabPref === 'off' ? null : (collabPref || DEFAULT_COLLAB_WS)
  const collabActive = !!(collabDocName && collabWsUrl)

  const yDoc = useMemo(() => collabActive ? new Y.Doc() : null, [collabActive, collabDocName])
  const yProvider = useMemo(() => {
    if (!collabActive || !yDoc || !collabDocName || !collabWsUrl) return null
    const p = new WebsocketProvider(collabWsUrl, collabDocName, yDoc, { connect: true })
    return p
  }, [collabActive, yDoc, collabDocName, collabWsUrl])

  // Tear down provider on unmount or documentId change.
  useEffect(() => {
    return () => {
      yProvider?.destroy()
      yDoc?.destroy()
    }
  }, [yProvider, yDoc])

  // Seed the Y.Doc with the current HTML content the first time we sync — but
  // only if the doc is empty (no existing peer has populated it yet). This
  // prevents overwriting other users' edits on reconnect.
  const seededRef = useRef(false)
  useEffect(() => {
    if (!collabActive || !yProvider || !yDoc || seededRef.current) return
    const onSynced = (synced: boolean) => {
      if (!synced || seededRef.current) return
      seededRef.current = true
      const fragment = yDoc.getXmlFragment('default')
      if (fragment.length === 0 && content && content.trim()) {
        // editor.commands.setContent feeds HTML through the schema, which
        // Tiptap propagates into Y.Doc automatically.
        editorRef.current?.commands.setContent(content)
      }
    }
    yProvider.on('synced', onSynced)
    return () => { yProvider.off('synced', onSynced) }
  }, [collabActive, yProvider, yDoc, content])

  const [showFontMenu, setShowFontMenu] = useState(false)
  const [showSizeMenu, setShowSizeMenu] = useState(false)
  const [showColorMenu, setShowColorMenu] = useState(false)
  const [showHighlightMenu, setShowHighlightMenu] = useState(false)
  const [showTableMenu, setShowTableMenu] = useState(false)
  const [showImageMenu, setShowImageMenu] = useState(false)

  // v1.5.2206 — Edit-history panel state (issues #10 + #12). Lazy-loaded:
  // we don't fetch the edits list unless the user opens the panel, so the
  // common case (editing the doc) pays nothing.
  type EditMeta = {
    id: string
    summary: string | null
    createdAt: string
    user: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  }
  const [showEditHistory, setShowEditHistory] = useState(false)
  const [edits, setEdits] = useState<EditMeta[]>([])
  const [editsLoading, setEditsLoading] = useState(false)
  useEffect(() => {
    if (!showEditHistory || !documentId) return
    let cancelled = false
    setEditsLoading(true)
    apiFetch<{ document: { edits: EditMeta[] } }>(`/api/report/documents/${documentId}`)
      .then((data) => { if (!cancelled) setEdits(data?.document?.edits ?? []) })
      .catch(() => { if (!cancelled) setEdits([]) })
      .finally(() => { if (!cancelled) setEditsLoading(false) })
    return () => { cancelled = true }
  }, [showEditHistory, documentId])
  const onRevertEdit = useCallback(async (editId: string) => {
    if (!documentId) return
    if (!window.confirm('Revert document to the state before this edit? Current content will be saved as a new edit so you can roll forward again.')) return
    try {
      await apiFetch(`/api/report/documents/${documentId}/edits/${editId}/revert`, { method: 'POST' })
      // The Y.js sync will pull in the reverted content; close panel.
      setShowEditHistory(false)
    } catch (err) {
      console.error('[DocumentEditor] revert failed:', err)
      window.alert('Revert failed. ' + (err instanceof Error ? err.message : ''))
    }
  }, [documentId])

  // v1.5.2111 — active viewers/editors. Y.js awareness already broadcasts
  // who's connected (it's how the typing cursors work) — we just surface
  // it as an avatar stack. `editing` = had a doc change in last 5s.
  type ViewerState = { id: string; name: string; color: string; avatar: string | null; isEditing: boolean; isSelf: boolean }
  const [activeViewers, setActiveViewers] = useState<ViewerState[]>([])
  const lastEditAtRef = useRef<Map<string, number>>(new Map())
  useEffect(() => {
    if (!collabActive || !yProvider) return
    const awareness = yProvider.awareness
    const myClientId = awareness.clientID
    const refresh = () => {
      const now = Date.now()
      const states: ViewerState[] = []
      const seenIds = new Set<string>()
      awareness.getStates().forEach((state, clientId) => {
        const u = (state as { user?: { id?: string; name?: string; color?: string; avatar?: string | null } }).user
        if (!u) return
        const uid = u.id || `client-${clientId}`
        if (seenIds.has(uid)) return // dedupe multiple tabs from same user
        seenIds.add(uid)
        const lastEdit = lastEditAtRef.current.get(uid) ?? 0
        states.push({
          id: uid,
          name: u.name || 'Anonymous',
          color: u.color || '#3b82f6',
          avatar: u.avatar ?? null,
          isEditing: now - lastEdit < 5000,
          isSelf: clientId === myClientId,
        })
      })
      setActiveViewers(states)
    }
    awareness.on('change', refresh)
    refresh()
    return () => { awareness.off('change', refresh) }
  }, [collabActive, yProvider])
  // Track when each remote peer last edited the doc, so the avatar dot
  // can flip from "viewing" (grey) to "editing" (green).
  useEffect(() => {
    if (!collabActive || !yDoc) return
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      // Origin is the provider that pushed the update; for local edits
      // it's null/undefined. Map back to user via awareness lookup.
      if (!yProvider) return
      const awareness = yProvider.awareness
      // origin is the awareness client when remote, our own provider when local.
      // Simplest signal: every state with `user` gets a heartbeat now.
      awareness.getStates().forEach((state) => {
        const u = (state as { user?: { id?: string } }).user
        if (u?.id) lastEditAtRef.current.set(u.id, Date.now())
      })
      // Trigger a refresh so isEditing flips
      setActiveViewers((prev) => prev.map((v) => ({ ...v, isEditing: true })))
      void _update; void origin
    }
    yDoc.on('update', onUpdate)
    return () => { yDoc.off('update', onUpdate) }
  }, [collabActive, yDoc, yProvider])
  const imageInputRef = useRef<HTMLInputElement>(null)

  const editorRefForUpload = useRef<ReturnType<typeof useEditor>>(null)
  const { upload: uploadImage, uploadMany: uploadManyImages, tryUploadFromClipboard, uploading: imageUploading } = useImageUpload({
    endpoint: '/api/report/documents/upload-image',
    onUploaded: (url) => editorRefForUpload.current?.chain().focus().setImage({ src: url }).run(),
    // v1.5.2111 — batched insert path for multi-image paste/drop. All N
    // images go in via a single chained transaction so the cursor advances
    // correctly between them (previously parallel `setImage` calls clobbered
    // each other and only the last image survived).
    onUploadedMany: (urls) => {
      const editor = editorRefForUpload.current
      if (!editor) return
      // v1.5.2207 — use insertContent with a single array of nodes so
      // ProseMirror inserts all images in one transaction with proper
      // block boundaries. Previous chain().setImage(...).setImage(...)
      // didn't reliably advance the cursor between block-level image
      // inserts, so subsequent setImage calls overwrote the first.
      const nodes = urls.flatMap((url) => [
        { type: 'image', attrs: { src: url } },
        { type: 'paragraph' },
      ])
      editor.chain().focus().insertContent(nodes).run()
    },
    onError: (err) => console.error('[DocumentEditor] image upload failed:', err),
  })

  const handleDroppedImage = useCallback((file: File) => { void uploadImage(file) }, [uploadImage])
  // v1.5.2111 — multi-file drop variant; routed through uploadMany so all
  // images insert via a single editor transaction.
  const handleDroppedImages = useCallback((files: File[]) => { void uploadManyImages(files) }, [uploadManyImages])
  void apiBase; void token // kept for prop compat — apiFetch reads from configStore

  const editorRef = useRef<ReturnType<typeof useEditor>>(null)

  const editor = useEditor({
    extensions: [
      // Tiptap v3 StarterKit already bundles Underline + Link, so we configure
      // them inline instead of importing them separately (which would warn
      // about duplicate extension names and corrupt the schema for Y.js sync).
      // The Collaboration extension brings its own Y.js-driven undo/redo,
      // so StarterKit's UndoRedo (note: was called `history` in v2) must be
      // disabled when collaborating, otherwise both stack-pop on Cmd-Z.
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        horizontalRule: false,
        // v1.5.2111 — explicit autolink + linkOnPaste so URLs typed inline
        // become clickable as soon as a space follows (was: only on newline).
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          protocols: ['http', 'https', 'mailto'],
          HTMLAttributes: { class: 'tiptap-link', rel: 'noopener noreferrer', target: '_blank' },
        },
        ...(collabActive ? { undoRedo: false as const } : {}),
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Image.configure({ allowBase64: true, inline: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Subscript,
      Superscript,
      HorizontalRule,
      FontFamily,
      FontSize,
      ...(collabActive && yDoc ? [Collaboration.configure({ document: yDoc })] : []),
      ...(collabActive && yProvider ? [CollaborationCaret.configure({
        provider: yProvider,
        user: {
          // v1.5.2111 — include id + avatar in awareness so the active-viewers
          // avatar stack can render real faces, not initials.
          id: user?.id ?? '',
          name: user?.name || 'Anonymous',
          color: user?.id ? colorForUserId(user.id) : '#3b82f6',
          avatar: user?.avatar ?? null,
        },
      })] : []),
    ],
    // When collaborating, Y.Doc is the source of truth — don't seed content
    // (the WS provider will sync the doc state from peers/persistence).
    content: collabActive ? undefined : content,
    editable,
    onUpdate: ({ editor: ed }) => {
      onUpdateRef.current(ed.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
        spellcheck: 'true',
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files
        if (!files?.length) return false
        const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
        if (imageFiles.length === 0) return false
        event.preventDefault()
        if (imageFiles.length === 1) handleDroppedImage(imageFiles[0])
        else handleDroppedImages(imageFiles)
        return true
      },
      handlePaste: (_view, event) => {
        if (tryUploadFromClipboard(event.clipboardData?.items ?? null)) {
          event.preventDefault()
          return true
        }
        return false
      },
    },
  })

  editorRef.current = editor
  editorRefForUpload.current = editor

  // Close menus on click outside
  useEffect(() => {
    const handler = () => {
      setShowFontMenu(false); setShowSizeMenu(false)
      setShowColorMenu(false); setShowHighlightMenu(false)
      setShowTableMenu(false); setShowImageMenu(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  // P1.11 + P2.16 — Presence beacon + heartbeat tag while a documentId is set.
  // Beacon every 10s; tag the heartbeat for the duration the editor is mounted.
  useEffect(() => {
    if (!documentId) return
    let cancelled = false

    window.electronAPI.setCurrentReportDocument(documentId)

    const beat = async () => {
      try {
        const cfg = await window.electronAPI.getApiConfig()
        if (cancelled) return
        await fetch(`${cfg.apiBase}/api/report/documents/${documentId}/presence`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.token}` },
        })
      } catch { /* network blip — next beat will retry */ }
    }
    beat()
    const id = setInterval(beat, 10_000)

    return () => {
      cancelled = true
      clearInterval(id)
      window.electronAPI.setCurrentReportDocument(null)
      window.electronAPI.getApiConfig().then((cfg) => {
        // Best-effort leave; ignore errors.
        fetch(`${cfg.apiBase}/api/report/documents/${documentId}/presence`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${cfg.token}` },
        }).catch(() => {})
      }).catch(() => {})
    }
  }, [documentId])

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href
    const url = window.prompt('URL', prev || 'https://')
    if (url === null) return
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  const addImageFromUrl = useCallback(() => {
    if (!editor) return
    const url = window.prompt('Image URL')
    if (url) editor.chain().focus().setImage({ src: url }).run()
    setShowImageMenu(false)
  }, [editor])

  const addImageFromFile = useCallback(async (file: File) => {
    if (!editor) return
    await uploadImage(file)
    setShowImageMenu(false)
  }, [editor, uploadImage])

  const insertTable = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    setShowTableMenu(false)
  }, [editor])

  if (!editor) return null

  const currentFontFamily = editor.getAttributes('textStyle').fontFamily || ''
  const currentFontLabel = FONT_FAMILIES.find(f => f.value === currentFontFamily)?.label || 'Default'

  // ── Toolbar button helper ───────────────────────────────────────────────
  const TB = ({ active, onClick, title, children, disabled }: {
    active?: boolean; onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean
  }) => (
    <button
      onClick={onClick} title={title} disabled={disabled}
      style={{
        width: 28, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: active ? C.accent : 'transparent',
        color: active ? '#fff' : disabled ? 'rgba(255,255,255,0.2)' : C.textSecondary,
        transition: 'all 0.1s', flexShrink: 0, opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={e => { if (!active && !disabled) e.currentTarget.style.background = C.bgHover }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? C.accent : 'transparent' }}
    >
      {children}
    </button>
  )

  const Sep = () => <div style={{ width: 1, height: 18, background: C.separator, flexShrink: 0, margin: '0 2px' }} />

  // ── Dropdown helper ─────────────────────────────────────────────────────
  const Dropdown = ({ show, children, style }: { show: boolean; children: React.ReactNode; style?: React.CSSProperties }) => {
    if (!show) return null
    return (
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4,
        background: C.bgFloating, border: `1px solid ${C.separator}`,
        borderRadius: 8, padding: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        ...style,
      }}>
        {children}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* ── Formatting Toolbar ───────────────────────────────────────── */}
      {editable && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2, padding: '4px 12px',
          borderBottom: `1px solid ${C.separator}`, background: C.lgBg,
          flexShrink: 0, flexWrap: 'wrap', minHeight: 36,
        }}>
          {/* Undo / Redo */}
          <TB onClick={() => editor.chain().focus().undo().run()} title="Undo"
            disabled={!editor.can().undo()}>
            <Undo2 size={14} />
          </TB>
          <TB onClick={() => editor.chain().focus().redo().run()} title="Redo"
            disabled={!editor.can().redo()}>
            <Redo2 size={14} />
          </TB>

          <Sep />

          {/* Font family dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={e => { e.stopPropagation(); setShowFontMenu(!showFontMenu); setShowSizeMenu(false); setShowColorMenu(false); setShowHighlightMenu(false); setShowTableMenu(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                borderRadius: 4, border: 'none', cursor: 'pointer',
                background: 'transparent', color: C.textSecondary, fontSize: 11,
                height: 26, minWidth: 80,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <Type size={12} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentFontLabel}</span>
              <ChevronDown size={10} style={{ flexShrink: 0 }} />
            </button>
            <Dropdown show={showFontMenu} style={{ minWidth: 160 }}>
              {FONT_FAMILIES.map(f => (
                <button key={f.label}
                  onClick={() => {
                    if (f.value) editor.chain().focus().setFontFamily(f.value).run()
                    else editor.chain().focus().unsetFontFamily().run()
                    setShowFontMenu(false)
                  }}
                  style={{
                    width: '100%', display: 'block', padding: '5px 10px', borderRadius: 4,
                    border: 'none', background: 'transparent', color: C.text, fontSize: 12,
                    cursor: 'pointer', textAlign: 'left',
                    fontFamily: f.value || 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  {f.label}
                </button>
              ))}
            </Dropdown>
          </div>

          {/* Font size dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={e => { e.stopPropagation(); setShowSizeMenu(!showSizeMenu); setShowFontMenu(false); setShowColorMenu(false); setShowHighlightMenu(false); setShowTableMenu(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 2, padding: '2px 6px',
                borderRadius: 4, border: 'none', cursor: 'pointer',
                background: 'transparent', color: C.textSecondary, fontSize: 11,
                height: 26, minWidth: 42,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <span>{editor.getAttributes('textStyle').fontSize || '14px'}</span>
              <ChevronDown size={10} />
            </button>
            <Dropdown show={showSizeMenu} style={{ minWidth: 70 }}>
              {FONT_SIZES.map(size => (
                <button key={size}
                  onClick={() => {
                    editor.chain().focus().setFontSize(size).run()
                    setShowSizeMenu(false)
                  }}
                  style={{
                    width: '100%', display: 'block', padding: '4px 10px', borderRadius: 4,
                    border: 'none', background: 'transparent', color: C.text, fontSize: 12,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  {size}
                </button>
              ))}
            </Dropdown>
          </div>

          <Sep />

          {/* Text formatting */}
          <TB active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (⌘B)">
            <Bold size={14} />
          </TB>
          <TB active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (⌘I)">
            <Italic size={14} />
          </TB>
          <TB active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (⌘U)">
            <UnderlineIcon size={14} />
          </TB>
          <TB active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
            <Strikethrough size={14} />
          </TB>
          <TB active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline Code">
            <Code size={14} />
          </TB>
          <TB active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()} title="Subscript">
            <SubIcon size={14} />
          </TB>
          <TB active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()} title="Superscript">
            <SupIcon size={14} />
          </TB>

          <Sep />

          {/* Text color */}
          <div style={{ position: 'relative' }}>
            <button onClick={e => { e.stopPropagation(); setShowColorMenu(!showColorMenu); setShowFontMenu(false); setShowSizeMenu(false); setShowHighlightMenu(false); setShowTableMenu(false) }}
              title="Text Color"
              style={{
                width: 28, height: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                borderRadius: 4, border: 'none', cursor: 'pointer',
                background: 'transparent', color: C.textSecondary, gap: 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>A</span>
              <div style={{ width: 14, height: 3, borderRadius: 1, background: editor.getAttributes('textStyle').color || '#fff' }} />
            </button>
            <Dropdown show={showColorMenu}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3, padding: 4 }}>
                {TEXT_COLORS.map(color => (
                  <button key={color}
                    onClick={() => { editor.chain().focus().setColor(color).run(); setShowColorMenu(false) }}
                    style={{
                      width: 22, height: 22, borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)',
                      background: color, cursor: 'pointer',
                    }} />
                ))}
              </div>
              <button
                onClick={() => { editor.chain().focus().unsetColor().run(); setShowColorMenu(false) }}
                style={{
                  width: '100%', padding: '4px 8px', marginTop: 4, borderRadius: 4,
                  border: 'none', background: 'transparent', color: C.textMuted,
                  fontSize: 10, cursor: 'pointer', textAlign: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                Reset color
              </button>
            </Dropdown>
          </div>

          {/* Highlight */}
          <div style={{ position: 'relative' }}>
            <button onClick={e => { e.stopPropagation(); setShowHighlightMenu(!showHighlightMenu); setShowFontMenu(false); setShowSizeMenu(false); setShowColorMenu(false); setShowTableMenu(false) }}
              title="Highlight"
              style={{
                width: 28, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 4, border: 'none', cursor: 'pointer',
                background: editor.isActive('highlight') ? C.accent : 'transparent',
                color: editor.isActive('highlight') ? '#fff' : C.textSecondary,
              }}
              onMouseEnter={e => { if (!editor.isActive('highlight')) e.currentTarget.style.background = C.bgHover }}
              onMouseLeave={e => { e.currentTarget.style.background = editor.isActive('highlight') ? C.accent : 'transparent' }}>
              <Highlighter size={14} />
            </button>
            <Dropdown show={showHighlightMenu}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3, padding: 4 }}>
                {HIGHLIGHT_COLORS.map(color => (
                  <button key={color}
                    onClick={() => {
                      if (color === 'transparent') editor.chain().focus().unsetHighlight().run()
                      else editor.chain().focus().toggleHighlight({ color }).run()
                      setShowHighlightMenu(false)
                    }}
                    style={{
                      width: 22, height: 22, borderRadius: 4,
                      border: color === 'transparent' ? `1px dashed rgba(255,255,255,0.3)` : '1px solid rgba(255,255,255,0.15)',
                      background: color, cursor: 'pointer',
                    }} />
                ))}
              </div>
            </Dropdown>
          </div>

          <Sep />

          {/* Headings */}
          <TB active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
            <Heading1 size={14} />
          </TB>
          <TB active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
            <Heading2 size={14} />
          </TB>
          <TB active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
            <Heading3 size={14} />
          </TB>
          <TB active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()} title="Paragraph">
            <Pilcrow size={14} />
          </TB>

          <Sep />

          {/* Lists */}
          <TB active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet List">
            <ListIcon size={14} />
          </TB>
          <TB active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered List">
            <ListOrdered size={14} />
          </TB>
          <TB active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Task List">
            <ListChecks size={14} />
          </TB>

          <Sep />

          {/* Alignment */}
          <TB active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align Left">
            <AlignLeft size={14} />
          </TB>
          <TB active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Align Center">
            <AlignCenter size={14} />
          </TB>
          <TB active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align Right">
            <AlignRight size={14} />
          </TB>
          <TB active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title="Justify">
            <AlignJustify size={14} />
          </TB>

          <Sep />

          {/* Block elements */}
          <TB active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">
            <Quote size={14} />
          </TB>
          <TB active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code Block">
            <Code size={14} />
          </TB>
          <TB onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
            <Minus size={14} />
          </TB>

          <Sep />

          {/* Insert: Link, Image, Table */}
          <TB active={editor.isActive('link')} onClick={setLink} title="Link">
            <LinkIcon size={14} />
          </TB>

          {/* Image dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={e => { e.stopPropagation(); setShowImageMenu(!showImageMenu); setShowFontMenu(false); setShowSizeMenu(false); setShowColorMenu(false); setShowHighlightMenu(false); setShowTableMenu(false) }}
              title="Insert Image"
              style={{
                width: 28, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 4, border: 'none', cursor: 'pointer',
                background: 'transparent', color: imageUploading ? C.accent : C.textSecondary,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <ImageIcon size={14} />
            </button>
            <Dropdown show={showImageMenu} style={{ minWidth: 160 }}>
              <button onClick={() => { imageInputRef.current?.click() }} style={menuItem}>
                <Upload size={12} /> Upload Image
              </button>
              <button onClick={addImageFromUrl} style={menuItem}>
                <LinkIcon size={12} /> From URL
              </button>
            </Dropdown>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={e => {
                const files = Array.from(e.target.files ?? [])
                if (files.length === 1) addImageFromFile(files[0])
                else if (files.length > 1) { void uploadManyImages(files); setShowImageMenu(false) }
                if (imageInputRef.current) imageInputRef.current.value = ''
              }}
            />
          </div>

          {/* Table dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={e => { e.stopPropagation(); setShowTableMenu(!showTableMenu); setShowFontMenu(false); setShowSizeMenu(false); setShowColorMenu(false); setShowHighlightMenu(false) }}
              title="Table"
              style={{
                width: 28, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 4, border: 'none', cursor: 'pointer',
                background: editor.isActive('table') ? C.accent : 'transparent',
                color: editor.isActive('table') ? '#fff' : C.textSecondary,
              }}
              onMouseEnter={e => { if (!editor.isActive('table')) e.currentTarget.style.background = C.bgHover }}
              onMouseLeave={e => { e.currentTarget.style.background = editor.isActive('table') ? C.accent : 'transparent' }}>
              <TableIcon size={14} />
            </button>
            <Dropdown show={showTableMenu} style={{ minWidth: 160, right: 0, left: 'auto' }}>
              <button onClick={insertTable} style={menuItem}>
                <Plus size={12} /> Insert Table (3×3)
              </button>
              {editor.isActive('table') && (
                <>
                  <button onClick={() => { editor.chain().focus().addColumnAfter().run(); setShowTableMenu(false) }} style={menuItem}>
                    <Plus size={12} /> Add Column
                  </button>
                  <button onClick={() => { editor.chain().focus().addRowAfter().run(); setShowTableMenu(false) }} style={menuItem}>
                    <Plus size={12} /> Add Row
                  </button>
                  <button onClick={() => { editor.chain().focus().deleteColumn().run(); setShowTableMenu(false) }} style={menuItem}>
                    <Trash2 size={12} /> Delete Column
                  </button>
                  <button onClick={() => { editor.chain().focus().deleteRow().run(); setShowTableMenu(false) }} style={menuItem}>
                    <Trash2 size={12} /> Delete Row
                  </button>
                  <button onClick={() => { editor.chain().focus().mergeCells().run(); setShowTableMenu(false) }} style={menuItem}>
                    <TableCellsMerge size={12} /> Merge Cells
                  </button>
                  <button onClick={() => { editor.chain().focus().splitCell().run(); setShowTableMenu(false) }} style={menuItem}>
                    <TableCellsMerge size={12} /> Split Cell
                  </button>
                  <div style={{ height: 1, background: C.separator, margin: '4px 0' }} />
                  <button onClick={() => { editor.chain().focus().deleteTable().run(); setShowTableMenu(false) }} style={{ ...menuItem, color: '#ef4444' }}>
                    <Trash2 size={12} /> Delete Table
                  </button>
                </>
              )}
            </Dropdown>
          </div>

          <Sep />

          {/* Clear formatting */}
          <TB onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear Formatting">
            <RemoveFormatting size={14} />
          </TB>

          <TB onClick={() => {
            const html = editor.getHTML()
            const w = window.open('', '_blank')
            if (!w) return
            w.document.write(`<!DOCTYPE html><html><head><title>Print</title><style>
              body { font-family: system-ui, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #222; }
              h1, h2, h3 { margin-top: 1.5em; } table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #ccc; padding: 8px; } blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 16px; color: #555; }
              pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; } code { background: #f0f0f0; padding: 2px 4px; border-radius: 3px; }
              img { max-width: 100%; } ul[data-type="taskList"] { list-style: none; padding-left: 0; }
              ul[data-type="taskList"] li { display: flex; gap: 8px; align-items: flex-start; }
            </style></head><body>${html}</body></html>`)
            w.document.close()
            w.print()
          }} title="Print">
            <Printer size={14} />
          </TB>

          {/* v1.5.2206 — edit history. Only visible when documentId is set
              (i.e. on a real Report doc, not on the embedded clock-out
              report editor where there's no version history). */}
          {documentId && (
            <TB onClick={() => setShowEditHistory(true)} title="Edit history">
              <History size={14} />
            </TB>
          )}

          {/* v1.5.2111 — active viewers / editors stack. Pushed to the
              right edge with margin-left:auto so it doesn't fight with
              formatting controls. Green dot = currently editing. */}
          {collabActive && activeViewers.length > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'row-reverse' }}>
                {activeViewers.slice(0, 5).map((v, idx) => (
                  <div key={v.id} title={`${v.name}${v.isSelf ? ' (you)' : ''} — ${v.isEditing ? 'editing' : 'viewing'}`}
                    style={{
                      width: 24, height: 24, borderRadius: '50%',
                      border: `2px solid ${v.color}`,
                      marginLeft: idx === activeViewers.slice(0, 5).length - 1 ? 0 : -8,
                      position: 'relative', overflow: 'visible', zIndex: activeViewers.length - idx,
                      background: C.bgHover, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    {v.avatar ? (
                      <img src={v.avatar.startsWith('http') ? v.avatar : `${apiBase}${v.avatar}`}
                        alt={v.name}
                        style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.text }}>
                        {(v.name || '?').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    {/* status dot */}
                    <span style={{
                      position: 'absolute', bottom: -1, right: -1,
                      width: 8, height: 8, borderRadius: '50%',
                      background: v.isEditing ? '#22c55e' : '#9ca3af',
                      border: `1.5px solid ${C.lgBg}`,
                    }} />
                  </div>
                ))}
              </div>
              {activeViewers.length > 5 && (
                <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 500 }}>+{activeViewers.length - 5}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Editor Content ───────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflow: 'auto', padding: '24px 40px',
        background: C.contentBg,
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* v1.5.2206 — slide-in edit history panel (issues #10 + #12). */}
      {showEditHistory && documentId && (
        <EditHistoryPanel
          documentId={documentId}
          edits={editsLoading ? [] : edits}
          onClose={() => setShowEditHistory(false)}
          onRevert={onRevertEdit}
        />
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const menuItem: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
  padding: '5px 10px', borderRadius: 4, border: 'none',
  background: 'transparent', color: C.text, fontSize: 11,
  cursor: 'pointer', textAlign: 'left' as const,
}
