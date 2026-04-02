import React, { useState, useEffect, useRef } from 'react'
import {
  Plus, Bold, Italic, Underline, Strikethrough, Link, List, ListOrdered,
  Quote, Code, FileCode, Smile, AtSign, Mic, Send, Loader, Type, X,
} from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig, UserInfo } from '../../types'
import { Avatar } from '../shared/Avatar'
import { apiFetch } from '../../utils/api'

function htmlToMarkdown(html: string): string {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  function nodeToMd(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    const children = Array.from(el.childNodes).map(nodeToMd).join('')
    if (tag === 'strong' || tag === 'b') return `**${children}**`
    if (tag === 'em' || tag === 'i') return `*${children}*`
    if (tag === 'u') return `__${children}__`
    if (tag === 's' || tag === 'strike' || tag === 'del') return `~~${children}~~`
    if (tag === 'a') {
      const href = (el as HTMLAnchorElement).href || el.getAttribute('href') || ''
      return `[${children}](${href})`
    }
    if (tag === 'pre') {
      const codeEl = el.querySelector('code')
      const text = codeEl ? (codeEl.textContent ?? '') : (el.textContent ?? '')
      return '```\n' + text + '\n```'
    }
    if (tag === 'code') return `\`${children}\``
    if (tag === 'blockquote') {
      return children.split('\n').filter(Boolean).map(l => `> ${l}`).join('\n')
    }
    if (tag === 'ol') {
      let i = 1
      return Array.from(el.childNodes)
        .filter(n => (n as HTMLElement).tagName?.toLowerCase() === 'li')
        .map(n => `${i++}. ${Array.from(n.childNodes).map(nodeToMd).join('')}`)
        .join('\n') + '\n'
    }
    if (tag === 'ul') {
      return Array.from(el.childNodes)
        .filter(n => (n as HTMLElement).tagName?.toLowerCase() === 'li')
        .map(n => `- ${Array.from(n.childNodes).map(nodeToMd).join('')}`)
        .join('\n') + '\n'
    }
    if (tag === 'li') return children
    if (tag === 'br') return '\n'
    if (tag === 'div') {
      if (el.childNodes.length === 1 && (el.childNodes[0] as HTMLElement).tagName === 'BR') return '\n'
      return '\n' + children
    }
    return children
  }
  return Array.from(tmp.childNodes).map(nodeToMd).join('').replace(/^\n/, '').replace(/\n+$/, '')
}

