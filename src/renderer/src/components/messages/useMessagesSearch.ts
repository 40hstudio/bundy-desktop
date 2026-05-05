import { useState, useRef, useCallback } from 'react'
import { track } from '../../utils/eventLogger'

export type MessageSearchHit = {
  id: string
  channelId: string
  content: string
  createdAt: string
  parentMessageId?: string | null
  sender: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  channel: { id: string; name: string | null; type: string }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiFetch = (path: string, opts?: RequestInit) => Promise<any>

/**
 * Debounced messages search — used in two places in MessagesPanel:
 *
 *   1. Sidebar global search (`/api/channels/search?q=…`)
 *   2. In-conversation search (`/api/channels/search?q=…&channelId=X`)
 *
 * The hook owns query / results / searching / show plus the debounce
 * timer ref. The URL builder is injected by the caller so it can scope
 * to the current channel (or skip the fetch entirely if no channel is
 * selected) without the hook needing to know about that state.
 *
 * The two consumers share the input + results state shape but diverge
 * sharply on what to do with a result click — those handlers stay in
 * MessagesPanel because they touch broader navigation state (channel
 * switching, thread view opening, scroll-into-view).
 */
export function useMessagesSearch(
  apiFetch: ApiFetch,
  buildUrl: (q: string) => string | null,
) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MessageSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [show, setShow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable wrapper around buildUrl so the handleInput callback below
  // doesn't churn every render.
  const buildUrlRef = useRef(buildUrl)
  buildUrlRef.current = buildUrl

  const handleInput = useCallback((q: string) => {
    setQuery(q)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!q.trim() || q.trim().length < 2) {
      setResults([])
      return
    }
    const url = buildUrlRef.current(q.trim())
    if (!url) return
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      track('messages:search', { q })
      try {
        const data = await apiFetch(url)
        setResults(data.messages ?? [])
      } catch {
        setResults([])
      }
      setSearching(false)
    }, 400)
  }, [apiFetch])

  const reset = useCallback(() => {
    setShow(false)
    setQuery('')
    setResults([])
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  return {
    query, setQuery,
    results, setResults,
    searching,
    show, setShow,
    handleInput,
    reset,
  }
}
