import { useState } from 'react'
import { ChevronRight, Layers } from 'lucide-react'
import { Task, Auth } from '../../types'
import { C } from '../../theme'
import TaskListRow from './TaskListRow'
import type { UnreadBreakdown } from './TasksPanel'

export default function TaskListGroup({ name, tasks, auth, onOpen, unreadByTaskId }: {
  name: string; tasks: Task[]; auth: Auth; onOpen: (id: string) => void
  unreadByTaskId?: Record<string, UnreadBreakdown>
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{ borderRadius: 4 }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px', marginBottom: 8, background: 'none', border: 'none', cursor: 'pointer', width: '100%' }}
      >
        <ChevronRight size={12} color={C.textMuted} style={{ transform: collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.15s' }} />
        <Layers size={12} color={C.textMuted} />
        <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{name}</span>
        <span style={{ fontSize: 10, color: C.textMuted }}>({tasks.length})</span>
      </button>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {tasks.map((task, i) => (
            <TaskListRow
              key={task.id} task={task} auth={auth} onOpen={() => onOpen(task.id)}
              showDivider={i > 0}
              unread={unreadByTaskId?.[task.id]}
            />
          ))}
        </div>
      )}
    </div>
  )
}
