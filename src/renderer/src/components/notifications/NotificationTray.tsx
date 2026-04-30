import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, MessageSquare, AtSign, CheckSquare, X, Check, Trash2, GitBranch, Activity } from 'lucide-react'
import { C } from '../../theme'
import { Avatar } from '../shared/Avatar'
import type { TaskNotificationItem } from '../../types'

export interface NotificationItem {
  id: string
  type: 'message' | 'mention' | 'thread-reply'
  title: string
  body: string
  channelId: string
  channelName?: string
  channelType?: 'dm' | 'group' | 'channel'
  senderAvatar?: string | null
  timestamp: string
  read: boolean
}

interface TaskNotifDisplay {
  id: string
  type: 'task-assigned' | 'task-status' | 'task-discussion' | 'task-mention' | 'task-subtask'
  title: string
  body: string
  taskId: string
  timestamp: string
  read: boolean
}

type AnyNotif = NotificationItem | TaskNotifDisplay

type FilterTab = 'all' | 'mentions' | 'messages' | 'tasks'

function isTaskNotif(n: AnyNotif): n is TaskNotifDisplay {
  return n.type.startsWith('task-')
}

function toTaskDisplay(n: TaskNotificationItem): TaskNotifDisplay {
  const typeMap: Record<string, TaskNotifDisplay['type']> = {
    assigned: 'task-assigned',
    discussion: 'task-discussion',
    status_change: 'task-status',
    mentioned: 'task-mention',
    subtask_update: 'task-subtask',
  }
  const projectLabel = n.task.project ? ` · ${n.task.project.name}` : ''
  return {
    id: n.id,
    type: typeMap[n.type] ?? 'task-discussion',
    title: n.task.title + projectLabel,
    body: n.message,
    taskId: n.task.parentTaskId ?? n.taskId,
    timestamp: n.createdAt,
    read: !!n.readAt,
  }
}

