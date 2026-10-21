import type { EventException, EventTiming, IsoDate } from '@/types'
import { addDays, shortDay, weekdayShortDay } from '@/utils/days'
import { repeatLabel } from './eventText'
import { crossesMidnight, occurrencesBetween } from './recurrence'

// "Copiar para la IA": the family's calendar for a period as plain text to paste into a chat and
// ask where tasks or exercise could go. Pure function, like recurrence.ts.
//
// To keep a month short, the weekly routine goes once per person; day by day only what changes
// (one-off events, changed and cancelled days) and the free time, worked out here because chats
// get it wrong.

export interface PlanPerson {
  id: string
  name: string
  isMe: boolean
}

/** An event as the plan needs it: who it is for and when. A null title is a busy slot. */
export interface PlanEvent {
  id: string
  title: string | null
  folder: string | null
  /** Owner and participants, among the plan's people. */
  people: string[]
  timing: EventTiming
  exceptions: EventException[]
}

export interface PlanTask {
  title: string
  list: string
  dueDate: IsoDate | null
  /** Names. */
  assignees: string[]
}

export interface PlanInput {
  groupName: string
  from: IsoDate
  to: IsoDate
  today: IsoDate
  people: PlanPerson[]
  events: PlanEvent[]
  tasks: PlanTask[]
  request: string
  /** The waking hours free time is counted in. */
  dayStart?: string
  dayEnd?: string
}

export const DEFAULT_PLAN_REQUEST =
  'Propón dónde colocar las tareas pendientes y 2 o 3 sesiones de ejercicio por semana para cada uno, ' +
  'en los huecos libres y sin pisar lo que ya hay. Devuélvelo como una lista por día (fecha, hora de ' +
  'inicio y fin, persona y qué) y avisa si alguna semana no hay hueco suficiente.'

/** Free time shorter than this is not worth listing. */
const MIN_FREE_MINUTES = 30

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

function hours(t: { allDay: boolean; startTime: string | null; endTime: string | null }): string {
  if (t.allDay || !t.startTime || !t.endTime) return 'todo el día'
  return `${t.startTime}–${t.endTime}${crossesMidnight(t) ? ' (+1)' : ''}`
}

const named = (title: string | null) => title ?? 'Ocupado'

interface DayItem {
  event: PlanEvent
  title: string | null
  date: IsoDate
  allDay: boolean
  startTime: string | null
  endTime: string | null
  modified: boolean
}

function itemsOn(events: PlanEvent[], day: IsoDate): DayItem[] {
  return events.flatMap((event) =>
    occurrencesBetween(event.timing, event.exceptions, day, day).map((o) => {
      const shown = { ...event.timing, ...o.overrides }
      return {
        event,
        title: event.title === null ? null : (o.overrides.title ?? event.title),
        date: o.date,
        allDay: shown.allDay,
        startTime: shown.startTime,
        endTime: shown.endTime,
        modified: o.modified,
      }
    }),
  )
}

/** Free stretches of `day` between dayStart and dayEnd, given what the person has. */
export function freeTime(items: DayItem[], day: IsoDate, dayStart: string, dayEnd: string): string[] {
  const taken = items
    .filter((i) => !i.allDay && i.startTime && i.endTime)
    .map((i) => {
      // The night before's event takes the morning up to its end; one crossing midnight, the rest of the day.
      if (i.date < day) return [0, minutes(i.endTime!)] as const
      const start = minutes(i.startTime!)
      return [start, crossesMidnight(i) ? 24 * 60 : minutes(i.endTime!)] as const
    })
    .sort((a, b) => a[0] - b[0])

  const free: string[] = []
  let cursor = minutes(dayStart)
  const end = minutes(dayEnd)
  for (const [start, stop] of taken) {
    if (start - cursor >= MIN_FREE_MINUTES && cursor < end) free.push(`${clock(cursor)}–${clock(Math.min(start, end))}`)
    cursor = Math.max(cursor, stop)
  }
  if (end - cursor >= MIN_FREE_MINUTES) free.push(`${clock(cursor)}–${clock(end)}`)
  return free.filter((f) => minutes(f.slice(6)) - minutes(f.slice(0, 5)) >= MIN_FREE_MINUTES)
}

