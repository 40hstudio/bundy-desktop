import { useState } from 'react'
import { ChevronRight, Layers } from 'lucide-react'
import { Task, Auth } from '../../types'
import { C } from '../../theme'
import TaskListRow from './TaskListRow'

export default function TaskListGroup({ name, tasks, auth, onOpen, canDropSection, isDropOver, onDragOver, onDragLeave, onDrop, onDragStartTask, onDragEndTask, draggingId }: {
  name: string; tasks: Task[]; auth: Auth; onOpen: (id: string) => void
  canDropSection?: boolean; isDropOver?: boolean
  onDragOver?: () => void; onDragLeave?: () => void; onDrop?: () => void
  onDragStartTask?: (id: string) => void; onDragEndTask?: () => void; draggingId?: string | null
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      onDragOver={canDropSection ? (e) => { e.preventDefault(); onDragOver?.() } : undefined}
      onDragLeave={canDropSection ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragLeave?.() } : undefined}
      onDrop={canDropSection ? (e) => { e.preventDefault(); onDrop?.() } : undefined}
      style={{
        borderRadius: 4, padding: canDropSection ? 4 : 0,
        border: canDropSection ? `2px ${isDropOver ? 'solid' : 'dashed'} ${isDropOver ? C.accent : 'transparent'}` : 'none',
        background: isDropOver ? C.accentLight : 'transparent',
        transition: 'all 0.15s',
      }}
    >
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
              draggable={canDropSection}
              onDragStart={() => onDragStartTask?.(task.id)}
              onDragEnd={() => onDragEndTask?.()}
              isDragging={draggingId === task.id}
              showDivider={i > 0}
            />
          ))}
          {tasks.length === 0 && isDropOver && (
            <div style={{ textAlign: 'center', padding: 8, fontSize: 11, color: C.accent }}>↩ drop here</div>
          )}
        </div>
      )}
    </div>
  )
}
