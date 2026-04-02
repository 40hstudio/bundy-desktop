import React, { useState, useEffect } from 'react'
import { FileText, Loader, ChevronDown } from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig } from '../../types'
import { isImageUrl, isVideoUrl } from '../../utils/markdown'
import { apiFetchUrl } from '../../utils/api'

// ─── Auth-aware image (fetches with bearer token for protected uploads) ───────

export function AuthImage({
  src, config, alt, style, onClick,
}: {
  src: string; config: ApiConfig; alt?: string; style?: React.CSSProperties; onClick?: () => void
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!src) return
    let objectUrl: string | null = null
    let cancelled = false
    apiFetchUrl(src)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob() })
      .then(blob => { if (!cancelled) { objectUrl = URL.createObjectURL(blob); setBlobUrl(objectUrl) } })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [src, config.token])
  if (error) return <div style={{ ...style, background: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}><FileText size={14} /></div>
  if (!blobUrl) return <div style={{ ...style, background: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}><Loader size={14} /></div>
  return <img src={blobUrl} alt={alt} style={style} onClick={onClick} />
}

// ─── Inline attachment card (Slack-style) ─────────────────────────────────────

export function InlineAttachment({
  content, config, onImageClick,
}: {
  content: string; isMe?: boolean; config?: ApiConfig; onImageClick?: (url: string, filename: string) => void
}) {
  const match = content.match(/^\[📎\s([^\]]+?)\]\((https?:\/\/\S+?)\)\s*$/)
  if (!match) return null
  const [, filename, url] = match
  const cleanUrl = url.trim()
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)

  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const extUpper = ext.toUpperCase() || 'FILE'
  const typeColor = (() => {
    switch (ext) {
      case 'zip': case 'rar': case '7z': case 'tar': case 'gz': return '#7B68EE'
      case 'csv': case 'xls': case 'xlsx': return '#2E7D32'
      case 'pdf': return '#C62828'
      case 'doc': case 'docx': return '#1565C0'
      case 'ppt': case 'pptx': return '#D84315'
      default: return '#5C6BC0'
    }
  })()

  const fileHeader = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{filename}</span>
      <ChevronDown size={12} color={C.textMuted} />
    </div>
  )

  if (isImageUrl(cleanUrl)) {
    if (config) {
      return (
        <div style={{ marginTop: 4 }}>
          {fileHeader}
          <AuthImage
            src={cleanUrl} config={config} alt={filename}
            style={{ maxWidth: 360, maxHeight: 260, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', display: 'block', border: `1px solid ${C.separator}` }}
            onClick={() => onImageClick?.(cleanUrl, filename)}
          />
        </div>
      )
    }
    if (imgError) {
      return (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: C.textMuted }}>{extUpper}</span>
            <ChevronDown size={12} color={C.textMuted} />
          </div>
          <div onClick={() => window.electronAPI.openExternal(cleanUrl)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 8, border: `1px solid ${C.separator}`, background: 'transparent', cursor: 'pointer', maxWidth: 400 }}>
            <div style={{ width: 36, height: 36, borderRadius: 6, background: typeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileText size={18} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{extUpper}</div>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div style={{ marginTop: 4 }}>
        {fileHeader}
        {!imgLoaded && !imgError && (
          <div style={{ width: 360, height: 200, borderRadius: 8, background: C.bgInput, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader size={18} color={C.textMuted} />
          </div>
        )}
        <img src={cleanUrl} alt={filename} loading="lazy"
          onClick={() => onImageClick?.(cleanUrl, filename)}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          style={{ maxWidth: 360, maxHeight: 260, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', display: imgLoaded ? 'block' : 'none', border: `1px solid ${C.separator}` }}
        />
      </div>
    )
  }

  if (isVideoUrl(cleanUrl)) {
    return (
      <div style={{ marginTop: 4 }}>
        {fileHeader}
        <video controls src={cleanUrl} style={{ maxWidth: 360, maxHeight: 260, borderRadius: 8, display: 'block' }} />
      </div>
    )
  }

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: C.textMuted }}>{extUpper}</span>
        <ChevronDown size={12} color={C.textMuted} />
      </div>
      <div onClick={() => window.electronAPI.openExternal(cleanUrl)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 8, border: `1px solid ${C.separator}`, background: 'transparent', cursor: 'pointer', maxWidth: 400 }}>
        <div style={{ width: 36, height: 36, borderRadius: 6, background: typeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText size={18} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>{extUpper}</div>
        </div>
      </div>
    </div>
  )
}
