/**
 * SharedMediaView — full-screen view of files / media / links shared in a
 * channel (P3-#8). Replaces the old right-pane sidebar.
 *
 * Tabs: Media (image/video grid) · Files (download list) · Links (extracted URLs).
 * Click any media item to open the global lightbox; files trigger the same
 * lightbox so the user can preview/download instead of opening a browser tab.
 */
import { useState } from 'react'
import { FolderOpen, ArrowLeft, Loader, Paperclip, ExternalLink, Link as LinkIcon, Check } from 'lucide-react'
import { C } from '../../theme'
import { AuthImage } from './Attachments'
import type { ApiConfig } from '../../types'

// Copy a URL to clipboard via the native bridge first (Electron's
// renderer often vetoes navigator.clipboard with no permission UI).
function copyUrl(url: string, onCopied: () => void) {
  const native = (window.electronAPI as { writeClipboard?: (s: string) => void } | undefined)?.writeClipboard
  if (native) { try { native(url); onCopied(); return } catch { /* fall through */ } }
  navigator.clipboard.writeText(url).then(onCopied).catch(() => { /* swallow */ })
}

function CopyLinkButton({ url, small = false }: { url: string; small?: boolean }) {
  const [copied, setCopied] = useState(false)
  const Icon = copied ? Check : LinkIcon
  return (
    <button
      onClick={(e) => {
        e.stopPropagation(); e.preventDefault()
        copyUrl(url, () => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) })
      }}
      title={copied ? 'Link copied' : 'Copy link'}
      style={{
        background: copied ? `${C.accent}22` : 'rgba(0,0,0,0.55)',
        border: `1px solid ${copied ? C.accent : 'transparent'}`,
        color: copied ? C.accent : '#fff',
        padding: small ? 4 : 6, borderRadius: 6, cursor: 'pointer', display: 'flex',
      }}>
      <Icon size={small ? 12 : 14} />
    </button>
  )
}

interface SharedMedia {
  links: Array<{ url: string; sender: string; createdAt: string }>
  media: Array<{ url: string; sender: string; createdAt: string; filename?: string }>
  files: Array<{ url: string; filename: string; sender: string; createdAt: string }>
}

export function SharedMediaView({
  config, sharedMedia, sharedMediaTab, setSharedMediaTab,
  loadingSharedMedia, onClose, onOpenFile,
}: {
  config: ApiConfig
  sharedMedia: SharedMedia
  sharedMediaTab: 'media' | 'files' | 'links'
  setSharedMediaTab: (t: 'media' | 'files' | 'links') => void
  loadingSharedMedia: boolean
  onClose: () => void
  /** Open a file URL in the lightbox so the user can preview / download. */
  onOpenFile: (url: string, filename: string) => void
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: C.lgBg }}>
      <div style={{
        padding: '12px 16px', borderBottom: `1px solid ${C.separator}`,
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <button onClick={onClose} title="Back to messages"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, display: 'flex' }}>
          <ArrowLeft size={18} />
        </button>
        <FolderOpen size={16} style={{ color: C.accent }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Shared in this conversation</span>
      </div>

      <div style={{ display: 'flex', borderBottom: `1px solid ${C.separator}`, flexShrink: 0 }}>
        {(['media', 'files', 'links'] as const).map((tab) => {
          const active = sharedMediaTab === tab
          const counts = { media: sharedMedia.media.length, files: sharedMedia.files.length, links: sharedMedia.links.length }
          return (
            <button key={tab} onClick={() => setSharedMediaTab(tab)}
              style={{
                flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                background: active ? C.accent + '15' : 'transparent',
                color: active ? C.accent : C.textMuted,
                fontWeight: active ? 700 : 500, fontSize: 13,
                borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
              }}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)} <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 4 }}>{counts[tab]}</span>
            </button>
          )
        })}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20, maxWidth: 960, margin: '0 auto', width: '100%' }}>
        {loadingSharedMedia ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.textMuted }}><Loader size={20} /></div>
        ) : sharedMediaTab === 'media' ? (
          sharedMedia.media.length === 0 ? (
            <Empty msg="No media shared yet." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
              {sharedMedia.media.map((m, i) => {
                const fullUrl = `${config.apiBase}${m.url}`
                const filename = m.filename ?? m.url.split('/').pop() ?? 'media'
                const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(m.url)
                return (
                  <div key={i} onClick={() => onOpenFile(fullUrl, filename)}
                    style={{ borderRadius: 8, overflow: 'hidden', aspectRatio: '1', background: C.bgInput, cursor: 'pointer', position: 'relative', border: `1px solid ${C.separator}` }}>
                    {isVideo ? (
                      <video src={fullUrl} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <AuthImage src={fullUrl} config={config} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    )}
                    {/* #7 — copy direct link so the user can re-share without
                        re-uploading the same asset. */}
                    <div style={{ position: 'absolute', top: 6, right: 6 }}>
                      <CopyLinkButton url={fullUrl} small />
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : sharedMediaTab === 'files' ? (
          sharedMedia.files.length === 0 ? (
            <Empty msg="No files shared yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sharedMedia.files.map((f, i) => {
                const fullUrl = `${config.apiBase}${f.url}`
                const display = f.filename.replace(/^[a-f0-9-]{36}\./i, '').replace(/^\d+-/, '')
                return (
                  <div key={i}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.separator}`, background: C.bgInput }}>
                    <button onClick={() => onOpenFile(fullUrl, display)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', overflow: 'hidden', padding: 0 }}>
                      <Paperclip size={16} color={C.textMuted} />
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</div>
                        <div style={{ fontSize: 11, color: C.textMuted }}>{f.sender} · {new Date(f.createdAt).toLocaleDateString()}</div>
                      </div>
                    </button>
                    <CopyLinkButton url={fullUrl} />
                  </div>
                )
              })}
            </div>
          )
        ) : (
          sharedMedia.links.length === 0 ? (
            <Empty msg="No links shared yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sharedMedia.links.map((l, i) => (
                <div key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.separator}`, background: C.bgInput }}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer"
                    onClick={(e) => { e.preventDefault(); window.electronAPI.openExternal(l.url) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, textDecoration: 'none', overflow: 'hidden' }}>
                    <ExternalLink size={16} color={C.accent} />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: 13, color: C.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url.replace(/^https?:\/\//, '')}</div>
                      <div style={{ fontSize: 11, color: C.textMuted }}>{l.sender} · {new Date(l.createdAt).toLocaleDateString()}</div>
                    </div>
                  </a>
                  <CopyLinkButton url={l.url} />
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return (
    <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, padding: 60 }}>
      <FolderOpen size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
      <div>{msg}</div>
    </div>
  )
}
