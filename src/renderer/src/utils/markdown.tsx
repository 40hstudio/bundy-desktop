import React from 'react'
import { ExternalLink, FolderOpen } from 'lucide-react'
import { C } from '../theme'
import { sanitizeHtml } from './sanitize'

// ─── URL type helpers ─────────────────────────────────────────────────────────

export function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?.*)?$/i.test(url.split('?')[0])
}
// Voice notes ride on `.webm` (Opus audio in a WebM container) — we steer
// them away from the video renderer by checking the filename prefix the
// recorder stamps on every clip.
export function isVoiceNoteName(filename: string): boolean {
  return /^voice-note-/i.test(filename)
}
export function isVideoNoteName(filename: string): boolean {
  return /^video-note-/i.test(filename)
}
export function isVideoUrl(url: string, filename?: string): boolean {
  if (filename && isVoiceNoteName(filename)) return false
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url.split('?')[0])
}
export function isAudioUrl(url: string, filename?: string): boolean {
  if (filename && isVoiceNoteName(filename)) return true
  return /\.(mp3|wav|ogg|m4a|aac|opus)(\?.*)?$/i.test(url.split('?')[0])
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

// Accept trailing query string (e.g. ?comment=xxx) and optional fragment so
// shareable comment-deep-links open in-app instead of browser.
const TASK_LINK_RE = /\/tasks\/([a-z0-9]+)(?:\?[^#\s]*)?(?:#[^\s]*)?$/i
const REPORT_LINK_RE = /\/report\/([a-z0-9]+)\/([a-z0-9]+)(?:\/(folder|document|file)\/([a-z0-9]+))?$/i
const FEEDBACK_LINK_RE = /\/report\/feedback\/([a-z0-9]+)(?:\?pin=([a-z0-9]+))?/i
// Deep link to a specific message: /messages/{channelId}/{messageId}.
const MESSAGE_LINK_RE = /\/messages\/([a-z0-9]+)\/([a-z0-9]+)(?:\?[^#\s]*)?(?:#[^\s]*)?$/i
// Deep link to a calendar event: /calendar/event/{seriesId} (recurring
// occurrences all share the parent series id, so a single link works for
// any instance in the series).
const CALENDAR_EVENT_LINK_RE = /\/calendar\/event\/([a-z0-9]+)(?:\?[^#\s]*)?(?:#[^\s]*)?$/i

export { TASK_LINK_RE, REPORT_LINK_RE, FEEDBACK_LINK_RE, MESSAGE_LINK_RE, CALENDAR_EVENT_LINK_RE }

export function parseContent(text: string, isMe = false, usersMap?: Record<string, string>): React.ReactNode {
  // Also match relative `/tasks/<id>` markdown links — those are how
  // subtask references are stored in comment bodies (e.g.
  // `[Subtask: foo](/tasks/abc123)`). Without this they'd render as
  // plain text instead of a clickable card.
  const linkRe = /!?\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/tasks\/[a-z0-9]+(?:\?[^\s)]*)?(?:#[^\s)]*)?)\)|(https?:\/\/[^\s<>\]"']+)/g
  const result: React.ReactNode[] = []
  let cursor = 0
  let m: RegExpExecArray | null
  let keyIdx = 0

  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > cursor) {
      result.push(formatInline(text.slice(cursor, m.index), keyIdx++))
    }
    const isImgMd = m[0].startsWith('!')
    const label = m[1] ?? m[3]
    const url = m[2] ?? m[3]
    const linkColor = isMe ? 'rgba(255,255,255,0.9)' : C.accent
    const relativeTaskMatch = /^\/tasks\/([a-z0-9]+)/i.exec(url)
    const taskMatch = TASK_LINK_RE.exec(url)
    const feedbackMatch = FEEDBACK_LINK_RE.exec(url)
    const reportMatch = !feedbackMatch ? REPORT_LINK_RE.exec(url) : null
    const messageMatch = MESSAGE_LINK_RE.exec(url)
    const calendarEventMatch = CALENDAR_EVENT_LINK_RE.exec(url)
    if (relativeTaskMatch) {
      // Render as a clickable subtask card — same UX the task drawer
      // already uses for its own discussion. Click opens the drawer.
      const subtaskId = relativeTaskMatch[1]
      result.push(
        <button
          key={keyIdx++}
          onClick={() => window.dispatchEvent(new CustomEvent('bundy-open-task', { detail: { taskId: subtaskId } }))}
          style={{
            borderLeft: `3px solid ${C.accent}`, padding: '4px 8px',
            margin: '4px 0', background: `${C.accent}10`,
            borderRadius: '0 4px 4px 0', cursor: 'pointer',
            fontSize: 12, color: C.accent, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            border: 'none', borderLeftWidth: 3, fontFamily: 'inherit',
          }}>
          {label}
        </button>
      )
    } else if (taskMatch) {
      // Skip inline rendering — TaskLinkCard handles display below the message
    } else if (feedbackMatch) {
      // Skip inline rendering — FeedbackLinkCard handles display below the message
    } else if (reportMatch) {
      // Skip inline rendering — ReportLinkCard handles display below the message
    } else if (messageMatch) {
      // Skip inline rendering — MessageLinkCard handles display below.
    } else if (calendarEventMatch) {
      // Skip inline rendering — CalendarEventLinkCard handles display below.
    } else if (isImgMd || isImageUrl(url)) {
      // P3-#10 — route image clicks through the lightbox via a CustomEvent.
      // MessagesPanel listens for `bundy-open-lightbox` and opens the overlay.
      // Falls back to openExternal if no listener is mounted (eg. task drawer).
      result.push(
        <img key={keyIdx++} src={url} alt={label ?? ''}
          onClick={() => {
            const ev = new CustomEvent('bundy-open-lightbox', { detail: { url, filename: label || url.split('/').pop() || 'image' }, cancelable: true })
            const dispatched = window.dispatchEvent(ev)
            if (dispatched && !ev.defaultPrevented) {
              // No-op — listener will preventDefault when handled. If no
              // listener fired, dispatched stays true and we fall through
              // to openExternal as a sensible default.
              // (We can't tell directly whether anyone heard us, so we
              // unconditionally dispatch + skip the fallback when the URL
              // is hosted on our origin since the lightbox always handles
              // those.)
              if (!url.includes('/api/uploads/')) window.electronAPI.openExternal(url)
            }
          }}
          style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, display: 'block', marginTop: 4, cursor: 'zoom-in' }}
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
  if (cursor < text.length) result.push(formatInline(text.slice(cursor), keyIdx++, usersMap))
  return result.length === 1 ? result[0] : <>{result}</>
}

export function formatInline(text: string, key?: number, usersMap?: Record<string, string>): React.ReactNode {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const mentionStyle = (isBroadcast: boolean) => {
    const bgColor = isBroadcast ? '#FAA61A33' : `${C.accent}22`
    const fgColor = isBroadcast ? '#FAA61A' : C.accent
    return `display:inline-flex;align-items:center;gap:2px;padding:0 5px;border-radius:4px;background:${bgColor};color:${fgColor};font-weight:600;font-size:0.9em;vertical-align:baseline;cursor:default`
  }
  // v1.5.2111 — pre-pass for multi-word aliases. If the user typed
  // "@Wahyu Ferziawan" literally (without using the picker), the
  // single-word @\w+ regex below would only catch "@Wahyu". So scan for
  // longest known names first and replace them with badge HTML.
  // v1.5.2207 — also include usersMap keys (usernames). Discord display
  // names land in User.username (which is the map's key), and those can
  // contain spaces too — alias-only iteration missed them.
  let multiWordReplaced = escaped
  if (usersMap) {
    const candidates = new Set<string>()
    for (const [username, alias] of Object.entries(usersMap)) {
      if (username && / /.test(username)) candidates.add(username)
      if (alias && / /.test(alias)) candidates.add(alias)
    }
    const multiWord = Array.from(candidates).sort((a, b) => b.length - a.length)
    for (const name of multiWord) {
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`(^|[\\s\\n])@(${escapedName})\\b`, 'g')
      multiWordReplaced = multiWordReplaced.replace(re, (_m, lead, matched) => {
        return `${lead}<span style="${mentionStyle(false)}">${matched}</span>`
      })
    }
  }
  // Order matters — longest delimiters first so `**bold**` isn't eaten by `*italic*`.
  // v1.5.2207 — `(^|\s)` boundary on the @ regex so emails like
  // `name@bundy.com` don't render the `@bundy` portion as a mention chip.
  const html = multiWordReplaced
    .replace(/`([^`]+)`/g, '<code style="background:rgba(128,128,128,0.18);padding:1px 5px;border-radius:3px;font-family:\'SF Mono\',Monaco,Menlo,monospace;font-size:0.9em">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<span style="text-decoration:underline">$1</span>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/(^|[\s\n>])@([\w.]+)/g, (_match, lead, username) => {
      const isBroadcast = username === 'all' || username === 'here'
      const displayName = isBroadcast ? `@${username}` : (usersMap?.[username] || username)
      return `${lead}<span style="${mentionStyle(isBroadcast)}">${displayName}</span>`
    })
  return <span key={key} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} style={{ userSelect: 'text', WebkitUserSelect: 'text', wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} />
}

// Match a single line that's *just* one attachment from the composer:
// either an image `![filename](url)` or a file `[📎 filename](url)`. Plain
// markdown links are excluded so a message with two ordinary links isn't
// misread as a gallery.
// Groups: 1 = image filename (set on image), 2 = file filename (set on file), 3 = URL.
const ATTACH_LINE_RE = /^(?:!\[([^\]]+?)\]|\[📎\s([^\]]+?)\])\((https?:\/\/\S+?)\)\s*$/
// Bare URL on its own line that points at an attachment we host. Pasted
// links from the Files tab end up like this — we want them to render as
// the same thumbnail / inline preview the original message would show.
const BARE_ATTACH_URL_RE = /^(https?:\/\/\S+\/api\/uploads\/(?:attachments|task-attachments|document-images|feedback-attachments)\/[^\s?#]+)(?:[?#]\S*)?\s*$/i

// Try to coerce a single line into an attachment item. Returns null when
// the line doesn't fit any attachment pattern.
function parseAttachmentLine(line: string): { url: string; filename: string; isImage: boolean } | null {
  const m = ATTACH_LINE_RE.exec(line)
  if (m) {
    const isImg = m[1] !== undefined || isImageUrl(m[3])
    const filename = m[1] ?? m[2]
    return { url: m[3], filename, isImage: isImg }
  }
  const b = BARE_ATTACH_URL_RE.exec(line)
  if (b) {
    const url = b[1]
    const basename = decodeURIComponent(url.split('/').pop() ?? 'file')
    return { url, filename: basename, isImage: isImageUrl(url) }
  }
  return null
}

// v1.5.2206 — subtask-origin chip. The comments POST route prepends
// `[Subtask: <name>](/tasks/<id>)\n` when a comment is authored from
// inside a subtask drawer's discussion tab. Detected here once so EVERY
// renderer (MessageRow, DiscussionPanel, TaskDiscussionChannel,
// MessagesPanel main pane) shows the chip without duplicating logic.
const SUBTASK_CHIP_RE = /^\[(?:Sub)?[Tt]ask: (.+?)\]\(\/tasks\/(\w+)\)\s*\n?/

export function renderMessageContent(text: string, isMe = false, usersMap?: Record<string, string>): React.ReactNode {
  // v1.5.2206 — peel off the subtask chip first if the message starts
  // with one. Render it as a styled inline chip, then render the rest
  // of the body normally.
  let chip: React.ReactNode = null
  let body = text
  const subtaskMatch = SUBTASK_CHIP_RE.exec(text)
  if (subtaskMatch) {
    const name = subtaskMatch[1]
    const taskId = subtaskMatch[2]
    chip = (
      <div
        key="subtask-chip"
        onClick={() => window.dispatchEvent(new CustomEvent('bundy-open-task', { detail: { taskId } }))}
        style={{
          borderLeft: `3px solid ${C.accent}`, padding: '4px 8px',
          marginBottom: 4,
          background: `${C.accent}08`, borderRadius: '0 4px 4px 0',
          cursor: 'pointer',
          fontSize: 11, color: C.accent, fontWeight: 500,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${C.accent}18` }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = `${C.accent}08` }}>
        <span style={{ fontSize: 13, lineHeight: 1 }}>↳</span> Subtask: {name}
      </div>
    )
    body = text.slice(subtaskMatch[0].length)
  }

  // Walk lines and group block-level markdown (code blocks, quotes, lists,
  // headings) so we can render them with proper styling. Inline marks
  // (bold/italic/underline/strike/code) are still handled by parseContent
  // → formatInline per line.
  const lines = body.split('\n')
  const out: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Multi-attachment gallery: 1+ consecutive lines that are each a single
    // attachment (image `![]()`, file `[📎 ...]()`, or a bare URL pointing
    // at our `/api/uploads/...` endpoint — covers links pasted from the
    // Files tab so they render as a real preview, not just text). Click
    // opens the lightbox; gallery nav activates only when there are 2+.
    {
      let look = i
      const items: { url: string; filename: string; isImage: boolean }[] = []
      while (look < lines.length) {
        const item = parseAttachmentLine(lines[look])
        if (!item) break
        items.push(item)
        look++
      }
      if (items.length >= 1) {
        out.push(<AttachmentGalleryRow key={key++} items={items} />)
        i = look
        continue
      }
    }

    // Fenced code block: ``` … ```
    if (line.trim().startsWith('```')) {
      const start = i + 1
      let end = start
      while (end < lines.length && !lines[end].trim().startsWith('```')) end++
      const code = lines.slice(start, end).join('\n')
      out.push(
        <pre key={key++} style={{
          background: 'rgba(128,128,128,0.18)', padding: '8px 12px', borderRadius: 6,
          fontFamily: "'SF Mono', Monaco, Menlo, monospace", fontSize: 12,
          overflowX: 'auto', margin: '4px 0', whiteSpace: 'pre-wrap',
        }}>
          {code}
        </pre>
      )
      i = end + 1
      continue
    }

    // Heading: # / ## / ### (only at line start)
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line)
    if (headingMatch) {
      const level = headingMatch[1].length
      const tagSize = level === 1 ? '1.15em' : level === 2 ? '1.05em' : '0.95em'
      const Tag: keyof React.JSX.IntrinsicElements = (`h${level}`) as keyof React.JSX.IntrinsicElements
      out.push(
        React.createElement(Tag, {
          key: key++,
          style: { fontSize: tagSize, fontWeight: 700, margin: '6px 0 2px', lineHeight: 1.3 },
        }, parseContent(headingMatch[2], isMe, usersMap))
      )
      i++
      continue
    }

    // Quote block: contiguous lines starting with `> `
    if (/^>\s/.test(line)) {
      const block: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        block.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      out.push(
        <blockquote key={key++} style={{
          borderLeft: '3px solid rgba(128,128,128,0.5)', paddingLeft: 10,
          margin: '4px 0', opacity: 0.85,
        }}>
          {block.map((bl, j) => (
            <div key={j} style={{ lineHeight: 1.5 }}>{bl ? parseContent(bl, isMe, usersMap) : <br />}</div>
          ))}
        </blockquote>
      )
      continue
    }

    // Unordered list: contiguous lines starting with `- ` or `* `
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''))
        i++
      }
      out.push(
        <ul key={key++} style={{ margin: '2px 0', paddingLeft: 24, listStyle: 'disc' }}>
          {items.map((it, j) => (
            <li key={j} style={{ lineHeight: 1.5, margin: '1px 0' }}>{parseContent(it, isMe, usersMap)}</li>
          ))}
        </ul>
      )
      continue
    }

    // Ordered list: contiguous lines starting with `1. `, `2. ` …
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      out.push(
        <ol key={key++} style={{ margin: '2px 0', paddingLeft: 24, listStyle: 'decimal' }}>
          {items.map((it, j) => (
            <li key={j} style={{ lineHeight: 1.5, margin: '1px 0' }}>{parseContent(it, isMe, usersMap)}</li>
          ))}
        </ol>
      )
      continue
    }

    // Plain line.
    out.push(
      <div key={key++} style={{ lineHeight: 1.5, minHeight: out.length === 0 ? undefined : '1.5em', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
        {line ? parseContent(line, isMe, usersMap) : <br />}
      </div>
    )
    i++
  }

  return (
    <div style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}>
      {chip}
      {out}
    </div>
  )
}

