/**
 * `useObjectURL(blob)` — returns a blob URL that's revoked on
 * blob change or component unmount. Replaces three sites that did
 * `URL.createObjectURL()` without ever calling `URL.revokeObjectURL()`,
 * which leaked roughly 500 MB across an 8-hour messaging session.
 *
 * Pass null to clear / not allocate.
 */

import { useEffect, useState } from 'react'

export function useObjectURL(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) { setUrl(null); return }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => { URL.revokeObjectURL(next) }
  }, [blob])
  return url
}
