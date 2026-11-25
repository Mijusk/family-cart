import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Person } from '@/types'
import { addDays } from '@/utils/days'
import { callsTo, fakeSupabase } from './testSupabase'

const fake = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof import('./testSupabase').fakeSupabase> }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, { get: (_, key) => Reflect.get(fake.current.client, key) }),
}))

import { useGroupStore } from './group'
import { useStretchingStore } from './stretching'

const down = { error: { message: 'TypeError: Failed to fetch' } }
const TODAY = '2026-11-25'

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(`${TODAY}T10:00:00`) })
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
  })
  vi.stubGlobal('navigator', { onLine: true })
  setActivePinia(createPinia())
  fake.current = fakeSupabase()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const group = useGroupStore()
  group.userId = 'u1'
  group.me = { id: 'p1' } as Person
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const sent = () => callsTo(fake.current.calls, 'log_stretch_session').map((c) => c.steps[0]![1][0])

describe('the streak', () => {
  it('counts more days than the API gives at once', async () => {
    const days = Array.from({ length: 1500 }, (_, i) => ({ person_id: 'p1', day: addDays(TODAY, i - 1499) }))
    fake.current.answers.stretch_sessions = (call) => {
      const [from, to] = call.steps.find(([m]) => m === 'range')![1] as [number, number]
      return { data: days.slice(from, to + 1) }
    }
    const stretching = useStretchingStore()
    await stretching.load()
    expect(stretching.streak.current).toBe(1500)
    await stretching.loadFamily(['p1'])
    expect(stretching.familyDays.p1).toHaveLength(1500)
  })
})

describe('a routine finished without connection', () => {
  it('counts at once and is sent once, also asked for twice at the same time', async () => {
    const { answers } = fake.current
    answers.log_stretch_session = down
    const stretching = useStretchingStore()
    const logged = stretching.logSession('wake')
    expect(stretching.streak.doneToday).toBe(true)
    await logged
    expect(sent()).toHaveLength(1)

    answers.log_stretch_session = {}
    fake.current.calls.length = 0
    await Promise.all([stretching.load(), stretching.logSession('work')])
    expect(sent().map((a) => (a as { routine: string }).routine)).toEqual(['wake', 'work'])
  })

  it('is sent also when there was nothing to send before', async () => {
    const stretching = useStretchingStore()
    await stretching.load()
    await stretching.logSession('wake')
    expect(sent()).toHaveLength(1)
  })

  it('waits on the device for the next time the app opens', async () => {
    fake.current.answers.log_stretch_session = down
    await useStretchingStore().logSession('wake')

    const { userId, me } = useGroupStore()
    setActivePinia(createPinia())
    useGroupStore().userId = userId
    useGroupStore().me = me
    fake.current.answers.log_stretch_session = {}
    fake.current.calls.length = 0
    await useStretchingStore().load()
    expect(sent()).toEqual([{ routine: 'wake', local_day: TODAY }])
  })

  it('is dropped when the database no longer takes that day', async () => {
    fake.current.answers.log_stretch_session = { error: { message: 'invalid stretch day' } }
    const stretching = useStretchingStore()
    await stretching.logSession('wake')
    fake.current.calls.length = 0
    await stretching.load()
    expect(sent()).toHaveLength(0)
  })
})
