/**
 * Effective due date for a task =
 *   - if any subtasks have a dueDate → max(subtasks.dueDate)
 *   - else → task.dueDate (own value as fallback)
 *
 * Mirrors the rollup the calendar API does server-side. Used by the
 * task list rows and detail drawer so a parent's displayed deadline
 * tracks the latest subtask automatically.
 *
 * Returns the same shape as `task.dueDate` (ISO string or null) so
 * callers don't need to branch on whether the rollup applied.
 */

import type { Task } from '../../types'

export function effectiveDueDate(task: Task): string | null {
  const subDueDates = (task.subtasks ?? [])
    .map((s) => s.dueDate)
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
  if (subDueDates.length === 0) return task.dueDate ?? null
  // Compare ISO strings via Date.parse for correctness across timezone
  // suffixes (e.g. -07:00 vs Z). Cheap at the few-subtasks scale.
  const latest = subDueDates.reduce<string>((acc, cur) => (
    Date.parse(cur) > Date.parse(acc) ? cur : acc
  ), subDueDates[0])
  return latest
}

/** Whether the displayed due date came from a subtask rather than the
 *  task's own field. UI uses this to show a small "via subtask" hint. */
export function dueDateFromSubtask(task: Task): boolean {
  const own = task.dueDate
  const eff = effectiveDueDate(task)
  if (!eff) return false
  if (!own) return true
  return Date.parse(eff) !== Date.parse(own)
}