export function buildPlanText(input: PlanInput): string {
  const dayStart = input.dayStart ?? '07:00'
  const dayEnd = input.dayEnd ?? '22:00'
  // Planning is for what is ahead: a month already started counts from today.
  const from = input.from < input.today ? input.today : input.from
  const days: IsoDate[] = []
  for (let d = from; d <= input.to; d = addDays(d, 1)) days.push(d)
  const nameOf = (id: string) => input.people.find((p) => p.id === id)?.name ?? 'Alguien'
  const whose = (event: PlanEvent) => event.people.map(nameOf).join(' y ')

  const lines: string[] = [
    `# Calendario de ${input.groupName}: del ${shortDay(from)} al ${shortDay(input.to)} de ${input.to.slice(0, 4)}`,
    '',
    `Personas: ${input.people.map((p) => (p.isMe ? `${p.name} (yo)` : p.name)).join(', ')}.`,
    'Semanas de lunes a domingo, horas en formato 24 h. «(+1)» = termina al día siguiente. «Ocupado» = algo cuyo detalle no se comparte.',
    '',
  ]

  // ── Routine ──
  const repeating = input.events.filter(
    (e) => e.timing.repeat !== 'none' && e.timing.startDate <= input.to && (!e.timing.repeatUntil || e.timing.repeatUntil >= from),
  )
  lines.push('## Rutina (se repite)')
  for (const person of input.people) {
    const own = repeating
      .filter((e) => e.people.includes(person.id))
      .sort((a, b) => (a.timing.startTime ?? '').localeCompare(b.timing.startTime ?? ''))
    if (!own.length) continue
    lines.push('', `${person.name}:`)
    for (const e of own) {
      const since = e.timing.startDate > from ? ` · desde el ${shortDay(e.timing.startDate)}` : ''
      const shared = e.people.length > 1 ? ` (con ${e.people.filter((id) => id !== person.id).map(nameOf).join(' y ')})` : ''
      lines.push(`- ${hours(e.timing)} ${named(e.title)}${shared} — ${repeatLabel(e.timing)!.toLowerCase()}${since}`)
    }
  }
  if (!repeating.length) lines.push('', 'Nada que se repita.')

  // ── What changes, day by day ──
  lines.push('', '## Además, día a día')
  let changes = 0
  for (const day of days) {
    const items = itemsOn(input.events, day).filter((i) => i.date === day && (i.event.timing.repeat === 'none' || i.modified))
    const cancelled = input.events.flatMap((e) =>
      e.exceptions
        .filter((x) => x.status === 'cancelled' && x.occurrenceDate === day && e.timing.repeat !== 'none')
        .map(() => `${whose(e)}: no hay ${named(e.title)}`),
    )
    const dated = items
      .sort((a, b) => (a.allDay ? '' : a.startTime!).localeCompare(b.allDay ? '' : b.startTime!))
      .map((i) => `${whose(i.event)}: ${hours(i)} ${named(i.title)}${i.modified ? ' (cambio de un día de su rutina)' : ''}`)
    for (const text of [...dated, ...cancelled]) {
      lines.push(`- ${weekdayShortDay(day)} · ${text}`)
      changes++
    }
  }
  if (!changes) lines.push('Nada fuera de la rutina.')

  // ── Free time ──
  lines.push('', `## Huecos libres (entre ${dayStart} y ${dayEnd}, de ${MIN_FREE_MINUTES} min o más)`)
  for (const day of days) {
    const items = itemsOn(input.events, day)
    const parts = input.people.map((person) => {
      const own = items.filter((i) => i.event.people.includes(person.id))
      const free = freeTime(own, day, dayStart, dayEnd)
      const allDay = own.filter((i) => i.allDay && i.date === day).map((i) => named(i.title))
      const note = allDay.length ? ` (todo el día: ${allDay.join(', ')})` : ''
      return `${person.name} ${free.length ? free.join(', ') : 'nada'}${note}`
    })
    lines.push(`- ${weekdayShortDay(day)} · ${parts.join(' · ')}`)
  }

  // ── Tasks ──
  lines.push('', '## Tareas pendientes')
  if (!input.tasks.length) lines.push('Ninguna.')
  for (const t of input.tasks) {
    const who = t.assignees.length ? ` · para ${t.assignees.join(' y ')}` : ''
    const due = t.dueDate ? (t.dueDate < input.today ? ` · vencida (era el ${shortDay(t.dueDate)})` : ` · para el ${weekdayShortDay(t.dueDate)}`) : ''
    lines.push(`- ${t.title} (lista «${t.list}»)${who}${due}`)
  }

  lines.push('', '## Lo que te pido', input.request.trim() || DEFAULT_PLAN_REQUEST)
  return lines.join('\n') + '\n'
}
