import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { RealtimeChannel, RealtimeSystemPayload } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  fromEvent,
  fromOverrides,
  toBusyEvent,
  toCalendar,
  toCalendarShare,
  toEvent,
  toException,
  toHistoryEntry,
  toPerson,
} from '@/lib/mappers'
import { crossesMidnight, occurrencesBetween } from '@/lib/recurrence'
import type {
  BusyEvent,
  Calendar,
  CalendarEvent,
  CalendarShare,
  EventException,
  EventOverrides,
  HistoryEntry,
  IsoDate,
  Occurrence,
  Person,
  ShareLevel,
  TrashItem,
} from '@/types'
import { useGroupStore } from './group'

const REALTIME_TABLES = ['calendars', 'calendar_shares', 'events', 'event_exceptions', 'event_shares', 'event_participants']

/** What the event form saves; the rest of an event is set by the database. */
export type EventDraft = Pick<
  CalendarEvent,
  | 'calendarId'
  | 'title'
  | 'notes'
  | 'location'
  | 'allDay'
  | 'startDate'
  | 'startTime'
  | 'endTime'
  | 'repeat'
  | 'repeatWeekdays'
  | 'repeatUntil'
  | 'reminderMinutes'
>

/**
 * Everything of the calendar the signed-in person can see, plus the busy slots of the current
 * group. A family has few events, so it is all loaded at once and repetitions are expanded here.
 */