export default function NotificationTray() {
  const [open, setOpen] = useState(false)
  const [msgItems, setMsgItems] = useState<NotificationItem[]>([])
  const [taskItems, setTaskItems] = useState<TaskNotifDisplay[]>([])
  const [filter, setFilter] = useState<FilterTab>('all')
  const [hovered, setHovered] = useState(false)
  const [apiConfig, setApiConfig] = useState<{ apiBase: string; token: string } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Fetch api config once
  useEffect(() => {
    window.electronAPI.getApiConfig().then(setApiConfig).catch(() => {})
  }, [])

  const fetchTaskNotifs = useCallback(async () => {
    if (!apiConfig) return
    try {
      const res = await fetch(`${apiConfig.apiBase}/api/tasks/notifications`, {
        headers: { Authorization: `Bearer ${apiConfig.token}` },
      })
      if (!res.ok) return
      const data = await res.json() as { notifications: TaskNotificationItem[] }
      setTaskItems((data.notifications ?? []).map(toTaskDisplay))
    } catch { /* offline */ }
  }, [apiConfig])

  // Initial fetch + re-fetch on SSE updates
  useEffect(() => {
    fetchTaskNotifs()
    const unsub = window.electronAPI.onStatusUpdate(() => fetchTaskNotifs())
    return () => unsub()
  }, [fetchTaskNotifs])

  // Listen for message notifications from MessagesPanel
  useEffect(() => {
    function onNotification(e: Event) {
      const detail = (e as CustomEvent<NotificationItem>).detail
      setMsgItems(prev => {
        if (prev.some(n => n.id === detail.id)) return prev
        return [detail, ...prev].slice(0, 100)
      })
    }
    window.addEventListener('bundy-notification', onNotification)
    return () => window.removeEventListener('bundy-notification', onNotification)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Refresh task notifs when panel opens
  useEffect(() => {
    if (open) fetchTaskNotifs()
  }, [open, fetchTaskNotifs])

  const allItems: AnyNotif[] = [
    ...msgItems,
    ...taskItems,
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const unreadMsgCount = msgItems.filter(n => !n.read).length
  const mentionCount = msgItems.filter(n => n.type === 'mention' && !n.read).length
  const unreadTaskCount = taskItems.filter(n => !n.read).length
  const unreadCount = unreadMsgCount + unreadTaskCount

  const filtered = allItems.filter(n => {
    if (filter === 'mentions') return n.type === 'mention'
    if (filter === 'messages') return n.type === 'message' || n.type === 'thread-reply'
    if (filter === 'tasks') return isTaskNotif(n)
    return true
  })

  const markAllRead = useCallback(() => {
    setMsgItems(prev => prev.map(n => ({ ...n, read: true })))
    if (!apiConfig) return
    const unreadIds = taskItems.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length === 0) return
    fetch(`${apiConfig.apiBase}/api/tasks/notifications`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiConfig.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unreadIds }),
    }).then(() => setTaskItems(prev => prev.map(n => ({ ...n, read: true })))).catch(() => {})
  }, [apiConfig, taskItems])

  const markMsgRead = useCallback((id: string) => {
    setMsgItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }, [])

  const markTaskRead = useCallback((id: string) => {
    if (!apiConfig) return
    fetch(`${apiConfig.apiBase}/api/tasks/notifications`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiConfig.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    }).catch(() => {})
    setTaskItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }, [apiConfig])

  const clearAll = useCallback(() => {
    setMsgItems([])
    setTaskItems([])
  }, [])

  const handleMsgClick = useCallback((item: NotificationItem) => {
    markMsgRead(item.id)
    window.dispatchEvent(new CustomEvent('bundy-open-channel', { detail: { channelId: item.channelId } }))
    setOpen(false)
  }, [markMsgRead])

  const handleTaskClick = useCallback((item: TaskNotifDisplay) => {
    markTaskRead(item.id)
    // discussion / mention / subtask notifications take the user to the
    // discussion tab; assigned / status take them to the details tab.
    const focusDiscussion =
      item.type === 'task-discussion' ||
      item.type === 'task-mention' ||
      item.type === 'task-subtask'
    window.dispatchEvent(new CustomEvent('bundy-open-task', {
      detail: { taskId: item.taskId, focusDiscussion },
    }))
    setOpen(false)
  }, [markTaskRead])

  function timeAgo(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    const days = Math.floor(hrs / 24)
    return `${days}d`
  }

  const iconForType = (type: AnyNotif['type']) => {
    switch (type) {
      case 'mention': return <AtSign size={14} color={C.warning} />
      case 'thread-reply': return <MessageSquare size={14} color={C.accent} />
      case 'task-assigned': return <CheckSquare size={14} color={C.accent} />
      case 'task-status': return <Activity size={14} color={C.success} />
      case 'task-discussion': return <MessageSquare size={14} color={C.warning} />
      case 'task-mention': return <AtSign size={14} color={C.warning} />
      case 'task-subtask': return <GitBranch size={14} color={C.textMuted} />
      default: return <MessageSquare size={14} color={C.textMuted} />
    }
  }

  const TABS: { id: FilterTab; label: string; badge?: number }[] = [
    { id: 'all', label: 'All', badge: unreadCount },
    { id: 'mentions', label: 'Mentions', badge: mentionCount },
    { id: 'messages', label: 'Messages', badge: unreadMsgCount },
    { id: 'tasks', label: 'Tasks', badge: unreadTaskCount },
  ]

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 32, height: 32, borderRadius: 8, border: 'none',
          background: open ? C.bgActive : hovered ? C.bgHover : 'transparent',
          color: open ? C.text : C.textMuted,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', transition: 'all 0.15s ease',
        }}
      >
        <Bell size={18} strokeWidth={open ? 2 : 1.5} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, borderRadius: 8,
            background: mentionCount > 0 ? C.warning : C.danger,
            color: '#fff', fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', lineHeight: 1,
            border: `2px solid ${C.bgTertiary}`,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 38, right: 0,
          width: 380, maxHeight: 520,
          background: C.bgFloating,
          border: `1px solid ${C.separator}`,
          borderRadius: 12,
          boxShadow: C.shadowModal,
          display: 'flex', flexDirection: 'column',
          zIndex: 9999, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text, flex: 1 }}>Inbox</span>
            <button onClick={markAllRead} title="Mark all as read"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.textMuted, display: 'flex', alignItems: 'center', borderRadius: 4 }}>
              <Check size={16} />
            </button>
            <button onClick={clearAll} title="Clear all"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.textMuted, display: 'flex', alignItems: 'center', borderRadius: 4 }}>
              <Trash2 size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, padding: '10px 16px 0', borderBottom: `1px solid ${C.separator}` }}>
            {TABS.map(t => {
              const active = filter === t.id
              return (
                <button key={t.id} onClick={() => setFilter(t.id)} style={{
                  padding: '8px 14px', border: 'none', cursor: 'pointer',
                  background: 'transparent',
                  color: active ? C.accent : C.textMuted,
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  borderBottom: `2px solid ${active ? C.accent : 'transparent'}`,
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.15s ease',
                }}>
                  {t.label}
                  {(t.badge ?? 0) > 0 && (
                    <span style={{
                      minWidth: 18, height: 18, borderRadius: 9,
                      background: active ? C.accent : C.fillTertiary,
                      color: active ? '#fff' : C.textMuted,
                      fontSize: 10, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 5px',
                    }}>{t.badge}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Notification list */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
                <Bell size={28} strokeWidth={1} style={{ marginBottom: 8, opacity: 0.4 }} />
                <div>No notifications yet</div>
              </div>
            ) : (
              filtered.map(item => (
                <NotifRow
                  key={item.id}
                  item={item}
                  onClick={() => isTaskNotif(item) ? handleTaskClick(item) : handleMsgClick(item as NotificationItem)}
                  iconForType={iconForType}
                  timeAgo={timeAgo}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NotifRow({ item, onClick, iconForType, timeAgo }: {
  item: AnyNotif
  onClick: () => void
  iconForType: (type: AnyNotif['type']) => React.ReactNode
  timeAgo: (ts: string) => string
}) {
  const [hovered, setHovered] = useState(false)

  const isTask = isTaskNotif(item)
  const subtitle = isTask
    ? item.body
    : (item as NotificationItem).channelName
      ? (item as NotificationItem).channelType === 'dm'
        ? 'Direct Message'
        : `${(item as NotificationItem).channelName} — ${(item as NotificationItem).channelType === 'group' ? 'Group' : 'Channel'}`
      : ''

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 16px',
        background: hovered ? C.bgHover : 'transparent',
        cursor: 'pointer',
        display: 'flex', gap: 10, alignItems: 'flex-start',
        borderBottom: `1px solid ${C.separator}`,
        transition: 'background 0.1s ease',
      }}
    >
      {/* Unread dot */}
      <div style={{
        width: 8, minWidth: 8, height: 8, borderRadius: '50%',
        background: item.read ? 'transparent' : C.accent,
        marginTop: 6, flexShrink: 0,
      }} />

      {/* Icon */}
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: C.bgInput,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {iconForType(item.type)}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {subtitle && (
          <div style={{
            fontSize: 11, color: C.accent, fontWeight: 600, marginBottom: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{subtitle}</div>
        )}
        <div style={{
          fontSize: 13, color: item.read ? C.textMuted : C.text, fontWeight: item.read ? 400 : 500,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          wordBreak: 'break-word', lineHeight: 1.4,
        }}>
          {item.title}
        </div>
        {!isTask && (item as NotificationItem).body && (
          <div style={{
            fontSize: 12, color: C.textMuted, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {(item as NotificationItem).body}
          </div>
        )}
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
          {timeAgo(item.timestamp)}
        </div>
      </div>
    </div>
  )
}
