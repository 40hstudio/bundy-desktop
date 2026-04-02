import React from 'react'
import { CheckSquare, ExternalLink } from 'lucide-react'
import { C } from '../theme'
import { sanitizeHtml } from './sanitize'

// ─── URL type helpers ─────────────────────────────────────────────────────────

export function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?.*)?$/i.test(url.split('?')[0])
}
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url.split('?')[0])
}

// ─── HTML-string markdown utilities ──────────────────────────────────────────

export function linkifyText(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(https?:\/\/[^\s<&]+(?:&amp;[^\s<&]+)*)/g, (m) => {
      const href = m.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      return `<a href="${href}" target="_blank" rel="noreferrer" style="color:${C.accent};text-decoration:underline;word-break:break-all">${m}</a>`
    })
    .replace(/\n/g, '<br>')
}

export function simpleMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:0.88em;font-weight:700;margin:6px 0 2px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:1em;font-weight:700;margin:8px 0 3px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:1.1em;font-weight:700;margin:10px 0 4px">$1</h1>')
    .replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:2px solid #888;padding-left:7px;margin:3px 0;opacity:0.65">$1</blockquote>')
    .replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid rgba(128,128,128,0.3);margin:8px 0">')
    .replace(/^[*-] (.+)$/gm, '<li style="margin-left:16px;list-style:disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-left:16px;list-style:decimal">$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(128,128,128,0.15);padding:1px 4px;border-radius:3px;font-family:monospace;font-size:0.85em">$1</code>')
    .replace(/(https?:\/\/[^\s<&]+(?:&amp;[^\s<&]+)*)/g, (m) => {
      const href = m.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      return `<a href="${href}" target="_blank" rel="noreferrer" style="color:${C.accent};text-decoration:underline;word-break:break-all">${m}</a>`
    })
    .replace(/\n/g, '<br>')
}

// ─── JSX React.ReactNode renderers ───────────────────────────────────────────

const TASK_LINK_RE = /\/tasks\/([a-z0-9]+)$/i

export function parseContent(text: string, isMe = false): React.ReactNode {
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>\]"']+)|(@[\w.]+)/g
  const result: React.ReactNode[] = []
  let cursor = 0
  let m: RegExpExecArray | null
  let keyIdx = 0

  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > cursor) {
      result.push(formatInline(text.slice(cursor, m.index), keyIdx++))
    }

    // @mention badge
    if (m[4]) {
      result.push(
        <span
          key={keyIdx++}
          style={{
            display: 'inline-block',
            background: isMe ? 'rgba(255,255,255,0.2)' : `${C.accent}22`,
            color: isMe ? '#fff' : C.accent,
            borderRadius: 4,
            padding: '0px 5px',
            fontWeight: 700,
            fontSize: '0.92em',
            letterSpacing: 0.1,
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
        >
          {m[4]}
        </span>
      )
      cursor = m.index + m[0].length
      continue
    }

    const label = m[1] ?? m[3]
    const url = m[2] ?? m[3]
    const linkColor = isMe ? 'rgba(255,255,255,0.9)' : C.accent
    const taskMatch = TASK_LINK_RE.exec(url)
    if (taskMatch) {
      const taskId = taskMatch[1]
      result.push(
        <a
          key={keyIdx++}
          href={url}
          onClick={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('bundy-open-task', { detail: { taskId } })) }}
          style={{ color: linkColor, textDecoration: 'underline', cursor: 'pointer', wordBreak: 'break-all', WebkitUserSelect: 'text', userSelect: 'text' }}
        >
          <CheckSquare size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
          {label.replace(/^https?:\/\/[^/]+/, '').startsWith('/tasks/') ? 'Open Task' : label}
        </a>
      )
    } else if (isImageUrl(url)) {
      result.push(
        <img key={keyIdx++} src={url} alt={label ?? ''} onClick={() => window.electronAPI.openExternal(url)}
          style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, display: 'block', marginTop: 4, cursor: 'pointer' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      )
    } else {
      result.push(
        <a
          key={keyIdx++}
          href={url}
          onClick={e => { e.preventDefault(); window.electronAPI.openExternal(url) }}
          style={{ color: linkColor, textDecoration: 'underline', cursor: 'pointer', wordBreak: 'break-all', WebkitUserSelect: 'text', userSelect: 'text' }}
        >
          {label}
          {' '}<ExternalLink size={10} style={{ display: 'inline', verticalAlign: 'middle' }} />
        </a>
      )
    }
    cursor = m.index + m[0].length
  }
  if (cursor < text.length) result.push(formatInline(text.slice(cursor), keyIdx++))
  return result.length === 1 ? result[0] : <>{result}</>
}

