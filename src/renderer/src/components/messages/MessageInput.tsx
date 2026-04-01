import React, { useState, useEffect, useRef } from 'react'
import { Plus, Bold, Smile, AtSign, Video, Mic, Italic, List, Send, Loader } from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig, UserInfo } from '../../types'
import { Avatar } from '../shared/Avatar'

export function MessageInput({
  placeholder, config, channelId, onTyping, input, setInput, sendFn, sending,
}: {
  placeholder: string; config: ApiConfig; channelId: string
  onTyping: () => void; input: string; setInput: (v: string) => void
  sendFn: () => void; sending: boolean
  onSend?: (content: string) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [, setMentionSearch] = useState<string | null>(null)
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [mentionResults, setMentionResults] = useState<UserInfo[]>([])
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    fetch(`${config.apiBase}/api/users`, { headers: { Authorization: `Bearer ${config.token}` } })
      .then(r => r.json())
      .then((d: { users: UserInfo[] }) => setAllUsers(d.users))
      .catch(() => {})
  }, [config])

  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setInput(val)
    autoResize()
    onTyping()
    const cursor = e.target.selectionStart
    const textBefore = val.slice(0, cursor)
    const match = textBefore.match(/@(\w*)$/)
    if (match) {
      const q = match[1].toLowerCase()
      setMentionSearch(q)
      setMentionResults(allUsers.filter(u =>
        (u.alias?.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
      ).slice(0, 6))
    } else {
      setMentionSearch(null)
      setMentionResults([])
    }
  }

  function insertMention(user: UserInfo) {
    const el = textareaRef.current
    if (!el) return
    const cursor = el.selectionStart
    const textBefore = input.slice(0, cursor)
    const atIdx = textBefore.lastIndexOf('@')
    const name = user.username
    const newVal = input.slice(0, atIdx) + `@${name} ` + input.slice(cursor)
    setInput(newVal)
    setMentionSearch(null)
    setMentionResults([])
    setTimeout(() => { el.focus(); el.setSelectionRange(atIdx + name.length + 2, atIdx + name.length + 2) }, 0)
  }

  function wrapSelection(before: string, after: string) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = input.slice(start, end)
    const newVal = input.slice(0, start) + before + selected + after + input.slice(end)
    setInput(newVal)
    setTimeout(() => { el.focus(); el.setSelectionRange(start + before.length, end + before.length) }, 0)
  }

  function insertPrefix(prefix: string) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const lineStart = input.lastIndexOf('\n', start - 1) + 1
    const newVal = input.slice(0, lineStart) + prefix + input.slice(lineStart)
    setInput(newVal)
    setTimeout(() => el.focus(), 0)
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionResults.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
      e.preventDefault(); return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendFn()
    }
  }

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

        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          style={{
            width: '100%', resize: 'none', padding: '12px 14px 8px',
            fontSize: 14, color: C.text, border: 'none', outline: 'none',
            lineHeight: 1.5, minHeight: 40, maxHeight: 120, overflow: 'auto',
            fontFamily: 'inherit', background: 'transparent', display: 'block',
          }}
        />

        <div style={{ height: 1, background: C.separator, margin: '0 10px' }} />

        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 2 }}>
          {[
            { icon: <Plus size={18} />, action: () => fileRef.current?.click(), title: 'Attach file' },
            { icon: <Bold size={16} />, action: () => wrapSelection('**', '**'), title: 'Bold' },
            { icon: <Smile size={16} />, action: () => {}, title: 'Emoji' },
            { icon: <AtSign size={16} />, action: () => { setInput(input + '@'); setTimeout(() => textareaRef.current?.focus(), 0) }, title: 'Mention' },
          ].map((btn, i) => (
            <button key={i} onClick={btn.action} title={btn.title}
              style={{ width: 32, height: 32, borderRadius: 6, border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.1s, color 0.1s' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
              {btn.icon}
            </button>
          ))}

          <div style={{ width: 1, height: 20, background: C.separator, margin: '0 4px' }} />

          {[
            { icon: <Video size={16} />, action: () => {}, title: 'Video' },
            { icon: <Mic size={16} />, action: () => {}, title: 'Voice' },
          ].map((btn, i) => (
            <button key={`extra-${i}`} onClick={btn.action} title={btn.title}
              style={{ width: 32, height: 32, borderRadius: 6, border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.1s, color 0.1s' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
              {btn.icon}
            </button>
          ))}

          <div style={{ width: 1, height: 20, background: C.separator, margin: '0 4px' }} />

          {[
            { icon: <Italic size={16} />, action: () => wrapSelection('*', '*'), title: 'Italic' },
            { icon: <List size={16} />, action: () => insertPrefix('• '), title: 'Bullet list' },
          ].map((btn, i) => (
            <button key={`fmt-${i}`} onClick={btn.action} title={btn.title}
              style={{ width: 32, height: 32, borderRadius: 6, border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.1s, color 0.1s' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted }}>
              {btn.icon}
            </button>
          ))}

          <div style={{ flex: 1 }} />

          <button
            onClick={sendFn}
            disabled={!input.trim() || sending || uploading}
            title="Send message"
            style={{
              width: 32, height: 32, borderRadius: 6, border: 'none',
              background: input.trim() ? C.accent : 'transparent',
              color: input.trim() ? '#fff' : C.textMuted,
              cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {sending ? <Loader size={16} /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}
