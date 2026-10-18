import { ref } from 'vue'
import type { IsoDate } from '@/types'

// Calendar days as 'YYYY-MM-DD' strings. Arithmetic runs on UTC midnights so daylight saving
// changes never shift a day.

const DAY_MS = 86_400_000

function toUtc(day: IsoDate): number {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

function fromUtc(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10)
}

function deviceDay(now: Date): IsoDate {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function zoneDay(timeZone: string, at: Date): IsoDate {
  try {
    // en-CA writes dates as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  } catch {
    return deviceDay(at)
  }
}

// "Today" without a given moment is reactive: computeds and templates that ask for it run again
// when the date changes with the app open (past midnight, or woken up on another day). A cheap
// check every minute and when the app comes back covers every zone asked for ('' = this device).
const dayChanges = ref(0)
const zonesInUse = new Set<string>()
let lastKey: string | null = null

function dayKey(): string {
  const now = new Date()
  return [...zonesInUse].map((zone) => (zone ? zoneDay(zone, now) : deviceDay(now))).join()
}

function checkDay() {
  const key = dayKey()
  if (key === lastKey) return
  lastKey = key
  dayChanges.value++
}

/** Makes the caller depend on the date changing in `zone`. */
function trackDay(zone: string) {
  if (!zonesInUse.has(zone)) {
    if (lastKey === null && typeof window !== 'undefined') {
      setInterval(checkDay, 60_000)
      document.addEventListener('visibilitychange', checkDay)
    }
    zonesInUse.add(zone)
    lastKey = dayKey()
  }
  void dayChanges.value
}

/** Today on this device. */
export function today(now?: Date): IsoDate {
  if (now) return deviceDay(now)
  trackDay('')
  return deviceDay(new Date())
}

/** The day a moment falls on in a time zone (a group's): today by default. */
export function dayIn(timeZone: string, at?: Date | string): IsoDate {
  if (at !== undefined) return zoneDay(timeZone, new Date(at))
  trackDay(timeZone)
  return zoneDay(timeZone, new Date())
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
export function relativeDay(day: IsoDate, now = today()): string {
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
