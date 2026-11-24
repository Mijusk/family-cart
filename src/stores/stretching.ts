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

export const useStretchingStore = defineStore('stretching', () => {
  const groupStore = useGroupStore()
  const days = ref<IsoDate[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  /** The others' days, by person. */
  const familyDays = ref<Record<string, IsoDate[]>>({})
  const familyStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const streak = computed(() => streakOf([...days.value, ...pending().map((p) => p.day)], today()))

  function pending(): Pending[] {
    void days.value // Recomputed whenever the days change (a pending one sent or added).
    const user = groupStore.userId
    return user ? (readSnapshot<Pending[]>(user, PENDING_KEY) ?? []) : []
  }

  function setPending(list: Pending[]) {
    const user = groupStore.userId
    if (user) saveSnapshot(user, PENDING_KEY, list)
  }

  async function send(p: Pending): Promise<boolean> {
    const { error } = await supabase.rpc('log_stretch_session', { routine: p.routine, local_day: p.day })
    if (error) console.error('stretching', error)
    return !error
  }

  /** Sends what waits on this device; a day the database no longer takes is dropped. */
  async function flush() {
    const waiting = pending()
    if (!waiting.length) return
    const left: Pending[] = []
    for (const p of waiting) {
      if (daysBetween(p.day, today()) > 1) continue // Too old: the database no longer takes it.
      if (await send(p)) days.value = [...days.value, p.day]
      else left.push(p)
    }
    setPending(left)
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
        const { data, error } = await supabase.from('stretch_sessions').select('day').eq('person_id', me).order('day')
        if (error) throw error
        days.value = data.map((r) => r.day)
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
      if (personIds.length) {
        const { data, error } = await supabase.from('stretch_sessions').select('person_id, day').in('person_id', personIds)
        if (error) throw error
        for (const r of data) byPerson[r.person_id]?.push(r.day)
      }
      familyDays.value = byPerson
      familyStatus.value = 'ready'
    } catch (e) {
      console.error('stretching', e)
      if (familyStatus.value !== 'ready') familyStatus.value = 'error'
    }
  }

  /** A routine finished today: on screen at once, and in the database as soon as it can. */
  async function logSession(routine: string) {
    const p: Pending = { routine, day: today() }
    if (await send(p)) {
      days.value = [...days.value, p.day]
      return
    }
    setPending([...pending(), p])
    days.value = [...days.value] // The streak counts it already.
    void whenOnline().then(flush)
  }

  // Another account on this device: nothing of the previous one stays.
  watch(
    () => groupStore.userId,
    () => {
      days.value = []
      status.value = 'idle'
      familyDays.value = {}
      familyStatus.value = 'idle'
    },
  )

  return { days, status, streak, familyDays, familyStatus, load, loadFamily, logSession }
})
