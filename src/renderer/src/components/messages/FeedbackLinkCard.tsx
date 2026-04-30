import React, { useState, useEffect } from 'react'
import { MessageSquare, ExternalLink } from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig } from '../../types'

interface FeedbackMeta {
  title: string | null
  url: string | null
  pinBody: string | null
  pinStatus: string | null
  creator: string | null
}

const metaCache = new Map<string, FeedbackMeta | null>()

interface Props {
  linkId: string
  pinId: string | null
  fullUrl: string
  config: ApiConfig
}

const STATUS_COLORS: Record<string, string> = {
  todo: '#9ca3af',
  'in-progress': '#3b82f6',
  review: '#f59e0b',
  done: '#22c55e',
}

export function FeedbackLinkCard({ linkId, pinId, fullUrl, config }: Props) {
  const cacheKey = `${linkId}/${pinId ?? ''}`
  const [meta, setMeta] = useState<FeedbackMeta | null | undefined>(
    metaCache.has(cacheKey) ? metaCache.get(cacheKey) : undefined
  )

  useEffect(() => {
    if (metaCache.has(cacheKey)) return
    const params = new URLSearchParams({ linkId })
    if (pinId) params.set('pinId', pinId)
    fetch(`${config.apiBase}/api/report/feedback-meta?${params}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(6000),
    })
      .then(r => r.json())
      .then((d: FeedbackMeta) => {
        metaCache.set(cacheKey, d)
        setMeta(d)
      })
      .catch(() => {
        metaCache.set(cacheKey, null)
        setMeta(null)
      })
  }, [cacheKey, linkId, pinId, config])

  const title = meta?.title || 'Feedback Review'
  const subtitle = meta?.pinBody
    ? meta.pinBody.slice(0, 80) + (meta.pinBody.length > 80 ? '…' : '')
    : meta?.url || 'Visual Feedback'
  const statusColor = meta?.pinStatus ? STATUS_COLORS[meta.pinStatus] || '#9ca3af' : null

  function handleClick() {
    // Use desktop-bridge auth flow (same as ReportPanel.openFeedbackLink)
    const publicBase = 'https://bundy.40h.studio'
    const redirect = `/report/feedback/${linkId}${pinId ? `?pin=${pinId}` : ''}`
    const bridgeUrl = `${publicBase}/api/auth/desktop-bridge?token=${encodeURIComponent(config.token)}&redirect=${encodeURIComponent(redirect)}`
    window.electronAPI.openExternal(bridgeUrl)
  }

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
        borderRadius: 8, border: `1px solid ${C.separator}`,
        background: '#8b5cf608', cursor: 'pointer', maxWidth: 400,
        marginTop: 4, marginBottom: 2, transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#8b5cf615' }}
      onMouseLeave={e => { e.currentTarget.style.background = '#8b5cf608' }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: '#8b5cf622',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <MessageSquare size={18} color="#8b5cf6" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 13, fontWeight: 600, color: '#8b5cf6', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}>
            {title}
          </span>
          {statusColor && (
            <span style={{
              fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
              background: `${statusColor}20`, color: statusColor, textTransform: 'uppercase',
            }}>
              {meta?.pinStatus}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subtitle}
        </div>
        {meta?.creator && (
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>
            by {meta.creator}
          </div>
        )}
      </div>
      <ExternalLink size={14} color={C.textMuted} style={{ flexShrink: 0 }} />
    </div>
  )
}
