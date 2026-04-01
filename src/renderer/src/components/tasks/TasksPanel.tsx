import { useState, useEffect, useCallback } from 'react'
import {
  Plus, RefreshCw, Loader, CheckSquare, Filter, ChevronRight,
  Layers, LayoutList, LayoutGrid, FolderPlus, Edit2, MessageSquare, GitBranch
} from 'lucide-react'
import { ApiConfig, Auth, Task, TaskProject, TaskSection } from '../../types'
import { C, neu } from '../../theme'
import Avatar from '../shared/Avatar'
import { TASK_STATUS_COLORS, TASK_BOARD_COLS, PRIORITY_LABELS, PRIORITY_COLORS } from './constants'
import TaskListGroup from './TaskListGroup'
import TaskDetailDrawer from './TaskDetailDrawer'
import CreateTaskModal from './CreateTaskModal'
import CreateProjectModal from './CreateProjectModal'
import EditProjectModal from './EditProjectModal'
import ManageSectionsModal from './ManageSectionsModal'

const DEMO_MODE = false

export default function TasksPanel({ config, auth, pendingTaskId, onPendingTaskHandled }: {
  config: ApiConfig; auth: Auth; pendingTaskId?: string | null; onPendingTaskHandled?: () => void
}) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'mine' | 'todo' | 'in-progress' | 'overdue'>('mine')
  const [projects, setProjects] = useState<TaskProject[]>([])
  const [sections, setSections] = useState<TaskSection[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [dragOverSection, setDragOverSection] = useState<string | null>(null)
  const [showProjectFilter, setShowProjectFilter] = useState(false)
  const [editProject, setEditProject] = useState<TaskProject | null>(null)
  const [showManageSections, setShowManageSections] = useState(false)

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
      if (selectedProjectId) {
        const secData = await apiFetch(`/api/tasks/sections?projectId=${selectedProjectId}`) as { sections: TaskSection[] }
        setSections(secData.sections)
      } else {
        setSections([])
      }
    } catch { /* offline */ } finally {
      setLoading(false)
    }
  }, [apiFetch, filter, selectedProjectId])

  useEffect(() => {
    if (DEMO_MODE) {
      const demoProjects: TaskProject[] = [
        { id: 'p1', name: 'Bundy Web', color: '#007acc', clientName: 'Internal', description: 'Main web application', _count: { tasks: 12 } },
        { id: 'p2', name: 'Backend API', color: '#43B581', clientName: 'Internal', description: 'REST API services', _count: { tasks: 8 } },
        { id: 'p3', name: 'Desktop App', color: '#cca700', clientName: 'Internal', description: 'Electron desktop client', _count: { tasks: 6 } },
        { id: 'p4', name: 'Mobile App', color: '#f04747', clientName: 'Client XYZ', description: 'React Native mobile app', _count: { tasks: 4 } },
      ]
      const demoSections: TaskSection[] = [
        { id: 's1', name: 'Sprint 12', order: 0, projectId: 'p1' },
        { id: 's2', name: 'Backlog', order: 1, projectId: 'p1' },
      ]
      const mkTask = (id: string, title: string, status: string, priority: string, proj: TaskProject, section: TaskSection | null, assignee: string, dueOffset: number): Task => ({
        id, title, description: null, status, priority,
        dueDate: new Date(Date.now() + dueOffset * 86_400_000).toISOString(),
        estimatedHours: Math.ceil(Math.random() * 8),
        createdBy: 'u1', projectId: proj.id, assigneeId: 'u2',
        sectionId: section?.id ?? null,
        project: { id: proj.id, name: proj.name, color: proj.color },
        section: section ? { id: section.id, name: section.name } : null,
        assignee: { id: 'u2', username: assignee, alias: assignee.split('.').map(w => w[0].toUpperCase() + w.slice(1)).join(' '), avatarUrl: null },
        _count: { comments: Math.floor(Math.random() * 6), subtasks: Math.floor(Math.random() * 4) },
      })
      setTasks([
        mkTask('t1', 'Implement dark mode toggle', 'in-progress', 'high', demoProjects[0], demoSections[0], 'john.doe', 1),
        mkTask('t2', 'Fix sidebar scroll on mobile', 'todo', 'medium', demoProjects[0], demoSections[0], 'sarah.chen', 2),
        mkTask('t3', 'Add rate limiting to auth endpoints', 'in-progress', 'urgent', demoProjects[1], null, 'alex.k', 0),
        mkTask('t4', 'Write integration tests for /api/tasks', 'todo', 'medium', demoProjects[1], null, 'john.doe', 3),
        mkTask('t5', 'Update Electron to v33', 'done', 'low', demoProjects[2], null, 'mike.t', -1),
        mkTask('t6', 'Screenshot capture optimization', 'in-progress', 'high', demoProjects[2], null, 'john.doe', 2),
        mkTask('t7', 'Design new onboarding flow', 'todo', 'medium', demoProjects[0], demoSections[1], 'lisa.m', 5),
        mkTask('t8', 'Migrate database to PostgreSQL 16', 'todo', 'high', demoProjects[1], null, 'alex.k', 7),
        mkTask('t9', 'Push notification support', 'todo', 'low', demoProjects[3], null, 'sarah.chen', 10),
        mkTask('t10', 'Fix crash on offline mode', 'done', 'urgent', demoProjects[2], null, 'john.doe', -2),
        mkTask('t11', 'Add multi-language support', 'todo', 'low', demoProjects[0], demoSections[1], 'lisa.m', 14),
        mkTask('t12', 'Optimize bundle size', 'in-progress', 'medium', demoProjects[0], demoSections[0], 'mike.t', 3),
      ])
      setProjects(demoProjects)
      setSections(demoSections)
      setLoading(false)
      return
    }
    load()
  }, [load])

  useEffect(() => {
    if (pendingTaskId) {
      setDetailTaskId(pendingTaskId)
      onPendingTaskHandled?.()
    }
  }, [pendingTaskId, onPendingTaskHandled])

  async function handleDrop(targetStatus: string) {
    if (!dragId) return
    setDragOverCol(null)
    const task = tasks.find(t => t.id === dragId)
    if (!task || task.status === targetStatus) { setDragId(null); return }
    setTasks(prev => prev.map(t => t.id === dragId ? { ...t, status: targetStatus } : t))
    setDragId(null)
    try {
      await apiFetch(`/api/tasks/${dragId}`, { method: 'PATCH', body: JSON.stringify({ status: targetStatus }) })
    } catch {
      setTasks(prev => prev.map(t => t.id === dragId ? { ...t, status: task.status } : t))
    }
  }

  async function handleSectionDrop(targetSectionName: string) {
    if (!dragId) return
    setDragOverSection(null)
    const task = tasks.find(t => t.id === dragId)
    if (!task) { setDragId(null); return }
    const targetSection = sections.find(s => s.name === targetSectionName)
    const targetSectionId = targetSection?.id ?? null
    if (task.sectionId === targetSectionId) { setDragId(null); return }
    setTasks(prev => prev.map(t => t.id === dragId ? {
      ...t, sectionId: targetSectionId,
      section: targetSection ? { id: targetSection.id, name: targetSection.name } : null,
    } : t))
    setDragId(null)
    try {
      await apiFetch(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ sectionId: targetSectionId }) })
    } catch {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, sectionId: task.sectionId, section: task.section } : t))
    }
  }

  const grouped = (() => {
    if (viewMode === 'board') return {}
    if (selectedProjectId && sections.length > 0) {
      const groups: Record<string, Task[]> = {}
      for (const sec of sections) groups[sec.name] = []
      groups['No Section'] = []
      for (const t of tasks) {
        const secName = t.section?.name ?? 'No Section'
        ;(groups[secName] ??= []).push(t)
      }
      return groups
    }
    return tasks.reduce<Record<string, Task[]>>((acc, t) => {
      const key = t.project?.name ?? 'No Project'
      ;(acc[key] ??= []).push(t)
      return acc
    }, {})
  })()

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

        {selectedProjectId && auth.role === 'admin' && (
          <button onClick={() => setShowManageSections(true)} style={{
            ...neu(), padding: '4px 10px', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11, color: C.textMuted, fontWeight: 500,
          }}><Layers size={11} /> Sections</button>
        )}

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
              const colTasks = tasks.filter(t => t.status === col.key)
              const isOver = dragOverCol === col.key
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
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOverCol(col.key) }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null) }}
                    onDrop={e => { e.preventDefault(); handleDrop(col.key) }}
                    style={{
                      flex: 1, borderRadius: 12, padding: 6, display: 'flex', flexDirection: 'column', gap: 6,
                      border: `2px ${isOver ? 'solid' : 'dashed'} ${isOver ? C.accent : C.separator}`,
                      background: isOver ? C.accentLight : 'transparent',
                      transition: 'all 0.15s ease',
                      minHeight: 80, overflow: 'auto',
                    }}
                  >
                    {colTasks.map(task => (
                      <div key={task.id} draggable
                        onDragStart={e => { setDragId(task.id); e.dataTransfer.effectAllowed = 'move' }}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => setDetailTaskId(task.id)}
                        style={{ ...neu(), padding: '10px 12px', cursor: 'pointer', opacity: dragId === task.id ? 0.4 : 1, transition: 'opacity 0.15s' }}
                      >
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
                      </div>
                    ))}
                    {colTasks.length === 0 && (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.textMuted, opacity: 0.4, padding: 12 }}>
                        {isOver ? '↩ drop here' : 'empty'}
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
                canDropSection={!!selectedProjectId && sections.length > 0}
                isDropOver={dragOverSection === groupName}
                onDragOver={() => setDragOverSection(groupName)}
                onDragLeave={() => setDragOverSection(null)}
                onDrop={() => handleSectionDrop(groupName)}
                onDragStartTask={id => setDragId(id)}
                onDragEndTask={() => setDragId(null)}
                draggingId={dragId}
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
            onUpdated={(updated) => setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))}
            onDeleted={(id) => { setTasks(prev => prev.filter(t => t.id !== id)); setDetailTaskId(null) }}
          />
        </>
      )}

      {showCreate && (
        <CreateTaskModal config={config} auth={auth} projects={projects} sections={sections}
          selectedProjectId={selectedProjectId}
          onClose={() => setShowCreate(false)}
          onCreated={(task) => { setTasks(prev => [task, ...prev]); setShowCreate(false) }}
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

      {showManageSections && selectedProjectId && (
        <ManageSectionsModal config={config} projectId={selectedProjectId}
          projectName={selectedProject?.name ?? 'Project'} sections={sections}
          onClose={() => setShowManageSections(false)}
          onUpdated={(updated) => setSections(updated)}
        />
      )}

      {showProjectFilter && <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowProjectFilter(false)} />}
    </div>
  )
}
