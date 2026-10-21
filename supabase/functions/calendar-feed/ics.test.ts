import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'
import { occurrencesBetween } from '@/lib/recurrence'
import type { EventException } from '@/types'
import { buildIcs, zonedToUtc, type Feed, type FeedEvent, type FeedException } from './ics.ts'

// 2026-10-19 is a Monday. In Madrid the clocks go back on 2026-10-25.
function event(change: Partial<FeedEvent> = {}): FeedEvent {
  return {
    id: 'e1',
    title: 'Clase',
    notes: null,
    location: null,
    all_day: false,
    start_date: '2026-10-19',
    start_time: '17:30:00',
    end_time: '18:30:00',
    timezone: 'Europe/Madrid',
    repeat: 'none',
    repeat_weekdays: null,
    repeat_until: null,
    exceptions: [],
    updated_at: '2026-10-16T20:48:34.427634+00:00',
    calendar: 'Colegio',
    owner: 'Pablo',
    mine: true,
    ...change,
  }
}

const feed = (events: FeedEvent[], busy: Feed['busy'] = []): Feed => ({ name: 'Marta', timezone: 'Europe/Madrid', events, busy })
const ics = (...events: FeedEvent[]) => buildIcs(feed(events), new Date('2026-10-21T10:00:00Z'))

