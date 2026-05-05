/**
 * FeedbackViewer — Pastel.io-style visual feedback tool for reviewing web pages.
 * Renders a URL in an iframe with responsive breakpoints and allows placing
 * pin annotations with comments and status tracking.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowLeft, Monitor, Tablet, Smartphone, Plus, X, MessageSquare,
  Circle, Play, Eye, Check, Loader, ExternalLink, ChevronDown, RefreshCw,
  Trash2, Send,
} from 'lucide-react'
import { C, neu } from '../../theme'
import type { ApiConfig } from '../../types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeedbackLinkDetail {
  id: string
  url: string
  title: string
  projectId: string
  folderId: string | null
  pins: Pin[]
  creator: UserRef
  createdAt: string
}

interface Pin {
  id: string
  breakpoint: string
  xPercent: number
  yAbsolute: number
  body: string
  status: string
  pageUrl: string | null
  scrollY: number
  createdAt: string
  updatedAt: string
  creator: UserRef
  resolver: UserRef | null
  resolvedAt: string | null
}

interface UserRef {
  id: string
  username: string
  alias: string | null
  avatarUrl: string | null
}

type Breakpoint = 'desktop' | 'tablet' | 'mobile'

const BREAKPOINTS: Record<Breakpoint, { width: number; label: string; icon: typeof Monitor }> = {
  desktop: { width: 1440, label: 'Desktop', icon: Monitor },
  tablet: { width: 768, label: 'Tablet', icon: Tablet },
  mobile: { width: 375, label: 'Mobile', icon: Smartphone },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Circle }> = {
  'todo':        { label: 'To Do',       color: '#9ca3af', icon: Circle },
  'in-progress': { label: 'In Progress', color: '#3b82f6', icon: Play },
  'review':      { label: 'Review',      color: '#f59e0b', icon: Eye },
  'done':        { label: 'Done',        color: '#22c55e', icon: Check },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FeedbackViewer({
  linkId,
  config,
  onBack,
  focusPinId,
}: {
  linkId: string
  config: ApiConfig
  onBack: () => void
  /** When set, scroll + pulse the matching pin once after pins load (P3.20). */
  focusPinId?: string | null
}) {
  const [link, setLink] = useState<FeedbackLinkDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // P2.17 — parent task this link belongs to (if any)
  const [parentTask, setParentTask] = useState<{ id: string; title: string; projectName: string | null; env: 'staging' | 'production'; status: string } | null>(null)
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop')
  const [pins, setPins] = useState<Pin[]>([])
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  // P3.21 — bulk select for pin operations.
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const bulkMode = bulkSelected.size > 0
  const [isPlacing, setIsPlacing] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)

  // New pin form
  const [newPinPos, setNewPinPos] = useState<{ xPercent: number; yAbsolute: number } | null>(null)
  const [newPinBody, setNewPinBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // P3.27 + P4.33 — public-token sharing modal.
  const [showShareModal, setShowShareModal] = useState(false)
  const [tokens, setTokens] = useState<Array<{ id: string; token: string; expiresAt: string | null; viewerEmail: string | null; createdAt: string }>>([])
  const [tokensLoading, setTokensLoading] = useState(false)
  const [newTokenEmail, setNewTokenEmail] = useState('')
  const [newTokenExpiry, setNewTokenExpiry] = useState<'7d' | '30d' | '90d' | 'never'>('30d')
  const [tokenJustCopied, setTokenJustCopied] = useState<string | null>(null)

  // Comment panel
  const [showPanel, setShowPanel] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const apiFetch = useCallback((path: string, init?: RequestInit) => {
    return fetch(`${config.apiBase}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}`, ...init?.headers },
    })
  }, [config])

  // ── Load link data ────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await apiFetch(`/api/report/links/${linkId}`)
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        if (cancelled) return
        setLink(data)
        setPins(data.pins)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [linkId, apiFetch])

  // P3.27 — load active public tokens for this link when the modal opens.
  useEffect(() => {
    if (!showShareModal) return
    setTokensLoading(true)
    apiFetch(`/api/report/links/${linkId}/public-tokens`)
      .then((res) => res.ok ? res.json() : { tokens: [] })
      .then((data) => setTokens(data.tokens))
      .finally(() => setTokensLoading(false))
  }, [showShareModal, linkId, apiFetch])

  const createToken = useCallback(async () => {
    let expiresAt: string | null = null
    if (newTokenExpiry !== 'never') {
      const days = newTokenExpiry === '7d' ? 7 : newTokenExpiry === '30d' ? 30 : 90
      expiresAt = new Date(Date.now() + days * 24 * 3600_000).toISOString()
    }
    const res = await apiFetch(`/api/report/links/${linkId}/public-tokens`, {
      method: 'POST', body: JSON.stringify({ expiresAt, viewerEmail: newTokenEmail.trim() || undefined }),
    })
    if (res.ok) {
      const data = await res.json()
      setTokens((prev) => [data.token, ...prev])
      setNewTokenEmail('')
    }
  }, [apiFetch, linkId, newTokenEmail, newTokenExpiry])

  const revokeToken = useCallback(async (tokenId: string) => {
    const res = await apiFetch(`/api/report/public-tokens/${tokenId}`, { method: 'DELETE' })
    if (res.ok) setTokens((prev) => prev.filter((t) => t.id !== tokenId))
  }, [apiFetch])

  // P3.20 — when a focusPinId is provided (e.g. from a chat preview card),
  // select + scroll to that pin once pins are loaded. The selected pin row in
  // the sidebar gets a pulse via CSS transition because selectedPinId drives
  // its style.
  useEffect(() => {
    if (!focusPinId || pins.length === 0) return
    const target = pins.find(p => p.id === focusPinId)
    if (!target) return
    if (target.breakpoint !== breakpoint) setBreakpoint(target.breakpoint as Breakpoint)
    setSelectedPinId(focusPinId)
    // Defer scroll until the iframe + sidebar render the pin.
    const t = setTimeout(() => {
      document.querySelector(`[data-pin-id="${focusPinId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 250)
    return () => clearTimeout(t)
  }, [focusPinId, pins, breakpoint])

  // P2.17 — fetch parent task once per link.
  useEffect(() => {
    let cancelled = false
    apiFetch(`/api/report/links/${linkId}/parent-task`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (!cancelled) setParentTask(data?.task ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [linkId, apiFetch])

  // ── Filtered pins ─────────────────────────────────────────────────────

  const filteredPins = pins.filter(p => {
    if (p.breakpoint !== breakpoint) return false
    if (statusFilter && p.status !== statusFilter) return false
    return true
  })

  const allBreakpointPins = pins.filter(p => p.breakpoint === breakpoint)

  // ── Pin placement ─────────────────────────────────────────────────────

  function handleOverlayClick(e: React.MouseEvent) {
    if (!isPlacing) return
    const overlay = overlayRef.current
    if (!overlay) return

    const rect = overlay.getBoundingClientRect()
    const viewportWidth = BREAKPOINTS[breakpoint].width
    const scale = rect.width / viewportWidth
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100
    const yAbsolute = (e.clientY - rect.top + overlay.scrollTop) / scale

    setNewPinPos({ xPercent, yAbsolute })
    setNewPinBody('')
    setIsPlacing(false)
    setSelectedPinId(null)
  }

  async function submitPin() {
    if (!newPinPos || !newPinBody.trim()) return
    setSubmitting(true)
    try {
      const res = await apiFetch(`/api/report/links/${linkId}/pins`, {
        method: 'POST',
        body: JSON.stringify({
          breakpoint,
          xPercent: newPinPos.xPercent,
          yAbsolute: newPinPos.yAbsolute,
          body: newPinBody.trim(),
          scrollY: overlayRef.current?.scrollTop ?? 0,
        }),
      })
      if (res.ok) {
        const { pin } = await res.json()
        setPins(prev => [...prev, pin])
        setNewPinPos(null)
        setNewPinBody('')
        setShowPanel(true)
      }
    } catch { /* */ }
    finally { setSubmitting(false) }
  }

  async function updatePinStatus(pinId: string, status: string) {
    const res = await apiFetch(`/api/report/pins/${pinId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const updated = await res.json()
      setPins(prev => prev.map(p => p.id === pinId ? updated : p))
    }
  }

  async function deletePin(pinId: string) {
    const res = await apiFetch(`/api/report/pins/${pinId}`, { method: 'DELETE' })
    if (res.ok) {
      setPins(prev => prev.filter(p => p.id !== pinId))
      if (selectedPinId === pinId) setSelectedPinId(null)
    }
  }

  // ── Pin numbering ─────────────────────────────────────────────────────

  function getPinNumber(pin: Pin): number {
    return allBreakpointPins.findIndex(p => p.id === pin.id) + 1
  }

  // ── Proxy URL ─────────────────────────────────────────────────────────

  const proxyUrl = link ? `${config.apiBase}/api/report/proxy?url=${encodeURIComponent(link.url)}&token=${encodeURIComponent(config.token)}` : ''

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={24} style={{ color: C.textMuted, animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  if (error || !link) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: C.danger, fontSize: 13 }}>{error || 'Link not found'}</p>
        <button onClick={onBack} style={{ ...btnStyle, background: C.bgHover }}>
          <ArrowLeft size={14} /> Go Back
        </button>
      </div>
    )
  }

  const selectedPin = selectedPinId ? pins.find(p => p.id === selectedPinId) : null
  const bpConfig = BREAKPOINTS[breakpoint]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── Top toolbar ────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${C.border}`, background: C.bgSidebar, flexShrink: 0,
      }}>
        <button onClick={onBack} title="Back to folder"
          style={toolBtn}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <ArrowLeft size={14} />
        </button>

        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {link.title}
          {parentTask && (
            <button
              title={`${parentTask.env === 'staging' ? 'Staging' : 'Production'} link of "${parentTask.title}" — click to open task`}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('bundy-open-task', { detail: { taskId: parentTask.id } }))
              }}
              style={{
                marginLeft: 8, fontSize: 10, fontWeight: 500, padding: '2px 6px',
                borderRadius: 4, border: `1px solid ${C.border}`, background: C.bgHover,
                color: C.textMuted, cursor: 'pointer', verticalAlign: 'middle',
              }}>
              ↳ Task: {parentTask.title.length > 30 ? parentTask.title.slice(0, 30) + '…' : parentTask.title}
              <span style={{ marginLeft: 6, fontSize: 9, color: parentTask.env === 'staging' ? '#f59e0b' : '#22c55e' }}>
                {parentTask.env}
              </span>
            </button>
          )}
        </div>

        {/* Breakpoint switcher */}
        <div style={{ display: 'flex', gap: 1, background: C.bgHover, borderRadius: 6, padding: 2 }}>
          {(Object.entries(BREAKPOINTS) as [Breakpoint, typeof bpConfig][]).map(([bp, cfg]) => {
            const Icon = cfg.icon
            return (
              <button key={bp} onClick={() => { setBreakpoint(bp); setSelectedPinId(null); setNewPinPos(null) }}
                title={`${cfg.label} (${cfg.width}px)`}
                style={{
                  width: 30, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4, border: 'none', cursor: 'pointer', transition: 'all 0.1s',
                  background: breakpoint === bp ? C.accent : 'transparent',
                  color: breakpoint === bp ? '#fff' : C.textMuted,
                }}>
                <Icon size={14} />
              </button>
            )
          })}
        </div>

        <span style={{ fontSize: 11, color: C.textMuted }}>{bpConfig.width}px</span>

        {/* Add pin button */}
        <button onClick={() => { setIsPlacing(!isPlacing); setNewPinPos(null) }}
          title={isPlacing ? 'Cancel pin placement' : 'Add feedback pin'}
          style={{
            ...toolBtn,
            background: isPlacing ? C.accent : 'transparent',
            color: isPlacing ? '#fff' : C.textSecondary,
          }}
          onMouseEnter={e => { if (!isPlacing) e.currentTarget.style.background = C.bgHover }}
          onMouseLeave={e => { if (!isPlacing) e.currentTarget.style.background = 'transparent' }}>
          <Plus size={14} />
          <span style={{ fontSize: 12 }}>Pin</span>
        </button>

        {/* Toggle comment panel */}
        <button onClick={() => setShowPanel(!showPanel)}
          title={showPanel ? 'Hide comments' : 'Show comments'}
          style={toolBtn}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <MessageSquare size={14} />
          {allBreakpointPins.length > 0 && (
            <span style={{
              fontSize: 10, background: C.accent, color: '#fff', borderRadius: 8,
              padding: '0 5px', fontWeight: 700, lineHeight: '16px',
            }}>
              {allBreakpointPins.length}
            </span>
          )}
        </button>

        {/* Reload iframe */}
        <button onClick={() => { setIframeLoaded(false); if (iframeRef.current) iframeRef.current.src = proxyUrl }}
          title="Reload page" style={toolBtn}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <RefreshCw size={14} />
        </button>

        {/* Open original URL */}
        <button onClick={() => window.open(link.url, '_blank')}
          title="Open original URL" style={toolBtn}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <ExternalLink size={14} />
        </button>

        {/* P3.27 — public share */}
        <button onClick={() => setShowShareModal(true)} title="Share publicly with a token" style={toolBtn}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <Send size={14} />
        </button>
      </div>

      {/* URL bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
        borderBottom: `1px solid ${C.border}`, background: C.bg, fontSize: 11, color: C.textMuted,
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.url}</span>
      </div>

      {/* ── Main content: iframe + panel ───────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── Viewport area ────────────────────────────────────────────── */}
        <div style={{
          flex: 1, display: 'flex', justifyContent: 'center', overflow: 'auto',
          background: '#1a1a2e', position: 'relative',
        }}>
          <div style={{
            width: bpConfig.width, minHeight: '100%', position: 'relative',
            boxShadow: '0 0 30px rgba(0,0,0,0.5)',
          }}>
            {/* Iframe */}
            <iframe
              ref={iframeRef}
              src={proxyUrl}
              onLoad={() => setIframeLoaded(true)}
              style={{
                width: bpConfig.width, height: '100%', border: 'none',
                display: 'block', background: '#fff',
              }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />

            {/* Pin overlay — positioned on top of iframe */}
            <div
              ref={overlayRef}
              onClick={handleOverlayClick}
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                cursor: isPlacing ? 'crosshair' : 'default',
                zIndex: 2,
              }}
            >
              {/* Existing pins */}
              {filteredPins.map(pin => {
                const num = getPinNumber(pin)
                const isSelected = pin.id === selectedPinId
                const sc = STATUS_CONFIG[pin.status] || STATUS_CONFIG.todo
                return (
                  <div key={pin.id}
                    onClick={e => { e.stopPropagation(); setSelectedPinId(isSelected ? null : pin.id); setNewPinPos(null) }}
                    style={{
                      position: 'absolute',
                      left: `${pin.xPercent}%`,
                      top: pin.yAbsolute,
                      transform: 'translate(-50%, -100%)',
                      zIndex: isSelected ? 10 : 3,
                      cursor: 'pointer',
                    }}>
                    {/* Pin marker */}
                    <div style={{
                      width: 28, height: 28, borderRadius: '50% 50% 50% 0',
                      background: sc.color, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, transform: 'rotate(-45deg)',
                      boxShadow: isSelected ? `0 0 0 3px ${sc.color}44, 0 2px 8px rgba(0,0,0,0.3)` : '0 2px 6px rgba(0,0,0,0.3)',
                      transition: 'box-shadow 0.15s',
                    }}>
                      <span style={{ transform: 'rotate(45deg)' }}>{num}</span>
                    </div>
                  </div>
                )
              })}

              {/* New pin placement marker */}
              {newPinPos && (
                <div style={{
                  position: 'absolute',
                  left: `${newPinPos.xPercent}%`,
                  top: newPinPos.yAbsolute,
                  transform: 'translate(-50%, -100%)',
                  zIndex: 20,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50% 50% 50% 0',
                    background: C.accent, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, transform: 'rotate(-45deg)',
                    boxShadow: `0 0 0 3px ${C.accent}44, 0 2px 8px rgba(0,0,0,0.3)`,
                    animation: 'pulse 1.5s infinite',
                  }}>
                    <span style={{ transform: 'rotate(45deg)' }}>+</span>
                  </div>

                  {/* Comment input popup */}
                  <div onClick={e => e.stopPropagation()} style={{
                    position: 'absolute', top: 4, left: 36,
                    width: 280, background: C.bgSidebar, borderRadius: 8,
                    border: `1px solid ${C.border}`, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    padding: 12, zIndex: 30,
                  }}>
                    <textarea
                      autoFocus
                      value={newPinBody}
                      onChange={e => setNewPinBody(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitPin() }}
                      placeholder="Add your feedback…"
                      style={{
                        width: '100%', minHeight: 60, maxHeight: 140, resize: 'vertical',
                        background: C.bgInput, color: C.text, border: `1px solid ${C.border}`,
                        borderRadius: 6, padding: 8, fontSize: 12, outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <span style={{ fontSize: 10, color: C.textMuted }}>⌘+Enter to submit</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setNewPinPos(null); setNewPinBody('') }}
                          style={{ ...btnStyle, background: C.bgHover, fontSize: 11 }}>
                          Cancel
                        </button>
                        <button onClick={submitPin} disabled={!newPinBody.trim() || submitting}
                          style={{
                            ...btnStyle, background: C.accent, color: '#fff', fontSize: 11,
                            opacity: !newPinBody.trim() || submitting ? 0.5 : 1,
                          }}>
                          {submitting ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={11} />}
                          <span>Submit</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Loading overlay */}
            {!iframeLoaded && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 5,
              }}>
                <div style={{ textAlign: 'center', color: C.textMuted }}>
                  <Loader size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                  <p style={{ fontSize: 12 }}>Loading page…</p>
                </div>
              </div>
            )}
          </div>

          {/* Placing mode indicator */}
          {isPlacing && (
            <div style={{
              position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
              background: C.accent, color: '#fff', padding: '8px 16px', borderRadius: 8,
              fontSize: 12, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              display: 'flex', alignItems: 'center', gap: 6, zIndex: 20,
            }}>
              <Plus size={14} /> Click anywhere on the page to place a pin
              <button onClick={() => setIsPlacing(false)}
                style={{ marginLeft: 8, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 11 }}>
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* ── Comment panel (right sidebar) ────────────────────────────── */}
        {showPanel && (
          <div style={{
            width: 320, borderLeft: `1px solid ${C.border}`, background: C.bgSidebar,
            display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
          }}>
            {/* Panel header */}
            <div style={{
              padding: '10px 12px', borderBottom: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1 }}>
                {bulkMode ? `${bulkSelected.size} selected` : `Comments (${allBreakpointPins.length})`}
              </span>
              {!bulkMode && <StatusFilterDropdown value={statusFilter} onChange={setStatusFilter} />}
              {bulkMode && (
                <button onClick={() => setBulkSelected(new Set())} title="Clear selection"
                  style={{ background: 'transparent', border: 'none', color: C.textMuted, cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              )}
            </div>

            {/* P3.21 — Bulk action toolbar (visible only when pins are bulk-selected) */}
            {bulkMode && (
              <div style={{
                padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6,
                borderBottom: `1px solid ${C.border}`, background: C.bgHover,
              }}>
                {(['todo', 'in-progress', 'review', 'done'] as const).map((status) => (
                  <button key={status}
                    onClick={async () => {
                      const ids = [...bulkSelected]
                      const res = await apiFetch('/api/report/pins/bulk', {
                        method: 'POST', body: JSON.stringify({ pinIds: ids, action: 'status', status }),
                      })
                      if (res.ok) {
                        setPins((prev) => prev.map((p) => bulkSelected.has(p.id) ? { ...p, status } : p))
                        setBulkSelected(new Set())
                      }
                    }}
                    style={{
                      padding: '4px 8px', fontSize: 10, fontWeight: 500,
                      background: STATUS_CONFIG[status].color, color: '#fff',
                      border: 'none', borderRadius: 4, cursor: 'pointer',
                    }}>
                    {STATUS_CONFIG[status].label}
                  </button>
                ))}
                <button
                  onClick={async () => {
                    if (!confirm(`Delete ${bulkSelected.size} pin(s)?`)) return
                    const ids = [...bulkSelected]
                    const res = await apiFetch('/api/report/pins/bulk', {
                      method: 'POST', body: JSON.stringify({ pinIds: ids, action: 'delete' }),
                    })
                    if (res.ok) {
                      setPins((prev) => prev.filter((p) => !bulkSelected.has(p.id)))
                      setBulkSelected(new Set())
                    }
                  }}
                  style={{
                    padding: '4px 8px', fontSize: 10, fontWeight: 500, color: '#fff',
                    background: '#ef4444', border: 'none', borderRadius: 4, cursor: 'pointer', marginLeft: 'auto',
                  }}>
                  Delete
                </button>
              </div>
            )}

            {/* Pin list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {allBreakpointPins.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: C.textMuted, fontSize: 12 }}>
                  <MessageSquare size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <p>No feedback yet</p>
                  <p style={{ fontSize: 11, marginTop: 4 }}>Click the <strong>+ Pin</strong> button to start</p>
                </div>
              ) : (
                filteredPins.map(pin => {
                  const num = getPinNumber(pin)
                  const sc = STATUS_CONFIG[pin.status] || STATUS_CONFIG.todo
                  const isSelected = pin.id === selectedPinId
                  const isBulkSelected = bulkSelected.has(pin.id)
                  return (
                    <div key={pin.id}
                      data-pin-id={pin.id}
                      onClick={(e) => {
                        // P3.21 — shift/cmd-click toggles into bulk-select mode.
                        if (e.shiftKey || e.metaKey || e.ctrlKey || bulkMode) {
                          setBulkSelected((prev) => {
                            const next = new Set(prev)
                            if (next.has(pin.id)) next.delete(pin.id); else next.add(pin.id)
                            return next
                          })
                          return
                        }
                        setSelectedPinId(isSelected ? null : pin.id)
                      }}
                      style={{
                        padding: 10, borderRadius: 8, marginBottom: 6, cursor: 'pointer',
                        background: isBulkSelected ? `${C.accent}25` : isSelected ? `${sc.color}15` : 'transparent',
                        border: isBulkSelected ? `1px solid ${C.accent}` : isSelected ? `1px solid ${sc.color}40` : `1px solid transparent`,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (!isSelected && !isBulkSelected) e.currentTarget.style.background = C.bgHover }}
                      onMouseLeave={e => { if (!isSelected && !isBulkSelected) e.currentTarget.style.background = 'transparent' }}>
                      {/* Pin header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%', background: sc.color,
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, flexShrink: 0,
                        }}>
                          {num}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 500, color: C.text, flex: 1 }}>
                          {pin.creator.alias || pin.creator.username}
                        </span>
                        <span style={{ fontSize: 10, color: C.textMuted }}>
                          {timeAgo(pin.createdAt)}
                        </span>
                      </div>

                      {/* Comment body */}
                      <p style={{ fontSize: 12, color: C.textSecondary, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {pin.body}
                      </p>

                      {/* Status + actions */}
                      {isSelected && (
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                            const StatusIcon = cfg.icon
                            const active = pin.status === key
                            return (
                              <button key={key} onClick={e => { e.stopPropagation(); updatePinStatus(pin.id, key) }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 3,
                                  padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                                  fontSize: 10, fontWeight: active ? 600 : 400,
                                  background: active ? `${cfg.color}25` : C.bgHover,
                                  color: active ? cfg.color : C.textMuted,
                                  transition: 'all 0.1s',
                                }}>
                                <StatusIcon size={10} /> {cfg.label}
                              </button>
                            )
                          })}
                          <div style={{ flex: 1 }} />
                          <button onClick={e => { e.stopPropagation(); deletePin(pin.id) }}
                            title="Delete pin"
                            style={{ ...toolBtn, padding: 4 }}
                            onMouseEnter={e => { e.currentTarget.style.color = C.danger }}
                            onMouseLeave={e => { e.currentTarget.style.color = C.textMuted }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}

                      {/* Resolved info */}
                      {pin.status === 'done' && pin.resolver && (
                        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
                          Resolved by {pin.resolver.alias || pin.resolver.username} · {timeAgo(pin.resolvedAt || '')}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Summary bar */}
            <div style={{
              padding: '8px 12px', borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textMuted,
              display: 'flex', gap: 12,
            }}>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                const count = allBreakpointPins.filter(p => p.status === key).length
                if (count === 0) return null
                return (
                  <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
                    {count} {cfg.label}
                  </span>
                )
              })}
              {allBreakpointPins.length === 0 && <span>No pins on this breakpoint</span>}
            </div>
          </div>
        )}
      </div>

      {/* P3.27 + P4.33 — Public-share token modal */}
      {showShareModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowShareModal(false)}>
          <div style={{
            background: C.bgFloating, borderRadius: 12, padding: '20px 24px', width: 520, maxHeight: '80vh',
            border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Send size={16} style={{ color: C.accent }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Share publicly</div>
              <button onClick={() => setShowShareModal(false)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: C.textMuted, cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
              Public tokens let an unauthenticated client view this feedback link (read-only). Share the URL via email — anyone with the link can see pins until the token expires or is revoked.
            </div>

            {/* Create form */}
            <div style={{ borderTop: `1px solid ${C.separator}`, paddingTop: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>Create new token</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={newTokenEmail}
                  onChange={(e) => setNewTokenEmail(e.target.value)}
                  placeholder="reviewer@client.com (optional)"
                  style={{
                    flex: 1, padding: '6px 10px', fontSize: 12, color: C.text,
                    background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 6, outline: 'none',
                  }}
                />
                <select
                  value={newTokenExpiry}
                  onChange={(e) => setNewTokenExpiry(e.target.value as '7d' | '30d' | '90d' | 'never')}
                  style={{
                    padding: '6px 10px', fontSize: 12, color: C.text,
                    background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 6,
                  }}>
                  <option value="7d">7d</option>
                  <option value="30d">30d</option>
                  <option value="90d">90d</option>
                  <option value="never">never</option>
                </select>
                <button onClick={createToken}
                  style={{
                    padding: '6px 12px', fontSize: 12, fontWeight: 500,
                    background: C.accent, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
                  }}>Create</button>
              </div>
            </div>

            {/* Token list */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {tokensLoading && <Loader size={16} style={{ color: C.textMuted, animation: 'spin 1s linear infinite' }} />}
              {!tokensLoading && tokens.length === 0 && (
                <div style={{ fontSize: 12, color: C.textMuted, padding: '12px 0' }}>No active tokens.</div>
              )}
              {tokens.map((t) => {
                const url = `${config.apiBase.replace(/\/api$/, '')}/report/feedback/${linkId}?token=${t.token}`
                const expired = t.expiresAt && new Date(t.expiresAt) < new Date()
                return (
                  <div key={t.id} style={{
                    padding: '8px 0', borderBottom: `1px solid ${C.separator}`,
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <code style={{ fontSize: 10, color: C.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {url}
                      </code>
                      <button onClick={() => {
                        navigator.clipboard.writeText(url)
                        setTokenJustCopied(t.id)
                        setTimeout(() => setTokenJustCopied(null), 1500)
                      }} style={{ padding: '3px 8px', fontSize: 10, background: C.bgHover, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer' }}>
                        {tokenJustCopied === t.id ? 'Copied!' : 'Copy'}
                      </button>
                      <button onClick={() => revokeToken(t.id)} style={{ padding: '3px 8px', fontSize: 10, background: 'transparent', color: C.danger, border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer' }}>
                        Revoke
                      </button>
                    </div>
                    <div style={{ fontSize: 10, color: C.textMuted }}>
                      {t.viewerEmail ? `${t.viewerEmail} · ` : ''}
                      {expired ? <span style={{ color: '#ef4444' }}>expired</span> :
                        t.expiresAt ? `expires ${new Date(t.expiresAt).toLocaleDateString()}` : 'no expiry'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Status filter dropdown ────────────────────────────────────────────────

function StatusFilterDropdown({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border}`,
          background: value ? `${(STATUS_CONFIG[value] || STATUS_CONFIG.todo).color}15` : 'transparent',
          color: value ? (STATUS_CONFIG[value] || STATUS_CONFIG.todo).color : C.textMuted,
          cursor: 'pointer', fontSize: 11,
        }}>
        {value ? STATUS_CONFIG[value]?.label || value : 'All'}
        <ChevronDown size={10} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100,
            background: C.bgSidebar, border: `1px solid ${C.border}`, borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)', minWidth: 120, overflow: 'hidden',
          }}>
            <button onClick={() => { onChange(null); setOpen(false) }}
              style={{
                ...dropdownItem, fontWeight: !value ? 600 : 400,
                background: !value ? C.bgHover : 'transparent',
              }}>
              All
            </button>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button key={key} onClick={() => { onChange(key); setOpen(false) }}
                style={{
                  ...dropdownItem, color: cfg.color,
                  fontWeight: value === key ? 600 : 400,
                  background: value === key ? `${cfg.color}10` : 'transparent',
                }}>
                {cfg.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const toolBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '4px 8px', borderRadius: 4, border: 'none',
  cursor: 'pointer', background: 'transparent', color: C.textSecondary,
  fontSize: 12, transition: 'all 0.1s',
}

const btnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 10px', borderRadius: 4, border: 'none',
  cursor: 'pointer', fontSize: 12,
}

const dropdownItem: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '6px 12px', border: 'none', cursor: 'pointer',
  fontSize: 11, color: C.text,
}
