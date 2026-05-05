import {
  Plus, Trash2, Pencil, FileText, Upload, Folder, File, Play, Music, FileType,
  ArrowLeft, Download, Link2, Clock, RotateCcw, Building2, Briefcase,
} from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig } from '../../types'
import { AuthImage } from '../messages/Attachments'

// ─── Shared styles ────────────────────────────────────────────────────────────

export const iconBtn24: React.CSSProperties = {
  width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', transition: 'all 0.15s',
}

export const iconBtnSmall: React.CSSProperties = {
  background: 'none', border: 'none', padding: 2, cursor: 'pointer',
  color: C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 4, flexShrink: 0,
}

export const iconBtnTiny: React.CSSProperties = {
  background: 'rgba(0,0,0,0.5)', border: 'none', padding: 3, cursor: 'pointer',
  color: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 4, flexShrink: 0, transition: 'opacity 0.15s',
}

export const toolbarBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
  borderRadius: 6, border: 'none', background: 'transparent',
  color: C.textSecondary, fontSize: 12, cursor: 'pointer', transition: 'background 0.1s',
  whiteSpace: 'nowrap',
}

export const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px',
  cursor: 'default', transition: 'background 0.1s',
}

export const menuItemStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 10px', borderRadius: 6, border: 'none',
  background: 'transparent', color: C.text, fontSize: 12,
  cursor: 'pointer', textAlign: 'left',
}

// ─── File helpers ─────────────────────────────────────────────────────────────

export function isImageFile(file: { mimeType: string | null; name: string }) {
  if (file.mimeType?.startsWith('image/')) return true
  return /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp)$/i.test(file.name)
}

export function isVideoFile(file: { mimeType: string | null; name: string }) {
  if (file.mimeType?.startsWith('video/')) return true
  return /\.(mp4|webm|ogg|mov|m4v|avi)$/i.test(file.name)
}

export function isAudioFile(file: { mimeType: string | null; name: string }) {
  if (file.mimeType?.startsWith('audio/')) return true
  return /\.(mp3|wav|ogg|m4a|aac|opus|flac)$/i.test(file.name)
}

export function isPdfFile(file: { mimeType: string | null; name: string }) {
  if (file.mimeType === 'application/pdf') return true
  return /\.pdf$/i.test(file.name)
}

// Anything the LightboxOverlay can render (image / video / audio / pdf).
export function isPreviewableFile(file: { mimeType: string | null; name: string }) {
  return isImageFile(file) || isVideoFile(file) || isAudioFile(file) || isPdfFile(file)
}

export function fileTypeAccent(file: { mimeType: string | null; name: string }) {
  if (isImageFile(file)) return '#60a5fa'
  if (isVideoFile(file)) return '#f472b6'
  if (isAudioFile(file)) return '#34d399'
  if (isPdfFile(file)) return '#ef4444'
  if (/\.(zip|rar|7z|tar|gz)$/i.test(file.name)) return '#a78bfa'
  return C.textSecondary
}

// ─── Thumbnails ───────────────────────────────────────────────────────────────
//
// v1.5.2301: video thumbnails no longer auto-fetch the full file. The previous
// implementation downloaded the entire blob (potentially hundreds of MB)
// through the auth path just to grab one frame for a 60×48 tile. We now show
// a type tile with a Play badge — same as audio/PDF — and rely on the
// double-click → lightbox flow to actually stream the video.

