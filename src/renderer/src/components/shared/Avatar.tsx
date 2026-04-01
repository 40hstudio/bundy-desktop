import React, { useState } from 'react'
import { C } from '../../theme'
import { apiBase } from '../../hooks/useApiConfig'

export function Avatar({
  url,
  name,
  size = 30,
  radius = '50%',
}: {
  url?: string | null
  name: string
  size?: number
  radius?: string
}) {
  const [err, setErr] = useState(false)
  // Resolve server-relative URLs (e.g. /uploads/avatars/...) using the stored apiBase
  const resolvedUrl = url && url.startsWith('/') ? `${apiBase}${url}` : url
  if (resolvedUrl && !err) {
    return (
      <img
        src={resolvedUrl}
        alt={name}
        onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, background: C.accentLight,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: C.accent, flexShrink: 0,
    }}>
      {(name[0] ?? '?').toUpperCase()}
    </div>
  )
}
