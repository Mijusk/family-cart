import type { IsoDate } from '../types.ts'

// Calendar days as 'YYYY-MM-DD' strings. Arithmetic runs on UTC midnights so daylight saving
// changes never shift a day.
//
// No Vue here (the reactive "today" is in days.ts): the mcp Edge Function imports this file under
// Deno, so its imports are relative and keep the .ts extension.

const DAY_MS = 86_400_000

function toUtc(day: IsoDate): number {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

function fromUtc(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10)
}

/** The day a moment falls on in this device's own time zone. */
export function deviceDay(at: Date): IsoDate {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

/** The day a moment falls on in a time zone; the device's if the zone is unknown. */
export function zoneDay(timeZone: string, at: Date): IsoDate {
  try {
    // en-CA writes dates as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  } catch {
    return deviceDay(at)
  }
}

export function addDays(day: IsoDate, n: number): IsoDate {
  return fromUtc(toUtc(day) + n * DAY_MS)
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function weekday(day: IsoDate): number {
  return ((new Date(toUtc(day)).getUTCDay() + 6) % 7) + 1
}

export function startOfWeek(day: IsoDate): IsoDate {
  return addDays(day, 1 - weekday(day))
}

export function dayOfMonth(day: IsoDate): number {
  return Number(day.slice(8, 10))
}

/** First day of the month `day` is in. */
export function startOfMonth(day: IsoDate): IsoDate {
  return `${day.slice(0, 8)}01`
}

/** First day of the month `n` months after (or before) the one `day` is in. */
export function addMonths(day: IsoDate, n: number): IsoDate {
  const [y, m] = day.split('-').map(Number)
  return fromUtc(Date.UTC(y!, m! - 1 + n, 1))
}

export const WEEKDAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const
export const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const

const longFormat = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const shortFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const weekdayShortFormat = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const monthFormat = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** "Octubre de 2026". */
export function monthLabel(day: IsoDate): string {
  return capitalize(monthFormat.format(new Date(toUtc(day)))).replace(' de ', ' ')
}

/** "Jueves, 16 de octubre". */
export function longDay(day: IsoDate): string {
  return capitalize(longFormat.format(new Date(toUtc(day))))
}

/** "16 oct". */
export function shortDay(day: IsoDate): string {
  return shortFormat.format(new Date(toUtc(day)))
}

/** "jue 23 oct". */
export function weekdayShortDay(day: IsoDate): string {
  return weekdayShortFormat.format(new Date(toUtc(day))).replace(',', '')
}

/** "Hoy", "Mañana", "Ayer" or "Jueves, 16 de octubre". */
export function relativeDay(day: IsoDate, now: IsoDate): string {
  const diff = daysBetween(now, day)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  if (diff === -1) return 'Ayer'
  return longDay(day)
}

/** A real 'YYYY-MM-DD' day (from a URL, say). */
export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}