export function MessageInput({
  placeholder, config, channelId, onTyping, input, setInput, sendFn, sending,
}: {
  placeholder: string; config: ApiConfig; channelId: string
  onTyping: () => void; input: string; setInput: (v: string) => void
  sendFn: () => void; sending: boolean
  onSend?: (content: string) => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [uploading, setUploading] = useState(false)
  const [, setMentionSearch] = useState<string | null>(null)
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [mentionResults, setMentionResults] = useState<UserInfo[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [showFormatting, setShowFormatting] = useState(true)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  useEffect(() => {
    apiFetch('/api/users')
      .then(r => r.json())
      .then((d: { users: UserInfo[] }) => setAllUsers(d.users))
      .catch(() => {})
  }, [config])

  // Clear the editor when input is reset externally (e.g. after send)
  useEffect(() => {
    if (input === '' && editorRef.current && editorRef.current.innerHTML !== '') {
      editorRef.current.innerHTML = ''
    }
  }, [input])

  function syncMarkdown() {
    const div = editorRef.current
    if (!div) return
    setInput(htmlToMarkdown(div.innerHTML))
  }

  function handleEditorInput() {
    syncMarkdown()
    onTyping()
    // @mention detection
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      const node = range.startContainer
      if (node.nodeType === Node.TEXT_NODE) {
        const textBefore = (node.textContent ?? '').slice(0, range.startOffset)
        const match = textBefore.match(/@(\w*)$/)
        if (match) {
          const q = match[1].toLowerCase()
          setMentionSearch(q)
          setMentionResults(allUsers.filter(u =>
            (u.alias?.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
          ).slice(0, 6))
          return
        }
      }
    }
    setMentionSearch(null)
    setMentionResults([])
  }

  function insertMention(user: UserInfo) {
    const div = editorRef.current
    if (!div) return
    div.focus()
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      const node = range.startContainer
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ''
        const offset = range.startOffset
        const atIdx = text.lastIndexOf('@', offset - 1)
        if (atIdx >= 0) {
          const mention = `@${user.username} `
          node.textContent = text.slice(0, atIdx) + mention + text.slice(offset)
          const newRange = document.createRange()
          newRange.setStart(node, atIdx + mention.length)
          newRange.collapse(true)
          sel.removeAllRanges()
          sel.addRange(newRange)
        }
      }
    }
    setMentionSearch(null)
    setMentionResults([])
    syncMarkdown()
  }

  function applyFormat(command: string, value?: string) {
    const div = editorRef.current
    if (!div) return
    div.focus()
    document.execCommand(command, false, value)
    syncMarkdown()
  }

  function insertBlockquote() {
    const div = editorRef.current
    if (!div) return
    div.focus()
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    // Toggle off if already inside a blockquote
    let node: Node | null = range.startContainer
    while (node && node !== div) {
      if ((node as HTMLElement).tagName?.toUpperCase() === 'BLOCKQUOTE') {
        const bq = node as Element
        const parent = bq.parentNode!
        while (bq.firstChild) parent.insertBefore(bq.firstChild, bq)
        parent.removeChild(bq)
        syncMarkdown()
        return
      }
      node = node.parentNode
    }
    // Build blockquote from selection or current block
    const bq = document.createElement('blockquote')
    if (!range.collapsed) {
      bq.appendChild(range.extractContents())
    } else {
      // Find block-level parent inside editor
      let block: Node | null = range.startContainer
      if (block.nodeType === Node.TEXT_NODE) block = block.parentNode
      // If the block is a <li>, extract just its content
      if ((block as HTMLElement).tagName?.toUpperCase() === 'LI') {
        const li = block as HTMLElement
        while (li.firstChild) bq.appendChild(li.firstChild)
        const ul = li.parentElement!
        ul.parentNode!.insertBefore(bq, ul)
        li.remove()
        if (!ul.children.length) ul.remove()
      } else {
        // Flat text node: wrap the whole direct child
        while (block && block.parentNode !== div) block = block.parentNode
        if (block && block !== div) {
          div.insertBefore(bq, block)
          bq.appendChild(block)
        } else {
          // Cursor in bare text node directly in editor
          bq.appendChild(document.createElement('br'))
          range.insertNode(bq)
        }
      }
    }
    if (bq.parentNode !== div) range.insertNode(bq)
    const r = document.createRange()
    r.selectNodeContents(bq)
    r.collapse(false)
    sel.removeAllRanges()
    sel.addRange(r)
    syncMarkdown()
  }

  function insertInlineCode() {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const code = document.createElement('code')
    if (!range.collapsed) {
      code.appendChild(range.extractContents())
    } else {
      code.appendChild(document.createTextNode('​'))
    }
    range.insertNode(code)
    // Place cursor at end of the code span
    const r = document.createRange()
    r.selectNodeContents(code)
    r.collapse(false)
    sel.removeAllRanges()
    sel.addRange(r)
    syncMarkdown()
  }

  function insertCodeBlock() {
    const div = editorRef.current
    if (!div) return
    div.focus()
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.textContent = '\n'
    pre.appendChild(code)
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(pre)
      const newRange = document.createRange()
      newRange.setStart(code, 0)
      newRange.collapse(true)
      sel.removeAllRanges()
      sel.addRange(newRange)
    }
    syncMarkdown()
  }

  function openLinkDialog() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
    }
    setLinkUrl('')
    setLinkDialogOpen(true)
  }

  function confirmLink() {
    const div = editorRef.current
    if (!div || !linkUrl.trim()) { setLinkDialogOpen(false); return }
    div.focus()
    const sel = window.getSelection()
    if (savedRangeRef.current) {
      sel?.removeAllRanges()
      sel?.addRange(savedRangeRef.current)
    }
    document.execCommand('createLink', false, linkUrl.trim())
    setLinkDialogOpen(false)
    syncMarkdown()
  }

  function insertBullet() {
    const div = editorRef.current
    if (!div) return
    div.focus()
    document.execCommand('insertUnorderedList', false)
    syncMarkdown()
  }

  async function uploadFileBlob(file: File) {
    if (!channelId) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await apiFetch(`/api/channels/${channelId}/attachments`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      const { url, filename } = await res.json() as { url: string; filename: string }
      const content = `[📎 ${filename}](${config.apiBase}${url})`
      await apiFetch(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
    } catch { /* ignore upload errors */ } finally { setUploading(false) }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadFileBlob(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFileBlob(file)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (mentionResults.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
      e.preventDefault(); return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        let node: Node | null = sel.getRangeAt(0).startContainer
        while (node && node !== editorRef.current) {
          const tag = (node as Element).tagName?.toUpperCase()
          if (tag === 'LI') return  // browser handles list item Enter
          if (tag === 'PRE') return  // browser handles Enter inside code blocks
          node = node.parentNode
        }
      }
      e.preventDefault()
      sendFn()
    }
  }

  const fmtBtn = (cmd: string, title: string, icon: React.ReactNode, execValue?: string) => (
    <button key={title} title={title}
      onMouseDown={e => { e.preventDefault(); applyFormat(cmd, execValue) }}
      style={{ width: 28, height: 28, borderRadius: 5, border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
      {icon}
    </button>
  )

  const actionBtn = (onClick: () => void, title: string, icon: React.ReactNode, active = false) => (
    <button key={title} title={title} onClick={onClick}
      style={{ width: 30, height: 30, borderRadius: 6, border: 'none', background: active ? `${C.accent}22` : 'transparent', color: active ? C.accent : C.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted } }}>
      {icon}
    </button>
  )

  return (
    <div style={{ padding: '8px 16px 12px', flexShrink: 0, position: 'relative' }}>
      {mentionResults.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 16, right: 16,
          background: C.bgFloating, borderRadius: 8, border: `1px solid ${C.separator}`,
          boxShadow: C.shadowHigh, overflow: 'hidden', zIndex: 50,
        }}>
          {mentionResults.map(u => (
            <button key={u.id} onClick={() => insertMention(u)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget.style.background = C.bgHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <Avatar url={u.avatarUrl} name={u.alias ?? u.username} size={24} />
              <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{u.alias ?? u.username}</span>
              <span style={{ fontSize: 11, color: C.textMuted }}>@{u.username}</span>
            </button>
          ))}
        </div>
      )}

      <input ref={fileRef} type="file" hidden onChange={handleFile} />

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `1px solid ${dragOver ? C.accent : C.fillTertiary}`,
          borderRadius: 8, background: C.bgSecondary,
          transition: 'border-color 0.15s', position: 'relative', overflow: 'hidden',
        }}>
        {dragOver && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0, 122, 204, 0.08)', zIndex: 30, pointerEvents: 'none' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>Drop file to upload</span>
          </div>
        )}

        {/* Formatting toolbar */}
        {showFormatting && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 6px', borderBottom: `1px solid ${C.separator}`, gap: 2, flexWrap: 'wrap' }}>
            {fmtBtn('bold', 'Bold', <Bold size={14} />)}
            {fmtBtn('italic', 'Italic', <Italic size={14} />)}
            {fmtBtn('underline', 'Underline', <Underline size={14} />)}
            {fmtBtn('strikeThrough', 'Strikethrough', <Strikethrough size={14} />)}
            <div style={{ width: 1, height: 16, background: C.separator, margin: '0 2px' }} />
            <button title="Link" onMouseDown={e => { e.preventDefault(); openLinkDialog() }}
              style={{ width: 28, height: 28, borderRadius: 5, border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
              <Link size={14} />
            </button>
            <div style={{ width: 1, height: 16, background: C.separator, margin: '0 2px' }} />
            {fmtBtn('insertOrderedList', 'Ordered list', <ListOrdered size={14} />)}
            {fmtBtn('insertUnorderedList', 'Bullet list', <List size={14} />)}
            <div style={{ width: 1, height: 16, background: C.separator, margin: '0 2px' }} />
            <button title="Blockquote" onMouseDown={e => { e.preventDefault(); insertBlockquote() }}
              style={{ width: 28, height: 28, borderRadius: 5, border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
              <Quote size={14} />
            </button>
            <button title="Inline code" onMouseDown={e => { e.preventDefault(); insertInlineCode() }}
              style={{ width: 28, height: 28, borderRadius: 5, border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
              <Code size={14} />
            </button>
            <button title="Code block" onMouseDown={e => { e.preventDefault(); insertCodeBlock() }}
              style={{ width: 28, height: 28, borderRadius: 5, border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
              <FileCode size={14} />
            </button>
          </div>
        )}

        {/* Link dialog */}
        {linkDialogOpen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${C.separator}` }}>
            <input
              autoFocus
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmLink(); if (e.key === 'Escape') setLinkDialogOpen(false) }}
              placeholder="https://..."
              style={{ flex: 1, fontSize: 13, padding: '4px 8px', borderRadius: 5, border: `1px solid ${C.separator}`, background: C.bgInput, color: C.text, outline: 'none' }}
            />
            <button onClick={confirmLink} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 5, border: 'none', background: C.accent, color: '#fff', cursor: 'pointer' }}>Insert</button>
            <button onClick={() => setLinkDialogOpen(false)} style={{ width: 26, height: 26, borderRadius: 5, border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
          </div>
        )}

        {/* Editor */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleEditorInput}
          onKeyDown={handleKeyDown}
          data-placeholder={placeholder}
          className="msg-editor"
          style={{
            width: '100%', padding: '10px 14px 8px',
            fontSize: 14, color: C.text, border: 'none', outline: 'none',
            lineHeight: 1.5, minHeight: 40, maxHeight: 120, overflow: 'auto',
            fontFamily: 'inherit', background: 'transparent', display: 'block',
            wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          }}
        />

        {/* Bottom action bar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', gap: 2, borderTop: `1px solid ${C.separator}` }}>
          {actionBtn(() => fileRef.current?.click(), 'Attach file', <Plus size={16} />)}
          {actionBtn(() => setShowFormatting(v => !v), 'Formatting', <Type size={15} />, showFormatting)}
          <div style={{ width: 1, height: 18, background: C.separator, margin: '0 3px' }} />
          {actionBtn(() => {}, 'Emoji', <Smile size={16} />)}
          {actionBtn(() => { const div = editorRef.current; if (div) { div.focus(); document.execCommand('insertText', false, '@'); handleEditorInput() } }, 'Mention', <AtSign size={16} />)}
          {actionBtn(() => {}, 'Voice message', <Mic size={16} />)}

          <div style={{ flex: 1 }} />

          <button
            onClick={sendFn}
            disabled={!input.trim() || sending || uploading}
            title="Send message"
            style={{
              width: 30, height: 30, borderRadius: 6, border: 'none',
              background: input.trim() ? C.accent : 'transparent',
              color: input.trim() ? '#fff' : C.textMuted,
              cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {sending || uploading ? <Loader size={15} /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  )
}
