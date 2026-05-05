import { useState, useEffect } from 'react'

export type SearchHit =
  | { kind: 'client'; id: string; label: string; clientId: string }
  | { kind: 'project'; id: string; label: string; clientId: string }
  | { kind: 'folder'; id: string; label: string; projectId: string }
  | { kind: 'document'; id: string; label: string; projectId: string; folderId: string | null; snippet?: string }
  | { kind: 'file'; id: string; label: string; projectId: string; folderId: string | null }
  | { kind: 'link'; id: string; label: string; projectId: string; folderId: string | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiFetch = (path: string, opts?: RequestInit) => Promise<any>

/**
 * Debounced report-tree search (P3.25). Owns the input value + hits.
 * The "what to do when a hit is clicked" behaviour stays in the parent
 * because it interacts with the broader tree state (selection, expanded
 * map, current folder load) that this hook deliberately doesn't see.
 *
 * Queries shorter than 2 chars clear the hits list without firing a
 * request.
 */
export function useReportSearch(apiFetch: ApiFetch) {
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)

  useEffect(() => {
    const q = term.trim()
    if (q.length < 2) {
      setHits(null)
      return
    }
    const handle = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/report/search?q=${encodeURIComponent(q)}`)
        if (!res.ok) return
        const data = await res.json() as { hits: SearchHit[] }
        setHits(data.hits)
      } catch { /* ignore */ }
    }, 200)
    return () => clearTimeout(handle)
  }, [term, apiFetch])

  return { term, setTerm, hits, setHits }
}
