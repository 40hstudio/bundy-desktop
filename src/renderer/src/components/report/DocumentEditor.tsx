import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Link from '@tiptap/extension-link'
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
import { FontSize } from './FontSizeExtension'
import { useCallback, useRef, useEffect, useState } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List as ListIcon, ListOrdered, ListChecks,
  Heading1, Heading2, Heading3,
  Quote, Minus, Link as LinkIcon, Image as ImageIcon,
  Table as TableIcon, Undo2, Redo2, Highlighter,
  Type, ChevronDown, Subscript as SubIcon, Superscript as SupIcon,
  Printer, Pilcrow, RemoveFormatting, TableCellsMerge, Plus, Trash2,
  Upload,
} from 'lucide-react'
import { C } from '../../theme'

// ─── Props ────────────────────────────────────────────────────────────────────

interface DocumentEditorProps {
  content: string
  onUpdate: (html: string) => void
  editable?: boolean
  apiBase?: string
  token?: string
  projectId?: string
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

export default function DocumentEditor({ content, onUpdate, editable = true, apiBase, token, projectId }: DocumentEditorProps) {
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  const [showFontMenu, setShowFontMenu] = useState(false)
  const [showSizeMenu, setShowSizeMenu] = useState(false)
  const [showColorMenu, setShowColorMenu] = useState(false)
  const [showHighlightMenu, setShowHighlightMenu] = useState(false)
  const [showTableMenu, setShowTableMenu] = useState(false)
  const [showImageMenu, setShowImageMenu] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Upload image helper for paste/drop (used inside editorProps, needs stable ref)
  const uploadImageRef = useRef<(file: File) => Promise<string | null>>(async () => null)
  uploadImageRef.current = async (file: File) => {
    if (!apiBase || !token) return null
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${apiBase}/api/report/documents/upload-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!res.ok) return null
    const data = await res.json()
    return `${apiBase}${data.url}`
  }

  const handleDroppedImage = useCallback(async (file: File) => {
    const url = await uploadImageRef.current(file)
    if (url && editorRef.current) {
      editorRef.current.chain().focus().setImage({ src: url }).run()
    }
  }, [])

  const editorRef = useRef<ReturnType<typeof useEditor>>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        horizontalRule: false,
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'tiptap-link' } }),
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
    ],
    content,
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
        if (files?.length && files[0].type.startsWith('image/')) {
          event.preventDefault()
          handleDroppedImage(files[0])
          return true
        }
        return false
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              event.preventDefault()
              const file = item.getAsFile()
              if (file) handleDroppedImage(file)
              return true
            }
          }
        }
        return false
      },
    },
  })

  editorRef.current = editor

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
    if (!editor || !apiBase || !token) return
    setImageUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${apiBase}/api/report/documents/upload-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      const imgUrl = `${apiBase}${data.url}`
      editor.chain().focus().setImage({ src: imgUrl }).run()
    } catch (err) {
      console.error('Image upload failed:', err)
    } finally {
      setImageUploading(false)
      setShowImageMenu(false)
    }
  }, [editor, apiBase, token])

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
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
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) addImageFromFile(f)
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