// ─── Multi-attachment gallery row ───────────────────────────────────────────
// Single row, never wraps, fits as many small thumbs as the parent width
// allows; the last visible one becomes a "+N" tile when there are more
// items than can fit. Uses ResizeObserver to recompute on resize.
const THUMB_SIZE = 84
const THUMB_GAP = 6

function AttachmentGalleryRow({
  items,
}: {
  items: { url: string; filename: string; isImage: boolean }[]
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [maxVisible, setMaxVisible] = React.useState(items.length)

  React.useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      const fit = Math.max(1, Math.floor((w + THUMB_GAP) / (THUMB_SIZE + THUMB_GAP)))
      setMaxVisible(Math.min(items.length, fit))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [items.length])

  const overflow = Math.max(0, items.length - maxVisible)
  const visible = items.slice(0, maxVisible)

  function open(index: number) {
    const ev = new CustomEvent('bundy-open-lightbox', {
      detail: { url: items[index].url, filename: items[index].filename, items, index },
      cancelable: true,
    })
    window.dispatchEvent(ev)
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', gap: THUMB_GAP, marginTop: 4, overflow: 'hidden' }}>
      {visible.map((it, j) => {
        const isLastWithOverflow = overflow > 0 && j === visible.length - 1
        return (
          <div key={j} style={{ position: 'relative', width: THUMB_SIZE, height: THUMB_SIZE, flexShrink: 0 }}>
            <AttachmentThumb item={it} size={THUMB_SIZE} onClick={() => open(j)} />
            {isLastWithOverflow && (
              <div
                onClick={() => open(j)}
                style={{
                  position: 'absolute', inset: 0, borderRadius: 6,
                  background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 18, cursor: 'pointer',
                }}
              >+{overflow + 1}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Attachment thumbnail (used by multi-attachment gallery strip) ──────────
function AttachmentThumb({
  item, onClick, size = 120,
}: {
  item: { url: string; filename: string; isImage: boolean }
  onClick: () => void
  size?: number
}) {
  const isVid = isVideoUrl(item.url)
  const ext = (item.filename.split('.').pop() ?? '').toUpperCase()
  if (item.isImage) {
    return (
      <img
        src={item.url}
        alt={item.filename}
        loading="lazy"
        onClick={onClick}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        style={{
          width: size, height: size, objectFit: 'cover', borderRadius: 6,
          cursor: 'zoom-in', border: `1px solid ${C.separator}`, display: 'block',
        }}
      />
    )
  }
  if (isVid) {
    return (
      <div
        onClick={onClick}
        style={{
          width: size, height: size, borderRadius: 6, position: 'relative',
          background: '#000', cursor: 'zoom-in', border: `1px solid ${C.separator}`,
          overflow: 'hidden',
        }}
      >
        <video src={item.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.25)', color: '#fff', fontSize: Math.round(size * 0.25),
        }}>▶</div>
      </div>
    )
  }
  return (
    <div
      onClick={onClick}
      title={item.filename}
      style={{
        width: size, height: size, borderRadius: 6, border: `1px solid ${C.separator}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, cursor: 'pointer', background: 'rgba(128,128,128,0.08)', padding: 6,
      }}
    >
      <FolderOpen size={Math.round(size * 0.28)} color={C.textMuted} />
      <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted }}>{ext}</span>
      <span style={{ fontSize: 10, color: C.text, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
        {item.filename}
      </span>
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
