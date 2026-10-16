import type { IsoDate, Task } from '@/types'
import { addDays, daysBetween, weekdayShortDay } from '@/utils/days'

// Pure helpers for the tasks screens: the date tag, manual order and what counts as recently done.

/** Done tasks stay in view this long. */
export const DONE_VISIBLE_DAYS = 30

/** "Hoy", "Mañana", "Ayer" or "jue 23 oct"; overdue when the day has passed and it isn't done. */
export function dueLabel(task: Pick<Task, 'dueDate' | 'doneAt'>, today: IsoDate): { text: string; overdue: boolean } | null {
  if (!task.dueDate) return null
  const diff = daysBetween(today, task.dueDate)
  const text = diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : diff === -1 ? 'Ayer' : weekdayShortDay(task.dueDate)
  return { text, overdue: diff < 0 && !task.doneAt }
}

/** A position between two neighbours (either may be missing), so moving a task is one update. */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 1
  if (before === undefined) return after! - 1
  if (after === undefined) return before + 1
  return (before + after) / 2
}

/** Pending tasks in manual order. */
export function byPosition(a: Task, b: Task): number {
  return a.position - b.position || a.createdAt.localeCompare(b.createdAt)
}

/** "Ordenar por fecha": dated first, soonest first; undated keep their manual order at the end. */
export function byDueDate(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate.localeCompare(b.dueDate)
  }
  return byPosition(a, b)
}

/** Ticked in the last DONE_VISIBLE_DAYS days (counted in the group's days). */
export function recentlyDone(task: Task, today: IsoDate, dayOf: (iso: string) => IsoDate): boolean {
  return !!task.doneAt && dayOf(task.doneAt) > addDays(today, -DONE_VISIBLE_DAYS)
}
