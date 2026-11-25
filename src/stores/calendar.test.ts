import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, fakeSupabase } from './testSupabase'

const fake = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof import('./testSupabase').fakeSupabase> }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, { get: (_, key) => Reflect.get(fake.current.client, key) }),
}))

import { useCalendarStore, type EventDraft } from './calendar'
import { useTasksStore } from './tasks'

const down = { error: { message: 'TypeError: Failed to fetch' } }

const eventRow = {
  id: 'e1',
  calendar_id: 'c1',
  title: 'Dentista',
  all_day: false,
  start_date: '2026-11-25',
  start_time: '10:00:00',
  end_time: '11:00:00',
  repeat: 'none',
  event_shares: [],
  event_participants: [],
}

beforeEach(() => {
  setActivePinia(createPinia())
  fake.current = fakeSupabase()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a load that fails', () => {
  it('keeps the calendar on screen when it was only a refresh', async () => {
    const { answers } = fake.current
    answers.events = { data: [eventRow] }
    const calendar = useCalendarStore()
    await calendar.load('g1')
    expect(calendar.status).toBe('ready')

    answers.events = down
    await expect(calendar.reload()).rejects.toMatchObject(down.error)
    expect(calendar.status).toBe('ready')
    expect(calendar.eventById('e1')?.title).toBe('Dentista')
  })

  it('says so when there is nothing to show yet', async () => {
    fake.current.answers.events = down
    const calendar = useCalendarStore()
    await calendar.load('g1').catch(() => {})
    expect(calendar.status).toBe('error')
  })

  it.each<[string, (c: ReturnType<typeof useCalendarStore>) => Promise<void>]>([
    ['other days', (c) => c.ensureLoaded('g1', '2031-01-01')],
    ['another group', (c) => c.load('g2')],
    ['an event that is not here', (c) => c.ensureEvent('g1', 'another')],
  ])('says so when it was for %s', async (_, action) => {
    const { answers } = fake.current
    answers.events = { data: [eventRow] }
    const calendar = useCalendarStore()
    await calendar.load('g1')
    answers.events = down
    await action(calendar).catch(() => {})
    expect(calendar.status).toBe('error')
  })

  it('keeps the tasks on screen too', async () => {
    const { answers } = fake.current
    const tasks = useTasksStore()
    await tasks.load('g1')
    answers.tasks = down
    await tasks.reload().catch(() => {})
    expect(tasks.status).toBe('ready')
    await tasks.load('g2').catch(() => {})
    expect(tasks.status).toBe('error')
  })
})

describe('saveEvent', () => {
  const draft: EventDraft = {
    calendarId: 'c1',
    title: 'Dentista',
    notes: null,
    location: null,
    allDay: false,
    startDate: '2026-11-25',
    startTime: '10:00',
    endTime: '11:00',
    repeat: 'none',
    repeatWeekdays: null,
    repeatUntil: null,
    reminderMinutes: null,
    reminderOnly: false,
  }

  it('goes on with the same event when a first try failed halfway', async () => {
    const { answers, calls } = fake.current
    const calendar = useCalendarStore()
    answers.events = { data: eventRow }
    answers.event_shares = down
    await expect(calendar.saveEvent(draft, ['g2'], ['p2'], 'e1')).rejects.toMatchObject(down.error)

    answers.event_shares = { data: [] }
    await calendar.saveEvent(draft, ['g2'], ['p2'], 'e1')
    expect(callsTo(calls, 'events', 'insert')).toHaveLength(1)
    expect(callsTo(calls, 'events', 'update')).toHaveLength(1)
    expect(calendar.eventGroups.e1).toEqual(['g2'])
    expect(calendar.participants.e1).toEqual(['p2'])
  })

  it('takes a first insert whose answer never arrived as done', async () => {
    const { answers, calls } = fake.current
    const calendar = useCalendarStore()
    answers.events = (call) =>
      call.steps.some(([m]) => m === 'insert') ? { error: { message: 'duplicate key value', code: '23505' } } : { data: eventRow }
    await calendar.saveEvent(draft, [], [], 'e1')
    expect(callsTo(calls, 'events', 'update')).toHaveLength(1)
    expect(calendar.eventById('e1')?.title).toBe('Dentista')
  })
})
