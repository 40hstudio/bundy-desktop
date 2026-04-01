import React from 'react'
import { Circle, Play, Check, AlertCircle } from 'lucide-react'
import { C } from '../../theme'

export const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'To Do', 'in-progress': 'In Progress', review: 'Review', done: 'Done', blocked: 'Blocked'
}

export const TASK_STATUS_COLORS: Record<string, string> = {
  todo: C.textMuted, 'in-progress': C.accent, review: '#1a8ad4', done: C.success, blocked: C.danger
}

export const TASK_STATUS_ICONS: Record<string, React.ReactNode> = {
  todo: <Circle size={13} />,
  'in-progress': <Play size={13} />,
  done: <Check size={13} />,
  cancelled: <AlertCircle size={13} />,
  blocked: <AlertCircle size={13} />,
}

export const TASK_BOARD_COLS = [
  { key: 'todo', label: 'To Do' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
  { key: 'blocked', label: 'Blocked' },
]

export const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low', none: 'None'
}

export const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#f04747', high: '#007acc', medium: '#007acc', low: '#43B581', none: '#9ca3af'
}
