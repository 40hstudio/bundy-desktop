import { useState, useEffect, useCallback } from 'react'
import {
  Plus, RefreshCw, Loader, CheckSquare, Filter, ChevronRight,
  Layers, LayoutList, LayoutGrid, FolderPlus, Edit2, MessageSquare, GitBranch, Search, X
} from 'lucide-react'
import { ApiConfig, Auth, Task, TaskProject } from '../../types'
import { C, neu } from '../../theme'
import Avatar from '../shared/Avatar'
import { TASK_STATUS_COLORS, TASK_BOARD_COLS, PRIORITY_LABELS, PRIORITY_COLORS } from './constants'
import TaskListGroup from './TaskListGroup'
import TaskDetailDrawer from './TaskDetailDrawer'
import CreateTaskModal from './CreateTaskModal'
import CreateProjectModal from './CreateProjectModal'
import EditProjectModal from './EditProjectModal'

interface TaskNotif {
  id: string; readAt: string | null; taskId: string
  task: { id: string; parentTaskId: string | null }
}

export default function TasksPanel({ config, auth, pendingTaskId, onPendingTaskHandled }: {
  config: ApiConfig; auth: Auth; pendingTaskId?: string | null; onPendingTaskHandled?: () => void
}) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'mine' | 'todo' | 'in-progress' | 'overdue'>('mine')
  const [projects, setProjects] = useState<TaskProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'board'>('board')
  const [showProjectFilter, setShowProjectFilter] = useState(false)
  const [editProject, setEditProject] = useState<TaskProject | null>(null)
  const [taskSearchQuery, setTaskSearchQuery] = useState('')
  const [unreadByTaskId, setUnreadByTaskId] = useState<Record<string, number>>({})

  const apiFetch = useCallback(async (path: string, opts?: RequestInit) => {
    const res = await fetch(`${config.apiBase}${path}`, {
      ...opts,
      headers: { 'Authorization': `Bearer ${config.token}`, 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }, [config])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter === 'mine') params.set('assigneeId', 'me')
      if (filter === 'todo') params.set('status', 'todo')
      if (filter === 'in-progress') params.set('status', 'in-progress')
      if (filter === 'overdue') params.set('dueDate', 'overdue')
      if (selectedProjectId) params.set('projectId', selectedProjectId)
      const [taskData, projData] = await Promise.all([
        apiFetch(`/api/tasks?${params.toString()}`) as Promise<{ tasks: Task[] }>,
        apiFetch('/api/tasks/projects') as Promise<{ projects: TaskProject[] }>,
      ])
      setTasks(taskData.tasks)
      setProjects(projData.projects)

      // Fetch unread task notifications and build per-task map
      try {
        const notifData = await apiFetch('/api/tasks/notifications?unread=1') as { notifications: TaskNotif[] }
        const map: Record<string, number> = {}
        let total = 0
        for (const n of (notifData.notifications ?? [])) {
          const rootId = n.task.parentTaskId ?? n.task.id
          map[rootId] = (map[rootId] ?? 0) + 1
          total++
        }
        setUnreadByTaskId(map)
        window.dispatchEvent(new CustomEvent('bundy-task-unread-update', { detail: { count: total } }))
      } catch { /* non-fatal */ }
    } catch { /* offline */ } finally {
      setLoading(false)
    }
  }, [apiFetch, filter, selectedProjectId])

  useEffect(() => {
    load()
  }, [load])

  // Auto-refresh on SSE status updates from main process
  useEffect(() => {
    const unsub = window.electronAPI.onStatusUpdate(() => load())
    return () => unsub()
  }, [load])

  useEffect(() => {
    if (pendingTaskId) {
      setDetailTaskId(pendingTaskId)
      onPendingTaskHandled?.()
    }
  }, [pendingTaskId, onPendingTaskHandled])

  // Filter tasks by search query
  const filteredTasks = taskSearchQuery.trim()
    ? tasks.filter(t => {
        const q = taskSearchQuery.toLowerCase()
        return t.title.toLowerCase().includes(q)
          || t.project?.name?.toLowerCase().includes(q)
          || t.assignee?.alias?.toLowerCase().includes(q)
          || t.assignee?.username?.toLowerCase().includes(q)
          || t.subtasks?.some(st => st.title.toLowerCase().includes(q))
      })
    : tasks

  const grouped = viewMode === 'board' ? {} : filteredTasks.reduce<Record<string, Task[]>>((acc, t) => {
    const key = t.project?.name ?? 'No Project'
    ;(acc[key] ??= []).push(t)
    return acc
  }, {})

  const selectedProject = projects.find(p => p.id === selectedProjectId)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minHeight: 0, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding: '10px 20px', borderBottom: `1px solid ${C.separator}`,
        background: C.lgBg,
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: C.text, marginRight: 4 }}>Tasks</span>

        {/* Project filter dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowProjectFilter(!showProjectFilter)}
            style={{
              ...neu(), padding: '4px 10px', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: selectedProjectId ? C.accent : C.textMuted, fontWeight: 500,
            }}
          >
            <Filter size={11} />
            {selectedProject ? selectedProject.name : 'All Projects'}
            <ChevronRight size={10} style={{ transform: showProjectFilter ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {showProjectFilter && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
              background: C.lgBg, borderRadius: 4, boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
              border: `1px solid ${C.separator}`, minWidth: 200, padding: 6, maxHeight: 300, overflow: 'auto',
            }}>
              <button
                onClick={() => { setSelectedProjectId(''); setShowProjectFilter(false) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 6,
                  border: 'none', cursor: 'pointer', fontSize: 12, background: !selectedProjectId ? C.accentLight : 'transparent',
                  color: !selectedProjectId ? C.accent : C.text, fontWeight: !selectedProjectId ? 600 : 400,
                }}
              >All Projects</button>
              {projects.map(p => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6,
                  background: selectedProjectId === p.id ? C.accentLight : 'transparent',
                }}>
                  <button
                    onClick={() => { setSelectedProjectId(p.id); setShowProjectFilter(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, flex: 1, textAlign: 'left',
                      border: 'none', cursor: 'pointer', fontSize: 12, padding: 0, background: 'transparent',
                      color: selectedProjectId === p.id ? C.accent : C.text,
                      fontWeight: selectedProjectId === p.id ? 600 : 400,
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    {p._count?.tasks != null && <span style={{ fontSize: 10, color: C.textMuted }}>{p._count.tasks}</span>}
                  </button>
                  {auth.role === 'admin' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditProject(p); setShowProjectFilter(false) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2, flexShrink: 0, opacity: 0.5 }}
                      title="Edit project"
                    ><Edit2 size={10} /></button>
                  )}
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${C.separator}`, marginTop: 4, paddingTop: 4 }}>
                <button
                  onClick={() => { setShowCreateProject(true); setShowProjectFilter(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '7px 10px',
                    borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, color: C.accent, background: 'transparent',
                  }}
                ><FolderPlus size={12} /> New Project</button>
              </div>
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 20, background: C.separator }} />

        {(['all', 'mine', 'todo', 'in-progress', 'overdue'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 10px', borderRadius: 8, border: 'none',
            background: filter === f ? C.accent : 'transparent',
            color: filter === f ? '#fff' : C.textMuted,
            fontSize: 11, fontWeight: filter === f ? 600 : 400, cursor: 'pointer',
          }}>
            {f === 'in-progress' ? 'In Progress' : f === 'overdue' ? 'Overdue' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={12} style={{ position: 'absolute', left: 8, color: C.textMuted, pointerEvents: 'none' }} />
          <input
            value={taskSearchQuery}
            onChange={e => setTaskSearchQuery(e.target.value)}
            placeholder="Search tasks…"
            style={{
              ...neu(), padding: '4px 24px 4px 26px', border: 'none', fontSize: 11,
              color: C.text, background: C.lgBg, borderRadius: 8, width: 160, outline: 'none',
            }}
          />
          {taskSearchQuery && (
            <button
              onClick={() => setTaskSearchQuery('')}
              style={{ position: 'absolute', right: 4, background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2 }}
            ><X size={12} /></button>
          )}
        </div>

        <div style={{ display: 'flex', background: C.lgBg, borderRadius: 8, padding: 2, border: `1px solid ${C.lgBorderSide}` }}>
          <button onClick={() => setViewMode('list')} style={{
            padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: viewMode === 'list' ? C.lgBg : 'transparent',
            color: viewMode === 'list' ? C.accent : C.textMuted,
            boxShadow: viewMode === 'list' ? C.lgShadow : 'none',
          }}><LayoutList size={14} /></button>
          <button onClick={() => setViewMode('board')} style={{
            padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: viewMode === 'board' ? C.lgBg : 'transparent',
            color: viewMode === 'board' ? C.accent : C.textMuted,
            boxShadow: viewMode === 'board' ? C.lgShadow : 'none',
          }}><LayoutGrid size={14} /></button>
        </div>

        <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4 }}>
          <RefreshCw size={14} />
        </button>
        <button onClick={() => setShowCreate(true)} style={{
          padding: '5px 12px', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5,
          color: '#fff', background: C.accent, borderRadius: 8, fontSize: 12, fontWeight: 600,
          boxShadow: `0 2px 8px ${C.accent}44`,
        }}><Plus size={13} /> New Task</button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: viewMode === 'board' ? 'hidden' : 'auto', minHeight: 0, padding: viewMode === 'board' ? '16px 12px' : 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: C.textMuted, padding: 40 }}><Loader size={24} /></div>
        ) : tasks.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.textMuted, padding: 40 }}>
            <CheckSquare size={40} strokeWidth={1} style={{ opacity: 0.4, margin: '0 auto' }} />
            <div style={{ marginTop: 12, fontSize: 13 }}>No tasks found</div>
            <button onClick={() => setShowCreate(true)} style={{
              marginTop: 12, padding: '6px 14px', borderRadius: 8, border: 'none',
              background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>Create your first task</button>
          </div>
        ) : viewMode === 'board' ? (
          /* ─── Board View ─── */
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${TASK_BOARD_COLS.length}, 1fr)`, gap: 10, height: '100%' }}>
            {TASK_BOARD_COLS.map(col => {
              const colTasks = filteredTasks.filter(t => t.status === col.key)
              return (
                <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, minHeight: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px', marginBottom: 2, flexShrink: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: TASK_STATUS_COLORS[col.key] }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{col.label}</span>
                    {colTasks.length > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.accent, background: C.accentLight, borderRadius: 4, padding: '1px 6px' }}>
                        {colTasks.length}
                      </span>
                    )}
                  </div>
                  <div style={{
                    flex: 1, borderRadius: 12, padding: 6, display: 'flex', flexDirection: 'column', gap: 6,
                    border: `2px dashed ${C.separator}`,
                    background: 'transparent',
                    minHeight: 80, overflow: 'auto',
                  }}>
                    {colTasks.map(task => {
                      const unread = unreadByTaskId[task.id] ?? 0
                      return (
                        <div key={task.id}
                          onClick={() => setDetailTaskId(task.id)}
                          style={{ ...neu(), padding: '10px 12px', cursor: 'pointer', position: 'relative' }}
                        >
                          {unread > 0 && (
                            <span style={{
                              position: 'absolute', top: 6, right: 6,
                              minWidth: 16, height: 16, borderRadius: 8,
                              background: C.warning, color: '#fff', fontSize: 9, fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: '0 4px', lineHeight: 1,
                            }}>{unread > 99 ? '99+' : unread}</span>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            {task.project ? (
                              <span style={{ fontSize: 9, fontWeight: 600, color: task.project.color, background: task.project.color + '18', borderRadius: 4, padding: '1px 5px' }}>
                                {task.project.name}
                              </span>
                            ) : <span />}
                            {task.assignee && <Avatar url={task.assignee.avatarUrl} name={task.assignee.alias ?? task.assignee.username} size={20} />}
                          </div>
                          <div style={{
                            fontSize: 12, color: C.text, lineHeight: 1.4, marginBottom: 6,
                            textDecoration: task.status === 'done' ? 'line-through' : 'none',
                            opacity: task.status === 'done' ? 0.6 : 1,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                          }}>{task.title}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLORS[task.priority] ?? C.textMuted }} />
                            <span style={{ fontSize: 9, color: C.textMuted }}>{PRIORITY_LABELS[task.priority] ?? task.priority}</span>
                            {task.dueDate && (
                              <span style={{ fontSize: 9, color: new Date(task.dueDate) < new Date() && task.status !== 'done' ? C.danger : C.textMuted, marginLeft: 'auto' }}>
                                {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                            {(task._count?.subtasks ?? 0) > 0 && <span style={{ fontSize: 9, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 2 }}><GitBranch size={8} />{task._count.subtasks}</span>}
                            {(task._count?.comments ?? 0) > 0 && <span style={{ fontSize: 9, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 2 }}><MessageSquare size={8} />{task._count.comments}</span>}
                          </div>
                          {/* Progress bar for tasks with subtasks */}
                          {task.subtasks && task.subtasks.length > 0 && (() => {
                            const total = task.subtasks.length
                            const done = task.subtasks.filter(s => s.status === 'done').length
                            const pct = Math.round((done / total) * 100)
                            return (
                              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, height: 3, background: C.separator, borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? C.success : C.accent, transition: 'width 0.3s' }} />
                                </div>
                                <span style={{ fontSize: 9, color: pct === 100 ? C.success : C.textMuted, fontWeight: 600 }}>{pct}%</span>
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })}
                    {colTasks.length === 0 && (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.textMuted, opacity: 0.4, padding: 12 }}>
                        empty
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ─── List View ─── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {Object.entries(grouped).map(([groupName, groupTasks]) => (
              <TaskListGroup
                key={groupName} name={groupName} tasks={groupTasks} auth={auth}
                onOpen={id => setDetailTaskId(id)}
                unreadByTaskId={unreadByTaskId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Overlays */}
      {detailTaskId && (
        <>
          <div onClick={() => setDetailTaskId(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 48 }} />
          <TaskDetailDrawer
            taskId={detailTaskId} config={config} auth={auth} projects={projects}
            onClose={() => setDetailTaskId(null)}
            onUpdated={(updated) => {
              setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))
              load()
            }}
            onDeleted={(id) => { setTasks(prev => prev.filter(t => t.id !== id)); setDetailTaskId(null) }}
            onRefresh={load}
          />
        </>
      )}

      {showCreate && (
        <CreateTaskModal config={config} auth={auth} projects={projects}
          selectedProjectId={selectedProjectId}
          onClose={() => setShowCreate(false)}
          onCreated={(task) => { setTasks(prev => [task, ...prev]); setShowCreate(false); load() }}
        />
      )}

      {showCreateProject && (
        <CreateProjectModal config={config}
          onClose={() => setShowCreateProject(false)}
          onCreated={(proj) => { setProjects(prev => [...prev, proj]); setSelectedProjectId(proj.id); setShowCreateProject(false) }}
        />
      )}

      {editProject && (
        <EditProjectModal config={config} project={editProject}
          onClose={() => setEditProject(null)}
          onUpdated={(proj) => { setProjects(prev => prev.map(p => p.id === proj.id ? { ...p, ...proj } : p)); setEditProject(null) }}
          onDeleted={(id) => { setProjects(prev => prev.filter(p => p.id !== id)); if (selectedProjectId === id) setSelectedProjectId(''); setEditProject(null) }}
        />
      )}

      {showProjectFilter && <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowProjectFilter(false)} />}
    </div>
  )
}
