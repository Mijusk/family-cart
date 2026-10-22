// What the AI sends to the write tools, checked with the same rules as the app's forms
// (EventFormView, the task screen, the shopping list) before anything is written. Pure functions,
// tested with Vitest (input.test.ts); the database checks again with its constraints and RLS.

import type { CalendarEvent, ClockTime, EventOverrides, IsoDate, RepeatKind } from '../../../src/types.ts'
import { reminderEndTime } from '../../../src/lib/recurrence.ts'
import { addDays, daysBetween, isIsoDate, weekday } from '../../../src/utils/isoDays.ts'
import { cleanDisplayName } from '../../../src/utils/text.ts'

/** The writable fields of an event, as the app's EventDraft. */
export type EventFields = Pick<
  CalendarEvent,
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
  | 'reminderOnly'
>

/** Event fields as the tools receive them. Left out = unchanged (or the default when creating); null = clear. */
export interface EventInput {
  titulo?: string
  fecha?: string
  todo_el_dia?: boolean
  hora_inicio?: string | null
  hora_fin?: string | null
  lugar?: string | null
  notas?: string | null
  repeticion?: RepeatKind
  dias_semana?: number[] | null
  repetir_hasta?: string | null
  aviso_minutos?: number | null
  recordatorio?: boolean
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** As in the form: 30 days at most. */
export const REMINDER_MAX_MINUTES = 30 * 1440
/** A new event without an end lasts this long, as in the form. */
const DEFAULT_LENGTH_MINUTES = 60
/** Far enough for any plan; past it, it is surely a mistake (a wrong year). */
const FIRST_YEAR = 2000
const LAST_YEAR = 2100

const TITLE_MAX = 120
const NOTES_MAX = 2000
const LOCATION_MAX = 200

/** "9:30", "09:30" or "09:30:00" → "09:30"; null if it is not a time of day. */
export function parseClock(value: string): ClockTime | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${match[2]}`
}

const toMinutes = (time: ClockTime) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
const fromMinutes = (m: number): ClockTime => {
  const wrapped = ((m % 1440) + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

/** Minutes from start to end, past midnight when the end is earlier. */
function length(start: ClockTime, end: ClockTime): number {
  return (toMinutes(end) - toMinutes(start) + 1440) % 1440
}

function checkDate(value: string, what: string): Checked<IsoDate> {
  if (!isIsoDate(value)) return fail(`${what} tiene que ir como AAAA-MM-DD (por ejemplo 2026-11-04).`)
  const year = Number(value.slice(0, 4))
  if (year < FIRST_YEAR || year > LAST_YEAR) return fail(`${what} (${value}) no parece correcta: revisa el año.`)
  return { ok: true, value }
}

/** Trimmed text, null if empty; an error past `max` characters. */
function optionalText(value: string | null, max: number, what: string): Checked<string | null> {
  const text = value?.trim() || null
  if (text && text.length > max) return fail(`${what} puede tener como mucho ${max} caracteres.`)
  return { ok: true, value: text }
}

function checkTitle(value: string, what = 'El título'): Checked<string> {
  const title = cleanDisplayName(value)
  if (!title) return fail(`${what} no puede estar vacío.`)
  if (title.length > TITLE_MAX) return fail(`${what} puede tener como mucho ${TITLE_MAX} caracteres.`)
  return { ok: true, value: title }
}

/**
 * Start and end of a timed event (or day). An end left out keeps the length it had (`previous`),
 * or lasts an hour; an end earlier than the start means it ends the next day.
 */
function checkTimes(
  startIn: string | null | undefined,
  endIn: string | null | undefined,
  previous: { startTime: ClockTime | null; endTime: ClockTime | null },
): Checked<{ startTime: ClockTime; endTime: ClockTime }> {
  const startRaw = startIn === undefined ? previous.startTime : startIn
  if (!startRaw) return fail('Falta la hora de inicio (HH:MM), o indica que es de todo el día.')
  const startTime = parseClock(startRaw)
  if (!startTime) return fail(`La hora de inicio «${startRaw}» tiene que ir como HH:MM (24 h).`)
  let endTime: ClockTime | null
  if (endIn) {
    endTime = parseClock(endIn)
    if (!endTime) return fail(`La hora de fin «${endIn}» tiene que ir como HH:MM (24 h).`)
  } else if (endIn === undefined && previous.startTime && previous.endTime) {
    // As in the form: moving the start moves the end with it.
    endTime = fromMinutes(toMinutes(startTime) + length(previous.startTime, previous.endTime))
  } else {
    endTime = fromMinutes(toMinutes(startTime) + DEFAULT_LENGTH_MINUTES)
  }
  if (startTime === endTime) return fail('La hora de fin tiene que ser distinta de la de inicio.')
  return { ok: true, value: { startTime, endTime } }
}

export const NEW_EVENT: EventFields = {
  title: '',
  notes: null,
  location: null,
  allDay: false,
  startDate: '',
  startTime: null,
  endTime: null,
  repeat: 'none',
  repeatWeekdays: null,
  repeatUntil: null,
  reminderMinutes: null,
  reminderOnly: false,
}

/**
 * The event after applying `input` to `base` (NEW_EVENT when creating), or what is wrong with it,
 * in Spanish for the AI to tell the person. Mirrors validate() and save() of EventFormView.
 */
export function eventFields(input: EventInput, base: EventFields = NEW_EVENT): Checked<EventFields> {
  const title = checkTitle(input.titulo ?? base.title)
  if (!title.ok) return title

  const dateRaw = input.fecha ?? base.startDate
  if (!dateRaw) return fail('Falta la fecha (AAAA-MM-DD).')
  const date = checkDate(dateRaw, 'La fecha')
  if (!date.ok) return date

  const reminderOnly = input.recordatorio ?? base.reminderOnly
  const allDay = !reminderOnly && (input.todo_el_dia ?? (input.hora_inicio ? false : base.allDay))
  let startTime: ClockTime | null = null
  let endTime: ClockTime | null = null
  if (!allDay) {
    const times = checkTimes(input.hora_inicio, input.hora_fin, base.allDay ? { startTime: null, endTime: null } : base)
    if (!times.ok) return times
    ;({ startTime, endTime } = times.value)
    // A «Recordatorio» has no end to choose: as in the form, 15 minutes after the start.
    if (reminderOnly) endTime = reminderEndTime(startTime)
  }

  const notes = optionalText(input.notas === undefined ? base.notes : input.notas, NOTES_MAX, 'Las notas')
  if (!notes.ok) return notes
  const location = optionalText(input.lugar === undefined ? base.location : input.lugar, LOCATION_MAX, 'El lugar')
  if (!location.ok) return location

  const repeat = input.repeticion ?? base.repeat
  const weekly = repeat === 'weekly' || repeat === 'biweekly'
  let repeatWeekdays: number[] | null = null
  if (weekly) {
    const days = input.dias_semana === undefined ? base.repeatWeekdays : input.dias_semana
    if (days?.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return fail('Los días de la semana van del 1 (lunes) al 7 (domingo).')
    // As in the form: weekly with no days picked repeats on the event's own weekday.
    repeatWeekdays = days?.length ? [...new Set(days)].sort() : [weekday(date.value)]
  }
  let repeatUntil: IsoDate | null = null
  if (repeat !== 'none') {
    const untilRaw = input.repetir_hasta === undefined ? base.repeatUntil : input.repetir_hasta
    if (untilRaw) {
      const until = checkDate(untilRaw, 'La fecha de fin de la repetición')
      if (!until.ok) return until
      if (until.value < date.value) return fail('La repetición no puede terminar antes de empezar.')
      repeatUntil = until.value
    }
  }

  let reminder = input.aviso_minutos === undefined ? base.reminderMinutes : input.aviso_minutos
  if (reminderOnly && reminder === null) {
    // It exists for its notification: «Al empezar» unless one was asked for; never none.
    if (input.aviso_minutos === null) return fail('Un recordatorio necesita un aviso (aviso_minutos, 0 = al empezar).')
    reminder = 0
  }
  if (reminder !== null && (!Number.isInteger(reminder) || reminder < 0 || reminder > REMINDER_MAX_MINUTES)) {
    return fail('El aviso va en minutos antes del inicio: de 0 (al empezar) a 43200 (30 días).')
  }

  return {
    ok: true,
    value: {
      title: title.value,
      notes: notes.value,
      location: location.value,
      allDay,
      startDate: date.value,
      startTime,
      endTime,
      repeat,
      repeatWeekdays,
      repeatUntil,
      reminderMinutes: reminder,
      reminderOnly,
    },
  }
}

/** One day of a repeating event as the tools receive it. Left out = as it is now that day. */
export interface DayInput {
  titulo?: string
  nueva_fecha?: string
  todo_el_dia?: boolean
  hora_inicio?: string | null
  hora_fin?: string | null
  lugar?: string | null
  notas?: string | null
}

/**
 * The overrides of that day after the change: only what differs from the series, as
 * saveOccurrence() in the calendar store. Empty = back to the series. `current` is the day as it
 * is now (the series plus the overrides it already has).
 */
export function dayOverrides(
  input: DayInput,
  series: Pick<CalendarEvent, 'title' | 'notes' | 'location' | 'allDay' | 'startTime' | 'endTime'>,
  seriesDate: IsoDate,
  current: Required<EventOverrides>,
): Checked<EventOverrides> {
  const title = checkTitle(input.titulo ?? current.title)
  if (!title.ok) return title
  const date = checkDate(input.nueva_fecha ?? current.startDate, 'La nueva fecha')
  if (!date.ok) return date
  // A day moved more than a week away is surely a mistake (the app would allow it, but it is rare).
  if (Math.abs(daysBetween(seriesDate, date.value)) > 7) {
    return fail('Un solo día se puede mover como mucho una semana. Para más, cambia el evento entero.')
  }
  const allDay = input.todo_el_dia ?? (input.hora_inicio ? false : current.allDay)
  let startTime: ClockTime | null = null
  let endTime: ClockTime | null = null
  if (!allDay) {
    const times = checkTimes(input.hora_inicio, input.hora_fin, current.allDay ? { startTime: null, endTime: null } : current)
    if (!times.ok) return times
    ;({ startTime, endTime } = times.value)
  }
  const notes = optionalText(input.notas === undefined ? current.notes : input.notas, NOTES_MAX, 'Las notas')
  if (!notes.ok) return notes
  const location = optionalText(input.lugar === undefined ? current.location : input.lugar, LOCATION_MAX, 'El lugar')
  if (!location.ok) return location

  const shown: Required<EventOverrides> = {
    title: title.value,
    notes: notes.value,
    location: location.value,
    allDay,
    startDate: date.value,
    startTime,
    endTime,
  }
  const overrides: EventOverrides = {}
  for (const key of Object.keys(shown) as (keyof EventOverrides)[]) {
    const inSeries = key === 'startDate' ? seriesDate : series[key]
    if (shown[key] !== inSeries) (overrides as Record<string, unknown>)[key] = shown[key]
  }
  return { ok: true, value: overrides }
}

/** A task as the tools receive it. Left out = unchanged; null = clear. */
export interface TaskInput {
  titulo?: string
  notas?: string | null
  fecha?: string | null
}

export interface TaskFields {
  title: string
  notes: string | null
  dueDate: IsoDate | null
}

/** The task after applying `input` to `base`, or what is wrong with it. */
export function taskFields(input: TaskInput, base: TaskFields = { title: '', notes: null, dueDate: null }): Checked<TaskFields> {
  const title = checkTitle(input.titulo ?? base.title, 'El título de la tarea')
  if (!title.ok) return title
  const notes = optionalText(input.notas === undefined ? base.notes : input.notas, NOTES_MAX, 'Las notas')
  if (!notes.ok) return notes
  const dueRaw = input.fecha === undefined ? base.dueDate : input.fecha
  let dueDate: IsoDate | null = null
  if (dueRaw) {
    const due = checkDate(dueRaw, 'La fecha de la tarea')
    if (!due.ok) return due
    dueDate = due.value
  }
  return { ok: true, value: { title: title.value, notes: notes.value, dueDate } }
}

export interface ItemInput {
  nombre: string
  cantidad?: number
  nota?: string | null
}

export interface ItemFields {
  name: string
  quantity: number
  note: string | null
}

const ITEM_NAME_MAX = 80
const ITEM_NOTE_MAX = 120
const ITEM_QUANTITY_MAX = 999

/** A product for the shopping list, cleaned as the add form does. */
export function itemFields(input: ItemInput): Checked<ItemFields> {
  const name = cleanDisplayName(input.nombre)
  if (!name) return fail('Cada producto necesita un nombre.')
  if (name.length > ITEM_NAME_MAX) return fail(`«${name.slice(0, 20)}…»: el nombre puede tener como mucho ${ITEM_NAME_MAX} caracteres.`)
  const quantity = input.cantidad ?? 1
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > ITEM_QUANTITY_MAX) {
    return fail(`«${name}»: la cantidad va de 1 a ${ITEM_QUANTITY_MAX}.`)
  }
  const note = optionalText(input.nota ?? null, ITEM_NOTE_MAX, `La nota de «${name}»`)
  if (!note.ok) return note
  return { ok: true, value: { name, quantity, note: note.value } }
}

/** The longest range ver_eventos returns at once. */
export const MAX_RANGE_DAYS = 62

/** From and to (included) for ver_eventos; to defaults to from. */
export function dateRange(fromRaw: string, toRaw?: string): Checked<{ from: IsoDate; to: IsoDate }> {
  const from = checkDate(fromRaw, 'La fecha «desde»')
  if (!from.ok) return from
  const to = checkDate(toRaw ?? fromRaw, 'La fecha «hasta»')
  if (!to.ok) return to
  if (to.value < from.value) return fail('La fecha «hasta» no puede ser anterior a «desde».')
  if (to.value > addDays(from.value, MAX_RANGE_DAYS - 1)) {
    return fail(`Como mucho ${MAX_RANGE_DAYS} días de una vez. Pide el resto en otra consulta.`)
  }
  return { ok: true, value: { from: from.value, to: to.value } }
}
