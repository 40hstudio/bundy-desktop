import React, { useState, useEffect } from 'react'
import { CheckSquare, ExternalLink } from 'lucide-react'
import { C } from '../../theme'
import type { ApiConfig } from '../../types'

interface TaskMeta {
  title: string
  projectName: string | null
  projectColor: string | null
  status: string
}

const taskMetaCache = new Map<string, TaskMeta | null>()

export function TaskLinkCard({ taskId, config }: { taskId: string; config: ApiConfig }) {
  const [meta, setMeta] = useState<TaskMeta | null | undefined>(
    taskMetaCache.has(taskId) ? taskMetaCache.get(taskId) : undefined
  )

  useEffect(() => {
    if (taskMetaCache.has(taskId)) return
    fetch(`${config.apiBase}/api/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(6000),
    })
      .then(r => r.json())
      .then((d: { task?: { title: string; status: string; project?: { name: string; color: string } | null } }) => {
        if (!d.task) { taskMetaCache.set(taskId, null); setMeta(null); return }
        const m: TaskMeta = {
          title: d.task.title,
          projectName: d.task.project?.name ?? null,
          projectColor: d.task.project?.color ?? null,
          status: d.task.status,
        }
        taskMetaCache.set(taskId, m)
        setMeta(m)
      })
      .catch(() => { taskMetaCache.set(taskId, null); setMeta(null) })
  }, [taskId, config])

  const title = meta?.title ?? 'Open Task'
  const subtitle = meta?.projectName ?? 'Task'
  const accentColor = meta?.projectColor ?? C.success

  return (
    <div
      onClick={() => window.dispatchEvent(new CustomEvent('bundy-open-task', { detail: { taskId } }))}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
        borderRadius: 8, border: `1px solid ${C.separator}`,
        background: `${accentColor}08`, cursor: 'pointer', maxWidth: 360,
        marginTop: 4, marginBottom: 2, transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${accentColor}15` }}
      onMouseLeave={e => { e.currentTarget.style.background = `${accentColor}08` }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: `${accentColor}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <CheckSquare size={18} color={accentColor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: C.accent, lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subtitle}{meta?.status ? ` · ${meta.status.charAt(0) + meta.status.slice(1).toLowerCase().replace(/_/g, ' ')}` : ''}
        </div>
      </div>
      <ExternalLink size={14} color={C.textMuted} style={{ flexShrink: 0 }} />
    </div>
  )
}
