import React, { useState, useEffect, useRef } from 'react'
import {
  Plus, Smile, AtSign, Send, Loader, Image, Search, X,
  Bold, Italic, Underline, Strikethrough, Link2, ListOrdered, List,
  Quote, Code, Braces, MoreHorizontal, ChevronDown, Video, Mic, Clock,
} from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig, UserInfo } from '../../types'
import { Avatar } from '../shared/Avatar'
import { EmojiPicker } from './EmojiPicker'

// ─── Tenor GIF API (v2, free tier) ───────────────────────────────────────────
const TENOR_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ' // Google/Tenor public API key
const TENOR_CLIENT = 'bundy_desktop'
const TENOR_LIMIT = 30

interface TenorGif {
  id: string
  title: string
  previewUrl: string
  gifUrl: string
  width: number
  height: number
}

async function searchTenorGifs(query: string): Promise<TenorGif[]> {
  const endpoint = query.trim()
    ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&client_key=${TENOR_CLIENT}&limit=${TENOR_LIMIT}&media_filter=gif,tinygif`
    : `https://tenor.googleapis.com/v2/featured?key=${TENOR_KEY}&client_key=${TENOR_CLIENT}&limit=${TENOR_LIMIT}&media_filter=gif,tinygif`
  const res = await fetch(endpoint)
  if (!res.ok) return []
  const data = await res.json()
  return (data.results ?? []).map((r: any) => ({
    id: r.id,
    title: r.title || r.content_description || '',
    previewUrl: r.media_formats?.tinygif?.url ?? r.media_formats?.gif?.url ?? '',
    gifUrl: r.media_formats?.gif?.url ?? '',
    width: r.media_formats?.tinygif?.dims?.[0] ?? 200,
    height: r.media_formats?.tinygif?.dims?.[1] ?? 200,
  }))
}

// ─── HTML → Markdown converter ───────────────────────────────────────────────
function htmlToMarkdown(html: string): string {
  if (!html || html === '<br>' || html === '<br/>') return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return convertNodes(tmp).replace(/\n{3,}/g, '\n\n').trim()
}

function convertNodes(parent: Node): string {
  return Array.from(parent.childNodes).map(convertNode).join('')
}

function convertNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  const inner = convertNodes(el)
  // Handle mention badges
  if (el.classList.contains('bundy-mention-badge') && el.dataset.username) {
    return `@${el.dataset.username} `
  }
  switch (tag) {
    case 'strong': case 'b': return inner ? `**${inner}**` : ''
    case 'em': case 'i': return inner ? `*${inner}*` : ''
    case 'u': return inner
    case 's': case 'strike': case 'del': return inner ? `~~${inner}~~` : ''
    case 'code': return el.parentElement?.tagName.toLowerCase() === 'pre' ? inner : (inner ? `\`${inner}\`` : '')
    case 'pre': return `\`\`\`\n${el.textContent || ''}\n\`\`\``
    case 'a': return `[${inner}](${el.getAttribute('href') || ''})`
    case 'br': return '\n'
    case 'div': case 'p': return (inner || '') + '\n'
    case 'blockquote': return inner.split('\n').filter(l => l.trim()).map(l => `> ${l}`).join('\n') + '\n'
    case 'ul': case 'ol': return inner
    case 'li': {
      const p = el.parentElement?.tagName.toLowerCase()
      if (p === 'ol') { const idx = Array.from(el.parentElement!.children).indexOf(el) + 1; return `${idx}. ${inner.trim()}\n` }
      return `- ${inner.trim()}\n`
    }
    default: return inner
  }
}

