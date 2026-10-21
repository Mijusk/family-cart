import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  dayIn,
  dayOfMonth,
  daysBetween,
  isIsoDate,
  longDay,
  monthLabel,
  relativeDay,
  shortDay,
  startOfMonth,
  startOfWeek,
  today,
  weekday,
  weekdayShortDay,
} from './days'

describe('day arithmetic', () => {
  it('adds days across months, years and leap days', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('daylight saving changes never shift a day', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
  })

  it('counts days between, either way', () => {
    expect(daysBetween('2026-10-19', '2026-10-26')).toBe(7)
    expect(daysBetween('2026-10-26', '2026-10-19')).toBe(-7)
  })

  it('weekdays go from Monday (1) to Sunday (7)', () => {
    expect(weekday('2026-10-19')).toBe(1)
    expect(weekday('2026-10-25')).toBe(7)
  })

  it('weeks start on Monday', () => {
    expect(startOfWeek('2026-10-21')).toBe('2026-10-19')
    expect(startOfWeek('2026-10-19')).toBe('2026-10-19')
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26')
  })

  it('months', () => {
    expect(dayOfMonth('2026-10-07')).toBe(7)
    expect(startOfMonth('2026-10-21')).toBe('2026-10-01')
    expect(addMonths('2026-10-21', 1)).toBe('2026-11-01')
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01')
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-01')
  })
})

describe('today', () => {
  it('the day of a moment in a time zone', () => {
    // 23:30 UTC is already the next day in Madrid.
    expect(dayIn('Europe/Madrid', '2026-10-21T23:30:00Z')).toBe('2026-10-22')
    expect(dayIn('America/New_York', '2026-10-22T02:00:00Z')).toBe('2026-10-21')
  })

  it('a moment given to today() reads the device day', () => {
    expect(today(new Date(2026, 9, 21, 12))).toBe('2026-10-21')
  })
})

describe('labels', () => {
  it('long and short days, in Spanish', () => {
    expect(longDay('2026-10-22')).toBe('Jueves, 22 de octubre')
    expect(shortDay('2026-12-20')).toBe('20 dic')
    expect(weekdayShortDay('2026-10-23')).toBe('vie 23 oct')
    expect(monthLabel('2026-10-01')).toBe('Octubre 2026')
  })

  it('relative days', () => {
    expect(relativeDay('2026-10-21', '2026-10-21')).toBe('Hoy')
    expect(relativeDay('2026-10-22', '2026-10-21')).toBe('Mañana')
    expect(relativeDay('2026-10-20', '2026-10-21')).toBe('Ayer')
    expect(relativeDay('2026-10-23', '2026-10-21')).toBe('Viernes, 23 de octubre')
  })
})

describe('isIsoDate', () => {
  it('accepts real days only', () => {
    expect(isIsoDate('2026-10-21')).toBe(true)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('21/10/2026')).toBe(false)
    expect(isIsoDate('2026-10-21T10:00')).toBe(false)
    expect(isIsoDate(undefined)).toBe(false)
    expect(isIsoDate(['2026-10-21'])).toBe(false)
  })
})
