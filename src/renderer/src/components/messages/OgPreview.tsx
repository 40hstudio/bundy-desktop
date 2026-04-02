import React, { useState, useEffect } from 'react'
import { C } from '../../theme'
import type { ApiConfig } from '../../types'
import { apiFetch } from '../../utils/api'

interface OgMeta { title: string | null; description: string | null; image: string | null; siteName: string | null }

const ogClientCache = new Map<string, OgMeta | null>()
const OG_CACHE_MAX = 200

export function OgPreview({ url, config }: { url: string; config: ApiConfig }) {
  const [og, setOg] = useState<OgMeta | null | undefined>(
    ogClientCache.has(url) ? ogClientCache.get(url) : undefined
  )
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (ogClientCache.has(url)) return
    const params = new URLSearchParams({ url })
    apiFetch(`/api/opengraph?${params}`, {
      signal: AbortSignal.timeout(8000),
    })
      .then(r => r.json())
      .then((d: OgMeta & { error?: string }) => {
        const data = d.error ? null : (d.title || d.image ? d : null)
        if (ogClientCache.size >= OG_CACHE_MAX) {
          const firstKey = ogClientCache.keys().next().value
          if (firstKey !== undefined) ogClientCache.delete(firstKey)
        }
        ogClientCache.set(url, data)
        setOg(data)
      })
      .catch(() => {
        if (ogClientCache.size >= OG_CACHE_MAX) {
          const firstKey = ogClientCache.keys().next().value
          if (firstKey !== undefined) ogClientCache.delete(firstKey)
        }
        ogClientCache.set(url, null)
        setOg(null)
      })
  }, [url, config])

  if (!og) return null

  return (
    <div
      onClick={() => window.electronAPI.openExternal(url)}
      style={{
        marginTop: 6,
        borderLeft: '4px solid rgba(255, 255, 255, 0.15)',
        cursor: 'pointer',
        paddingLeft: 12, paddingTop: 4, paddingBottom: 4,
      }}
    >
      {og.siteName && (
        <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 2 }}>{og.siteName}</div>
      )}
      {og.title && (
        <div style={{ fontSize: 14, fontWeight: 600, color: C.accent, lineHeight: 1.3, marginBottom: 2 }}>{og.title}</div>
      )}
      {og.description && (
        <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.4, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
          {og.description}
        </div>
      )}
      {og.image && (
        <img
          src={og.image} alt={og.title ?? ''}
          style={{ maxWidth: 360, maxHeight: expanded ? 400 : 200, objectFit: 'cover', borderRadius: 6, display: 'block', marginTop: 4 }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          onClick={e => { e.stopPropagation(); setExpanded(!expanded) }}
        />
      )}
    </div>
  )
}
