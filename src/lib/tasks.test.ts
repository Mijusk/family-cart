import { describe, expect, it } from 'vitest'
import type { Task } from '@/types'
import { byDueDate, byPosition, dueLabel, positionBetween, recentlyDone } from './tasks'

function task(change: Partial<Task>): Task {
  return {
    id: 't',
    listId: 'l',
    title: 'Tarea',
    notes: null,
    assignees: [],
    dueDate: null,
    position: 1,
    doneAt: null,
    doneBy: null,
    createdAt: '2026-10-01T10:00:00Z',
    createdBy: null,
    updatedAt: '2026-10-01T10:00:00Z',
    updatedBy: null,
    ...change,
  }
}

describe('dueLabel', () => {
  const today = '2026-10-21'

  it('null without a date', () => {
    expect(dueLabel(task({}), today)).toBeNull()
  })

  it('near days by name, the rest with their date', () => {
    expect(dueLabel(task({ dueDate: '2026-10-21' }), today)).toEqual({ text: 'Hoy', overdue: false })
    expect(dueLabel(task({ dueDate: '2026-10-22' }), today)).toEqual({ text: 'Mañana', overdue: false })
    expect(dueLabel(task({ dueDate: '2026-10-23' }), today)).toEqual({ text: 'vie 23 oct', overdue: false })
  })

  it('overdue only while it is not done', () => {
    expect(dueLabel(task({ dueDate: '2026-10-20' }), today)).toEqual({ text: 'Ayer', overdue: true })
    expect(dueLabel(task({ dueDate: '2026-10-20', doneAt: '2026-10-21T08:00:00Z' }), today)?.overdue).toBe(false)
  })
})

describe('positionBetween', () => {
  it('between, before the first, after the last, alone', () => {
    expect(positionBetween(1, 2)).toBe(1.5)
    expect(positionBetween(undefined, 3)).toBe(2)
    expect(positionBetween(3, undefined)).toBe(4)
    expect(positionBetween(undefined, undefined)).toBe(1)
  })
})

describe('sorting', () => {
  it('manual order, ties by creation', () => {
    const a = task({ id: 'a', position: 2 })
    const b = task({ id: 'b', position: 1, createdAt: '2026-10-02T10:00:00Z' })
    const c = task({ id: 'c', position: 1, createdAt: '2026-10-01T09:00:00Z' })
    expect([a, b, c].sort(byPosition).map((t) => t.id)).toEqual(['c', 'b', 'a'])
  })

  it('by date: soonest first, undated at the end in manual order', () => {
    const list = [
      task({ id: 'none2', position: 2 }),
      task({ id: 'late', dueDate: '2026-11-01' }),
      task({ id: 'none1', position: 1 }),
      task({ id: 'soon', dueDate: '2026-10-22' }),
    ]
    expect(list.sort(byDueDate).map((t) => t.id)).toEqual(['soon', 'late', 'none1', 'none2'])
  })
})

describe('recentlyDone', () => {
  const dayOf = (iso: string) => iso.slice(0, 10)

  it('done in the last 30 days', () => {
    expect(recentlyDone(task({}), '2026-10-21', dayOf)).toBe(false)
    expect(recentlyDone(task({ doneAt: '2026-10-20T10:00:00Z' }), '2026-10-21', dayOf)).toBe(true)
    expect(recentlyDone(task({ doneAt: '2026-09-22T10:00:00Z' }), '2026-10-21', dayOf)).toBe(true)
    expect(recentlyDone(task({ doneAt: '2026-09-21T10:00:00Z' }), '2026-10-21', dayOf)).toBe(false)
  })
})