/** Start dates (and local start times) an iCalendar client would show in [from, to]. */
function clientOccurrences(text: string, from: string, to: string): string[] {
  const calendar = new ICAL.Component(ICAL.parse(text))
  for (const zone of calendar.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(zone)
  const vevents = calendar.getAllSubcomponents('vevent').map((v) => new ICAL.Event(v))
  const masters = vevents.filter((e) => !e.isRecurrenceException())
  for (const e of vevents.filter((e) => e.isRecurrenceException())) masters.find((m) => m.uid === e.uid)!.relateException(e)

  const result: string[] = []
  for (const master of masters) {
    if (!master.isRecurring()) {
      const start = master.startDate.toString()
      if (start.slice(0, 10) >= from && start.slice(0, 10) <= to) result.push(start)
      continue
    }
    const it = master.iterator()
    for (let next = it.next(); next && next.toString().slice(0, 10) <= addDay(to); next = it.next()) {
      const start = master.getOccurrenceDetails(next).startDate.toString()
      if (start.slice(0, 10) >= from && start.slice(0, 10) <= to) result.push(start)
    }
  }
  return result.sort()
}

const addDay = (day: string) => new Date(Date.parse(day + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10)

/** The same occurrences as the app computes them (src/lib/recurrence.ts). */
function appOccurrences(e: FeedEvent, from: string, to: string): string[] {
  const exceptions: EventException[] = e.exceptions.map((x) => ({
    eventId: e.id,
    occurrenceDate: x.occurrence_date,
    status: x.status,
    overrides: {
      startDate: x.overrides.start_date,
      startTime: x.overrides.start_time?.slice(0, 5),
      endTime: x.overrides.end_time?.slice(0, 5),
    },
  }))
  const timing = {
    allDay: e.all_day,
    startDate: e.start_date,
    startTime: e.start_time?.slice(0, 5) ?? null,
    endTime: e.end_time?.slice(0, 5) ?? null,
    repeat: e.repeat,
    repeatWeekdays: e.repeat_weekdays,
    repeatUntil: e.repeat_until,
  }
  return occurrencesBetween(timing, exceptions, from, to)
    .filter((o) => o.date >= from)
    .map((o) => `${o.date}T${(o.overrides.startTime ?? timing.startTime) + ':00'}`)
    .sort()
}

describe('repetitions match what the app shows', () => {
  const cases: [string, Partial<FeedEvent>][] = [
    ['weekly on weekdays', { repeat: 'weekly', repeat_weekdays: [1, 2, 3, 4, 5] }],
    ['weekly, starting on a day that is not one of its weekdays', { repeat: 'weekly', start_date: '2026-10-20', repeat_weekdays: [1, 4] }],
    ['every two weeks', { repeat: 'biweekly', start_date: '2026-10-21', repeat_weekdays: [3, 6] }],
    ['every two weeks, the first weekday already gone', { repeat: 'biweekly', start_date: '2026-10-24', repeat_weekdays: [1, 3] }],
    ['daily until a date', { repeat: 'daily', repeat_until: '2026-11-03' }],
    ['daily until a date, late at night', { repeat: 'daily', start_time: '23:30:00', end_time: '00:30:00', repeat_until: '2026-10-28' }],
    ['monthly on the 31st (skips short months)', { repeat: 'monthly', start_date: '2026-10-31' }],
    [
      'weekly with a cancelled and a moved day',
      {
        repeat: 'weekly',
        repeat_weekdays: [2, 4],
        exceptions: [
          { occurrence_date: '2026-10-22', status: 'cancelled', overrides: {} },
          { occurrence_date: '2026-10-27', status: 'modified', overrides: { start_date: '2026-10-28', start_time: '10:00:00', end_time: '11:00:00' } },
          { occurrence_date: '2026-11-05', status: 'modified', overrides: { title: 'Clase en el patio' } },
        ] satisfies FeedException[],
      },
    ],
  ]

  for (const [name, change] of cases) {
    it(name, () => {
      const e = event(change)
      expect(clientOccurrences(ics(e), '2026-10-19', '2027-03-31')).toEqual(appOccurrences(e, '2026-10-19', '2027-03-31'))
    })
  }
})

describe('buildIcs', () => {
  it('times are in the event time zone, defined for Madrid', () => {
    const text = ics(event())
    expect(text).toContain('DTSTART;TZID=Europe/Madrid:20261019T173000')
    expect(text).toContain('DTEND;TZID=Europe/Madrid:20261019T183000')
    expect(text).toContain('TZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200')
    expect(text).toContain('DTSTART:19701025T030000')
  })

  it('keeps the local time across the change of time', () => {
    const text = ics(event({ repeat: 'weekly', repeat_weekdays: [1] }))
    expect(clientOccurrences(text, '2026-10-19', '2026-11-02')).toEqual(['2026-10-19T17:30:00', '2026-10-26T17:30:00', '2026-11-02T17:30:00'])
  })

  it('an end earlier than the start is the next day', () => {
    expect(ics(event({ start_time: '23:00:00', end_time: '00:30:00' }))).toContain('DTEND;TZID=Europe/Madrid:20261020T003000')
  })

  it('all-day events end the next day, as dates', () => {
    const text = ics(event({ all_day: true, start_time: null, end_time: null }))
    expect(text).toContain('DTSTART;VALUE=DATE:20261019')
    expect(text).toContain('DTEND;VALUE=DATE:20261020')
  })

  it('UNTIL is the end of the last day in UTC', () => {
    expect(ics(event({ repeat: 'daily', repeat_until: '2026-11-03' }))).toContain('UNTIL=20261103T225959Z')
  })

  it("other people's events say whose they are, with the folder", () => {
    const text = ics(event({ mine: false, owner: 'Daniel', title: 'Pádel', calendar: 'Gimnasio', notes: 'Con Javi' }))
    expect(text).toContain('SUMMARY:Daniel · Pádel')
    expect(text).toContain('DESCRIPTION:Con Javi\\n\\nCarpeta «Gimnasio» de Daniel')
  })

  it('busy slots have no details', () => {
    const text = buildIcs(
      feed([], [{ ...event({ title: 'Secreto', location: 'Sitio' }), owner: 'Daniel' }]),
      new Date('2026-10-21T10:00:00Z'),
    )
    expect(text).toContain('SUMMARY:Ocupado · Daniel')
    expect(text).not.toContain('Secreto')
    expect(text).not.toContain('Sitio')
  })

  it('escapes text and folds long lines (CRLF, 75 bytes)', () => {
    const text = ics(event({ title: 'Clase, aula 3; ' + 'ñ'.repeat(60) }))
    expect(text).toContain('SUMMARY:Clase\\, aula 3\\; ')
    for (const line of text.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(text.replace(/\r\n /g, '')).toContain('ñ'.repeat(60))
  })

  it('a cancelled one-off event is left out', () => {
    const text = ics(event({ exceptions: [{ occurrence_date: '2026-10-19', status: 'cancelled', overrides: {} }] }))
    expect(text).not.toContain('BEGIN:VEVENT')
  })
})

describe('zonedToUtc', () => {
  it('uses the offset of that day', () => {
    expect(zonedToUtc('2026-10-24', '12:00', 'Europe/Madrid').toISOString()).toBe('2026-10-24T10:00:00.000Z')
    expect(zonedToUtc('2026-10-26', '12:00', 'Europe/Madrid').toISOString()).toBe('2026-10-26T11:00:00.000Z')
    expect(zonedToUtc('2026-10-26', '12:00', 'Atlantic/Canary').toISOString()).toBe('2026-10-26T12:00:00.000Z')
  })
})
