import { useCallback, useState } from 'react'
import { getApiClientConfig } from '../api/client'
import { tryDirectR2Upload } from '../api/r2Upload'
import { xhrUploadJson } from '../api/xhrUpload'
import { trackUpload } from '../stores/uploadProgressStore'

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
  /**
   * v1.5.2111 — fires ONCE after a batched multi-file upload (paste/drop
   * of N images at once) with all resolved URLs. Lets callers insert
   * everything in a single editor transaction so cursor races between
   * sequential `setImage` calls don't lose images. Falls back to repeated
   * `onUploaded` calls if not provided.
   */
  onUploadedMany?: (urls: string[]) => void
  /** Called with an Error if the upload fails. */
  onError?: (err: Error) => void
}

/**
 * Generic image upload hook. Handles size validation, FormData POST via the
 * shared apiFetch client, response shape resolution, and absolute URL
 * construction. Used by Tiptap editors (paste/drop), avatar pickers, etc.
 */
export function useImageUpload({
  endpoint, maxBytes = 15 * 1024 * 1024, responsePath = 'url',
  onUploaded, onUploadedMany, onError,
}: UseImageUploadOptions) {
  const [uploading, setUploading] = useState(false)

  // Internal — performs a single upload and returns the absolute URL or null.
  // Does NOT toggle `setUploading` (caller manages, so multi-file batches
  // don't flicker the spinner between files) and does NOT invoke onUploaded.
  const uploadCore = useCallback(async (file: File): Promise<string | null> => {
    if (file.size > maxBytes) {
      onError?.(new Error(`Image exceeds ${Math.round(maxBytes / 1024 / 1024)}MB`))
      return null
    }
    const tracker = trackUpload({ name: file.name, surface: 'image', total: file.size })
    try {
      // Phase 3 — try direct-to-R2 first; fall back to multipart on 501 / error.
      const r2 = await tryDirectR2Upload({
        signEndpoint: `${endpoint}/sign`,
        signBody: {},
        file,
        onProgress: (pct) => tracker.onProgress(pct),
      })
      if (r2.ok) {
        const relPath = responsePath === 'url'
          ? (r2.data as { url?: string }).url
          : (r2.data as { attachment?: { url?: string } }).attachment?.url
        if (relPath) {
          const apiBase = getApiClientConfig()?.apiBase ?? ''
          tracker.success()
          return relPath.startsWith('http') ? relPath : `${apiBase}${relPath}`
        }
      }
      const form = new FormData()
      form.append('file', file)
      const apiBase = getApiClientConfig()?.apiBase ?? ''
      const token = getApiClientConfig()?.token ?? ''
      const data = await xhrUploadJson<Record<string, unknown>>(
        `${apiBase}${endpoint}`, token, form,
        (loaded, total) => tracker.onProgress(total > 0 ? (loaded / total) * 100 : 0),
      )
      const relPath = responsePath === 'url'
        ? (data as { url?: string }).url
        : (data as { attachment?: { url?: string } }).attachment?.url
      if (!relPath) throw new Error('Upload response missing URL')
      tracker.success()
      return relPath.startsWith('http') ? relPath : `${apiBase}${relPath}`
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      tracker.fail(e.message)
      onError?.(e)
      return null
    }
  }, [endpoint, maxBytes, responsePath, onError])

  const upload = useCallback(async (file: File): Promise<string | null> => {
    setUploading(true)
    try {
      const url = await uploadCore(file)
      if (url) onUploaded?.(url)
      return url
    } finally {
      setUploading(false)
    }
  }, [uploadCore, onUploaded])

  // v1.5.2111 — uploads N files in parallel. After all settle, fires
  // `onUploadedMany` ONCE with the array of successful URLs. This avoids
  // the cursor-race bug where N rapid `setImage` calls would clobber each
  // other in Tiptap, leaving only the last image inserted.
  const uploadMany = useCallback(async (files: File[]): Promise<string[]> => {
    if (files.length === 0) return []
    setUploading(true)
    try {
      const results = await Promise.all(files.map((f) => uploadCore(f)))
      const urls = results.filter((u): u is string => !!u)
      if (urls.length > 0) {
        if (onUploadedMany) onUploadedMany(urls)
        else for (const u of urls) onUploaded?.(u)
      }
      return urls
    } finally {
      setUploading(false)
    }
  }, [uploadCore, onUploaded, onUploadedMany])

  /**
   * Synchronously check for image(s) in a paste/drop event and kick off
   * the upload in the background. v1.5.2111 — handles MULTIPLE images
   * (was: only first), and batches them so the editor inserts everything
   * in a single transaction. Returns `true` if at least one image was
   * found (the caller should `preventDefault()` immediately).
   */
  const tryUploadFromClipboard = useCallback((
    items: DataTransferItem[] | DataTransferItemList | null,
  ): boolean => {
    if (!items) return false
    const list = Array.from(items)
    const files = list
      .filter((i) => i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f)
    if (files.length === 0) return false
    void uploadMany(files)
    return true
  }, [uploadMany])

  return { upload, uploadMany, tryUploadFromClipboard, uploading }
}
