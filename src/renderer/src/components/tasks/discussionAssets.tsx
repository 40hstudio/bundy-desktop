import { useState } from 'react'
import { Paperclip, ExternalLink, Check, Link, FileText } from 'lucide-react'
import { ApiConfig, TaskComment } from '../../types'
import { C } from '../../theme'

// ─── Discussion files / media / links extraction ────────────────────────────
// Walks the loaded comments (top-level + replies) and extracts every
// upload chip + URL referenced in `body`. Used by both the tab counter
// and the Files view itself so they stay in sync.
export type DiscussionAsset = {
  kind: 'media' | 'file' | 'link'
  url: string
  filename: string
  authorName: string
  createdAt: string
}
export function extractDiscussionAssets(comments: TaskComment[]): DiscussionAsset[] {
  const out: DiscussionAsset[] = []
  const mediaExt = /\.(jpe?g|png|gif|webp|avif|svg|mp4|webm|mov|m4v|mp3|wav|m4a|aac|opus)(\?.*)?$/i
  const flat: TaskComment[] = []
  for (const c of comments) { flat.push(c); if (c.replies) flat.push(...c.replies) }
  for (const c of flat) {
    const author = c.user.alias ?? c.user.username
    if (c.attachmentUrl && c.attachmentName) {
      const isMedia = mediaExt.test(c.attachmentName)
      out.push({ kind: isMedia ? 'media' : 'file', url: c.attachmentUrl, filename: c.attachmentName, authorName: author, createdAt: c.createdAt })
    }
    const body = c.body ?? ''
    const mdRe = /(!?)\[(?:📎\s)?([^\]]+?)\]\((https?:\/\/\S+?)\)/g
    let m: RegExpExecArray | null
    const seen = new Set<string>()
    while ((m = mdRe.exec(body)) !== null) {
      const isImg = m[1] === '!'
      seen.add(m[3])
      out.push({
        kind: isImg || mediaExt.test(m[3]) ? 'media' : 'file',
        url: m[3], filename: m[2], authorName: author, createdAt: c.createdAt,
      })
    }
    const urlRe = /https?:\/\/[^\s<>"')\]]+/g
    while ((m = urlRe.exec(body)) !== null) {
      const url = m[0]
      if (seen.has(url)) continue
      const isUploadHosted = /\/api\/uploads\/(?:attachments|task-attachments|document-images|feedback-attachments)\//i.test(url)
      const isMedia = mediaExt.test(url) || isUploadHosted
      const filename = decodeURIComponent(url.split('/').pop() ?? url)
      out.push({
        kind: isMedia ? (mediaExt.test(url) ? 'media' : 'file') : 'link',
        url, filename, authorName: author, createdAt: c.createdAt,
      })
    }
  }
  return out
}
export function countDiscussionAssets(comments: TaskComment[]): number {
  return extractDiscussionAssets(comments).length
}

