import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { readSnapshot, saveSnapshot, whenOnline } from '@/lib/offline'
import { streakOf } from '@/lib/streak'
import { supabase } from '@/lib/supabase'
import type { IsoDate } from '@/types'
import { daysBetween, today } from '@/utils/days'
import { useGroupStore } from './group'

// The stretching streak of the signed-in person: the days they finished a routine
// (stretch_sessions) and the streak worked out from them (src/lib/streak.ts). A routine finished
// without connection waits on this device and is sent when it comes back. Also the days of the
// others in the group, for the family's streaks page (StreaksView).
// Design notes: docs/estiramientos.md §4.

interface Pending {
  routine: string
  day: IsoDate
}

const PENDING_KEY = 'stretchPending'
/** Rows the API gives at once: past them, the latest days would be missing. */
const PAGE = 1000

/** Every day these people finished a routine, oldest first. */
async function fetchDays(personIds: string[]): Promise<{ person_id: string; day: IsoDate }[]> {
  const rows: { person_id: string; day: IsoDate }[] = []
  for (;;) {
    const { data, error } = await supabase
      .from('stretch_sessions')
      .select('person_id, day')
      .in('person_id', personIds)
      .order('day')
      .order('id')
      .range(rows.length, rows.length + PAGE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

export const useStretchingStore = defineStore('stretching', () => {
  const groupStore = useGroupStore()
  const days = ref<IsoDate[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  /** The others' days, by person. */
  const familyDays = ref<Record<string, IsoDate[]>>({})
  const familyStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

  /** Finished here and not in the database yet, oldest first; also kept on the device. */
  const waiting = ref<Pending[]>(readWaiting())

  const streak = computed(() => streakOf([...days.value, ...waiting.value.map((p) => p.day)], today()))

  function readWaiting(): Pending[] {
    const user = groupStore.userId
    return user ? (readSnapshot<Pending[]>(user, PENDING_KEY) ?? []) : []
  }

  function setWaiting(list: Pending[]) {
    waiting.value = list
    if (groupStore.userId) saveSnapshot(groupStore.userId, PENDING_KEY, list)
  }

  let flushing: Promise<void> | null = null

  /** Sends what waits, in order, one run at a time; a day the database no longer takes is dropped. */
  function flush(): Promise<void> {
    flushing ??= (async () => {
      const user = groupStore.userId
      try {
        for (let p = waiting.value[0]; p; p = waiting.value[0]) {
          if (daysBetween(p.day, today()) <= 1) {
            const { error } = await supabase.rpc('log_stretch_session', { routine: p.routine, local_day: p.day })
            if (groupStore.userId !== user) return
            if (error && !/invalid stretch day/i.test(error.message)) {
              console.error('stretching', error)
              return // For the next time.
            }
            if (!error) days.value = [...days.value, p.day]
          }
          setWaiting(waiting.value.slice(1))
        }
      } finally {
        flushing = null
      }
    })()
    return flushing
  }

  let loading: Promise<void> | null = null

  /** Loads my days; quietly (keeping what is on screen) when they are already there. */
  function load(): Promise<void> {
    const me = groupStore.me?.id
    if (!me) return Promise.resolve()
    loading ??= (async () => {
      if (status.value !== 'ready') status.value = 'loading'
      try {
        await flush()
        // The group's are readable too: only mine here.
        const rows = await fetchDays([me])
        if (groupStore.me?.id !== me) return
        days.value = rows.map((r) => r.day)
        status.value = 'ready'
      } catch (e) {
        console.error('stretching', e)
        if (status.value !== 'ready') status.value = 'error'
      } finally {
        loading = null
      }
    })()
    return loading
  }

  /** Loads the days of these people (the others in the group), quietly when already there. */
  async function loadFamily(personIds: string[]) {
    if (familyStatus.value !== 'ready') familyStatus.value = 'loading'
    try {
      const byPerson: Record<string, IsoDate[]> = Object.fromEntries(personIds.map((id) => [id, []]))
      if (personIds.length) for (const r of await fetchDays(personIds)) byPerson[r.person_id]?.push(r.day)
      familyDays.value = byPerson
      familyStatus.value = 'ready'
    } catch (e) {
      console.error('stretching', e)
      if (familyStatus.value !== 'ready') familyStatus.value = 'error'
    }
  }

  /** A routine finished today: on screen at once, and in the database as soon as it can. */
  async function logSession(routine: string) {
    setWaiting([...waiting.value, { routine, day: today() }])
    await flush()
    if (waiting.value.length && !navigator.onLine) void whenOnline().then(flush)
  }

  // Another account on this device: nothing of the previous one stays.
  watch(
    () => groupStore.userId,
    () => {
      days.value = []
      waiting.value = readWaiting()
      status.value = 'idle'
      familyDays.value = {}
      familyStatus.value = 'idle'
    },
    { flush: 'sync' },
  )

  return { days, status, streak, familyDays, familyStatus, load, loadFamily, logSession }
})
