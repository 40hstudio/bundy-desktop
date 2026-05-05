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

// ─── Tenor GIF search (proxied through server) ──────────────────────────────
const TENOR_LIMIT = 30

interface TenorGif {
  id: string
  title: string
  previewUrl: string
  gifUrl: string
  width: number
  height: number
}

async function searchTenorGifs(query: string, apiBase: string, token: string): Promise<TenorGif[]> {
  const q = query.trim()
  const endpoint = `${apiBase}/api/tenor?q=${encodeURIComponent(q)}&limit=${TENOR_LIMIT}`
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  })
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
  // Handle upload chips (image/file attachments)
  if (el.classList.contains('bundy-upload-chip') && el.dataset.md) {
    return el.dataset.md
  }
  switch (tag) {
    case 'strong': case 'b': return inner ? `**${inner}**` : ''
    case 'em': case 'i': return inner ? `*${inner}*` : ''
    case 'u': return inner ? `__${inner}__` : ''
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
    case 'span': {
      // execCommand often produces inline-style spans instead of <strong>/<em>/<u>/<s>.
      // Fall through inline marker conversion when we recognize the pattern.
      const style = el.getAttribute('style') || ''
      let m = inner
      if (/font-weight:\s*(bold|[6-9]\d{2})/i.test(style) && m) m = `**${m}**`
      if (/font-style:\s*italic/i.test(style) && m) m = `*${m}*`
      if (/text-decoration[^;]*\bunderline\b/i.test(style) && m) m = `__${m}__`
      if (/text-decoration[^;]*\bline-through\b/i.test(style) && m) m = `~~${m}~~`
      return m
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
  onUpload, onGifSelect, hideGifs, hideSchedule, onScheduled,
}: {
  placeholder: string; config: ApiConfig; channelId: string
  onTyping: () => void; input: string; setInput: (v: string) => void
  sendFn: () => void; sending: boolean
  onSend?: (content: string) => void
  onUpload?: (file: File) => Promise<{ url: string; filename: string }>
  /** Called after a scheduled-send succeeds so the parent can refresh its
   *  scheduled-messages list immediately (P3-#11). */
  onScheduled?: () => void
  /**
   * If provided, sendGif calls this with the GIF URL instead of POSTing to
   * the channel directly. Required when the parent owns the send pipeline
   * (e.g. task discussion comments — there is no channelId).
   */
  onGifSelect?: (url: string) => Promise<void>
  hideGifs?: boolean
  hideSchedule?: boolean
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [hasContent, setHasContent] = useState(false)
  const [showFormatBar, setShowFormatBar] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const [showScheduleMenu, setShowScheduleMenu] = useState(false)
  const scheduleMenuRef = useRef<HTMLDivElement>(null)
  const [showCustomTime, setShowCustomTime] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const [customTime, setCustomTime] = useState('09:00')

  // Local-time YYYY-MM-DD for an `<input type="date">` (toISOString uses
  // UTC and rolls over the day at midnight UTC, which surprises users in
  // non-UTC zones — keep it in the user's local timezone).
  function localDateString(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  function localTimeString(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  // #6 — open Custom-time pre-filled with today + one hour from now.
  function defaultCustomDate(): string { return localDateString(new Date(Date.now() + 60 * 60_000)) }
  function defaultCustomTime(): string { return localTimeString(new Date(Date.now() + 60 * 60_000)) }
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [mentionResults, setMentionResults] = useState<UserInfo[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const isInternalUpdate = useRef(false)
  // Custom link modal — replaces prompt() which Electron forbids.
  const [linkModal, setLinkModal] = useState<{ url: string; savedRange: Range | null } | null>(null)
  // Pending uploads displayed as chips ABOVE the editor (one chip per file,
  // each carrying its own status + percentage progress).
  type PendingUpload = {
    id: string; name: string; size: number
    status: 'uploading' | 'done' | 'error'
    url?: string
    isImage?: boolean
    thumbDataUrl?: string
    progress?: number      // 0–100
    xhr?: XMLHttpRequest   // so cancel button can abort
  }
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])

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

  // ─── #9: Audio + video clip recorder ────────────────────────────────────────
  // Three-phase flow: setup → recording → preview → send. Setup lets the
  // user pick a source for video (camera / screen / both) and confirms with
  // an explicit Record button so we never start capturing without consent.
  // Combined ("camera + screen") mode renders the screen onto a canvas with
  // the camera composited in the bottom-left as a PiP overlay, captures the
  // canvas stream + mic audio, and feeds that to MediaRecorder.
  type VideoSource = 'camera' | 'screen' | 'both'
  type ScreenSource = { id: string; name: string; thumbnail: string }
  type CameraDevice = { deviceId: string; label: string }
  type RecorderState = {
    type: 'audio' | 'video'
    phase: 'setup' | 'recording' | 'preview'
    /** For video: which capture source to use. Ignored for audio. */
    videoSource: VideoSource
    /** Available screen / window sources fetched from the main process when
     *  the user picks a screen-bearing video source. */
    screenSources?: ScreenSource[]
    screenSourcesLoading?: boolean
    /** The screen / window the user chose, required for screen / both. */
    selectedScreenId?: string
    /** Available camera input devices (populated lazily). */
    cameraDevices?: CameraDevice[]
    /** The camera the user chose; defaults to the system default when
     *  unset, or the first device once the list loads. */
    selectedCameraId?: string
    /** Active media stream while phase === 'recording'. */
    stream?: MediaStream
    /** Held alongside `stream` for the combined screen+cam flow so we can
     *  shut both source streams down cleanly on stop/cancel. */
    auxStreams?: MediaStream[]
    mr?: MediaRecorder
    chunks: Blob[]
    startedAt: number
    elapsedMs: number
    blob?: Blob
    blobUrl?: string
    /** RAF id for the canvas compositor (combined mode). */
    rafId?: number
  }
  const [recorder, setRecorder] = useState<RecorderState | null>(null)
  const recorderRef = useRef(recorder)
  recorderRef.current = recorder
  // P0-2 — safety net: every cancel / send / discard path already
  // revokes the recorder's blob URL, but if the user closes the tab
  // mid-recording or mid-preview the blob URL would leak. This unmount
  // cleanup catches that edge case + stops any live MediaRecorder so
  // the mic/camera lights don't stay on.
  useEffect(() => {
    return () => {
      const r = recorderRef.current
      if (!r) return
      if (r.blobUrl) { try { URL.revokeObjectURL(r.blobUrl) } catch { /* ignore */ } }
      if (r.mr && r.mr.state !== 'inactive') { try { r.mr.stop() } catch { /* ignore */ } }
      r.stream?.getTracks().forEach(t => { try { t.stop() } catch { /* ignore */ } })
      r.auxStreams?.forEach(s => s.getTracks().forEach(t => { try { t.stop() } catch { /* ignore */ } }))
    }
  }, [])
  const liveVideoRef = useRef<HTMLVideoElement>(null)
  const compositorCanvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => { ensureEditorStyles() }, [])

  useEffect(() => {
    fetch(`${config.apiBase}/api/users`, { headers: { Authorization: `Bearer ${config.token}` } })
      .then(r => r.json())
      .then((d: { users: UserInfo[] }) => setAllUsers(d.users))
      .catch(() => {})
  }, [config])

  // Sync parent → editor. Two scenarios:
  // 1. After-send clear: parent sets input back to ''.
  // 2. Channel switch with a per-channel draft: parent loads the new
  //    user's draft into `input`. The contenteditable div doesn't reset
  //    on its own (component stays mounted across channel changes), so
  //    we have to reflect the new value here. Without this the previous
  //    user's typed text leaks into the next conversation's composer.
  useEffect(() => {
    if (isInternalUpdate.current) { isInternalUpdate.current = false; return }
    if (!editorRef.current) return
    const editorText = editorRef.current.textContent ?? ''
    if (input === editorText) return
    if (input === '') {
      editorRef.current.innerHTML = ''
      setHasContent(false)
    } else {
      // Plain-text replacement is enough — drafts only persist text
      // (no styling), and any preserved markup would be re-derived
      // when the user next types.
      editorRef.current.innerText = input
      setHasContent(true)
    }
  }, [input])

  // GIF picker effects
  useEffect(() => {
    if (!showGifPicker) return
    if (gifSearchTimer.current) clearTimeout(gifSearchTimer.current)
    setLoadingGifs(true)
    gifSearchTimer.current = setTimeout(() => {
      searchTenorGifs(gifQuery, config.apiBase, config.token).then(setGifs).catch(() => setGifs([])).finally(() => setLoadingGifs(false))
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
    // v1.5.2111 — require whitespace or start-of-input before @ so that
    // email addresses (e.g. "user@example.com") don't trigger the picker.
    // Capture group 1 is the trigger char (or empty), group 2 is the query.
    const match = textBefore.match(/(^|[\s\n])@(\w*)$/)
    if (match) {
      const q = match[2].toLowerCase()
      // Special broadcast mentions
      const broadcastItems: UserInfo[] = []
      if ('all'.startsWith(q)) broadcastItems.push({ id: 'all', username: 'all', alias: 'all', avatarUrl: null } as UserInfo)
      if ('here'.startsWith(q)) broadcastItems.push({ id: 'here', username: 'here', alias: 'here', avatarUrl: null } as UserInfo)
      const userResults = allUsers.filter(u =>
        (u.alias?.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
      ).slice(0, 6)
      setMentionResults([...broadcastItems, ...userResults])
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
    // Capture the current selection so we can restore it after the modal closes
    // (clicking the modal input would otherwise blur the editor and drop the range).
    const sel = window.getSelection()
    const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null
    setLinkModal({ url: '', savedRange })
  }
  function applyLinkFromModal() {
    if (!linkModal) return
    let url = linkModal.url.trim()
    if (!url) { setLinkModal(null); return }
    // P3-#5 — bare hostnames like "test.com" rendered as raw `[text](url)`
    // because the markdown parser only matches http(s):// URLs. Prepend the
    // protocol if the user didn't.
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !url.startsWith('mailto:') && !url.startsWith('/')) {
      url = `https://${url}`
    }
    // Restore the saved selection so createLink wraps the right range.
    const sel = window.getSelection()
    if (linkModal.savedRange && sel) {
      sel.removeAllRanges()
      sel.addRange(linkModal.savedRange)
    }
    applyCommand('createLink', url)
    setLinkModal(null)
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
      // v1.5.2111 \u2014 derive the slice strictly from the @<word-chars> match
      // at the cursor. Previously we used `lastIndexOf('@')` and slice up to
      // cursorPos, which could over-consume characters typed AFTER the @ in
      // a fast-typing race (e.g. "@RifkieI" landing in the badge).
      const trigger = textBefore.match(/(^|[\s\n])@(\w*)$/)
      if (trigger) {
        const queryLen = trigger[2].length
        const atIdx = cursorPos - queryLen - 1 // position of the @ char
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
      void composedSend()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    // Handle pasted images
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault()
        const file = items[i].getAsFile()
        if (file) uploadFileBlob(file)
        return
      }
    }
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  async function sendScheduled(scheduledAt: Date) {
    if (!input.trim()) return
    const content = input.trim()
    try {
      const res = await fetch(`${config.apiBase}/api/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, scheduledAt: scheduledAt.toISOString() }),
      })
      if (res.ok) onScheduled?.()  // P3-#11 — parent refreshes the menu
    } catch { /* network blip */ }
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
    if (onGifSelect) {
      try { await onGifSelect(gif.gifUrl) } catch (err) { console.error('[MessageInput] onGifSelect failed:', err) }
      return
    }
    if (!channelId) return
    await fetch(`${config.apiBase}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: gif.gifUrl }),
    }).catch(() => {})
  }

  // P3-#1/#2/#3/#4 — multi-file upload with above-input progress chips.
  // Each file gets a `PendingUpload` row immediately (status: 'uploading').
  // While the upload is in flight, the chip shows a spinner and a thumbnail
  // preview (data URL) for images. On completion, status flips to 'done' and
  // the chip's url/filename are set; on send, all completed chips' markdown
  // is appended to the message body.
  const MAX_BYTES = 50 * 1024 * 1024 // 50 MB (#11a)

  function isImageFilename(name: string): boolean {
    return /\.(jpe?g|png|gif|webp|avif|svg)$/i.test(name)
  }
  function isVideoFilename(name: string): boolean {
    return /\.(mp4|webm|ogg|mov|m4v)$/i.test(name)
  }

  async function readImageAsDataUrl(file: File): Promise<string | undefined> {
    try {
      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.onerror = reject
        r.readAsDataURL(file)
      })
    } catch { return undefined }
  }

  // P3-#2/#3 — XHR-based upload so xhr.upload.onprogress can drive a real
  // percentage. fetch() never exposes upload progress, which is why a 23 MB
  // video looked stuck. Returns a promise that resolves to the upload row
  // (which can be polled by composedSend for the "follow-up" auto-post).
  function uploadFileBlob(file: File): Promise<PendingUpload | null> {
    if (!channelId && !onUpload) return Promise.resolve(null)
    if (file.size > MAX_BYTES) {
      setUploadError(`"${file.name}" exceeds 50 MB`)
      setTimeout(() => setUploadError(null), 4000)
      return Promise.resolve(null)
    }

    return new Promise(async (resolve) => {
      const isImage = isImageFilename(file.name)
      const id = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const thumbDataUrl = isImage ? await readImageAsDataUrl(file) : undefined

      // onUpload prop path (task discussion comments, etc.) — no progress hook
      // available, so just toggle status.
      if (onUpload) {
        setPendingUploads((prev) => [...prev, {
          id, name: file.name, size: file.size, status: 'uploading',
          isImage, thumbDataUrl, progress: 0,
        }])
        try {
          const result = await onUpload(file)
          const fullUrl = result.url.startsWith('http') ? result.url : `${config.apiBase}${result.url}`
          const done: PendingUpload = { id, name: result.filename, size: file.size, status: 'done', url: fullUrl, isImage, thumbDataUrl, progress: 100 }
          setPendingUploads((prev) => prev.map((u) => u.id === id ? done : u))
          resolve(done)
        } catch (err) {
          console.error('[Upload] onUpload failed:', err)
          setPendingUploads((prev) => prev.map((u) => u.id === id ? { ...u, status: 'error' } : u))
          setUploadError(`Upload failed: ${file.name}`)
          setTimeout(() => setUploadError(null), 4000)
          resolve(null)
        }
        return
      }

      // v1.5.2109 — Phase 2 of the R2 migration: try direct-to-R2 first,
      // fall back to the legacy multipart route on 501 ("R2 disabled"),
      // sign-step error, OR PUT-step failure (e.g. CSP block, R2 outage,
      // mid-upload network drop). Both paths use XHR for the body upload
      // so xhr.upload.onprogress drives the % indicator either way.
      type R2Outcome = 'done' | 'aborted' | 'fallback'
      const tryR2Direct = (): Promise<{ outcome: R2Outcome; pending?: PendingUpload }> => new Promise(async (r2Resolve) => {
        try {
          const signRes = await fetch(
            `${config.apiBase}/api/channels/${channelId}/attachments/sign`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.token}`,
              },
              body: JSON.stringify({
                filename: file.name,
                contentType: file.type || 'application/octet-stream',
                size: file.size,
              }),
            },
          )
          if (!signRes.ok) {
            // 501 = R2 disabled (expected before bucket provisioned).
            // Other codes shouldn't happen — log so we notice.
            if (signRes.status !== 501) {
              console.warn(`[Upload] sign returned ${signRes.status}, falling back to multipart`)
            }
            r2Resolve({ outcome: 'fallback' })
            return
          }
          const { uploadUrl, url } = (await signRes.json()) as { uploadUrl: string; url: string }
          const putXhr = new XMLHttpRequest()
          putXhr.open('PUT', uploadUrl)
          putXhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

          setPendingUploads((prev) => [...prev, {
            id, name: file.name, size: file.size, status: 'uploading',
            isImage, thumbDataUrl, progress: 0, xhr: putXhr,
          }])
          console.log(`[Upload] R2 direct ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`)

          putXhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100)
              setPendingUploads((prev) => prev.map((u) => u.id === id ? { ...u, progress: pct } : u))
            }
          }
          putXhr.onload = () => {
            if (putXhr.status >= 200 && putXhr.status < 300) {
              const fullUrl = `${config.apiBase}${url}`
              console.log(`[Upload] R2 done ${file.name} → ${fullUrl}`)
              const done: PendingUpload = { id, name: file.name, size: file.size, status: 'done', url: fullUrl, isImage, thumbDataUrl, progress: 100 }
              setPendingUploads((prev) => prev.map((u) => u.id === id ? done : u))
              r2Resolve({ outcome: 'done', pending: done })
            } else {
              console.warn(`[Upload] R2 PUT HTTP ${putXhr.status} for ${file.name}, falling back to multipart`)
              setPendingUploads((prev) => prev.filter((u) => u.id !== id))
              r2Resolve({ outcome: 'fallback' })
            }
          }
          putXhr.onerror = () => {
            // Most common cause: CSP block (browser refuses cross-origin PUT)
            // or R2 transient network glitch. Both are recoverable via the
            // multipart fallback path below.
            console.warn(`[Upload] R2 PUT error for ${file.name}, falling back to multipart`)
            setPendingUploads((prev) => prev.filter((u) => u.id !== id))
            r2Resolve({ outcome: 'fallback' })
          }
          putXhr.onabort = () => {
            setPendingUploads((prev) => prev.filter((u) => u.id !== id))
            r2Resolve({ outcome: 'aborted' })
          }
          putXhr.send(file)
        } catch (err) {
          console.warn('[Upload] sign network error, falling back to multipart:', err)
          r2Resolve({ outcome: 'fallback' })
        }
      })

      const r2Result = await tryR2Direct()
      if (r2Result.outcome === 'done') { resolve(r2Result.pending ?? null); return }
      if (r2Result.outcome === 'aborted') { resolve(null); return }
      // outcome === 'fallback' → drop through to multipart below

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${config.apiBase}/api/channels/${channelId}/attachments`)
      xhr.setRequestHeader('Authorization', `Bearer ${config.token}`)

      setPendingUploads((prev) => [...prev, {
        id, name: file.name, size: file.size, status: 'uploading',
        isImage, thumbDataUrl, progress: 0, xhr,
      }])
      console.log(`[Upload] start ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          setPendingUploads((prev) => prev.map((u) => u.id === id ? { ...u, progress: pct } : u))
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText) as { url: string; filename: string }
            const fullUrl = `${config.apiBase}${data.url}`
            console.log(`[Upload] done ${data.filename} → ${fullUrl}`)
            const done: PendingUpload = { id, name: data.filename, size: file.size, status: 'done', url: fullUrl, isImage, thumbDataUrl, progress: 100 }
            setPendingUploads((prev) => prev.map((u) => u.id === id ? done : u))
            resolve(done)
          } catch {
            setPendingUploads((prev) => prev.map((u) => u.id === id ? { ...u, status: 'error' } : u))
            resolve(null)
          }
        } else {
          console.error(`[Upload] HTTP ${xhr.status} for ${file.name}`)
          setPendingUploads((prev) => prev.map((u) => u.id === id ? { ...u, status: 'error' } : u))
          setUploadError(`Upload failed (${xhr.status}): ${file.name}`)
          setTimeout(() => setUploadError(null), 4000)
          resolve(null)
        }
      }

      xhr.onerror = () => {
        console.error(`[Upload] network error for ${file.name}`)
        setPendingUploads((prev) => prev.map((u) => u.id === id ? { ...u, status: 'error' } : u))
        setUploadError(`Upload failed: ${file.name}`)
        setTimeout(() => setUploadError(null), 4000)
        resolve(null)
      }
      xhr.onabort = () => {
        setPendingUploads((prev) => prev.filter((u) => u.id !== id))
        resolve(null)
      }

      const form = new FormData()
      form.append('file', file)
      xhr.send(form)
    })
  }

  async function uploadAll(files: FileList | File[]) {
    const arr = Array.from(files)
    // Fire uploads in parallel — server is fast enough that batching isn't needed.
    await Promise.all(arr.map((f) => uploadFileBlob(f)))
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return
    await uploadAll(e.target.files)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) {
      void uploadAll(e.dataTransfer.files)
    }
  }

  function removeUpload(id: string) {
    setPendingUploads((prev) => {
      // P3-#2 — abort an in-flight XHR if the user removes the chip mid-upload.
      const target = prev.find((u) => u.id === id)
      if (target?.xhr && target.status === 'uploading') {
        try { target.xhr.abort() } catch { /* already done */ }
      }
      return prev.filter((u) => u.id !== id)
    })
  }

  // ─── Recorder lifecycle ─────────────────────────────────────────────────────
  // Picks the most-likely-supported MIME type. Chromium/Electron typically
  // accepts audio/webm;codecs=opus and video/webm;codecs=vp9,opus.
  function pickRecorderMime(type: 'audio' | 'video'): string {
    // VP8+Opus first — produces WebM that Chromium's <video> element
    // reliably renders the first frame from a blob URL even when the
    // file lacks a duration header (common with MediaRecorder output).
    // VP9 sometimes ships a black box during preview until playback
    // starts because the decoder can't resolve duration in time.
    const candidates = type === 'audio'
      ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      : ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']
    for (const m of candidates) {
      try { if (MediaRecorder.isTypeSupported(m)) return m } catch { /* fall through */ }
    }
    return ''
  }

  // Open the recorder UI in setup phase — no capture starts until the user
  // explicitly clicks Record.
  function openRecorder(type: 'audio' | 'video') {
    if (recorderRef.current) return
    setRecorder({
      type, phase: 'setup', videoSource: 'camera',
      chunks: [], startedAt: 0, elapsedMs: 0,
    })
    if (type === 'video') void loadCameraDevices()
  }

  // Enumerate webcams. Most browsers won't return device labels until the
  // user has granted at least one media permission this session, so we
  // request a short-lived audio stream first to "unlock" labels.
  async function loadCameraDevices() {
    try {
      let primed = false
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
        probe.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
        primed = true
      } catch { /* labels may stay generic */ }
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cams: CameraDevice[] = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
      setRecorder((r) => {
        if (!r || r.phase !== 'setup') return r
        return { ...r, cameraDevices: cams, selectedCameraId: r.selectedCameraId ?? cams[0]?.deviceId }
      })
      if (!primed) console.debug('[recorder] camera labels may be empty until first capture grant')
    } catch (err) {
      console.error('[recorder] enumerateDevices failed:', err)
    }
  }

  function setSelectedCamera(deviceId: string) {
    setRecorder((r) => r && r.phase === 'setup' ? { ...r, selectedCameraId: deviceId } : r)
  }

  function setVideoSource(src: VideoSource) {
    setRecorder((r) => {
      if (!r || r.phase !== 'setup') return r
      const next: RecorderState = { ...r, videoSource: src }
      // Fetch the screen / window list lazily the first time the user
      // picks a screen-bearing source.
      if ((src === 'screen' || src === 'both') && !next.screenSources && !next.screenSourcesLoading) {
        next.screenSourcesLoading = true
        loadScreenSources()
      }
      // Camera-only mode doesn't need a screen pick.
      if (src === 'camera') next.selectedScreenId = undefined
      return next
    })
  }

  function setSelectedScreen(id: string) {
    setRecorder((r) => r && r.phase === 'setup' ? { ...r, selectedScreenId: id } : r)
  }

  async function loadScreenSources() {
    try {
      const sources = await window.electronAPI.getScreenSources()
      setRecorder((r) => {
        if (!r || r.phase !== 'setup') return r
        // Auto-pick the primary screen as a sensible default — user can
        // click another tile to switch.
        const primary = sources.find(s => /screen/i.test(s.name)) ?? sources[0]
        return { ...r, screenSources: sources, screenSourcesLoading: false, selectedScreenId: r.selectedScreenId ?? primary?.id }
      })
    } catch (err) {
      console.error('[recorder] getScreenSources failed:', err)
      setRecorder((r) => r ? { ...r, screenSourcesLoading: false, screenSources: [] } : r)
    }
  }

  async function getCaptureStream(state: RecorderState): Promise<{ stream: MediaStream; aux: MediaStream[] }> {
    if (state.type === 'audio') {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      return { stream: s, aux: [] }
    }
    if (state.videoSource === 'camera') {
      const videoConstraints: MediaTrackConstraints = state.selectedCameraId
        ? { deviceId: { exact: state.selectedCameraId }, width: 640, height: 480 }
        : { width: 640, height: 480 }
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: videoConstraints })
      return { stream: s, aux: [] }
    }
    const sourceId = state.selectedScreenId
    if (!sourceId) throw new Error('No screen source selected')
    if (state.videoSource === 'screen') {
      // Screen-only: try to grab system audio too; fall back to mic if the
      // platform won't return a desktop audio track.
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } as MediaTrackConstraints,
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } as MediaTrackConstraints,
      }).catch(async () => {
        const v = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } as MediaTrackConstraints,
        })
        // Layer the user's mic onto the screen video if we couldn't tap
        // system audio — at minimum the user should be heard.
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
          mic.getAudioTracks().forEach((t) => v.addTrack(t))
        } catch { /* mic optional */ }
        return v
      })
      return { stream: s, aux: [] }
    }
    // 'both' — composite cam onto screen via canvas, mix mic audio in.
    const screenStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } as MediaTrackConstraints,
    })
    const camVideoConstraints: MediaTrackConstraints = state.selectedCameraId
      ? { deviceId: { exact: state.selectedCameraId }, width: 320, height: 240 }
      : { width: 320, height: 240 }
    const camStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: camVideoConstraints })
    return { stream: composeCamOverScreen(screenStream, camStream), aux: [screenStream, camStream] }
  }

  // Build a composited MediaStream: screen video as the canvas backdrop,
  // camera as a small overlay in the bottom-left, mic audio passthrough.
  function composeCamOverScreen(screenStream: MediaStream, camStream: MediaStream): MediaStream {
    const screenVideo = document.createElement('video')
    screenVideo.muted = true
    screenVideo.srcObject = screenStream
    void screenVideo.play()
    const camVideo = document.createElement('video')
    camVideo.muted = true
    camVideo.srcObject = camStream
    void camVideo.play()

    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 720
    const ctx = canvas.getContext('2d')!
    compositorCanvasRef.current = canvas

    let stopped = false
    function draw() {
      if (stopped) return
      if (screenVideo.readyState >= 2) {
        const sw = screenVideo.videoWidth || canvas.width
        const sh = screenVideo.videoHeight || canvas.height
        // Letterbox screen to canvas while preserving aspect.
        const r = Math.min(canvas.width / sw, canvas.height / sh)
        const dw = sw * r, dh = sh * r
        const dx = (canvas.width - dw) / 2, dy = (canvas.height - dh) / 2
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(screenVideo, dx, dy, dw, dh)
      }
      if (camVideo.readyState >= 2) {
        const camW = 240, camH = 180
        const margin = 20
        const x = margin
        const y = canvas.height - camH - margin
        ctx.save()
        ctx.shadowColor = 'rgba(0,0,0,0.5)'
        ctx.shadowBlur = 12
        // Rounded rectangle clip for a polished PiP.
        const r = 12
        ctx.beginPath()
        ctx.moveTo(x + r, y)
        ctx.arcTo(x + camW, y, x + camW, y + camH, r)
        ctx.arcTo(x + camW, y + camH, x, y + camH, r)
        ctx.arcTo(x, y + camH, x, y, r)
        ctx.arcTo(x, y, x + camW, y, r)
        ctx.closePath()
        ctx.clip()
        ctx.drawImage(camVideo, x, y, camW, camH)
        ctx.restore()
        ctx.lineWidth = 2
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.beginPath()
        ctx.moveTo(x + r, y)
        ctx.arcTo(x + camW, y, x + camW, y + camH, r)
        ctx.arcTo(x + camW, y + camH, x, y + camH, r)
        ctx.arcTo(x, y + camH, x, y, r)
        ctx.arcTo(x, y, x + camW, y, r)
        ctx.closePath()
        ctx.stroke()
      }
      const id = requestAnimationFrame(draw)
      setRecorder((r) => r ? { ...r, rafId: id } : r)
    }
    draw()

    const out = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(30)
    camStream.getAudioTracks().forEach((t) => out.addTrack(t))
    // Tear-down hook: stop the RAF when the canvas track ends.
    out.getVideoTracks()[0]?.addEventListener('ended', () => { stopped = true })
    // We rely on cancelRecording / stopRecording below to also stop the
    // animation by setting `stopped = true` via the ref.
    ;(out as MediaStream & { __stopCompositor?: () => void }).__stopCompositor = () => { stopped = true }
    return out
  }

  async function startRecordingNow() {
    const cur = recorderRef.current
    if (!cur || cur.phase !== 'setup') return
    try {
      const { stream, aux } = await getCaptureStream(cur)
      const mime = pickRecorderMime(cur.type)
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      const chunks: Blob[] = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      mr.onstop = () => {
        const c = recorderRef.current
        if (!c) return
        const blob = new Blob(c.chunks, { type: mr.mimeType || (cur.type === 'audio' ? 'audio/webm' : 'video/webm') })
        const blobUrl = URL.createObjectURL(blob)
        setRecorder({ ...c, phase: 'preview', blob, blobUrl })
      }
      mr.start(250)
      setRecorder({
        ...cur, phase: 'recording', stream, auxStreams: aux,
        mr, chunks, startedAt: Date.now(), elapsedMs: 0,
      })
    } catch (err) {
      console.error('[recorder] capture failed:', err)
      setUploadError(`Capture failed — ${cur.type === 'audio' ? 'mic' : 'camera/screen'} access denied?`)
      setTimeout(() => setUploadError(null), 4000)
    }
  }

  function teardownStreams(state: RecorderState) {
    state.stream?.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
    state.auxStreams?.forEach((s) => s.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } }))
    const stopFn = (state.stream as (MediaStream & { __stopCompositor?: () => void }) | undefined)?.__stopCompositor
    if (stopFn) try { stopFn() } catch { /* ignore */ }
    if (state.rafId) try { cancelAnimationFrame(state.rafId) } catch { /* ignore */ }
  }

  function stopRecording() {
    const cur = recorderRef.current
    if (!cur || cur.phase !== 'recording' || !cur.mr) return
    try { cur.mr.stop() } catch { /* already stopped */ }
    teardownStreams(cur)
  }

  function cancelRecording() {
    const cur = recorderRef.current
    if (!cur) return
    try { if (cur.mr && cur.mr.state !== 'inactive') cur.mr.stop() } catch { /* ignore */ }
    teardownStreams(cur)
    if (cur.blobUrl) { try { URL.revokeObjectURL(cur.blobUrl) } catch { /* ignore */ } }
    setRecorder(null)
  }

  // From preview phase, toss the blob and go back to setup so the user can
  // tweak source / try again without leaving the recorder UI.
  function retakeRecording() {
    const cur = recorderRef.current
    if (!cur) return
    if (cur.blobUrl) { try { URL.revokeObjectURL(cur.blobUrl) } catch { /* ignore */ } }
    setRecorder({
      type: cur.type, phase: 'setup', videoSource: cur.videoSource,
      chunks: [], startedAt: 0, elapsedMs: 0,
    })
  }

  async function sendRecording() {
    const cur = recorderRef.current
    if (!cur || cur.phase !== 'preview' || !cur.blob) return
    const ts = Date.now()
    const ext = (cur.blob.type.includes('mp4') ? 'mp4' : 'webm')
    const name = cur.type === 'audio' ? `voice-note-${ts}.${ext}` : `video-note-${ts}.${ext}`
    const file = new File([cur.blob], name, { type: cur.blob.type })
    if (cur.blobUrl) { try { URL.revokeObjectURL(cur.blobUrl) } catch { /* ignore */ } }
    setRecorder(null)
    await uploadFileBlob(file)
  }

  // Tick the elapsed-time clock while recording (250ms cadence is plenty).
  useEffect(() => {
    if (!recorder || recorder.phase !== 'recording') return
    const id = setInterval(() => {
      setRecorder((r) => r && r.phase === 'recording'
        ? { ...r, elapsedMs: Date.now() - r.startedAt }
        : r)
    }, 250)
    return () => clearInterval(id)
  }, [recorder?.phase])

  // Wire the live camera stream to the preview <video> tag once both exist.
  useEffect(() => {
    if (recorder?.phase === 'recording' && recorder.type === 'video' && liveVideoRef.current && recorder.stream) {
      liveVideoRef.current.srcObject = recorder.stream
      liveVideoRef.current.play().catch(() => { /* autoplay blocked — user can click */ })
    }
  }, [recorder?.phase, recorder?.type, recorder?.stream])

  // Tear down media tracks if the component unmounts mid-recording.
  useEffect(() => () => {
    const cur = recorderRef.current
    if (!cur) return
    try { if (cur.mr && cur.mr.state !== 'inactive') cur.mr.stop() } catch { /* ignore */ }
    teardownStreams(cur)
    if (cur.blobUrl) { try { URL.revokeObjectURL(cur.blobUrl) } catch { /* ignore */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function uploadMarkdown(u: PendingUpload): string {
    return u.isImage ? `![${u.name}](${u.url})` : `[📎 ${u.name}](${u.url})`
  }

  async function postContent(content: string) {
    if (!channelId) return
    try {
      await fetch(`${config.apiBase}/api/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
    } catch (err) { console.error('[messages] post failed:', err) }
  }

  // P3-#4 — Send is non-blocking. We send immediately with the user's text +
  // already-completed uploads. Any in-progress uploads keep running and post
  // as separate follow-up messages when each finishes. This is much closer to
  // how Slack / Discord behave.
  async function composedSend() {
    const completed = pendingUploads.filter((u) => u.status === 'done' && u.url)
    const inProgress = pendingUploads.filter((u) => u.status === 'uploading')
    const userText = input.trim()
    if (completed.length === 0 && inProgress.length === 0) {
      sendFn()
      return
    }

    // Snapshot the in-progress xhrs so we can wait on them later.
    const pendingXhrs = inProgress.slice()

    // Send what's ready right now.
    const initialMd = completed.map(uploadMarkdown).join('\n')
    const combined = userText ? (initialMd ? `${initialMd}\n${userText}` : userText) : initialMd

    // Clear UI immediately so the user can keep typing.
    setPendingUploads(inProgress) // keep in-progress chips visible
    setInput('')
    if (editorRef.current) { editorRef.current.innerHTML = ''; setHasContent(false) }

    if (combined) await postContent(combined)

    // For each in-progress upload, post as its own message when it lands.
    for (const u of pendingXhrs) {
      const xhr = u.xhr
      if (!xhr) continue
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText) as { url: string; filename: string }
            const fullUrl = `${config.apiBase}${data.url}`
            const isImage = isImageFilename(data.filename)
            const md = isImage ? `![${data.filename}](${fullUrl})` : `[📎 ${data.filename}](${fullUrl})`
            void postContent(md)
            // Drop the now-posted upload from the chip list.
            setPendingUploads((prev) => prev.filter((p) => p.id !== u.id))
          } catch { /* already handled in onload */ }
        }
      }, { once: true })
    }
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

  // Format ms → "0:12" / "1:05".
  function fmtElapsed(ms: number): string {
    const total = Math.floor(ms / 1000)
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div style={{ padding: '8px 16px 12px', flexShrink: 0, position: 'relative' }}>
      {/* #9 — Audio / video clip recorder. Setup → record → preview flow.
          Capture only starts when the user clicks the explicit Record
          button so we never light up the mic / camera by surprise. */}
      {recorder && (
        <div style={{
          padding: 12, marginBottom: 8, borderRadius: 10,
          background: C.bgInput,
          border: `1px solid ${recorder.phase === 'recording' ? '#ef4444' : C.separator}`,
        }}>
          {recorder.phase === 'setup' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {recorder.type === 'audio'
                  ? <Mic size={16} color={C.accent} />
                  : <Video size={16} color={C.accent} />}
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                  {recorder.type === 'audio' ? 'New voice note' : 'New video note'}
                </span>
                <button onClick={cancelRecording} title="Close"
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, display: 'flex' }}>
                  <X size={14} />
                </button>
              </div>
              {recorder.type === 'video' && (
                <>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([
                      { id: 'camera', label: 'Camera only' },
                      { id: 'screen', label: 'Screen only' },
                      { id: 'both', label: 'Screen + camera' },
                    ] as const).map((opt) => {
                      const active = recorder.videoSource === opt.id
                      return (
                        <button key={opt.id} onClick={() => setVideoSource(opt.id)}
                          style={{
                            flex: 1, padding: '8px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                            border: `1px solid ${active ? C.accent : C.separator}`,
                            background: active ? `${C.accent}22` : 'transparent',
                            color: active ? C.accent : C.text,
                            fontWeight: active ? 600 : 500,
                          }}>
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                  {/* Camera selector — relevant when the chosen mode
                      involves the webcam. Single-cam users just see one
                      label; multi-cam users get a dropdown. */}
                  {(recorder.videoSource === 'camera' || recorder.videoSource === 'both') && (recorder.cameraDevices?.length ?? 0) > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: C.textMuted, whiteSpace: 'nowrap' }}>Camera:</span>
                      <select
                        value={recorder.selectedCameraId ?? ''}
                        onChange={(e) => setSelectedCamera(e.target.value)}
                        style={{
                          flex: 1, padding: '6px 8px', borderRadius: 6,
                          border: `1px solid ${C.separator}`, background: C.bgSecondary,
                          color: C.text, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                        }}>
                        {recorder.cameraDevices!.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {(recorder.videoSource === 'screen' || recorder.videoSource === 'both') && (
                    <div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>
                        Choose a screen or window to capture:
                      </div>
                      {recorder.screenSourcesLoading ? (
                        <div style={{ fontSize: 12, color: C.textMuted, padding: 12 }}>Loading sources…</div>
                      ) : !recorder.screenSources || recorder.screenSources.length === 0 ? (
                        <div style={{ fontSize: 12, color: C.textMuted, padding: 12 }}>No sources available.</div>
                      ) : (
                        <div style={{
                          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                          gap: 8, maxHeight: 240, overflowY: 'auto', paddingRight: 4,
                        }}>
                          {recorder.screenSources.map((s) => {
                            const active = recorder.selectedScreenId === s.id
                            return (
                              <button key={s.id} onClick={() => setSelectedScreen(s.id)}
                                style={{
                                  padding: 6, borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                                  border: `2px solid ${active ? C.accent : C.separator}`,
                                  background: active ? `${C.accent}10` : 'transparent',
                                  display: 'flex', flexDirection: 'column', gap: 4,
                                }}>
                                <img src={s.thumbnail} alt={s.name}
                                  style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 4, background: '#000' }} />
                                <span style={{ fontSize: 11, color: active ? C.accent : C.text, fontWeight: active ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {s.name}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {(() => {
                const needsScreen = recorder.type === 'video' && (recorder.videoSource === 'screen' || recorder.videoSource === 'both')
                const ready = !needsScreen || !!recorder.selectedScreenId
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: C.textMuted, flex: 1 }}>
                      {recorder.type === 'audio'
                        ? 'Press Record to start capturing audio.'
                        : recorder.videoSource === 'camera' ? 'Press Record to start your webcam.'
                        : recorder.videoSource === 'screen' ? (ready ? 'Press Record to capture the selected screen / window.' : 'Pick a screen or window above first.')
                        : (ready ? 'Press Record to capture the selected source with webcam in the bottom-left.' : 'Pick a screen or window above first.')}
                    </span>
                    <button onClick={cancelRecording}
                      style={{ background: 'none', border: `1px solid ${C.separator}`, color: C.textMuted, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                      Cancel
                    </button>
                    <button onClick={() => void startRecordingNow()} title="Start recording" disabled={!ready}
                      style={{
                        background: ready ? '#ef4444' : '#7d3a3a', border: 'none', color: '#fff',
                        padding: '6px 14px', borderRadius: 6, cursor: ready ? 'pointer' : 'not-allowed',
                        fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
                        opacity: ready ? 1 : 0.7,
                      }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
                      Record
                    </button>
                  </div>
                )
              })()}
            </div>
          ) : recorder.phase === 'recording' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {recorder.type === 'video' ? (
                <video ref={liveVideoRef} muted playsInline
                  style={{ width: 128, height: 96, objectFit: 'cover', borderRadius: 6, background: '#000', flexShrink: 0 }} />
              ) : (
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', background: '#ef4444',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  animation: 'bundy-pulse 1.2s ease-in-out infinite',
                }}>
                  <Mic size={20} color="#fff" />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'bundy-pulse 1.2s ease-in-out infinite' }} />
                  Recording {recorder.type === 'audio' ? 'voice note' : `video (${recorder.videoSource})`}…
                </div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtElapsed(recorder.elapsedMs)}
                </div>
              </div>
              <button onClick={cancelRecording} title="Discard"
                style={{ background: 'none', border: `1px solid ${C.separator}`, color: C.textMuted, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                Cancel
              </button>
              <button onClick={stopRecording} title="Stop & preview"
                style={{ background: C.accent, border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                Stop
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {recorder.type === 'video' && recorder.blobUrl ? (
                <video
                  key={recorder.blobUrl}
                  src={recorder.blobUrl}
                  controls playsInline preload="auto"
                  // MediaRecorder webm sometimes ships without a duration
                  // header, leaving the element on a black frame until
                  // play() runs. Nudging currentTime past 0 forces the
                  // decoder to emit the first frame.
                  onLoadedMetadata={(e) => { try { (e.currentTarget as HTMLVideoElement).currentTime = 0.05 } catch { /* ignore */ } }}
                  style={{ width: 240, maxHeight: 180, borderRadius: 6, background: '#000', flexShrink: 0 }}
                />
              ) : recorder.blobUrl ? (
                <audio src={recorder.blobUrl} controls
                  style={{ width: 280, flexShrink: 0 }} />
              ) : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                  {recorder.type === 'audio' ? '🎤 Voice note' : '📹 Video note'} ready
                </div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                  {fmtElapsed(recorder.elapsedMs)} · review then send
                </div>
              </div>
              <button onClick={cancelRecording} title="Discard"
                style={{ background: 'none', border: `1px solid ${C.separator}`, color: C.textMuted, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                Discard
              </button>
              <button onClick={retakeRecording} title="Re-record"
                style={{ background: 'none', border: `1px solid ${C.separator}`, color: C.text, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                Re-record
              </button>
              <button onClick={() => void sendRecording()} title="Send"
                style={{ background: C.accent, border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Send size={14} /> Send
              </button>
            </div>
          )}
        </div>
      )}

      {/* P3-#1/#2/#3 — Pending uploads, displayed ABOVE the editor with
          per-file status (uploading spinner / done check / error). */}
      {pendingUploads.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {pendingUploads.map((u) => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: 6, paddingRight: 10, borderRadius: 8,
              background: C.bgInput, border: `1px solid ${u.status === 'error' ? '#ef4444' : C.separator}`,
              maxWidth: 260, fontSize: 11,
            }}>
              {u.thumbDataUrl ? (
                <img src={u.thumbDataUrl} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: 4, background: C.bgHover, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                  {/\.(mp4|webm|ogg|mov|m4v)$/i.test(u.name) ? '🎬'
                    : /\.(mp3|wav|ogg|m4a|aac)$/i.test(u.name) ? '🎵'
                    : '📎'}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                <div style={{ color: u.status === 'error' ? '#ef4444' : C.textMuted, fontSize: 10, marginTop: 2 }}>
                  {u.status === 'uploading' && (
                    <>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, border: `1.5px solid ${C.accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'bundy-spin 0.7s linear infinite' }} />
                        {u.progress != null ? `${u.progress}%` : 'Uploading…'}
                      </span>
                      {/* Real progress bar — gives the user something to look at on slow networks. */}
                      <div style={{ marginTop: 4, height: 3, background: C.bgHover, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${u.progress ?? 0}%`, height: '100%', background: C.accent, transition: 'width 0.2s' }} />
                      </div>
                    </>
                  )}
                  {u.status === 'done' && '✓ Ready'}
                  {u.status === 'error' && '✗ Failed — click X to remove'}
                </div>
              </div>
              <button onClick={() => removeUpload(u.id)}
                title="Remove"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2, display: 'flex' }}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Keyframes used by upload spinner + recorder pulse. Rendered
          unconditionally so they're available whether or not the recorder
          / uploads UI happens to be mounted. */}
      <style>{`
        @keyframes bundy-spin { to { transform: rotate(360deg); } }
        @keyframes bundy-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.45 } }
      `}</style>

      {/* P3-#5 — Custom URL modal (replaces window.prompt which Electron forbids). */}
      {linkModal && (
        <div onClick={() => setLinkModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: C.bgPrimary, borderRadius: 10, padding: 18, width: 380, border: `1px solid ${C.separator}`, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 10 }}>Insert link</div>
            <input
              autoFocus
              value={linkModal.url}
              onChange={(e) => setLinkModal({ ...linkModal, url: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); applyLinkFromModal() }
                else if (e.key === 'Escape') { e.preventDefault(); setLinkModal(null) }
              }}
              placeholder="https://example.com"
              style={{
                width: '100%', padding: '8px 10px', fontSize: 13,
                background: C.bgInput, color: C.text, border: `1px solid ${C.separator}`,
                borderRadius: 6, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setLinkModal(null)}
                style={{ padding: '6px 12px', fontSize: 12, background: 'transparent', color: C.textMuted, border: `1px solid ${C.separator}`, borderRadius: 6, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={applyLinkFromModal}
                style={{ padding: '6px 12px', fontSize: 12, background: C.accent, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

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
          {mentionResults.map((u, i) => {
            const isBroadcast = u.id === 'all' || u.id === 'here'
            return (
              <button key={u.id} onClick={() => insertMention(u)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  background: i === mentionIndex ? C.bgHover : 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={() => setMentionIndex(i)}>
                {isBroadcast ? (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${C.accent}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AtSign size={14} color={C.accent} />
                  </div>
                ) : (
                  <Avatar url={u.avatarUrl} name={u.alias ?? u.username} size={28} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>@{u.username}</span>
                  {isBroadcast && (
                    <span style={{ fontSize: 11, color: C.textMuted }}>{u.id === 'all' ? 'Notify everyone in this channel' : 'Notify online members'}</span>
                  )}
                </div>
              </button>
            )
          })}
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
            <button onClick={() => { setShowScheduleMenu(false); setShowCustomTime(true); setCustomDate(defaultCustomDate()); setCustomTime(defaultCustomTime()) }}
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
            ...(!hideGifs ? [{ icon: <Image size={16} />, label: 'GIF', action: () => { setShowMoreMenu(false); setShowGifPicker(true); setGifQuery('') } }] : []),
            { icon: <Video size={16} />, label: 'Video clip', action: () => { setShowMoreMenu(false); openRecorder('video') } },
            { icon: <Mic size={16} />, label: 'Audio clip', action: () => { setShowMoreMenu(false); openRecorder('audio') } },
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

      <input ref={fileRef} type="file" hidden multiple onChange={handleFile}
        accept="image/*,video/*,audio/*,application/pdf,application/zip,text/*" />

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

        {uploadError && (
          <div style={{ padding: '6px 12px', fontSize: 12, color: '#ff4444', background: 'rgba(255,68,68,0.08)', borderBottom: `1px solid rgba(255,68,68,0.15)` }}>
            {uploadError}
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
              onClick={() => void composedSend()}
              disabled={(!input.trim() && pendingUploads.filter(u => u.status === 'done').length === 0) || sending || uploading}
              title="Send message"
              style={{
                width: 32, height: 32, borderRadius: hideSchedule ? 6 : '6px 0 0 6px', border: 'none',
                background: (input.trim() || pendingUploads.some(u => u.status === 'done')) ? C.accent : 'transparent',
                color: (input.trim() || pendingUploads.some(u => u.status === 'done')) ? '#fff' : C.textMuted,
                cursor: (input.trim() || pendingUploads.some(u => u.status === 'done')) ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s, color 0.15s',
              }}>
              {sending ? <Loader size={16} /> : <Send size={16} />}
            </button>
            {!hideSchedule && (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