export function formatInline(text: string, key?: number): React.ReactNode {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(128,128,128,0.15);padding:1px 4px;border-radius:3px;font-family:monospace;font-size:0.85em">$1</code>')
  return <span key={key} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} style={{ userSelect: 'text', WebkitUserSelect: 'text', wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} />
}

export function renderMessageContent(text: string, isMe = false): React.ReactNode {
  const nodes: React.ReactNode[] = []
  let key = 0

  // Split out ``` code blocks first
  const segments: Array<{ type: 'text' | 'code'; content: string }> = []
  const codeRe = /```[^\n]*\n?([\s\S]*?)```/g
  let last = 0; let cm: RegExpExecArray | null
  while ((cm = codeRe.exec(text)) !== null) {
    if (cm.index > last) segments.push({ type: 'text', content: text.slice(last, cm.index) })
    segments.push({ type: 'code', content: cm[1] })
    last = cm.index + cm[0].length
  }
  if (last < text.length) segments.push({ type: 'text', content: text.slice(last) })

  for (const seg of segments) {
    if (seg.type === 'code') {
      nodes.push(
        <pre key={key++} style={{ background: 'rgba(128,128,128,0.1)', borderRadius: 5, padding: '8px 10px', fontFamily: 'monospace', fontSize: '0.85em', overflowX: 'auto', margin: '4px 0', whiteSpace: 'pre', color: 'inherit' }}>
          <code>{seg.content.replace(/\n$/, '')}</code>
        </pre>
      )
      continue
    }

    const lines = seg.content.split('\n')
    let i = 0
    while (i < lines.length) {
      const line = lines[i]

      // Blockquote — group consecutive
      if (/^> /.test(line)) {
        const qLines: string[] = []
        while (i < lines.length && /^> /.test(lines[i])) { qLines.push(lines[i].replace(/^> /, '')); i++ }
        nodes.push(
          <blockquote key={key++} style={{ borderLeft: `3px solid ${isMe ? 'rgba(255,255,255,0.5)' : C.accent}`, paddingLeft: 10, margin: '2px 0', opacity: 0.8 }}>
            {qLines.map((ql, qi) => <div key={qi} style={{ lineHeight: 1.5 }}>{parseContent(ql, isMe)}</div>)}
          </blockquote>
        )
        continue
      }

      // Bullet list — group consecutive
      if (/^[-*] /.test(line)) {
        const items: string[] = []
        while (i < lines.length && /^[-*] /.test(lines[i])) { items.push(lines[i].replace(/^[-*] /, '')); i++ }
        nodes.push(
          <ul key={key++} style={{ marginLeft: 18, marginTop: 2, marginBottom: 2, paddingLeft: 4 }}>
            {items.map((it, ii) => <li key={ii} style={{ marginBottom: 1, lineHeight: 1.5 }}>{parseContent(it, isMe)}</li>)}
          </ul>
        )
        continue
      }

      // Ordered list — group consecutive
      if (/^\d+\. /.test(line)) {
        const items: string[] = []
        while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, '')); i++ }
        nodes.push(
          <ol key={key++} style={{ marginLeft: 18, marginTop: 2, marginBottom: 2, paddingLeft: 4 }}>
            {items.map((it, ii) => <li key={ii} style={{ marginBottom: 1, lineHeight: 1.5 }}>{parseContent(it, isMe)}</li>)}
          </ol>
        )
        continue
      }

      // Empty line → small spacer
      if (line === '') {
        nodes.push(<div key={key++} style={{ height: '0.4em' }} />)
      } else {
        nodes.push(
          <div key={key++} style={{ lineHeight: 1.5, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
            {parseContent(line, isMe)}
          </div>
        )
      }
      i++
    }
  }

  return (
    <div style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}>
      {nodes}
    </div>
  )
}

export function extractUrls(text: string): string[] {
  const urls: string[] = []
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>\]"']+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) urls.push(m[2] ?? m[3])
  return urls
}