// ─── Editor styles injected once ─────────────────────────────────────────────
const EDITOR_STYLE_ID = 'bundy-editor-styles'
function ensureEditorStyles() {
  let style = document.getElementById(EDITOR_STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = EDITOR_STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = `
    .bundy-editor blockquote { border-left: 3px solid rgba(255,255,255,0.2); margin: 4px 0; padding-left: 12px; color: rgba(255,255,255,0.7); }
    .bundy-editor code { background: rgba(255,255,255,0.06); padding: 1px 4px; border-radius: 3px; font-family: 'SF Mono', Monaco, Menlo, monospace; font-size: 12px; }
    .bundy-editor pre { background: rgba(255,255,255,0.06); padding: 8px 12px; border-radius: 6px; font-family: 'SF Mono', Monaco, Menlo, monospace; font-size: 12px; overflow-x: auto; margin: 4px 0; }
    .bundy-editor pre code { background: none; padding: 0; }
    .bundy-editor a { color: ${C.accent}; text-decoration: underline; }
    .bundy-editor ul, .bundy-editor ol { margin: 2px 0; padding-left: 24px; }
    .bundy-editor li { margin: 1px 0; }
    .bundy-editor .bundy-mention-badge {
      display: inline-flex; align-items: center; gap: 2px;
      padding: 1px 6px; border-radius: 4px;
      background: ${C.accent}22; color: ${C.accent};
      font-weight: 600; font-size: 13px;
      cursor: default; user-select: all; -webkit-user-select: all;
      vertical-align: baseline; line-height: 1.4;
    }
  `
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
  const [uploading, setUploading] = useState(false)
  const [hasContent, setHasContent] = useState(false)
  const [showFormatBar, setShowFormatBar] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const [showScheduleMenu, setShowScheduleMenu] = useState(false)
  const scheduleMenuRef = useRef<HTMLDivElement>(null)
  const [showCustomTime, setShowCustomTime] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const [customTime, setCustomTime] = useState('09:00')
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [mentionResults, setMentionResults] = useState<UserInfo[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const isInternalUpdate = useRef(false)

  // Emoji picker state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const emojiPickerRef = useRef<HTMLDivElement>(null)

  // GIF picker state
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [gifQuery, setGifQuery] = useState('')
  const [gifs, setGifs] = useState<TenorGif[]>([])
  const [loadingGifs, setLoadingGifs] = useState(false)
  const gifSearchTimer = useRef<NodeJS.Timeout | null>(null)
  const gifPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { ensureEditorStyles() }, [])

  useEffect(() => {
    fetch(`${config.apiBase}/api/users`, { headers: { Authorization: `Bearer ${config.token}` } })
      .then(r => r.json())
      .then((d: { users: UserInfo[] }) => setAllUsers(d.users))
      .catch(() => {})
  }, [config])

  // Sync parent → editor (clear after send)
  useEffect(() => {
    if (isInternalUpdate.current) { isInternalUpdate.current = false; return }
    if (!editorRef.current) return
    if (input === '' && editorRef.current.textContent) {
      editorRef.current.innerHTML = ''
      setHasContent(false)
    }
  }, [input])

  // GIF picker effects
  useEffect(() => {
    if (!showGifPicker) return
    if (gifSearchTimer.current) clearTimeout(gifSearchTimer.current)
    setLoadingGifs(true)
    gifSearchTimer.current = setTimeout(() => {
      searchTenorGifs(gifQuery).then(setGifs).catch(() => setGifs([])).finally(() => setLoadingGifs(false))
    }, gifQuery ? 400 : 0)
    return () => { if (gifSearchTimer.current) clearTimeout(gifSearchTimer.current) }
  }, [gifQuery, showGifPicker])

  useEffect(() => {
    if (!showGifPicker) return
    function handleClick(e: MouseEvent) {
      if (gifPickerRef.current && !gifPickerRef.current.contains(e.target as Node)) setShowGifPicker(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showGifPicker])

  // Close more menu on outside click
  useEffect(() => {
    if (!showMoreMenu) return
    function handleClick(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setShowMoreMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMoreMenu])

  // Close schedule menu on outside click
  useEffect(() => {
    if (!showScheduleMenu) return
    function handleClick(e: MouseEvent) {
      if (scheduleMenuRef.current && !scheduleMenuRef.current.contains(e.target as Node)) setShowScheduleMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showScheduleMenu])

  function syncToParent() {
    const html = editorRef.current?.innerHTML || ''
    const md = htmlToMarkdown(html)
    isInternalUpdate.current = true
    setInput(md)
    setHasContent(!!(editorRef.current?.textContent?.trim()))
  }

  function handleEditorInput() {
    syncToParent()
    onTyping()
    checkMention()
  }

  function checkMention() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return
    const range = sel.getRangeAt(0)
    const preRange = document.createRange()
    preRange.selectNodeContents(editorRef.current)
    preRange.setEnd(range.startContainer, range.startOffset)
    const textBefore = preRange.toString()
    const match = textBefore.match(/@(\w*)$/)
    if (match) {
      const q = match[1].toLowerCase()
      const results = allUsers.filter(u =>
        (u.alias?.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
      ).slice(0, 6)
      setMentionResults(results)
      setMentionIndex(0)
    } else {
      setMentionResults([])
    }
  }

  function applyCommand(command: string, value?: string) {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    syncToParent()
  }

  function insertLink() {
    const url = prompt('Enter URL:')
    if (url) applyCommand('createLink', url)
  }

  function toggleInlineCode() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    editorRef.current?.focus()
    const range = sel.getRangeAt(0)
    if (range.collapsed) return
    const ancestor = range.commonAncestorContainer
    const codeParent = ancestor.nodeType === Node.ELEMENT_NODE
      ? (ancestor as HTMLElement).closest('code')
      : ancestor.parentElement?.closest('code')
    if (codeParent) {
      const textNode = document.createTextNode(codeParent.textContent || '')
      codeParent.replaceWith(textNode)
    } else {
      const code = document.createElement('code')
      code.appendChild(range.extractContents())
      range.insertNode(code)
      range.selectNodeContents(code)
      sel.removeAllRanges()
      sel.addRange(range)
    }
    syncToParent()
  }

  function insertMention(user: UserInfo) {
    const editor = editorRef.current
    if (!editor) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) {
      editor.focus()
      const badge = createMentionBadge(user)
      const range = sel ? sel.getRangeAt(0) : document.createRange()
      range.insertNode(badge)
      range.setStartAfter(badge)
      range.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(range)
      syncToParent()
      setMentionResults([])
      return
    }
    const range = sel.getRangeAt(0)
    const textNode = range.startContainer
    if (textNode.nodeType === Node.TEXT_NODE) {
      const text = textNode.textContent || ''
      const cursorPos = range.startOffset
      const textBefore = text.slice(0, cursorPos)
      const atIdx = textBefore.lastIndexOf('@')
      if (atIdx >= 0) {
        // Split text and insert badge
        const before = text.slice(0, atIdx)
        const after = text.slice(cursorPos)
        textNode.textContent = before
        const badge = createMentionBadge(user)
        const afterNode = document.createTextNode(after || '\u200B')
        const parent = textNode.parentNode!
        if (textNode.nextSibling) {
          parent.insertBefore(afterNode, textNode.nextSibling)
          parent.insertBefore(badge, afterNode)
        } else {
          parent.appendChild(badge)
          parent.appendChild(afterNode)
        }
        // Place cursor after the badge
        const newRange = document.createRange()
        newRange.setStart(afterNode, after ? 0 : 1)
        newRange.collapse(true)
        sel.removeAllRanges()
        sel.addRange(newRange)
      }
    }
    syncToParent()
    setMentionResults([])
  }

  function createMentionBadge(user: UserInfo): HTMLSpanElement {
    const badge = document.createElement('span')
    badge.className = 'bundy-mention-badge'
    badge.contentEditable = 'false'
    badge.dataset.username = user.username
    badge.dataset.mentionId = user.id
    badge.textContent = user.alias || user.username
    return badge
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex(i => (i + 1) % mentionResults.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(i => (i - 1 + mentionResults.length) % mentionResults.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(mentionResults[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionResults([])
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendFn()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  async function sendScheduled(scheduledAt: Date) {
    if (!input.trim()) return
    const content = input.trim()
    await fetch(`${config.apiBase}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, scheduledAt: scheduledAt.toISOString() }),
    }).catch(() => {})
    // Clear editor
    setInput('')
    if (editorRef.current) { editorRef.current.innerHTML = ''; setHasContent(false) }
    setShowScheduleMenu(false)
  }

  function getScheduleOptions(): { label: string; date: Date }[] {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)

    // Next Monday
    const nextMonday = new Date(now)
    const dayOfWeek = nextMonday.getDay()
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek)
    nextMonday.setDate(nextMonday.getDate() + daysUntilMonday)
    nextMonday.setHours(9, 0, 0, 0)

    const fmt = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long' }) + ' at ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

    return [
      { label: `Tomorrow at ${tomorrow.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`, date: tomorrow },
      { label: `${fmt(nextMonday)}`, date: nextMonday },
    ]
  }

  async function sendGif(gif: TenorGif) {
    setShowGifPicker(false)
    setGifQuery('')
    await fetch(`${config.apiBase}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: gif.gifUrl }),
    }).catch(() => {})
  }

  async function uploadFileBlob(file: File) {
    if (!channelId) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${config.apiBase}/api/channels/${channelId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}` },
        body: form,
      })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      const { url, filename } = await res.json() as { url: string; filename: string }
      const content = `[📎 ${filename}](${config.apiBase}${url})`
      await fetch(`${config.apiBase}/api/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
    } catch { /* ignore */ } finally { setUploading(false) }
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

  // ─── Toolbar button helpers ──────────────────────────────────────────────────
  const tbBtn = (icon: React.ReactNode, action: () => void, title: string, active = false) => (
    <button onClick={action} title={title}
      style={{
        width: 30, height: 30, borderRadius: 6, border: 'none',
        background: active ? C.bgHover : 'transparent',
        color: active ? C.text : C.textMuted,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.1s, color 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? C.bgHover : 'transparent'; e.currentTarget.style.color = active ? C.text : C.textMuted }}>
      {icon}
    </button>
  )

  const sep = () => <div style={{ width: 1, height: 20, background: C.separator, margin: '0 4px' }} />

  return (
    <div style={{ padding: '8px 16px 12px', flexShrink: 0, position: 'relative' }}>
      {/* GIF Picker */}
      {showGifPicker && (
        <div ref={gifPickerRef} style={{
          position: 'absolute', bottom: '100%', left: 16, right: 16, marginBottom: 4,
          background: C.bgPrimary, borderRadius: 10, border: `1px solid ${C.separator}`,
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)', zIndex: 60,
          display: 'flex', flexDirection: 'column', height: 360, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${C.separator}` }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text, flex: 1 }}>GIF</span>
            <button onClick={() => { setShowGifPicker(false); setGifQuery('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2, display: 'flex' }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, background: C.bgInput, border: `1px solid ${C.separator}` }}>
              <Search size={14} color={C.textMuted} />
              <input value={gifQuery} onChange={e => setGifQuery(e.target.value)}
                placeholder="Search GIFs…" autoFocus
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: C.text, fontSize: 13, fontFamily: 'inherit' }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px' }}>
            {loadingGifs ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
                <Loader size={20} color={C.textMuted} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : gifs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: C.textMuted, fontSize: 13 }}>
                {gifQuery ? 'No GIFs found' : 'Search for a GIF'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {gifs.map(g => (
                  <button key={g.id} onClick={() => sendGif(g)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                    <img src={g.previewUrl} alt={g.title}
                      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 6, minHeight: 80, objectFit: 'cover', background: C.bgInput }}
                      loading="lazy" />
                  </button>
                ))}
              </div>
            )}
            <div style={{ textAlign: 'center', padding: '8px 0 2px' }}>
              <span style={{ fontSize: 10, color: C.textMuted }}>Powered by Tenor</span>
            </div>
          </div>
        </div>
      )}

      {/* Mention autocomplete */}
      {mentionResults.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 16, right: 16,
          background: C.bgFloating, borderRadius: 8, border: `1px solid ${C.separator}`,
          boxShadow: C.shadowHigh, overflow: 'hidden', zIndex: 50,
        }}>
          <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Members</div>
          {mentionResults.map((u, i) => (
            <button key={u.id} onClick={() => insertMention(u)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                background: i === mentionIndex ? C.bgHover : 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={() => setMentionIndex(i)}>
              <Avatar url={u.avatarUrl} name={u.alias ?? u.username} size={28} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{u.alias ?? u.username}</span>
                <span style={{ fontSize: 11, color: C.textMuted }}>@{u.username}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Schedule menu popup */}
      {showScheduleMenu && (
        <div ref={scheduleMenuRef} style={{
          position: 'absolute', bottom: '100%', right: 16, marginBottom: 4,
          background: C.bgFloating, borderRadius: 10, border: `1px solid ${C.separator}`,
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)', overflow: 'hidden', zIndex: 55, minWidth: 260,
        }}>
          {/* Header */}
          <div style={{ padding: '12px 16px 8px', borderBottom: `1px solid ${C.separator}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} color={C.textMuted} />
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Schedule message</span>
            </div>
          </div>
          {/* Quick options */}
          <div style={{ padding: '4px 0' }}>
            {getScheduleOptions().map((opt, i) => (
              <button key={i} onClick={() => sendScheduled(opt.date)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', padding: '10px 16px',
                  background: 'none', border: 'none', cursor: 'pointer', color: C.text,
                  fontSize: 14, fontFamily: 'inherit', textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = C.accent, e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none', e.currentTarget.style.color = C.text)}>
                {opt.label}
              </button>
            ))}
          </div>
          {/* Custom time */}
          <div style={{ borderTop: `1px solid ${C.separator}`, padding: '4px 0' }}>
            <button onClick={() => { setShowScheduleMenu(false); setShowCustomTime(true); setCustomDate(new Date(Date.now() + 86400000).toISOString().slice(0, 10)) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', padding: '10px 16px',
                background: 'none', border: 'none', cursor: 'pointer', color: C.text,
                fontSize: 14, fontFamily: 'inherit', textAlign: 'left',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.bgHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              Custom time
            </button>
          </div>
        </div>
      )}

      {/* Custom time picker modal */}
      {showCustomTime && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={e => { if (e.target === e.currentTarget) setShowCustomTime(false) }}>
          <div style={{
            background: C.bgFloating, borderRadius: 12, border: `1px solid ${C.separator}`,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: 24, minWidth: 320,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <Clock size={18} color={C.accent} />
              <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Schedule message</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 13, color: C.textMuted, fontWeight: 500 }}>Date
                <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  style={{
                    display: 'block', width: '100%', marginTop: 4, padding: '8px 10px',
                    borderRadius: 6, border: `1px solid ${C.separator}`, background: C.bgInput,
                    color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none',
                    colorScheme: 'dark',
                  }} />
              </label>
              <label style={{ fontSize: 13, color: C.textMuted, fontWeight: 500 }}>Time
                <input type="time" value={customTime} onChange={e => {
                    const val = e.target.value
                    setCustomTime(val)
                  }}
                  style={{
                    display: 'block', width: '100%', marginTop: 4, padding: '8px 10px',
                    borderRadius: 6, border: `1px solid ${C.separator}`, background: C.bgInput,
                    color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none',
                    colorScheme: 'dark',
                  }} />
              </label>
              {(() => {
                const isValid = customDate && customTime && new Date(`${customDate}T${customTime}:00`).getTime() > Date.now() + 5 * 60000
                const isTooSoon = customDate && customTime && !isValid && new Date(`${customDate}T${customTime}:00`).getTime() > Date.now()
                return isTooSoon ? (
                  <div style={{ fontSize: 12, color: C.warning, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} />
                    Must be at least 5 minutes from now
                  </div>
                ) : customDate && customTime && new Date(`${customDate}T${customTime}:00`).getTime() <= Date.now() ? (
                  <div style={{ fontSize: 12, color: C.danger, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} />
                    Selected time is in the past
                  </div>
                ) : null
              })()}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCustomTime(false)}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: `1px solid ${C.separator}`,
                  background: 'transparent', color: C.text, fontSize: 13, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}>Cancel</button>
              <button onClick={() => {
                  const dt = new Date(`${customDate}T${customTime}:00`)
                  if (dt.getTime() > Date.now() + 5 * 60000) { sendScheduled(dt); setShowCustomTime(false) }
                }}
                disabled={!customDate || !customTime || new Date(`${customDate}T${customTime}:00`).getTime() <= Date.now() + 5 * 60000}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: 'none',
                  background: C.accent, color: '#fff', fontSize: 13, cursor: 'pointer',
                  fontWeight: 600, fontFamily: 'inherit',
                  opacity: customDate && customTime && new Date(`${customDate}T${customTime}:00`).getTime() > Date.now() + 5 * 60000 ? 1 : 0.5,
                }}>Schedule</button>
            </div>
          </div>
        </div>
      )}

      {/* More menu popup */}
      {showMoreMenu && (
        <div ref={moreMenuRef} style={{
          position: 'absolute', bottom: '100%', left: 16, marginBottom: 4,
          background: C.bgFloating, borderRadius: 8, border: `1px solid ${C.separator}`,
          boxShadow: C.shadowHigh, overflow: 'hidden', zIndex: 55, minWidth: 180,
        }}>
          {[
            { icon: <Image size={16} />, label: 'GIF', action: () => { setShowMoreMenu(false); setShowGifPicker(true); setGifQuery('') } },
            { icon: <Video size={16} />, label: 'Video clip', action: () => setShowMoreMenu(false) },
            { icon: <Mic size={16} />, label: 'Audio clip', action: () => setShowMoreMenu(false) },
          ].map((item, i) => (
            <button key={i} onClick={item.action}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: C.text, fontSize: 13, fontFamily: 'inherit' }}
              onMouseEnter={e => (e.currentTarget.style.background = C.bgHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <span style={{ color: C.textMuted, display: 'flex' }}>{item.icon}</span>
              {item.label}
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

        {/* ─── Formatting toolbar (shown when Aa is toggled) ─── */}
        {showFormatBar && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', gap: 1, borderBottom: `1px solid ${C.separator}` }}>
            {tbBtn(<Bold size={16} />, () => applyCommand('bold'), 'Bold')}
            {tbBtn(<Italic size={16} />, () => applyCommand('italic'), 'Italic')}
            {tbBtn(<Underline size={16} />, () => applyCommand('underline'), 'Underline')}
            {tbBtn(<Strikethrough size={16} />, () => applyCommand('strikeThrough'), 'Strikethrough')}
            {sep()}
            {tbBtn(<Link2 size={16} />, insertLink, 'Link')}
            {tbBtn(<ListOrdered size={16} />, () => applyCommand('insertOrderedList'), 'Numbered list')}
            {tbBtn(<List size={16} />, () => applyCommand('insertUnorderedList'), 'Bullet list')}
            {sep()}
            {tbBtn(<Quote size={16} />, () => applyCommand('formatBlock', 'blockquote'), 'Blockquote')}
            {tbBtn(<Code size={16} />, toggleInlineCode, 'Code')}
            {tbBtn(<Braces size={16} />, () => applyCommand('formatBlock', 'pre'), 'Code block')}
          </div>
        )}

        {/* ─── ContentEditable editor ─── */}
        <div style={{ position: 'relative' }}>
          {!hasContent && (
            <div style={{ position: 'absolute', top: 12, left: 14, color: C.textMuted, pointerEvents: 'none', fontSize: 14, userSelect: 'none' }}>
              {placeholder}
            </div>
          )}
          <div
            ref={editorRef}
            className="bundy-editor"
            contentEditable
            suppressContentEditableWarning
            onInput={handleEditorInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            style={{
              minHeight: 40, maxHeight: 120, overflowY: 'auto',
              padding: '12px 14px 8px', fontSize: 14, color: C.text,
              outline: 'none', lineHeight: 1.5, fontFamily: 'inherit',
              wordBreak: 'break-word',
            }}
          />
        </div>

        <div style={{ height: 1, background: C.separator, margin: '0 10px' }} />

        {/* ─── Bottom toolbar (Slack-style) ─── */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 2 }}>
          {/* + Attach (circle) */}
          <button onClick={() => fileRef.current?.click()} title="Attach file"
            style={{
              width: 28, height: 28, borderRadius: '50%', border: 'none',
              background: C.fillTertiary, color: C.textMuted, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.1s, color 0.1s', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
            onMouseLeave={e => { e.currentTarget.style.background = C.fillTertiary; e.currentTarget.style.color = C.textMuted }}>
            <Plus size={16} />
          </button>

          {/* Aa Formatting toggle */}
          {tbBtn(
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'inherit', lineHeight: 1, textDecoration: showFormatBar ? 'underline' : 'none' }}>Aa</span>,
            () => setShowFormatBar(f => !f),
            'Formatting',
            showFormatBar
          )}

          {/* Emoji */}
          <div ref={emojiPickerRef} style={{ position: 'relative' }}>
            {tbBtn(<Smile size={16} />, () => setShowEmojiPicker(p => !p), 'Emoji', showEmojiPicker)}
            {showEmojiPicker && (
              <EmojiPicker
                onSelect={(emoji) => {
                  editorRef.current?.focus()
                  document.execCommand('insertText', false, emoji)
                  setShowEmojiPicker(false)
                }}
                onClose={() => setShowEmojiPicker(false)}
              />
            )}
          </div>

          {/* @ Mention */}
          {tbBtn(<AtSign size={16} />, () => {
            editorRef.current?.focus()
            document.execCommand('insertText', false, '@')
          }, 'Mention')}

          {/* ••• More */}
          {tbBtn(<MoreHorizontal size={16} />, () => setShowMoreMenu(m => !m), 'More', showMoreMenu)}

          <div style={{ flex: 1 }} />

          {/* Send + Chevron */}
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={sendFn}
              disabled={!input.trim() || sending || uploading}
              title="Send message"
              style={{
                width: 32, height: 32, borderRadius: '6px 0 0 6px', border: 'none',
                background: input.trim() ? C.accent : 'transparent',
                color: input.trim() ? '#fff' : C.textMuted,
                cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s, color 0.15s',
              }}>
              {sending ? <Loader size={16} /> : <Send size={16} />}
            </button>
            <div style={{ width: 1, height: 20, background: input.trim() ? 'rgba(255,255,255,0.2)' : C.separator }} />
            <button title="Schedule message" onClick={() => { if (input.trim()) setShowScheduleMenu(s => !s) }}
              style={{
                width: 24, height: 32, borderRadius: '0 6px 6px 0', border: 'none',
                background: input.trim() ? C.accent : 'transparent',
                color: input.trim() ? '#fff' : C.textMuted,
                cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s, color 0.15s',
              }}>
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
