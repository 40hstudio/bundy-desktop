import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { C } from '../theme'

export type AppKind = 'focus' | 'communication' | 'distraction' | 'neutral'

export type AppCategory = {
  id: string
  name: string
  kind: AppKind
}

/**
 * Loads admin-managed app productivity categories. Cached at module level
 * so multiple panels share one fetch. Used for colouring top-app bar
 * charts (P3.14). Does NOT affect salary calculation.
 */

let cachedCategories: AppCategory[] | null = null
let inflight: Promise<AppCategory[]> | null = null

export const KIND_COLORS: Record<AppKind, string> = {
  focus: C.success,
  communication: C.accent,
  distraction: C.danger,
  neutral: C.textMuted,
}

async function fetchOnce(): Promise<AppCategory[]> {
  if (cachedCategories) return cachedCategories
  if (inflight) return inflight
  inflight = apiFetch<{ categories: AppCategory[] }>('/api/admin/app-categories')
    .then(d => { cachedCategories = d.categories; return d.categories })
    .catch(() => { cachedCategories = []; return [] })
    .finally(() => { inflight = null })
  return inflight
}

export function useAppCategories() {
  const [categories, setCategories] = useState<AppCategory[]>(cachedCategories ?? [])

  useEffect(() => {
    if (cachedCategories) return
    void fetchOnce().then(setCategories)
  }, [])

  function kindFor(appName: string | null | undefined): AppKind {
    if (!appName) return 'neutral'
    const lower = appName.toLowerCase()
    const found = categories.find(c => c.name.toLowerCase() === lower)
    return (found?.kind as AppKind) ?? 'neutral'
  }

  function colorFor(appName: string | null | undefined): string {
    return KIND_COLORS[kindFor(appName)]
  }

  return { categories, kindFor, colorFor }
}

/** Force a re-fetch (e.g. after admin edits). */
export function invalidateAppCategoriesCache(): void {
  cachedCategories = null
}