export const useCalendarStore = defineStore('calendar', () => {
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const calendars = ref<Calendar[]>([])
  const shares = ref<CalendarShare[]>([])
  const events = ref<CalendarEvent[]>([])
  const exceptions = ref<EventException[]>([])
  /** Extra groups per event. */
  const eventGroups = ref<Record<string, string[]>>({})
  /** Participants per event (person ids). */
  const participants = ref<Record<string, string[]>>({})
  /** Owner and folder color of every visible event, even when its folder is private. */
  const owners = ref<Record<string, { ownerId: string; color: string }>>({})
  const editableIds = ref<Set<string>>(new Set())
  const busyEvents = ref<BusyEvent[]>([])
  /** People named anywhere in the calendar (owners, participants, authors). */
  const people = ref<Record<string, Person>>({})
  /** Group whose busy slots are loaded; answers for another group are discarded. */
  let loadedGroupId: string | null = null
  /** Every load gets a number; only the latest one is applied. */
  let loadSeq = 0

  const editableCalendars = computed(() =>
    calendars.value.filter((c) => editableIds.value.has(c.id)).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
  )

  function eventById(id: string): CalendarEvent | undefined {
    return events.value.find((e) => e.id === id)
  }

  function calendarById(id: string): Calendar | undefined {
    return calendars.value.find((c) => c.id === id)
  }

  function canEdit(event: CalendarEvent): boolean {
    return editableIds.value.has(event.calendarId)
  }

  function exceptionsOf(eventId: string): EventException[] {
    return exceptions.value.filter((x) => x.eventId === eventId)
  }

  /** A person's name; the signed-in person shows as `self` ("Tú", "ti"…), or their name if null. */
  function personName(id: string | null, self: string | null = 'Tú'): string {
    if (!id) return 'Alguien'
    const me = useGroupStore().me
    if (id === me?.id) return self ?? me.displayName
    return people.value[id]?.displayName ?? 'Alguien'
  }

  // ── Loading ────────────────────────────────────────────────

  async function load(groupId: string) {
    loadedGroupId = groupId
    const seq = ++loadSeq
    subscribe(groupId)
    if (status.value !== 'ready') status.value = 'loading'
    try {
      const [cals, shareRows, eventRows, exceptionRows, eventShareRows, participantRows, editable, busy] = await Promise.all([
        supabase.from('calendars').select().is('deleted_at', null),
        supabase.from('calendar_shares').select(),
        supabase.from('events').select().is('deleted_at', null),
        supabase.from('event_exceptions').select('event_id, occurrence_date, status, overrides'),
        supabase.from('event_shares').select('event_id, group_id'),
        supabase.from('event_participants').select(),
        supabase.rpc('editable_calendar_ids'),
        supabase.rpc('busy_events', { gid: groupId }),
      ])
      for (const res of [cals, shareRows, eventRows, exceptionRows, eventShareRows, participantRows, editable, busy]) {
        if (res.error) throw res.error
      }
      const loadedEvents = eventRows.data!.map(toEvent)
      const ownerRows = loadedEvents.length
        ? await supabase.rpc('event_owners', { event_ids: loadedEvents.map((e) => e.id) })
        : { data: [], error: null }
      if (ownerRows.error) throw ownerRows.error
      if (groupId !== loadedGroupId || seq !== loadSeq) return

      calendars.value = cals.data!.map(toCalendar)
      shares.value = shareRows.data!.map(toCalendarShare)
      events.value = loadedEvents
      exceptions.value = exceptionRows.data!.map(toException)
      eventGroups.value = groupBy(eventShareRows.data!, (r) => r.event_id, (r) => r.group_id)
      participants.value = groupBy(participantRows.data!, (r) => r.event_id, (r) => r.person_id)
      owners.value = Object.fromEntries(ownerRows.data!.map((r) => [r.event_id, { ownerId: r.owner_id, color: r.color }]))
      editableIds.value = new Set(editable.data!)
      busyEvents.value = busy.data!.map(toBusyEvent)
      await loadPeople()
      status.value = 'ready'
    } catch (e) {
      console.error(e)
      if (groupId === loadedGroupId && seq === loadSeq) status.value = 'error'
      throw e
    }
  }

  function reload() {
    return loadedGroupId ? load(loadedGroupId) : Promise.resolve()
  }

  /**
   * For the views: loads only if this group isn't loaded or loading yet, or the last load failed.
   * Realtime keeps it fresh after that, so moving between Hoy, Semana and Mes costs nothing.
   */
  function ensureLoaded(groupId: string): Promise<void> {
    if (groupId === loadedGroupId && (status.value === 'ready' || status.value === 'loading')) return Promise.resolve()
    return load(groupId)
  }

  /** Names for everyone the calendar mentions who isn't loaded yet. */
  async function loadPeople(extra: (string | null)[] = []) {
    const ids = new Set<string>()
    for (const o of Object.values(owners.value)) ids.add(o.ownerId)
    for (const c of calendars.value) ids.add(c.ownerId)
    for (const list of Object.values(participants.value)) list.forEach((id) => ids.add(id))
    for (const b of busyEvents.value) ids.add(b.ownerId)
    for (const e of events.value) {
      if (e.createdBy) ids.add(e.createdBy)
      if (e.updatedBy) ids.add(e.updatedBy)
    }
    extra.forEach((id) => id && ids.add(id))
    const missing = [...ids].filter((id) => !people.value[id])
    if (!missing.length) return
    // People who share no group with me any more are not visible; they show as "Alguien".
    const { data, error } = await supabase.from('people').select().in('id', missing)
    if (error) throw error
    for (const row of data) people.value[row.id] = toPerson(row)
  }

  // ── Occurrences ────────────────────────────────────────────

  /** Everything visible that starts on `day` or runs into it from the night before. */
  function occurrencesOn(day: IsoDate): Occurrence[] {
    const result: Occurrence[] = []
    for (const event of events.value) {
      const owner = owners.value[event.id]
      if (!owner) continue
      for (const o of occurrencesBetween(event, exceptionsOf(event.id), day, day)) {
        const shown = { ...event, ...o.overrides }
        result.push({
          key: `${event.id}:${o.seriesDate}`,
          eventId: event.id,
          ownerId: owner.ownerId,
          color: owner.color,
          title: shown.title,
          location: shown.location,
          busy: false,
          seriesDate: o.seriesDate,
          date: o.date,
          allDay: shown.allDay,
          startTime: shown.startTime,
          endTime: shown.endTime,
          crossesMidnight: crossesMidnight(shown),
          repeating: event.repeat !== 'none',
          modified: o.modified,
        })
      }
    }
    for (const busy of busyEvents.value) {
      for (const o of occurrencesBetween(busy, busy.exceptions, day, day)) {
        const shown = { ...busy, ...o.overrides }
        result.push({
          key: `${busy.id}:${o.seriesDate}`,
          eventId: busy.id,
          ownerId: busy.ownerId,
          color: people.value[busy.ownerId]?.color ?? '#5b6b5f',
          title: null,
          location: null,
          busy: true,
          seriesDate: o.seriesDate,
          date: o.date,
          allDay: shown.allDay,
          startTime: shown.startTime,
          endTime: shown.endTime,
          crossesMidnight: crossesMidnight(shown),
          repeating: busy.repeat !== 'none',
          modified: o.modified,
        })
      }
    }
    return result.sort(byStart(day))
  }

  /** Who an occurrence belongs to on the person-by-person views: its owner and its participants. */
  function peopleOf(o: Occurrence): string[] {
    return [o.ownerId, ...(participants.value[o.eventId] ?? []).filter((id) => id !== o.ownerId)]
  }

  // ── Folders ────────────────────────────────────────────────

  /** A new private folder for me, or for a profile I manage. */
  async function createCalendar(name: string, color: string, ownerId = useGroupStore().me!.id): Promise<Calendar> {
    const { data, error } = await supabase
      .from('calendars')
      .insert({ owner_id: ownerId, name, color, position: calendars.value.filter((c) => c.ownerId === ownerId).length })
      .select()
      .single()
    if (error) throw error
    const calendar = toCalendar(data)
    calendars.value.push(calendar)
    editableIds.value = new Set([...editableIds.value, calendar.id])
    return calendar
  }

  /** Admins: a folder for someone else in the group, shared with it in full. */
  async function createCalendarFor(ownerId: string, name: string, color: string, groupId: string): Promise<string> {
    const { data, error } = await supabase.rpc('create_calendar_for', { owner_id: ownerId, name, color, group_id: groupId })
    if (error) throw error
    await reload()
    return data
  }

  async function updateCalendar(id: string, change: Pick<Calendar, 'name' | 'color'>) {
    const { error } = await supabase.from('calendars').update(change).eq('id', id)
    if (error) throw error
    await reload()
  }

  function sharedGroupIds(calendarId: string): string[] {
    return shares.value.filter((s) => s.calendarId === calendarId).map((s) => s.groupId)
  }

  function shareLevel(calendarId: string, groupId: string): ShareLevel | null {
    return shares.value.find((s) => s.calendarId === calendarId && s.groupId === groupId)?.level ?? null
  }

  /** Shares a folder with a group in full or busy mode, or stops sharing it (null). */
  async function setShare(calendarId: string, groupId: string, level: ShareLevel | null) {
    const current = shareLevel(calendarId, groupId)
    if (current === level) return
    const { error } =
      level === null
        ? await supabase.from('calendar_shares').delete().eq('calendar_id', calendarId).eq('group_id', groupId)
        : current
          ? await supabase.from('calendar_shares').update({ level }).eq('calendar_id', calendarId).eq('group_id', groupId)
          : await supabase.from('calendar_shares').insert({ calendar_id: calendarId, group_id: groupId, level })
    if (error) throw error
    await reload()
  }

  /** Sends the folder and its events to the trash; returns how to undo it. */
  async function deleteCalendar(calendarId: string): Promise<() => Promise<void>> {
    const { error } = await supabase.rpc('delete_calendar', { calendar_id: calendarId })
    if (error) throw error
    await reload()
    return () => restoreCalendar(calendarId)
  }

  async function restoreCalendar(calendarId: string) {
    const { error } = await supabase.rpc('restore_calendar', { calendar_id: calendarId })
    if (error) throw error
    await reload()
  }

  // ── Events ─────────────────────────────────────────────────

  /**
   * Creates or updates a whole event (the series, if it repeats), its extra groups and who goes. The saved
   * row goes into the store at once, so the screens show it; a reload in the background (and
   * Realtime) brings the rest (exceptions, history…). That reload failing doesn't undo the save.
   */
  async function saveEvent(draft: EventDraft, groupIds: string[], participantIds: string[], id?: string): Promise<string> {
    const row = fromEvent(draft)
    const { data, error } = id
      ? await supabase.from('events').update(row).eq('id', id).select().single()
      : await supabase.from('events').insert(row).select().single()
    if (error) throw error
    await setEventGroups(data.id, groupIds)
    await setParticipants(data.id, participantIds)
    putEvent(toEvent(data), groupIds, participantIds)
    void reload().catch(() => {})
    return data.id
  }

  /** A saved event, shown before the reload brings it. */
  function putEvent(event: CalendarEvent, groupIds: string[], participantIds: string[]) {
    const i = events.value.findIndex((e) => e.id === event.id)
    if (i === -1) events.value.push(event)
    else events.value[i] = event
    // Its folder is one I can edit, so it is loaded; the owner and color are the folder's.
    const folder = calendarById(event.calendarId)
    if (folder) owners.value[event.id] = { ownerId: folder.ownerId, color: folder.color }
    // setEventGroups and setParticipants left exactly these.
    eventGroups.value[event.id] = groupIds
    participants.value[event.id] = participantIds
  }

  async function setEventGroups(eventId: string, groupIds: string[]) {
    const current = eventGroups.value[eventId] ?? []
    const added = groupIds.filter((g) => !current.includes(g))
    const removed = current.filter((g) => !groupIds.includes(g))
    if (added.length) {
      const { error } = await supabase.from('event_shares').insert(added.map((group_id) => ({ event_id: eventId, group_id })))
      if (error) throw error
    }
    if (removed.length) {
      const { error } = await supabase.from('event_shares').delete().eq('event_id', eventId).in('group_id', removed)
      if (error) throw error
    }
  }

  async function setParticipants(eventId: string, personIds: string[]) {
    const current = participants.value[eventId] ?? []
    const added = personIds.filter((p) => !current.includes(p))
    const removed = current.filter((p) => !personIds.includes(p))
    if (added.length) {
      const { error } = await supabase.from('event_participants').insert(added.map((person_id) => ({ event_id: eventId, person_id })))
      if (error) throw error
    }
    if (removed.length) {
      const { error } = await supabase.from('event_participants').delete().eq('event_id', eventId).in('person_id', removed)
      if (error) throw error
    }
  }

  /** Changes or cancels one occurrence of a repeating event. */
  async function setException(eventId: string, seriesDate: IsoDate, change: Pick<EventException, 'status' | 'overrides'> | null) {
    const existing = exceptions.value.find((x) => x.eventId === eventId && x.occurrenceDate === seriesDate)
    const fields = change && { status: change.status, overrides: fromOverrides(change.overrides) as never }
    const { error } = !change
      ? await supabase.from('event_exceptions').delete().eq('event_id', eventId).eq('occurrence_date', seriesDate)
      : existing
        ? await supabase.from('event_exceptions').update(fields!).eq('event_id', eventId).eq('occurrence_date', seriesDate)
        : await supabase.from('event_exceptions').insert({ event_id: eventId, occurrence_date: seriesDate, ...fields! })
    if (error) throw error
    await reload()
  }

  /** Saves only the fields that differ from the series as this day's change. */
  function saveOccurrence(event: CalendarEvent, seriesDate: IsoDate, shown: EventOverrides) {
    const overrides: EventOverrides = {}
    for (const key of Object.keys(shown) as (keyof EventOverrides)[]) {
      const series = key === 'startDate' ? seriesDate : event[key]
      if (shown[key] !== series) (overrides as Record<string, unknown>)[key] = shown[key]
    }
    // Unchanged after all: back to the series.
    if (!Object.keys(overrides).length) return setException(event.id, seriesDate, null)
    return setException(event.id, seriesDate, { status: 'modified', overrides })
  }

  /** Cancels one day; returns how to undo it. */
  async function cancelOccurrence(eventId: string, seriesDate: IsoDate): Promise<() => Promise<void>> {
    const before = exceptions.value.find((x) => x.eventId === eventId && x.occurrenceDate === seriesDate) ?? null
    await setException(eventId, seriesDate, { status: 'cancelled', overrides: {} })
    return () => setException(eventId, seriesDate, before)
  }

  /** Sends the event (the whole series) to the trash; returns how to undo it. */
  async function deleteEvent(eventId: string): Promise<() => Promise<void>> {
    const { error } = await supabase.rpc('delete_event', { event_id: eventId })
    if (error) throw error
    await reload()
    return () => restoreEvent(eventId)
  }

  async function restoreEvent(eventId: string) {
    const { error } = await supabase.rpc('restore_event', { event_id: eventId })
    if (error) throw error
    await reload()
  }

  // ── Trash ──────────────────────────────────────────────────

  /**
   * What I can bring back: deleted folders, and events deleted on their own (those deleted with
   * their folder come back with it). Newest first.
   */
  async function loadTrash(): Promise<TrashItem[]> {
    const [cals, evs] = await Promise.all([
      supabase.from('calendars').select('id, owner_id, name, color, deleted_at, deleted_by, deletion_batch').not('deleted_at', 'is', null),
      supabase
        .from('events')
        .select('id, calendar_id, title, start_date, repeat, deleted_at, deleted_by, deletion_batch')
        .not('deleted_at', 'is', null),
    ])
    if (cals.error) throw cals.error
    if (evs.error) throw evs.error
    const deletedCalendars = new Map(cals.data.map((c) => [c.id, c]))
    const folderOf = (id: string) => {
      const live = calendarById(id)
      const gone = deletedCalendars.get(id)
      return live ?? (gone && { name: gone.name, color: gone.color, ownerId: gone.owner_id })
    }
    const items: TrashItem[] = [
      ...cals.data.map((c) => ({
        kind: 'calendar' as const,
        id: c.id,
        title: c.name,
        color: c.color,
        ownerId: c.owner_id,
        folderName: null,
        startDate: null,
        repeating: false,
        eventCount: evs.data.filter((e) => e.calendar_id === c.id && e.deletion_batch === c.deletion_batch).length,
        deletedAt: c.deleted_at!,
        deletedBy: c.deleted_by,
      })),
      ...evs.data
        .filter((e) => deletedCalendars.get(e.calendar_id)?.deletion_batch !== e.deletion_batch)
        .map((e) => {
          const folder = folderOf(e.calendar_id)
          return {
            kind: 'event' as const,
            id: e.id,
            title: e.title,
            color: folder?.color ?? '#5b6b5f',
            ownerId: folder?.ownerId ?? null,
            folderName: folder?.name ?? null,
            startDate: e.start_date,
            repeating: e.repeat !== 'none',
            eventCount: 0,
            deletedAt: e.deleted_at!,
            deletedBy: e.deleted_by,
          }
        }),
    ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
    await loadPeople(items.flatMap((i) => [i.ownerId, i.deletedBy]))
    return items
  }

  function restore(item: TrashItem) {
    return item.kind === 'calendar' ? restoreCalendar(item.id) : restoreEvent(item.id)
  }

  /** Gone for good; only a line in the history stays. */
  async function purge(item: TrashItem) {
    const { error } =
      item.kind === 'calendar'
        ? await supabase.rpc('purge_calendar', { calendar_id: item.id })
        : await supabase.rpc('purge_event', { event_id: item.id })
    if (error) throw error
  }

  async function loadHistory(eventId: string): Promise<HistoryEntry[]> {
    const { data, error } = await supabase.from('event_history').select().eq('event_id', eventId).order('changed_at').order('id')
    if (error) throw error
    const entries = data.map(toHistoryEntry)
    await loadPeople(entries.map((e) => e.changedBy))
    return entries
  }

  // ── Realtime ───────────────────────────────────────────────

  let channel: RealtimeChannel | null = null
  let channelGroupId: string | null = null
  let reloadTimer: ReturnType<typeof setTimeout> | undefined

  /** Changes come in bursts (an event, its groups, its exceptions): one reload for them all. */
  function reloadSoon() {
    clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => reload().catch(console.error), 300)
  }

  /**
   * Postgres changes bring what RLS lets me see; busy slots come as an empty broadcast on the
   * group's topic (see the calendar_realtime migration). Either way, everything is reloaded.
   */
  function subscribe(groupId: string) {
    if (channelGroupId === groupId) return
    if (channel) void supabase.removeChannel(channel)
    channelGroupId = groupId
    let ch = supabase.channel(`calendar:${groupId}`)
    for (const table of REALTIME_TABLES) ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, reloadSoon)
    channel = ch
      .on('broadcast', { event: 'changed' }, reloadSoon)
      // Catch up on anything missed before the listeners were live: SUBSCRIBED also fires after a
      // reconnect (phone back from background), and the system event when Postgres changes actually start.
      .on('system', {}, (p: RealtimeSystemPayload) => {
        if (p.extension === 'postgres_changes' && p.status === 'ok') reloadSoon()
      })
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') reloadSoon()
      })
  }

  function unload() {
    if (channel) void supabase.removeChannel(channel)
    channel = null
    channelGroupId = null
    clearTimeout(reloadTimer)
    loadedGroupId = null
    status.value = 'idle'
    calendars.value = []
    shares.value = []
    events.value = []
    exceptions.value = []
    eventGroups.value = {}
    participants.value = {}
    owners.value = {}
    editableIds.value = new Set()
    busyEvents.value = []
  }

  return {
    status,
    calendars,
    events,
    eventGroups,
    participants,
    owners,
    people,
    editableCalendars,
    eventById,
    calendarById,
    canEdit,
    exceptionsOf,
    personName,
    load,
    ensureLoaded,
    reload,
    reloadSoon,
    unload,
    occurrencesOn,
    peopleOf,
    createCalendar,
    createCalendarFor,
    updateCalendar,
    sharedGroupIds,
    shareLevel,
    setShare,
    deleteCalendar,
    saveEvent,
    saveOccurrence,
    cancelOccurrence,
    deleteEvent,
    loadHistory,
    loadTrash,
    restore,
    purge,
  }
})

function groupBy<T>(rows: T[], key: (r: T) => string, value: (r: T) => string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const r of rows) (out[key(r)] ??= []).push(value(r))
  return out
}

/** All-day first, then by start time; what started the night before goes first of all. */
function byStart(day: IsoDate) {
  const rank = (o: Occurrence) => (o.date < day ? '' : o.allDay ? '0' : `1${o.startTime}`)
  return (a: Occurrence, b: Occurrence) => rank(a).localeCompare(rank(b))
}
