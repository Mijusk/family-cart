import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, fakeSupabase } from './testSupabase'

const fake = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof import('./testSupabase').fakeSupabase> }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, { get: (_, key) => Reflect.get(fake.current.client, key) }),
}))

import { useListStore } from './list'
import { useToastStore } from './toast'

const down = { error: { message: 'TypeError: Failed to fetch' } }

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('window', { isSecureContext: true })
  setActivePinia(createPinia())
  fake.current = fakeSupabase()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function openList() {
  const list = useListStore()
  await list.load('g1')
  return list
}

describe('writes on a weak signal', () => {
  it('keep trying until they reach the server, in order', async () => {
    const list = await openList()
    const { answers, calls } = fake.current
    answers.items = down
    const leche = list.addItem({ name: 'leche', folderId: null, quantity: 1 })
    list.addItem({ name: 'pan', folderId: null, quantity: 1 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(list.pendingWrites).toBe(2)
    expect(list.unreachable).toBe(true)
    expect(list.pendingItems.map((i) => i.name)).toContain('Leche')

    answers.items = {}
    const before = calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(list.pendingWrites).toBe(0)
    expect(list.unreachable).toBe(false)
    const sent = callsTo(calls.slice(before), 'items', 'insert')
    expect(sent).toHaveLength(2)
    expect(sent[0]!.steps[0]![1][0]).toMatchObject({ id: leche.id, name: 'Leche' })
  })

  it('also when the server is down for a moment', async () => {
    const list = await openList()
    const { answers, calls } = fake.current
    answers.items = { error: { message: 'Bad gateway' }, status: 502 }
    list.addItem({ name: 'leche', folderId: null, quantity: 1 })
    await vi.advanceTimersByTimeAsync(4_000)
    answers.items = {}
    await vi.advanceTimersByTimeAsync(10_000)
    expect(list.pendingWrites).toBe(0)
    expect(callsTo(calls, 'items', 'insert').length).toBeGreaterThan(1)
  })

  it('take a row that is already there as saved, after a first try', async () => {
    const list = await openList()
    const { answers } = fake.current
    answers.items = down
    list.addItem({ name: 'leche', folderId: null, quantity: 1 })
    await vi.advanceTimersByTimeAsync(1_000)
    answers.items = { error: { message: 'duplicate key value violates unique constraint "items_pkey"' } }
    await vi.advanceTimersByTimeAsync(3_000)
    expect(list.pendingWrites).toBe(0)
    expect(list.pendingItems.map((i) => i.name)).toEqual(['Leche'])
    expect(useToastStore().current?.message).toBe('Añadido: Leche')
  })

  it('that the server turns down are told and undone', async () => {
    const list = await openList()
    const { answers } = fake.current
    answers.items = (call) =>
      call.steps.some(([m]) => m === 'insert') ? { error: { message: 'permission denied' }, status: 403 } : {}
    list.addItem({ name: 'leche', folderId: null, quantity: 1 })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(list.pendingWrites).toBe(0)
    expect(list.pendingItems).toHaveLength(0)
    expect(useToastStore().current?.message).toMatch(/se ha deshecho/)
  })

  it('are dropped on signing out', async () => {
    const list = await openList()
    const { answers, calls } = fake.current
    answers.items = down
    list.addItem({ name: 'leche', folderId: null, quantity: 1 })
    await vi.advanceTimersByTimeAsync(1_000)
    list.dropWrites()
    answers.items = {}
    const before = calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls.slice(before)).toHaveLength(0)
    expect(list.pendingWrites).toBe(0)
  })
})

describe('the catalog', () => {
  it("has a new product once when the server's row arrives", async () => {
    const list = await openList()
    list.addItem({ name: 'Plátanos', folderId: null, quantity: 1 })
    expect(list.suggest('plat', null)).toHaveLength(1)
    fake.current.emit('products', {
      eventType: 'INSERT',
      new: { id: 'server-id', group_id: 'g1', normalized_name: 'platanos', display_name: 'Plátanos', last_quantity: 1, times_used: 1 },
    })
    expect(list.suggest('plat', null).map((s) => s.product.id)).toEqual(['server-id'])
  })
})
