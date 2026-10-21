import { describe, expect, it } from 'vitest'
import type { EventException, EventTiming } from '@/types'
import { crossesMidnight, isSeriesDate, occurrencesBetween, seriesDates } from './recurrence'

// 2026-10-19 is a Monday.
function timing(change: Partial<EventTiming> = {}): EventTiming {
  return {
    allDay: false,
    startDate: '2026-10-19',
    startTime: '17:00',
    endTime: '18:00',
    repeat: 'none',
    repeatWeekdays: null,
    repeatUntil: null,
    ...change,
  }
}

describe('isSeriesDate', () => {
  it('a one-off event is only on its day', () => {
    expect(isSeriesDate(timing(), '2026-10-19')).toBe(true)
    expect(isSeriesDate(timing(), '2026-10-20')).toBe(false)
  })

  it('never before the start or after the end', () => {
    const t = timing({ repeat: 'daily', repeatUntil: '2026-10-25' })
    expect(isSeriesDate(t, '2026-10-18')).toBe(false)
    expect(isSeriesDate(t, '2026-10-19')).toBe(true)
    expect(isSeriesDate(t, '2026-10-25')).toBe(true)
    expect(isSeriesDate(t, '2026-10-26')).toBe(false)
  })

  it('weekly on the chosen weekdays', () => {
    const t = timing({ repeat: 'weekly', repeatWeekdays: [1, 3, 5] })
    expect(seriesDates(t, '2026-10-19', '2026-10-25')).toEqual(['2026-10-19', '2026-10-21', '2026-10-23'])
  })

  it('weekly without weekdays never happens', () => {
    expect(seriesDates(timing({ repeat: 'weekly', repeatWeekdays: null }), '2026-10-19', '2026-11-30')).toEqual([])
  })

  it('biweekly counts weeks from the week of the start, not from its day', () => {
    // Starts on Wednesday, repeats on Monday: the Monday of the first week is before the start.
    const t = timing({ startDate: '2026-10-21', repeat: 'biweekly', repeatWeekdays: [1, 3] })
    expect(seriesDates(t, '2026-10-19', '2026-11-15')).toEqual(['2026-10-21', '2026-11-02', '2026-11-04'])
  })

  it('biweekly keeps its rhythm across the daylight saving change', () => {
    // Spain changes the clock on 2026-03-29 and 2026-10-25.
    const t = timing({ startDate: '2026-03-23', repeat: 'biweekly', repeatWeekdays: [1] })
    expect(seriesDates(t, '2026-03-23', '2026-04-30')).toEqual(['2026-03-23', '2026-04-06', '2026-04-20'])
  })

  it('monthly on the same day, skipping months without it', () => {
    const t = timing({ startDate: '2026-01-31', repeat: 'monthly' })
    expect(seriesDates(t, '2026-01-01', '2026-06-30')).toEqual(['2026-01-31', '2026-03-31', '2026-05-31'])
  })
})

describe('seriesDates', () => {
  it('a one-off event inside or outside the range', () => {
    expect(seriesDates(timing(), '2026-10-01', '2026-10-31')).toEqual(['2026-10-19'])
    expect(seriesDates(timing(), '2026-11-01', '2026-11-30')).toEqual([])
  })

  it('stops at repeatUntil within the range', () => {
    const t = timing({ repeat: 'daily', repeatUntil: '2026-10-21' })
    expect(seriesDates(t, '2026-10-01', '2026-10-31')).toEqual(['2026-10-19', '2026-10-20', '2026-10-21'])
  })

  it('crosses the end of the year', () => {
    const t = timing({ startDate: '2026-12-30', repeat: 'daily' })
    expect(seriesDates(t, '2026-12-29', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
  })
})

describe('crossesMidnight', () => {
  it('when the end is earlier than the start', () => {
    expect(crossesMidnight({ allDay: false, startTime: '23:00', endTime: '01:00' })).toBe(true)
    expect(crossesMidnight({ allDay: false, startTime: '08:00', endTime: '15:00' })).toBe(false)
    expect(crossesMidnight({ allDay: false, startTime: '10:00', endTime: '10:00' })).toBe(false)
    expect(crossesMidnight({ allDay: true, startTime: null, endTime: null })).toBe(false)
  })
})

describe('occurrencesBetween', () => {
  const weekly = timing({ repeat: 'weekly', repeatWeekdays: [1, 3] })
  const exception = (change: Partial<EventException>): EventException => ({
    eventId: 'e1',
    occurrenceDate: '2026-10-21',
    status: 'modified',
    overrides: {},
    ...change,
  })
  const dates = (list: { date: string }[]) => list.map((o) => o.date)

  it('leaves out cancelled occurrences', () => {
    const list = occurrencesBetween(weekly, [exception({ status: 'cancelled' })], '2026-10-19', '2026-10-25')
    expect(dates(list)).toEqual(['2026-10-19'])
  })

  it('applies the overrides and marks it as modified', () => {
    const list = occurrencesBetween(
      weekly,
      [exception({ overrides: { title: 'Dentista', startTime: '19:00' } })],
      '2026-10-19',
      '2026-10-25',
    )
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ date: '2026-10-19', modified: false, overrides: {} })
    expect(list[1]).toMatchObject({ seriesDate: '2026-10-21', modified: true, overrides: { title: 'Dentista' } })
  })

  it('shows a moved occurrence on its new date, in order', () => {
    // Wednesday's moved to Saturday.
    const moved = [exception({ overrides: { startDate: '2026-10-24' } })]
    expect(dates(occurrencesBetween(weekly, moved, '2026-10-19', '2026-10-25'))).toEqual(['2026-10-19', '2026-10-24'])
    // Only Saturday asked for: it shows although its series date is outside.
    const list = occurrencesBetween(weekly, moved, '2026-10-24', '2026-10-24')
    expect(list).toEqual([{ seriesDate: '2026-10-21', date: '2026-10-24', overrides: { startDate: '2026-10-24' }, modified: true }])
    // And not on its series date anymore.
    expect(occurrencesBetween(weekly, moved, '2026-10-21', '2026-10-21')).toEqual([])
  })

  it('brings in an occurrence moved in from another week', () => {
    const moved = [exception({ occurrenceDate: '2026-10-26', overrides: { startDate: '2026-10-22' } })]
    expect(dates(occurrencesBetween(weekly, moved, '2026-10-22', '2026-10-22'))).toEqual(['2026-10-22'])
  })

  it('ignores an exception for a date that is not in the series', () => {
    const stray = [exception({ occurrenceDate: '2026-10-20', overrides: { startDate: '2026-10-22' } })]
    expect(occurrencesBetween(weekly, stray, '2026-10-22', '2026-10-22')).toEqual([])
  })

  it('includes last night’s occurrence that runs past midnight', () => {
    const night = timing({ startTime: '23:00', endTime: '01:00', repeat: 'daily' })
    const list = occurrencesBetween(night, [], '2026-10-21', '2026-10-21')
    expect(dates(list)).toEqual(['2026-10-20', '2026-10-21'])
  })

  it('does not include last night’s occurrence that ends before midnight', () => {
    expect(dates(occurrencesBetween(timing({ repeat: 'daily' }), [], '2026-10-21', '2026-10-21'))).toEqual(['2026-10-21'])
  })

  it('a one-off night event shows the next day too', () => {
    const night = timing({ startTime: '23:00', endTime: '01:00' })
    expect(dates(occurrencesBetween(night, [], '2026-10-20', '2026-10-20'))).toEqual(['2026-10-19'])
    expect(occurrencesBetween(night, [], '2026-10-21', '2026-10-21')).toEqual([])
  })
})
