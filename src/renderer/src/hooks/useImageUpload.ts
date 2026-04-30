import { useCallback, useState } from 'react'
import { apiFetch, getApiClientConfig } from '../api/client'

export type ImageUploadResult = {
  /** Absolute URL ready to embed in <img src>. */
  url: string
}

export type UseImageUploadOptions = {
  /** API path that accepts a multipart FormData with `file`. */
  endpoint: string
  /** Maximum allowed file size in bytes. Default 15 MB. */
  maxBytes?: number
  /** Field on the JSON response holding the relative URL (e.g. "url" or "attachment.url"). */
  responsePath?: 'url' | 'attachment.url'
  /** Optional callback invoked with the absolute URL on success. */
  onUploaded?: (url: string) => void
  /** Called with an Error if the upload fails. */
  onError?: (err: Error) => void
}

/**
 * Generic image upload hook. Handles size validation, FormData POST via the
 * shared apiFetch client, response shape resolution, and absolute URL
 * construction. Used by Tiptap editors (paste/drop), avatar pickers, etc.
 */
export function useImageUpload({
  endpoint, maxBytes = 15 * 1024 * 1024, responsePath = 'url', onUploaded, onError,
}: UseImageUploadOptions) {
  const [uploading, setUploading] = useState(false)

  const upload = useCallback(async (file: File): Promise<string | null> => {
    if (file.size > maxBytes) {
      const err = new Error(`Image exceeds ${Math.round(maxBytes / 1024 / 1024)}MB`)
      onError?.(err)
      return null
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const data = await apiFetch<Record<string, unknown>>(endpoint, { method: 'POST', rawBody: form })
      const relPath = responsePath === 'url'
        ? (data as { url?: string }).url
        : (data as { attachment?: { url?: string } }).attachment?.url
      if (!relPath) throw new Error('Upload response missing URL')
      const apiBase = getApiClientConfig()?.apiBase ?? ''
      const absolute = relPath.startsWith('http') ? relPath : `${apiBase}${relPath}`
      onUploaded?.(absolute)
      return absolute
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)))
      return null
    } finally {
      setUploading(false)
    }
  }, [endpoint, maxBytes, responsePath, onUploaded, onError])

  /**
   * Synchronously check for an image in a paste/drop event and kick off the
   * upload in the background. Returns `true` if an image was found (the
   * caller should `preventDefault()` immediately).
   */
  const tryUploadFromClipboard = useCallback((
    items: DataTransferItem[] | DataTransferItemList | null,
  ): boolean => {
    if (!items) return false
    const list = Array.from(items)
    const imageItem = list.find((i) => i.type.startsWith('image/'))
    if (!imageItem) return false
    const file = imageItem.getAsFile()
    if (!file) return false
    void upload(file)
    return true
  }, [upload])

  return { upload, tryUploadFromClipboard, uploading }
}
