import { useState, useEffect } from 'react'
import { X, Download, ChevronLeft, ChevronRight, FileText, Loader } from 'lucide-react'
import type { ApiConfig } from '../../types'
import { AuthImage } from './Attachments'
import { C } from '../../theme'

export function LightboxOverlay({
  lightbox, config, onClose,
}: {
  lightbox: { url: string; filename: string; items?: Array<{ url: string; filename: string }>; index?: number }
  config: ApiConfig
  onClose: () => void
}) {
  const PREVIEW_LIMIT = 10 * 1024 * 1024
  const items = lightbox.items && lightbox.items.length > 0 ? lightbox.items : [{ url: lightbox.url, filename: lightbox.filename }]
  const [galleryIdx, setGalleryIdx] = useState(lightbox.index ?? 0)
  const current = items[galleryIdx] ?? items[0]
  const [size, setSize] = useState<number | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)

  const ext = (current.filename.split('.').pop() ?? '').toLowerCase()
  const isImage = /^(jpe?g|png|gif|webp|avif|svg)$/i.test(ext)
  // Voice notes are audio-in-WebM; route them to the audio player so the
  // user doesn't get a silent black square.
  const isVoiceNote = /^voice-note-/i.test(current.filename)
  const isVideo = !isVoiceNote && /^(mp4|webm|ogg|mov|m4v)$/i.test(ext)
  const isAudio = isVoiceNote || /^(mp3|wav|ogg|m4a|aac|opus)$/i.test(ext)
  const isPdf = ext === 'pdf'
  const hasGallery = items.length > 1

  // HEAD probe to learn the file size — drives the >10 MB fallback.
  // Re-runs when the user navigates between items in a gallery.
  useEffect(() => {
    let cancelled = false
    setSize(null)
    fetch(current.url, { method: 'HEAD', headers: { Authorization: `Bearer ${config.token}` } })
      .then((r) => {
        const len = r.headers.get('content-length')
        if (!cancelled) setSize(len ? parseInt(len, 10) : 0)
      })
      .catch(() => { if (!cancelled) setSize(0) })
    return () => { cancelled = true }
  }, [current.url, config.token])

  function go(delta: number) {
    if (!hasGallery) return
    setGalleryIdx((i) => (i + delta + items.length) % items.length)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && hasGallery) go(-1)
      else if (e.key === 'ArrowRight' && hasGallery) go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, hasGallery, items.length])

  async function downloadFile() {
    setDownloadProgress(0)
    try {
      const r = await fetch(current.url, { headers: { Authorization: `Bearer ${config.token}` } })
      if (!r.ok || !r.body) throw new Error('HTTP ' + r.status)
      const totalLen = parseInt(r.headers.get('content-length') ?? '0', 10)
      const reader = r.body.getReader()
      const chunks: Uint8Array[] = []
      let received = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          received += value.byteLength
          if (totalLen > 0) setDownloadProgress(Math.round((received / totalLen) * 100))
        }
      }
      const blob = new Blob(chunks)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = current.filename
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000)
    } catch (err) {
      console.error('[lightbox] download failed:', err)
    } finally {
      setDownloadProgress(null)
    }
  }

  // Decide what to render in the centre.
  const tooLarge = size !== null && size > PREVIEW_LIMIT
  const canPreview = !tooLarge && (isImage || isVideo || isAudio || isPdf)

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
      <button onClick={onClose}
        style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <X size={20} color="#fff" />
      </button>
      <button onClick={(e) => { e.stopPropagation(); void downloadFile() }}
        title="Download"
        style={{ position: 'absolute', top: 16, right: 64, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <Download size={18} color="#fff" />
      </button>
      <div style={{ position: 'absolute', top: 20, left: 20, color: '#fff', fontSize: 14, fontWeight: 600, opacity: 0.85, maxWidth: 'calc(100% - 140px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {current.filename}
        {hasGallery && (
          <span style={{ marginLeft: 8, fontWeight: 400, opacity: 0.7 }}>
            ({galleryIdx + 1} / {items.length})
          </span>
        )}
        {size != null && size > 0 && (
          <span style={{ marginLeft: 8, fontWeight: 400, opacity: 0.7 }}>
            · {(size / 1024 / 1024).toFixed(1)} MB
          </span>
        )}
        {downloadProgress != null && (
          <span style={{ marginLeft: 12, fontWeight: 500, color: '#3b82f6' }}>{downloadProgress}%</span>
        )}
      </div>

      {/* Prev / next gallery arrows */}
      {hasGallery && (
        <>
          <button onClick={(e) => { e.stopPropagation(); go(-1) }}
            title="Previous (←)"
            style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
            <ChevronLeft size={22} color="#fff" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); go(1) }}
            title="Next (→)"
            style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
            <ChevronRight size={22} color="#fff" />
          </button>
        </>
      )}

      <div onClick={(e) => e.stopPropagation()}
        style={{ cursor: 'default', maxWidth: '90vw', maxHeight: '85vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {size === null ? (
          <Loader size={28} color="#fff" style={{ opacity: 0.7 }} />
        ) : canPreview && isImage ? (
          <AuthImage src={current.url} config={config} alt={current.filename}
            style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 4 }} />
        ) : canPreview && isVideo ? (
          <video controls autoPlay src={current.url}
            style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 4 }} />
        ) : canPreview && isAudio ? (
          <audio controls src={current.url} style={{ width: 'min(80vw, 480px)' }} />
        ) : canPreview && isPdf ? (
          <iframe src={current.url} title={current.filename}
            style={{ width: '90vw', height: '85vh', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, background: '#fff' }} />
        ) : (
          <div style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 12, padding: 28, textAlign: 'center', color: '#fff',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
            maxWidth: 420,
          }}>
            <FileText size={48} color="rgba(255,255,255,0.6)" />
            <div style={{ fontSize: 15, fontWeight: 600 }}>{current.filename}</div>
            <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
              {tooLarge
                ? `This file is ${(size! / 1024 / 1024).toFixed(1)} MB — preview disabled to save bandwidth. Download to view it locally.`
                : 'No inline preview available for this file type. Download to open in your default app.'}
            </div>
            <button onClick={(e) => { e.stopPropagation(); void downloadFile() }}
              disabled={downloadProgress != null}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: downloadProgress != null ? 'rgba(255,255,255,0.15)' : '#3b82f6',
                color: '#fff', cursor: downloadProgress != null ? 'default' : 'pointer',
                fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
              }}>
              <Download size={16} />
              {downloadProgress != null ? `Downloading… ${downloadProgress}%` : 'Download'}
            </button>
          </div>
        )}
      </div>

      {/* Strip of gallery thumbnails along the bottom — quick-jump. */}
      {hasGallery && (
        <div onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, padding: 6, background: 'rgba(0,0,0,0.55)', borderRadius: 8, maxWidth: '80vw', overflowX: 'auto' }}>
          {items.map((it, i) => {
            const itExt = (it.filename.split('.').pop() ?? '').toLowerCase()
            const itIsImage = /^(jpe?g|png|gif|webp|avif|svg)$/i.test(itExt)
            return (
              <button key={i} onClick={(e) => { e.stopPropagation(); setGalleryIdx(i) }}
                style={{
                  width: 44, height: 44, borderRadius: 4, border: i === galleryIdx ? `2px solid ${C.accent}` : '2px solid transparent',
                  background: 'rgba(255,255,255,0.1)', cursor: 'pointer', padding: 0, overflow: 'hidden', flexShrink: 0,
                }}>
                {itIsImage ? (
                  <AuthImage src={it.url} config={config} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <FileText size={18} color="#fff" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