export function FileThumbnail({ file, config, size = 60, height }: {
  file: { id: string; name: string; url: string; mimeType: string | null }
  config: ApiConfig
  size?: number
  height?: number
}) {
  const w = size
  const h = height ?? Math.round(size * 0.8)
  const baseStyle: React.CSSProperties = {
    width: w, height: h, borderRadius: 6, overflow: 'hidden', background: C.bgHover,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, position: 'relative',
  }
  const iconPx = Math.max(14, Math.floor(w / 2.5))

  if (isImageFile(file)) {
    return (
      <div style={baseStyle}>
        <AuthImage src={`${config.apiBase}${file.url}`} config={config} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  if (isVideoFile(file)) {
    return (
      <div style={{ ...baseStyle, background: 'rgba(244,114,182,0.12)' }}>
        <Play size={iconPx} style={{ color: '#f472b6', fill: '#f472b6' }} />
      </div>
    )
  }
  if (isAudioFile(file)) {
    return (
      <div style={{ ...baseStyle, background: 'rgba(52,211,153,0.12)' }}>
        <Music size={iconPx} style={{ color: '#34d399' }} />
      </div>
    )
  }
  if (isPdfFile(file)) {
    return (
      <div style={{ ...baseStyle, background: 'rgba(239,68,68,0.12)' }}>
        <FileType size={iconPx} style={{ color: '#ef4444' }} />
      </div>
    )
  }
  if (/\.(zip|rar|7z|tar|gz)$/i.test(file.name)) {
    return (
      <div style={{ ...baseStyle, background: 'rgba(167,139,250,0.12)' }}>
        <File size={iconPx} style={{ color: '#a78bfa' }} />
      </div>
    )
  }
  return (
    <div style={baseStyle}>
      <File size={iconPx} style={{ color: C.textSecondary }} />
    </div>
  )
}

// ─── Inline + context menus ───────────────────────────────────────────────────

export function InlineInput({ value, onChange, onConfirm, onCancel }: {
  value: string; onChange: (v: string) => void; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
      <input autoFocus value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel() }}
        onBlur={onConfirm}
        style={{
          flex: 1, fontSize: 12, padding: '2px 6px', borderRadius: 4,
          border: `1px solid ${C.accent}`, background: C.bgInput, color: C.text,
          outline: 'none', minWidth: 0,
        }} />
    </div>
  )
}

export function ContextMenu({ onRename, onDelete, onShare, onClose }: {
  onRename: () => void; onDelete: () => void; onShare?: () => void; onClose: () => void
}) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div style={{
        position: 'absolute', right: 0, top: '100%', zIndex: 100,
        background: C.bgFloating, border: `1px solid ${C.separator}`,
        borderRadius: 8, padding: 4, minWidth: 140, boxShadow: C.shadowHigh,
      }}>
        <button onClick={onRename} style={menuItemStyle}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <Pencil size={13} /> Rename
        </button>
        {onShare && (
          <button onClick={onShare} style={menuItemStyle}
            onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
            <Link2 size={13} /> Copy Link
          </button>
        )}
        <button onClick={onDelete} style={{ ...menuItemStyle, color: C.danger }}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </>
  )
}

export function FileMenu({ onDownload, onShare, onDelete, onClose }: {
  onDownload: () => void; onShare?: () => void; onDelete: () => void; onClose: () => void
}) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div style={{
        position: 'absolute', right: 0, top: '100%', zIndex: 100,
        background: C.bgFloating, border: `1px solid ${C.separator}`,
        borderRadius: 8, padding: 4, minWidth: 140, boxShadow: C.shadowHigh,
      }}>
        <button onClick={onDownload} style={menuItemStyle}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <Download size={13} /> Download
        </button>
        {onShare && (
          <button onClick={onShare} style={menuItemStyle}
            onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
            <Link2 size={13} /> Copy Link
          </button>
        )}
        <button onClick={onDelete} style={{ ...menuItemStyle, color: C.danger }}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </>
  )
}

// ─── Activity Log helpers ─────────────────────────────────────────────────────

export function actionColor(action: string) {
  switch (action) {
    case 'create': return 'rgba(74,222,128,0.15)'
    case 'delete': return 'rgba(239,68,68,0.15)'
    case 'rename': return 'rgba(96,165,250,0.15)'
    case 'move': return 'rgba(168,85,247,0.15)'
    case 'upload': return 'rgba(59,130,246,0.15)'
    case 'edit': return 'rgba(251,191,36,0.15)'
    case 'restore': return 'rgba(45,212,191,0.15)'
    default: return 'rgba(255,255,255,0.06)'
  }
}

