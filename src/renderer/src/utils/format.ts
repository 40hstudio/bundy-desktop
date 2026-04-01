// ─── Format utilities ─────────────────────────────────────────────────────────

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1_000)
  const h = Math.floor(s / 3_600)
  const m = Math.floor((s % 3_600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}

export function insertMarkdownAt(
  ta: HTMLTextAreaElement,
  setContent: (v: string) => void,
  prefix: string,
  suffix = ''
): void {
  const { selectionStart: s, selectionEnd: e, value } = ta
  const selected = value.slice(s, e)
  const newVal = value.slice(0, s) + prefix + selected + suffix + value.slice(e)
  setContent(newVal)
  requestAnimationFrame(() => {
    ta.setSelectionRange(s + prefix.length, s + prefix.length + selected.length)
    ta.focus()
  })
}
