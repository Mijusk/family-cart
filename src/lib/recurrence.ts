import type { EventException, EventOverrides, EventTiming, IsoDate } from '@/types'
import { addDays, dayOfMonth, daysBetween, startOfWeek, weekday } from '@/utils/days'

// Expands repeating events into their dates. Pure functions: no Vue, no Supabase, so they can
// move to a native app or a server job as they are.

/** Whether `day` is a date of the series (before exceptions). */
export function isSeriesDate(t: EventTiming, day: IsoDate): boolean {
  if (day < t.startDate || (t.repeatUntil && day > t.repeatUntil)) return false
  switch (t.repeat) {
    case 'none':
      return day === t.startDate
    case 'daily':
      return true
    case 'weekly':
      return (t.repeatWeekdays ?? []).includes(weekday(day))
    case 'biweekly': {
      const weeks = daysBetween(startOfWeek(t.startDate), startOfWeek(day)) / 7
      return weeks % 2 === 0 && (t.repeatWeekdays ?? []).includes(weekday(day))
    }
    case 'monthly':
      // Same day of the month; months without it (the 31st in April) are skipped.
      return dayOfMonth(day) === dayOfMonth(t.startDate)
  }
}

/** Series dates within [from, to], both included. */
export function seriesDates(t: EventTiming, from: IsoDate, to: IsoDate): IsoDate[] {
  const dates: IsoDate[] = []
  const first = from > t.startDate ? from : t.startDate
  const last = t.repeatUntil && t.repeatUntil < to ? t.repeatUntil : to
  if (t.repeat === 'none') return t.startDate >= from && t.startDate <= to ? [t.startDate] : []
  for (let day = first; day <= last; day = addDays(day, 1)) {
    if (isSeriesDate(t, day)) dates.push(day)
  }
  return dates
}

export function crossesMidnight(t: { allDay: boolean; startTime: string | null; endTime: string | null }): boolean {
  return !t.allDay && !!t.startTime && !!t.endTime && t.endTime < t.startTime
}

/** One occurrence after applying its exception. */
export interface ExpandedOccurrence {
  seriesDate: IsoDate
  date: IsoDate
  overrides: EventOverrides
  modified: boolean
}

/**
 * Occurrences that start in [from, to], or started the day before and run past midnight into it.
 * An occurrence moved by an exception shows on its new date.
 */
export function occurrencesBetween(
  t: EventTiming,
  exceptions: EventException[],
  from: IsoDate,
  to: IsoDate,
): ExpandedOccurrence[] {
  const byDate = new Map(exceptions.map((x) => [x.occurrenceDate, x]))
  const result: ExpandedOccurrence[] = []
  const seen = new Set<IsoDate>()

  const consider = (seriesDate: IsoDate) => {
    if (seen.has(seriesDate)) return
    seen.add(seriesDate)
    const exception = byDate.get(seriesDate)
    if (exception?.status === 'cancelled') return
    const overrides = exception?.overrides ?? {}
    const date = overrides.startDate ?? seriesDate
    const timing = { ...t, ...overrides }
    const inRange = date >= from && date <= to
    const spillsIn = crossesMidnight(timing) && addDays(date, 1) >= from && date < from
    if (inRange || spillsIn) result.push({ seriesDate, date, overrides, modified: !!exception })
  }

  for (const day of seriesDates(t, addDays(from, -1), to)) consider(day)
  // Occurrences moved into the range from a date outside it.
  for (const x of exceptions) {
    if (x.status === 'modified' && x.overrides.startDate && isSeriesDate(t, x.occurrenceDate)) consider(x.occurrenceDate)
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
