import { useCallback, useEffect, useState } from 'react'

/**
 * Persisted "saved view" filter combinations for the Tasks panel.
 * Stored in localStorage under a versioned key. Keep the schema small —
 * the renderer is the source of truth; nothing on the server cares.
 */

export type TaskFilterView = {
  id: string
  name: string
  filter: 'all' | 'mine' | 'todo' | 'in-progress' | 'overdue'
  projectId: string  // empty string = all projects
  search: string     // empty string = no search
}

const STORAGE_KEY = 'bundy.tasks.savedViews.v1'

function readStorage(): TaskFilterView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStorage(views: TaskFilterView[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views))
  } catch { /* quota / disabled */ }
}

export function useSavedFilterViews() {
  const [views, setViews] = useState<TaskFilterView[]>(() => readStorage())

  // Sync across multiple windows of the same app (popup + full dashboard).
  useEffect(() => {
    function onStorage(e: StorageEvent): void {
      if (e.key === STORAGE_KEY) setViews(readStorage())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const saveView = useCallback((view: Omit<TaskFilterView, 'id'>): TaskFilterView => {
    const id = `view-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const entry: TaskFilterView = { ...view, id }
    const next = [...readStorage(), entry]
    writeStorage(next)
    setViews(next)
    return entry
  }, [])

  const deleteView = useCallback((id: string): void => {
    const next = readStorage().filter(v => v.id !== id)
    writeStorage(next)
    setViews(next)
  }, [])

  const renameView = useCallback((id: string, name: string): void => {
    const next = readStorage().map(v => v.id === id ? { ...v, name } : v)
    writeStorage(next)
    setViews(next)
  }, [])

  return { views, saveView, deleteView, renameView }
}
