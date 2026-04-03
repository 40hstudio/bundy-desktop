import { Calendar, GitBranch, MessageSquare, Circle } from 'lucide-react'
import { Task, Auth } from '../../types'
import { C } from '../../theme'
import Avatar from '../shared/Avatar'
import { TASK_STATUS_COLORS, TASK_STATUS_ICONS, TASK_STATUS_LABELS, PRIORITY_COLORS } from './constants'

export default function TaskListRow({ task, auth: _auth, onOpen, draggable: canDrag, onDragStart, onDragEnd, isDragging, showDivider }: {
  task: Task; auth: Auth; onOpen: () => void
  draggable?: boolean; onDragStart?: () => void; onDragEnd?: () => void; isDragging?: boolean
  showDivider?: boolean
}) {
  const isDone = task.status === 'done'
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !isDone

  return (
    <div
      onClick={onOpen}
      draggable={canDrag}
      onDragStart={canDrag ? (e) => { onDragStart?.(); e.dataTransfer.effectAllowed = 'move' } : undefined}
      onDragEnd={canDrag ? () => onDragEnd?.() : undefined}
      style={{
        padding: '10px 4px',
        display: 'flex', alignItems: 'center', gap: 10, cursor: canDrag ? 'grab' : 'pointer',
        opacity: isDragging ? 0.4 : 1,
        borderTop: showDivider ? `1px solid ${C.separator}` : 'none',
        transition: 'background 0.12s', borderRadius: 4,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = C.bgHover }}
      onMouseLeave={e => { e.currentTarget.style.background = '' }}
    >
      <div style={{ color: TASK_STATUS_COLORS[task.status] ?? C.textMuted, flexShrink: 0 }}>
        {TASK_STATUS_ICONS[task.status] ?? <Circle size={14} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: C.text,
          textDecoration: isDone ? 'line-through' : 'none',
          opacity: isDone ? 0.6 : 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{task.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          {task.project && (
            <span style={{ fontSize: 11, color: task.project.color || C.textMuted, fontWeight: 500 }}>
              {task.project.name}
            </span>
          )}
          <span style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            color: PRIORITY_COLORS[task.priority] ?? C.textMuted,
          }}>{task.priority}</span>
        </div>
      </div>
      {task.dueDate && (
        <span style={{
          fontSize: 10, color: isOverdue ? C.danger : C.textMuted, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 3, fontWeight: isOverdue ? 600 : 400,
        }}><Calendar size={10} />{new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
      )}
      {(task._count?.subtasks ?? 0) > 0 && (
        <span style={{ fontSize: 10, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <GitBranch size={10} /> {task._count.subtasks}
        </span>
      )}
      {(task._count?.comments ?? 0) > 0 && (
        <span style={{ fontSize: 10, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <MessageSquare size={10} /> {task._count.comments}
        </span>
      )}
      <span style={{ fontSize: 10, fontWeight: 600, color: TASK_STATUS_COLORS[task.status] ?? C.textMuted, flexShrink: 0 }}>
        {TASK_STATUS_LABELS[task.status] ?? task.status}
      </span>
      {task.assignee && (
        <Avatar url={task.assignee.avatarUrl} name={task.assignee.alias ?? task.assignee.username} size={22} />
      )}
    </div>
  )
}
