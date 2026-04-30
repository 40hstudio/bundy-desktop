import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
  List as ListIcon, ListOrdered, ListChecks,
  Heading1, Heading2, Quote, Minus, Link as LinkIcon, Image as ImageIcon,
  Undo2, Redo2, Edit2, Check, X,
} from 'lucide-react'
import { C } from '../../theme'
import { sanitizeHtml } from '../../utils/sanitize'
import { useImageUpload } from '../../hooks/useImageUpload'

interface Props {
  value: string | null
  onSave: (html: string) => void
  apiBase: string
  token: string
  taskId: string
  readOnly?: boolean
}

export default function TaskDescriptionEditor({ value, onSave, apiBase, token, taskId, readOnly }: Props) {
  const [editing, setEditing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  void apiBase; void token // kept for prop compat — apiFetch reads from configStore

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Add a description…' }),
    ],
    content: value || '',
    editable: editing && !readOnly,
    onUpdate: ({ editor }) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        onSave(editor.getHTML())
      }, 1500)
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editing && !readOnly)
    // Auto-focus when entering edit mode so the user doesn't need a second click.
    if (editing && !readOnly) {
      const t = setTimeout(() => editor.commands.focus('end'), 30)
      return () => clearTimeout(t)
    }
    return undefined
  }, [editor, editing, readOnly])

  useEffect(() => {
    if (!editor || editing) return
    const newContent = value || ''
    if (editor.getHTML() !== newContent) {
      editor.commands.setContent(newContent, false)
    }
  }, [editor, value, editing])

  function handleSave() {
    if (!editor) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    onSave(editor.getHTML())
    setEditing(false)
  }

  function handleCancel() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    editor?.commands.setContent(value || '', false)
    setEditing(false)
  }

  // Save on blur: if the editor loses focus while dirty, commit the work.
  // Prevents "I clicked outside and my notes vanished" complaints.
  useEffect(() => {
    if (!editor || !editing) return
    function onBlur(): void {
      // requestAnimationFrame so toolbar clicks (which steal focus briefly)
      // don't prematurely commit + exit edit mode.
      requestAnimationFrame(() => {
        if (!editor) return
        if (editor.isFocused) return
        // The toolbar buttons live outside the editor view; only commit if
        // focus has truly left the editor + its toolbar container.
        const active = document.activeElement as HTMLElement | null
        if (active && active.closest('[data-tiptap-toolbar="task-description"]')) return
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        onSave(editor.getHTML())
        setEditing(false)
      })
    }
    const dom = editor.view.dom
    dom.addEventListener('blur', onBlur)
    return () => dom.removeEventListener('blur', onBlur)
  }, [editor, editing, onSave])

  const { upload, tryUploadFromClipboard, uploading: imageUploading } = useImageUpload({
    endpoint: `/api/tasks/${taskId}/attachments`,
    responsePath: 'attachment.url',
    onUploaded: (url) => { editor?.chain().focus().setImage({ src: url }).run() },
    onError: (err) => console.error('[TaskDescriptionEditor] image upload failed:', err),
  })

  const uploadImage = useCallback((file: File) => { void upload(file) }, [upload])

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!editing) return
    if (!e.clipboardData?.items) return
    const handled = tryUploadFromClipboard(e.clipboardData.items)
    if (handled) e.preventDefault()
  }, [editing, tryUploadFromClipboard])

  useEffect(() => {
    const el = editor?.view?.dom
    if (!el) return
    el.addEventListener('paste', handlePaste as EventListener)
    return () => el.removeEventListener('paste', handlePaste as EventListener)
  }, [editor, handlePaste])

  const isEmpty = !value || value === '<p></p>' || value === ''

  if (!editing) {
    return (
      <div
        onClick={() => { if (!readOnly) setEditing(true) }}
        style={{ cursor: readOnly ? 'default' : 'pointer', minHeight: 36, position: 'relative' }}
      >
        {isEmpty ? (
          <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, fontStyle: 'italic' }}>
            {readOnly ? 'No description' : 'Click to add a description…'}
          </div>
        ) : (
          <div
            className="tiptap-content"
            // Open <a> clicks in the default browser via Electron's openExternal
            // instead of letting the renderer navigate / spawn a new window.
            onClick={(e) => {
              const target = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null
              if (!target?.href) return
              e.preventDefault()
              e.stopPropagation()
              window.electronAPI.openExternal(target.href).catch(() => {})
            }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(value!) }}
            style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}
          />
        )}
        {!readOnly && !isEmpty && (
          <Edit2 size={10} style={{ position: 'absolute', top: 2, right: 0, opacity: 0.3 }} />
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Toolbar */}
      <div data-tiptap-toolbar="task-description" style={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', padding: '4px 6px', background: C.bgInput, borderRadius: '8px 8px 0 0', border: `1px solid ${C.separator}`, borderBottom: 'none' }}>
        {[
          { icon: <Undo2 size={13} />, title: 'Undo', action: () => editor?.chain().focus().undo().run() },
          { icon: <Redo2 size={13} />, title: 'Redo', action: () => editor?.chain().focus().redo().run() },
          { sep: true },
          { icon: <Bold size={13} />, title: 'Bold', action: () => editor?.chain().focus().toggleBold().run(), active: editor?.isActive('bold') },
          { icon: <Italic size={13} />, title: 'Italic', action: () => editor?.chain().focus().toggleItalic().run(), active: editor?.isActive('italic') },
          { icon: <UnderlineIcon size={13} />, title: 'Underline', action: () => editor?.chain().focus().toggleUnderline().run(), active: editor?.isActive('underline') },
          { icon: <Strikethrough size={13} />, title: 'Strikethrough', action: () => editor?.chain().focus().toggleStrike().run(), active: editor?.isActive('strike') },
          { icon: <Code size={13} />, title: 'Code', action: () => editor?.chain().focus().toggleCode().run(), active: editor?.isActive('code') },
          { sep: true },
          { icon: <Heading1 size={13} />, title: 'Heading 1', action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), active: editor?.isActive('heading', { level: 1 }) },
          { icon: <Heading2 size={13} />, title: 'Heading 2', action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: editor?.isActive('heading', { level: 2 }) },
          { sep: true },
          { icon: <ListIcon size={13} />, title: 'Bullet list', action: () => editor?.chain().focus().toggleBulletList().run(), active: editor?.isActive('bulletList') },
          { icon: <ListOrdered size={13} />, title: 'Numbered list', action: () => editor?.chain().focus().toggleOrderedList().run(), active: editor?.isActive('orderedList') },
          { icon: <ListChecks size={13} />, title: 'Task list', action: () => editor?.chain().focus().toggleTaskList().run(), active: editor?.isActive('taskList') },
          { icon: <Quote size={13} />, title: 'Blockquote', action: () => editor?.chain().focus().toggleBlockquote().run(), active: editor?.isActive('blockquote') },
          { icon: <Minus size={13} />, title: 'Divider', action: () => editor?.chain().focus().setHorizontalRule().run() },
          { sep: true },
          { icon: <LinkIcon size={13} />, title: 'Link', action: () => { const url = prompt('URL:'); if (url) editor?.chain().focus().setLink({ href: url }).run() }, active: editor?.isActive('link') },
          { icon: <ImageIcon size={13} />, title: 'Upload image', action: () => fileInputRef.current?.click() },
        ].map((item, i) => item.sep ? (
          <div key={i} style={{ width: 1, height: 16, background: C.separator, margin: '0 3px' }} />
        ) : (
          <button key={i} onClick={item.action} title={item.title}
            style={{ background: item.active ? C.accent + '25' : 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 5, color: item.active ? C.accent : C.textSecondary, display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = C.bgHover }}
            onMouseLeave={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = 'none' }}>
            {item.icon}
          </button>
        ))}
        {imageUploading && <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 4 }}>Uploading…</span>}
        <div style={{ flex: 1 }} />
        <button onClick={handleCancel} title="Cancel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: '3px 5px', borderRadius: 5, display: 'flex', alignItems: 'center' }}>
          <X size={13} />
        </button>
        <button onClick={handleSave} title="Save (Cmd+Enter)" style={{ background: C.accent, border: 'none', cursor: 'pointer', color: '#fff', padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'inherit' }}>
          <Check size={11} /> Save
        </button>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = '' }} />
      <EditorContent editor={editor}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave() } }}
        style={{ fontSize: 13, color: C.text, lineHeight: 1.6, minHeight: 80, padding: '8px 10px', background: C.bgInput, border: `1px solid ${C.separator}`, borderRadius: '0 0 8px 8px', outline: 'none', cursor: 'text' }}
      />
    </div>
  )
}
