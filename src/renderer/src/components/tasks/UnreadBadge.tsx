import React from 'react'
import { AtSign, MessageSquare, GitBranch, UserCheck, Activity } from 'lucide-react'
import { C } from '../../theme'
import type { UnreadBreakdown } from './TasksPanel'

/**
 * Per-task unread badge that breaks the count down by notification type.
 * Shown on board cards and list rows. Empty when caught up — caller is
 * expected to skip rendering when total is zero.
 *
 * Priority order (left → right): mentioned, assigned, subtask, discussion,
 * status. The first non-zero type drives the dominant color so the user
 * gets a precise read at a glance.
 */
export default function UnreadBadge({ breakdown, compact = false }: {
  breakdown: UnreadBreakdown
  compact?: boolean
}) {
  if (breakdown.total === 0) return null

  // Each row in priority order. Tooltip shows the full breakdown.
  const segments: Array<{ key: string; count: number; icon: React.ReactNode; color: string; label: string }> = [
    { key: 'mentioned', count: breakdown.mentioned, icon: <AtSign size={10} />, color: C.danger, label: 'mention' },
    { key: 'assigned', count: breakdown.assigned, icon: <UserCheck size={10} />, color: C.accent, label: 'assignment' },
    { key: 'subtask', count: breakdown.subtask_update, icon: <GitBranch size={10} />, color: '#1a8ad4', label: 'subtask update' },
    { key: 'discussion', count: breakdown.discussion, icon: <MessageSquare size={10} />, color: C.warning, label: 'message' },
    { key: 'status', count: breakdown.status_change, icon: <Activity size={10} />, color: C.success, label: 'status change' },
  ].filter(s => s.count > 0)

  const tooltip = segments.map(s => `${s.count} ${s.label}${s.count === 1 ? '' : 's'}`).join(' · ')

  // Compact mode (e.g. small board cards): show just the dominant icon + total.
  if (compact && segments.length > 0) {
    const dom = segments[0]
    return (
      <span title={tooltip} style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '1px 5px', borderRadius: 8, background: dom.color, color: '#fff',
        fontSize: 9, fontWeight: 700, lineHeight: 1,
      }}>
        {dom.icon}
        {breakdown.total > 99 ? '99+' : breakdown.total}
      </span>
    )
  }

  // Full mode: one pill per type. Caller can size the row appropriately.
  return (
    <span title={tooltip} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      {segments.map(s => (
        <span key={s.key} style={{
          display: 'inline-flex', alignItems: 'center', gap: 2,
          padding: '1px 5px', borderRadius: 8, background: s.color, color: '#fff',
          fontSize: 9, fontWeight: 700, lineHeight: 1,
        }}>
          {s.icon}
          {s.count > 99 ? '99+' : s.count}
        </span>
      ))}
    </span>
  )
}
