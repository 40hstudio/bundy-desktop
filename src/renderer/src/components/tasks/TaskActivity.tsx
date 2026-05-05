import type { TaskActivityItem } from '../../types'
import { Avatar } from '../shared/Avatar'
import { C } from '../../theme'
import { timeAgo } from '../../utils/format'
import { TASK_STATUS_LABELS, PRIORITY_LABELS } from './constants'

/**
 * Activity-tab view for a single task. Pure read-only timeline of
 * status / priority / assign / due / title / section / comment events.
 */
export function TaskActivity({ activities }: { activities: TaskActivityItem[] }) {
  if (activities.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ textAlign: 'center', color: C.textMuted, opacity: 0.4, padding: 20, fontSize: 12 }}>
          No activity yet
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {activities.map(a => {
        const actorName = a.user?.alias ?? a.user?.username ?? 'Someone'
        const label = (() => {
          if (a.type === 'created') return 'created this task'
          if (a.type === 'status') return `changed status to ${TASK_STATUS_LABELS[a.newVal ?? ''] ?? a.newVal}`
          if (a.type === 'priority') return `set priority to ${PRIORITY_LABELS[a.newVal ?? ''] ?? a.newVal}`
          if (a.type === 'assigned') return a.newVal ? `assigned to ${a.newVal}` : 'unassigned'
          if (a.type === 'due') return a.newVal ? `set due date to ${new Date(a.newVal).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'removed due date'
          if (a.type === 'title') return `renamed to "${a.newVal}"`
          if (a.type === 'section') return a.newVal ? `moved to section "${a.newVal}"` : 'removed from section'
          if (a.type === 'comment') return `posted in discussion${a.newVal ? `: "${a.newVal.slice(0, 50)}${(a.newVal?.length ?? 0) > 50 ? '…' : ''}"` : ''}`
          return `updated ${a.type}`
        })()
        return (
          <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Avatar url={a.user?.avatarUrl ?? null} name={actorName} size={22} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 12, color: C.text }}><span style={{ fontWeight: 700 }}>{actorName}</span>{' '}{label}</span>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{timeAgo(a.createdAt)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
