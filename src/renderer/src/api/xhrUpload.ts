/**
 * v1.5.2208 — generic XHR-based multipart uploader so callers can drive a
 * progress callback. `fetch()` cannot expose upload progress; the entire
 * point of this helper is to plug the gap.
 *
 * Mirrors what `tryDirectR2Upload` does for the R2 PUT half, but for
 * surfaces whose multipart endpoints are still server-mediated (e.g. the
 * /uploads/<surface> Next.js routes that exist as a fallback for when R2
 * isn't enabled). All upload sites in the app should be running through
 * either tryDirectR2Upload OR xhrUploadJson — never bare `fetch()` with
 * a FormData body — so the global UploadProgressOverlay sees them.
 */

export function xhrUploadJson<T = unknown>(
  url: string,
  token: string,
  body: FormData | Blob,
  onProgress?: (loaded: number, total: number) => void,
  method: 'POST' | 'PUT' = 'POST',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total)
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const text = xhr.responseText
          resolve((text ? JSON.parse(text) : {}) as T)
        } catch (err) {
          reject(err instanceof Error ? err : new Error('parse failed'))
        }
      } else {
        let msg = `HTTP ${xhr.status}`
        try {
          const j = JSON.parse(xhr.responseText)
          if (j?.error) msg = j.error
        } catch { /* keep default */ }
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.onabort = () => reject(new Error('Aborted'))
    xhr.send(body)
  })
}
