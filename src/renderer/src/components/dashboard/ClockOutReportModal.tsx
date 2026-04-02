import { useState, useRef } from 'react'
import { sanitizeHtml } from '../../utils/sanitize'
import { simpleMarkdown } from '../../utils/markdown'
import { insertMarkdownAt as insertMarkdown } from '../../utils/format'
import { useAppStore } from '../../store'
import type { PlanItem } from '../../types'

interface Props {
  planItems: PlanItem[]
  onClose: () => void
}

export function ClockOutReportModal({ planItems, onClose }: Props): JSX.Element {
  const [step, setStep] = useState<'plan' | 'report'>(planItems.length > 0 ? 'plan' : 'report')
  const [confirmItems, setConfirmItems] = useState(
    planItems.map(i => ({ itemId: i.id, status: i.status, outcome: '' }))
  )
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = async () => {
    if (!content.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await window.electronAPI.submitReportWithPlan(
        content.trim(),
        confirmItems.map(ci => ({
          itemId: ci.itemId,
          status: ci.status,
          ...(ci.outcome.trim() ? { outcome: ci.outcome.trim() } : {})
        }))
      )
      onClose()
      await useAppStore.getState().refreshPlan()
      const next = await window.electronAPI.getStatus()
      useAppStore.getState().setStatus(next)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '16px'
      }}
    >
      <div
        className="glass-lg"
        style={{
          width: '100%',
          maxWidth: '380px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: '13px' }}>
            {step === 'plan' ? '📋 Confirm Plan Status' : '🔴 Clock Out Report'}
          </span>
          <button
            onClick={() => { onClose(); setShowPreview(false) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '14px' }}
          >✕</button>
        </div>

        {/* ─── Step 1: Plan Confirmation ─── */}
        {step === 'plan' && (
          <>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Update the status of each task before clocking out.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {planItems.map((item, idx) => {
                const ci = confirmItems[idx]
                if (!ci) return null
                return (
                  <div
                    key={item.id}
                    className="neu-inset"
                    style={{ padding: '8px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}
                  >
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)' }}>{item.project.name}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.details}
                      </span>
                    </div>
                    {/* Status selector */}
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {([
                        { value: 'completed', label: '✅ Done', color: 'var(--success)' },
                        { value: 'continued', label: '🔁 To be continued', color: 'var(--warning)' },
                        { value: 'planned', label: '📌 Haven\'t started', color: 'var(--text-secondary)' },
                        { value: 'blocked', label: '🚫 Blocked', color: 'var(--danger)' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          className={ci.status === opt.value ? 'neu-raised' : ''}
                          onClick={() => {
                            setConfirmItems(prev => prev.map((c, i) => i === idx ? { ...c, status: opt.value } : c))
                          }}
                          style={{
                            fontSize: '10px',
                            padding: '3px 8px',
                            border: ci.status === opt.value ? 'none' : '1px solid transparent',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: ci.status === opt.value ? undefined : 'transparent',
                            color: ci.status === opt.value ? opt.color : 'var(--text-secondary)',
                            fontWeight: ci.status === opt.value ? 600 : 400
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {/* Outcome note (optional) */}
                    <input
                      value={ci.outcome}
                      onChange={(e) => {
                        setConfirmItems(prev => prev.map((c, i) => i === idx ? { ...c, outcome: e.target.value } : c))
                      }}
                      placeholder="Outcome note (optional)"
                      style={{
                        fontSize: '10px',
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--separator)',
                        background: 'var(--fill-tertiary)',
                        color: 'var(--text)',
                        boxSizing: 'border-box',
                        width: '100%'
                      }}
                    />
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="neu-raised"
                onClick={() => { onClose(); setShowPreview(false) }}
                style={{ flex: 1, padding: '8px', fontSize: '12px', border: 'none', cursor: 'pointer' }}
              >Cancel</button>
              <button
                className="neu-raised"
                onClick={() => setStep('report')}
                style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--accent)', border: 'none', cursor: 'pointer' }}
              >Next →</button>
            </div>
          </>
        )}

        {/* ─── Step 2: Report Editor ─── */}
        {step === 'report' && (
          <>
            {/* Write / Preview tabs */}
            <div
              className="neu-inset"
              style={{ display: 'flex', borderRadius: '8px', padding: '2px', gap: '2px' }}
            >
              {(['Write', 'Preview'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setShowPreview(tab === 'Preview')}
                  className={!showPreview === (tab === 'Write') ? 'neu-raised' : ''}
                  style={{
                    flex: 1,
                    padding: '5px',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: 'transparent',
                    color: (!showPreview === (tab === 'Write')) ? 'var(--text)' : 'var(--text-secondary)'
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Formatting toolbar (Write mode) */}
            {!showPreview && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {([
                  { label: 'B',    prefix: '**',    suffix: '**',      title: 'Bold',            style: { fontWeight: 700 } },
                  { label: 'I',    prefix: '_',     suffix: '_',       title: 'Italic',          style: { fontStyle: 'italic' as const } },
                  { label: '~~',   prefix: '~~',    suffix: '~~',      title: 'Strikethrough',   style: { textDecoration: 'line-through' as const } },
                  { label: 'H1',   prefix: '# ',    suffix: '',        title: 'Heading 1',       style: {} },
                  { label: 'H2',   prefix: '## ',   suffix: '',        title: 'Heading 2',       style: {} },
                  { label: 'H3',   prefix: '### ',  suffix: '',        title: 'Heading 3',       style: {} },
                  { label: '❝',    prefix: '> ',    suffix: '',        title: 'Blockquote',      style: {} },
                  { label: '•',    prefix: '\n- ',  suffix: '',        title: 'Bullet list',     style: {} },
                  { label: '1.',   prefix: '\n1. ', suffix: '',        title: 'Numbered list',   style: {} },
                  { label: '`c`',  prefix: '`',     suffix: '`',       title: 'Inline code',     style: { fontFamily: 'monospace' } },
                  { label: '—',    prefix: '\n---\n', suffix: '',     title: 'Horizontal rule', style: {} },
                ]).map(({ label, prefix, suffix, title, style: btnStyle }) => (
                  <button
                    key={title}
                    title={title}
                    className="neu-raised"
                    onClick={() => {
                      if (textareaRef.current) {
                        insertMarkdown(textareaRef.current, setContent, prefix, suffix)
                      }
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      border: 'none',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      fontFamily: 'SF Mono, Menlo, monospace',
                      ...btnStyle
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Editor */}
            {!showPreview ? (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  const ta = e.currentTarget
                  if (e.key === 'Tab') {
                    e.preventDefault()
                    insertMarkdown(ta, setContent, '  ', '')
                    return
                  }
                  const mod = e.ctrlKey || e.metaKey
                  if (mod && e.key === 'b') {
                    e.preventDefault()
                    insertMarkdown(ta, setContent, '**', '**')
                  } else if (mod && e.key === 'i') {
                    e.preventDefault()
                    insertMarkdown(ta, setContent, '_', '_')
                  }
                }}
                placeholder="What did you work on today?&#10;&#10;- Task 1&#10;- Task 2&#10;&#10;## Notes&#10;Any blockers?"
                rows={8}
                className="glass-inset"
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '12px',
                  fontFamily: 'SF Mono, Menlo, monospace',
                  color: 'var(--text)',
                  resize: 'none',
                  boxSizing: 'border-box',
                  lineHeight: '1.5'
                }}
              />
            ) : (
              <div
                className="glass-inset"
                style={{
                  width: '100%',
                  minHeight: '160px',
                  padding: '10px',
                  fontSize: '12px',
                  color: 'var(--text)',
                  boxSizing: 'border-box',
                  lineHeight: '1.5',
                  overflowY: 'auto'
                }}
                dangerouslySetInnerHTML={{
                  __html: content.trim()
                    ? sanitizeHtml(simpleMarkdown(content))
                    : '<span style="opacity:0.4">Nothing to preview yet…</span>'
                }}
              />
            )}

            {/* Footer stats */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                {content.split(/\s+/).filter(Boolean).length} words
              </span>
            </div>

            {error && (
              <div style={{ fontSize: '11px', color: 'var(--danger)' }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="neu-raised"
                onClick={() => {
                  if (planItems.length > 0) {
                    setStep('plan')
                  } else {
                    onClose()
                    setShowPreview(false)
                  }
                }}
                style={{ flex: 1, padding: '8px', fontSize: '12px', border: 'none', cursor: 'pointer' }}
              >
                {planItems.length > 0 ? '← Back' : 'Cancel'}
              </button>
              <button
                className="neu-raised"
                onClick={handleSubmit}
                disabled={!content.trim() || submitting}
                style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--danger)', border: 'none', cursor: 'pointer' }}
              >
                {submitting ? '…' : 'Submit & Clock Out'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