// Files / media / links view inside the discussion tab. Mirrors the
// SharedMediaView UX from DMs but operates on the in-memory comments
// rather than a backend endpoint, so this works without any schema
// changes. Each row gets a copy-link button (re-share without re-upload).
export function DiscussionFilesView({
  comments, config, onOpenAttachment,
}: {
  comments: TaskComment[]
  config: ApiConfig
  onOpenAttachment: (url: string, filename: string) => void
}) {
  const [tab, setTab] = useState<'media' | 'files' | 'links'>('media')
  const assets = extractDiscussionAssets(comments)
  const groups = {
    media: assets.filter(a => a.kind === 'media'),
    files: assets.filter(a => a.kind === 'file'),
    links: assets.filter(a => a.kind === 'link'),
  }
  function fullUrl(a: DiscussionAsset): string {
    return a.url.startsWith('http') ? a.url : `${config.apiBase}${a.url}`
  }
  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.separator}` }}>
        {(['media', 'files', 'links'] as const).map(t => {
          const active = tab === t
          return (
            <button key={t} onClick={() => setTab(t)}
              style={{
                padding: '6px 10px', border: 'none', cursor: 'pointer',
                background: 'transparent', fontFamily: 'inherit',
                color: active ? C.accent : C.textMuted,
                fontWeight: active ? 700 : 500, fontSize: 11,
                borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
                marginBottom: -1,
              }}>
              {t.charAt(0).toUpperCase() + t.slice(1)} <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 3 }}>{groups[t].length}</span>
            </button>
          )
        })}
      </div>
      {groups[tab].length === 0 ? (
        <div style={{ textAlign: 'center', color: C.textMuted, opacity: 0.4, padding: 20, fontSize: 12 }}>
          No {tab} shared yet.
        </div>
      ) : tab === 'media' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
          {groups.media.map((a, i) => {
            const u = fullUrl(a)
            const isVid = /\.(mp4|webm|mov|m4v)$/i.test(a.filename)
            return (
              <div key={i} onClick={() => onOpenAttachment(u, a.filename)}
                style={{ position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', background: C.bgInput, border: `1px solid ${C.separator}` }}>
                {isVid ? (
                  <video src={u} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <img src={u} alt={a.filename} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                )}
                <DiscussionCopyLinkButton url={u} small />
              </div>
            )
          })}
        </div>
      ) : tab === 'files' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {groups.files.map((a, i) => {
            const u = fullUrl(a)
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.separator}`, background: C.bgInput }}>
                <button onClick={() => onOpenAttachment(u, a.filename)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, overflow: 'hidden', fontFamily: 'inherit' }}>
                  <Paperclip size={13} color={C.textMuted} />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 12, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.filename}</div>
                    <div style={{ fontSize: 10, color: C.textMuted }}>{a.authorName} · {new Date(a.createdAt).toLocaleDateString()}</div>
                  </div>
                </button>
                <DiscussionCopyLinkButton url={u} />
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {groups.links.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.separator}`, background: C.bgInput }}>
              <a href={a.url} onClick={(e) => { e.preventDefault(); window.electronAPI.openExternal(a.url) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, textDecoration: 'none', overflow: 'hidden' }}>
                <ExternalLink size={13} color={C.accent} />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, color: C.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.url.replace(/^https?:\/\//, '')}</div>
                  <div style={{ fontSize: 10, color: C.textMuted }}>{a.authorName} · {new Date(a.createdAt).toLocaleDateString()}</div>
                </div>
              </a>
              <DiscussionCopyLinkButton url={a.url} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DiscussionCopyLinkButton({ url, small = false }: { url: string; small?: boolean }) {
  const [copied, setCopied] = useState(false)
  function copy(e: React.MouseEvent) {
    e.stopPropagation(); e.preventDefault()
    const native = (window.electronAPI as { writeClipboard?: (s: string) => void } | undefined)?.writeClipboard
    if (native) { try { native(url); setCopied(true); window.setTimeout(() => setCopied(false), 1500); return } catch { /* fallthrough */ } }
    navigator.clipboard.writeText(url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) }).catch(() => { /* swallow */ })
  }
  return (
    <button onClick={copy} title={copied ? 'Link copied' : 'Copy link'}
      style={{
        ...(small ? { position: 'absolute', top: 4, right: 4 } : {}),
        background: copied ? `${C.accent}22` : 'rgba(0,0,0,0.55)',
        border: `1px solid ${copied ? C.accent : 'transparent'}`,
        color: copied ? C.accent : '#fff',
        padding: small ? 3 : 5, borderRadius: 5, cursor: 'pointer', display: 'flex',
        fontFamily: 'inherit',
      }}>
      {copied ? <Check size={small ? 11 : 13} /> : <Link size={small ? 11 : 13} />}
    </button>
  )
}

// ─── Comment attachment thumbnail ───────────────────────────────────────────
// 84×84 tile that mirrors the messaging tab gallery. Files render as a
// folder-icon card; images get an actual preview; videos get a thumb +
// play overlay. Click hands off to the parent via `onOpen` so the
// drawer can pick its own lightbox / external-open behaviour.
export function CommentAttachmentThumb({
  url, filename, isImage, onOpen,
}: {
  url: string
  filename: string
  isImage: boolean
  onOpen: () => void
}) {
  const cleanPath = url.split('?')[0].toLowerCase()
  const isVideo = /\.(mp4|webm|mov|m4v|ogg)$/.test(cleanPath)
  const ext = (filename.split('.').pop() ?? '').toUpperCase()
  const SIZE = 84
  if (isImage) {
    return (
      <img src={url} alt={filename} loading="lazy"
        onClick={onOpen}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        style={{ width: SIZE, height: SIZE, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', border: `1px solid ${C.separator}`, display: 'block', marginTop: 6 }} />
    )
  }
  if (isVideo) {
    return (
      <div onClick={onOpen}
        style={{ width: SIZE, height: SIZE, borderRadius: 6, position: 'relative', background: '#000', cursor: 'zoom-in', border: `1px solid ${C.separator}`, overflow: 'hidden', marginTop: 6 }}>
        <video src={url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)', color: '#fff', fontSize: 22 }}>▶</div>
      </div>
    )
  }
  return (
    <div onClick={onOpen} title={filename}
      style={{ width: SIZE, height: SIZE, borderRadius: 6, border: `1px solid ${C.separator}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', background: 'rgba(128,128,128,0.08)', padding: 6, marginTop: 6 }}>
      <FileText size={24} color={C.textMuted} />
      <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted }}>{ext || 'FILE'}</span>
      <span style={{ fontSize: 10, color: C.text, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{filename}</span>
    </div>
  )
}
