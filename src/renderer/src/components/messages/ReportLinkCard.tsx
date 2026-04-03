import React, { useState, useEffect } from 'react'
import { FileText, FolderOpen, File, ExternalLink } from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig } from '../../types'

interface ReportMeta {
  clientName: string | null
  projectName: string | null
  itemName: string | null
}

const metaCache = new Map<string, ReportMeta | null>()

interface Props {
  clientId: string
  projectId: string
  itemType?: string | null
  itemId?: string | null
  config: ApiConfig
}

export function ReportLinkCard({ clientId, projectId, itemType, itemId, config }: Props) {
  const cacheKey = `${clientId}/${projectId}/${itemType ?? ''}/${itemId ?? ''}`
  const [meta, setMeta] = useState<ReportMeta | null | undefined>(
    metaCache.has(cacheKey) ? metaCache.get(cacheKey) : undefined
  )

  useEffect(() => {
    if (metaCache.has(cacheKey)) return
    const params = new URLSearchParams({ clientId, projectId })
    if (itemType && itemId) {
      params.set('itemType', itemType)
      params.set('itemId', itemId)
    }
    fetch(`${config.apiBase}/api/report/meta?${params}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(6000),
    })
      .then(r => r.json())
      .then((d: ReportMeta) => {
        metaCache.set(cacheKey, d)
        setMeta(d)
      })
      .catch(() => {
        metaCache.set(cacheKey, null)
        setMeta(null)
      })
  }, [cacheKey, clientId, projectId, itemType, itemId, config])

  const icon = itemType === 'folder' ? FolderOpen : itemType === 'file' ? File : FileText
  const Icon = icon

  const title = meta?.itemName
    ?? (meta?.projectName ? `${meta.projectName}` : 'Open Report')
  const subtitle = meta?.clientName && meta?.projectName
    ? (meta.itemName
        ? `${meta.clientName} › ${meta.projectName}`
        : `${meta.clientName}`)
    : 'Client Report'

  return (
    <div
      onClick={() => window.dispatchEvent(new CustomEvent('bundy-open-report', {
        detail: { clientId, projectId, itemType: itemType || null, itemId: itemId || null },
      }))}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
        borderRadius: 8, border: `1px solid ${C.separator}`,
        background: `${C.accent}08`, cursor: 'pointer', maxWidth: 360,
        marginTop: 4, marginBottom: 2, transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${C.accent}15` }}
      onMouseLeave={e => { e.currentTarget.style.background = `${C.accent}08` }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: `${C.accent}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={18} color={C.accent} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: C.accent, lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subtitle}
        </div>
      </div>
      <ExternalLink size={14} color={C.textMuted} style={{ flexShrink: 0 }} />
    </div>
  )
}
