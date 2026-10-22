import type { EventTiming, HistoryEntry, IsoDate } from '../types.ts'
import { longDay, shortDay, WEEKDAY_NAMES } from '../utils/isoDays.ts'

// How events read in Spanish: times, repetitions and history lines. The mcp Edge Function imports
// this file under Deno, so its imports are relative and keep the .ts extension.

/**
 * "Todo el día", "08:00 – 15:00", "23:00 – 00:30 (+1)" (or "… del día siguiente" when `long`), or
 * "Hasta las 00:30" for the part of last night's event that runs into `day`.
 */
export function timeLabel(
  o: { allDay: boolean; startTime: string | null; endTime: string | null; date: IsoDate },
  day: IsoDate,
  long = false,
): string {
  if (o.allDay || !o.startTime || !o.endTime) return 'Todo el día'
  if (o.date < day) return `Hasta las ${o.endTime}`
  const nextDay = o.endTime >= o.startTime ? '' : long ? ' del día siguiente' : ' (+1)'
  return `${o.startTime} – ${o.endTime}${nextDay}`
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`
}

/** "Cada semana: lunes, miércoles y viernes · hasta el 20 dic", or null if it doesn't repeat. */
export function repeatLabel(t: EventTiming): string | null {
  const days = list((t.repeatWeekdays ?? []).slice().sort().map((d) => WEEKDAY_NAMES[d - 1]!))
  let label: string
  switch (t.repeat) {
    case 'none':
      return null
    case 'daily':
      label = 'Cada día'
      break
    case 'weekly':
      label = `Cada semana: ${days}`
      break
    case 'biweekly':
      label = `Cada dos semanas: ${days}`
      break
    case 'monthly':
      label = `Cada mes, el día ${Number(t.startDate.slice(8))}`
      break
  }
  return t.repeatUntil ? `${label} · hasta el ${shortDay(t.repeatUntil)}` : label
}

/** The reminder choices of the event form, in minutes before the start. */
export const REMINDER_PRESETS = [0, 15, 60, 1440, 10080] as const

function amount(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "Al empezar", "1 hora antes", "2 días y 3 horas antes"… */
export function reminderLabel(minutes: number): string {
  if (minutes === 0) return 'Al empezar'
  if (minutes === 10080) return '1 semana antes'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  const parts = [
    days && amount(days, 'día', 'días'),
    hours && amount(hours, 'hora', 'horas'),
    mins && amount(mins, 'minuto', 'minutos'),
  ].filter((p): p is string => !!p)
  return `${list(parts)} antes`
}

const FIELD_LABELS: Record<string, string> = {
  title: 'el título',
  notes: 'las notas',
  location: 'el lugar',
  all_day: 'el horario',
  start_date: 'la fecha',
  start_time: 'el horario',
  end_time: 'el horario',
  repeat: 'la repetición',
  repeat_weekdays: 'la repetición',
  repeat_until: 'la repetición',
  calendar_id: 'la carpeta',
  timezone: 'la zona horaria',
  reminder_minutes: 'el aviso',
}

/** What a history entry did, without the author: "cambió el título y la fecha". */
export function historyText(
  entry: HistoryEntry,
  names: { person: (id: string) => string; group: (id: string) => string },
): string {
  switch (entry.action) {
    case 'create':
      return 'creó el evento'
    case 'delete':
      return 'lo envió a la papelera'
    case 'restore':
      return 'lo recuperó de la papelera'
    case 'purge':
      return 'lo eliminó definitivamente'
    case 'update':
      break
  }
  const before = entry.before ?? {}
  const after = entry.after ?? {}
  if ('exception' in before || 'exception' in after) {
    const x = (after.exception ?? before.exception) as { occurrence_date: string; status: string }
    const day = longDay(x.occurrence_date).toLowerCase()
    if (!after.exception) return `deshizo el cambio del ${day}`
    return x.status === 'cancelled' ? `lo canceló el ${day}` : `lo cambió solo el ${day}`
  }
  if ('group' in after) return `lo compartió con ${names.group(after.group as string)}`
  if ('group' in before) return `dejó de compartirlo con ${names.group(before.group as string)}`
  if ('participant' in after) return `añadió a ${names.person(after.participant as string)}`
  if ('participant' in before) return `quitó a ${names.person(before.participant as string)}`
  const fields = [...new Set(Object.keys({ ...before, ...after }).map((k) => FIELD_LABELS[k] ?? 'otros datos'))]
  return `cambió ${list(fields)}`
}
