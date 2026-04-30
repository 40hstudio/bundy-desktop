import { useState } from 'react'
import { FileText, ChevronRight, ChevronLeft, X, Download, ExternalLink, FileWarning } from 'lucide-react'
import { C, neu } from '../../theme'
import type { TaskAttachment } from '../../types'

/** Files larger than this are not previewed inline — show a "download to view"
 * placeholder instead. Keeps the renderer (and the server it streams from)
 * from loading 50 MB media into memory just to show a thumbnail. */
const PREVIEW_SIZE_CAP = 15 * 1024 * 1024 // 15 MB

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

interface Props {
  attachments: TaskAttachment[]
  contextLabel?: string
  onContextClick?: () => void
  apiBase: string
  onDelete?: (id: string) => void
}

export default function AttachmentSlider({ attachments, contextLabel, onContextClick, apiBase, onDelete }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  if (attachments.length === 0) return null

  function openLightbox(i: number) { setLightboxIndex(i) }
  function closeLightbox() { setLightboxIndex(null) }
  function prev() { setLightboxIndex(i => i !== null ? Math.max(0, i - 1) : null) }
  function next() { setLightboxIndex(i => i !== null ? Math.min(attachments.length - 1, i + 1) : null) }

  const currentAtt = lightboxIndex !== null ? attachments[lightboxIndex] : null

  return (
    <>
      {/* Context tag */}
      {contextLabel && (
        <button
          onClick={onContextClick}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 12, marginBottom: 6,
            fontSize: 10, fontWeight: 600, cursor: onContextClick ? 'pointer' : 'default',
            color: onContextClick ? C.accent : C.textMuted,
            background: onContextClick ? C.accentLight : 'transparent',
            border: `1px solid ${onContextClick ? C.accent + '40' : C.separator}`,
            fontFamily: 'inherit',
          }}
        >
          {contextLabel}
          {onContextClick && <ChevronRight size={10} />}
        </button>
      )}

      {/* Horizontal scroll strip */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {attachments.map((att, i) => {
          const isImg = att.mimeType?.startsWith('image/')
          const isVideo = att.mimeType?.startsWith('video/')
          // Treat null/undefined size (legacy rows) as preview-ok.
          const tooLargeForPreview = (att.size ?? 0) > PREVIEW_SIZE_CAP
          const canPreviewMedia = (isImg || isVideo) && !tooLargeForPreview
          return (
            <div key={att.id} style={{ position: 'relative', flexShrink: 0 }}>
              {canPreviewMedia ? (
                <div style={{ position: 'relative' }}>
                  {isImg ? (
                    <img
                      src={`${apiBase}${att.url}`}
                      alt={att.name}
                      onClick={() => openLightbox(i)}
                      style={{
                        width: 100, height: 80, objectFit: 'cover',
                        borderRadius: 8, display: 'block', cursor: 'pointer',
                        border: `1px solid ${C.separator}`,
                      }}
                    />
                  ) : (
                    <video
                      src={`${apiBase}${att.url}`}
                      onClick={() => openLightbox(i)}
                      muted
                      preload="metadata"
                      style={{
                        width: 100, height: 80, objectFit: 'cover',
                        borderRadius: 8, display: 'block', cursor: 'pointer',
                        border: `1px solid ${C.separator}`, background: '#000',
                      }}
                    />
                  )}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
                    borderRadius: '0 0 8px 8px', padding: '10px 5px 4px',
                    fontSize: 9, color: '#fff',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{att.name}</div>
                </div>
              ) : tooLargeForPreview ? (
                // Media too big to preview safely — show download placeholder
                <button
                  onClick={() => window.electronAPI.openExternal(`${apiBase}${att.url}`)}
                  title={`${att.name} — ${formatSize(att.size ?? 0)}`}
                  style={{
                    width: 140, height: 80, borderRadius: 8,
                    border: `1px dashed ${C.separator}`, background: C.bgInput,
                    cursor: 'pointer', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6,
                    color: C.textMuted, fontFamily: 'inherit',
                  }}
                >
                  <FileWarning size={20} color={C.warning} />
                  <span style={{ fontSize: 10, color: C.text, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{att.name}</span>
                  <span style={{ fontSize: 9 }}>{formatSize(att.size ?? 0)} — download to view</span>
                </button>
              ) : (
                <button
                  onClick={() => window.electronAPI.openExternal(`${apiBase}${att.url}`)}
                  style={{
                    ...neu(), display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    color: C.accent, fontSize: 11, maxWidth: 160,
                    fontFamily: 'inherit',
                  }}
                >
                  <FileText size={14} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(att.id)}
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    width: 18, height: 18, borderRadius: '50%',
                    border: 'none', background: 'rgba(0,0,0,0.55)',
                    color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 0, zIndex: 1,
                  }}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Lightbox */}
      {currentAtt && (
        <div
          onClick={closeLightbox}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            zIndex: 200, cursor: 'zoom-out',
          }}
        >
          {/* Prev/Next arrows */}
          {lightboxIndex! > 0 && (
            <button
              onClick={e => { e.stopPropagation(); prev() }}
              style={{
                position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)',
                width: 40, height: 40, borderRadius: '50%', border: 'none',
                background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            ><ChevronLeft size={20} /></button>
          )}
          {lightboxIndex! < attachments.length - 1 && (
            <button
              onClick={e => { e.stopPropagation(); next() }}
              style={{
                position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)',
                width: 40, height: 40, borderRadius: '50%', border: 'none',
                background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            ><ChevronRight size={20} /></button>
          )}

          {currentAtt.mimeType?.startsWith('image/') ? (
            <img
              src={`${apiBase}${currentAtt.url}`}
              alt={currentAtt.name}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '90%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8, cursor: 'default' }}
            />
          ) : currentAtt.mimeType?.startsWith('video/') && (currentAtt.size ?? 0) <= PREVIEW_SIZE_CAP ? (
            <video
              src={`${apiBase}${currentAtt.url}`}
              controls autoPlay
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '90%', maxHeight: '80vh', borderRadius: 8, background: '#000', cursor: 'default' }}
            />
          ) : (
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 32, background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: `1px dashed rgba(255,255,255,0.15)` }}>
              <FileWarning size={48} color={C.warning} />
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{currentAtt.name}</span>
              {currentAtt.size != null && (
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{formatSize(currentAtt.size)}</span>
              )}
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, maxWidth: 360, textAlign: 'center' }}>
                The media is too big to preview in-app. Download it first to see the content.
              </span>
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{currentAtt.name}</span>
            {attachments.length > 1 && (
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{lightboxIndex! + 1} / {attachments.length}</span>
            )}
            {/* Source link — present when the strip carries a contextLabel
                (e.g. attachments shown under a subtask group). Lets the user
                jump from a lightbox-opened image straight to the subtask /
                comment that produced it. */}
            {contextLabel && onContextClick && (
              <button
                onClick={e => { e.stopPropagation(); closeLightbox(); onContextClick() }}
                style={{
                  color: C.accent, fontSize: 12, fontWeight: 600,
                  background: C.accent + '22', border: `1px solid ${C.accent}55`,
                  borderRadius: 6, padding: '4px 10px',
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <ChevronRight size={12} /> Go to {contextLabel}
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); window.electronAPI.openExternal(`${apiBase}${currentAtt.url}`) }}
              style={{ color: C.accent, fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}
            ><Download size={14} /> Download</button>
            <button
              onClick={e => { e.stopPropagation(); window.electronAPI.openExternal(`${apiBase}${currentAtt.url}`) }}
              style={{ color: C.textMuted, fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}
            ><ExternalLink size={12} /> Open</button>
          </div>

          <button
            onClick={closeLightbox}
            style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
          ><X size={24} /></button>
        </div>
      )}
    </>
  )
}