export function actionIcon(action: string) {
  const s = 13
  const style: React.CSSProperties = {}
  switch (action) {
    case 'create': return <Plus size={s} style={{ ...style, color: '#4ade80' }} />
    case 'delete': return <Trash2 size={s} style={{ ...style, color: '#ef4444' }} />
    case 'rename': return <Pencil size={s} style={{ ...style, color: '#60a5fa' }} />
    case 'move': return <ArrowLeft size={s} style={{ ...style, color: '#a855f7', transform: 'rotate(180deg)' }} />
    case 'upload': return <Upload size={s} style={{ ...style, color: '#3b82f6' }} />
    case 'edit': return <FileText size={s} style={{ ...style, color: '#fbbf24' }} />
    case 'restore': return <RotateCcw size={s} style={{ ...style, color: '#2dd4bf' }} />
    default: return <Clock size={s} style={{ ...style, color: C.textMuted }} />
  }
}

export function actionLabel(action: string) {
  switch (action) {
    case 'create': return 'created'
    case 'delete': return 'deleted'
    case 'rename': return 'renamed'
    case 'move': return 'moved'
    case 'upload': return 'uploaded'
    case 'edit': return 'edited'
    case 'restore': return 'restored'
    default: return action
  }
}

export function actionTextColor(action: string) {
  switch (action) {
    case 'create': return '#4ade80'
    case 'delete': return '#ef4444'
    case 'rename': return '#60a5fa'
    case 'move': return '#a855f7'
    case 'upload': return '#3b82f6'
    case 'edit': return '#fbbf24'
    case 'restore': return '#2dd4bf'
    default: return C.textMuted
  }
}

export function actionTargetIcon(targetType: string) {
  const s = 11
  const style: React.CSSProperties = { opacity: 0.6, verticalAlign: 'middle', marginRight: 2 }
  switch (targetType) {
    case 'client': return <Building2 size={s} style={{ ...style, color: '#fbbf24' }} />
    case 'project': return <Briefcase size={s} style={{ ...style, color: '#60a5fa' }} />
    case 'folder': return <Folder size={s} style={{ ...style, color: '#3b82f6' }} />
    case 'document': return <FileText size={s} style={{ ...style, color: '#a855f7' }} />
    case 'file': return <File size={s} style={{ ...style, color: '#6b7280' }} />
    default: return null
  }
}

export function formatTimeDetailed(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (diffDays === 0) return `Today at ${time}`
  if (diffDays === 1) return `Yesterday at ${time}`
  if (diffDays < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} at ${time}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`
}

// ─── Recycle Bin helpers ──────────────────────────────────────────────────────

export function recycleTypeColor(type: string) {
  switch (type) {
    case 'client': return 'rgba(251,191,36,0.12)'
    case 'project': return 'rgba(96,165,250,0.12)'
    case 'folder': return 'rgba(59,130,246,0.12)'
    case 'document': return 'rgba(168,85,247,0.12)'
    case 'file': return 'rgba(107,114,128,0.12)'
    default: return 'rgba(255,255,255,0.06)'
  }
}

export function recycleTypeIcon(type: string) {
  const s = 15
  switch (type) {
    case 'client': return <Building2 size={s} style={{ color: '#fbbf24' }} />
    case 'project': return <Briefcase size={s} style={{ color: '#60a5fa' }} />
    case 'folder': return <Folder size={s} style={{ color: '#3b82f6' }} />
    case 'document': return <FileText size={s} style={{ color: '#a855f7' }} />
    case 'file': return <File size={s} style={{ color: '#6b7280' }} />
    default: return <File size={s} style={{ color: C.textMuted }} />
  }
}
