// Builds the .ics of a calendar feed from what public.feed_calendar() returns. Pure TypeScript
// (no Deno, no Supabase) so Vitest tests it from the app (npm test).
//
// Repetitions become RRULEs in the event's own time zone (TZID), so a weekly class stays at 17:30
// across the change of time. A cancelled day is an EXDATE; a changed one, a second VEVENT with the
// same UID and a RECURRENCE-ID, as calendar apps expect.

type Repeat = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'

export interface FeedException {
  occurrence_date: string
  status: 'cancelled' | 'modified'
  overrides: Partial<{
    title: string
    notes: string | null
    location: string | null
    all_day: boolean
    start_date: string
    start_time: string | null
    end_time: string | null
  }>
}

interface FeedTiming {
  id: string
  all_day: boolean
  start_date: string
  start_time: string | null
  end_time: string | null
  timezone: string
  repeat: Repeat
  repeat_weekdays: number[] | null
  repeat_until: string | null
  exceptions: FeedException[]
}

export interface FeedEvent extends FeedTiming {
  title: string
  notes: string | null
  location: string | null
  updated_at: string
  calendar: string
  owner: string
  mine: boolean
}

/** A slot of a folder shared as busy: times only. */
export interface FeedBusy extends FeedTiming {
  owner: string
}

export interface Feed {
  name: string
  timezone: string
  events: FeedEvent[]
  busy: FeedBusy[]
}

// ── Dates (ISO strings, as in src/utils/days.ts) ─────────────────────────────

const toUtc = (day: string) => Date.parse(day + 'T00:00:00Z')

function addDays(day: string, n: number): string {
  return new Date(toUtc(day) + n * 86_400_000).toISOString().slice(0, 10)
}

/** 1 = Monday … 7 = Sunday. */
const weekday = (day: string) => ((new Date(toUtc(day)).getUTCDay() + 6) % 7) + 1
const startOfWeek = (day: string) => addDays(day, 1 - weekday(day))

/** As isSeriesDate in src/lib/recurrence.ts. */
function isSeriesDate(t: FeedTiming, day: string): boolean {
  if (day < t.start_date || (t.repeat_until && day > t.repeat_until)) return false
  switch (t.repeat) {
    case 'none':
      return day === t.start_date
    case 'daily':
      return true
    case 'weekly':
      return (t.repeat_weekdays ?? []).includes(weekday(day))
    case 'biweekly': {
      const weeks = (toUtc(startOfWeek(day)) - toUtc(startOfWeek(t.start_date))) / (7 * 86_400_000)
      return Math.round(weeks) % 2 === 0 && (t.repeat_weekdays ?? []).includes(weekday(day))
    }
    case 'monthly':
      return day.slice(8) === t.start_date.slice(8)
  }
}

/**
 * The first real date of the series. A weekly event can start on a day that isn't one of its
 * weekdays; calendar apps would count DTSTART as an extra occurrence.
 */
function firstDate(t: FeedTiming): string | null {
  for (let i = 0, day = t.start_date; i < 14; i++, day = addDays(day, 1)) {
    if (t.repeat_until && day > t.repeat_until) return null
    if (isSeriesDate(t, day)) return day
  }
  return null
}

/** The UTC instant of a wall-clock time in a time zone. */
export function zonedToUtc(day: string, time: string, timezone: string): Date {
  const local = Date.parse(`${day}T${time.slice(0, 8).padEnd(8, ':00')}Z`)
  const offset = (at: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
        .formatToParts(new Date(at))
        .map((p) => [p.type, p.value]),
    )
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - at
  }
  const guess = local - offset(local)
  return new Date(local - offset(guess))
}

// ── Text ─────────────────────────────────────────────────────────────────────

const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

const escape = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const compactDate = (day: string) => day.replace(/-/g, '')
const compactTime = (time: string) => time.slice(0, 8).padEnd(8, ':00').replace(/:/g, '')
const compactUtc = (at: Date) => at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Lines longer than 75 bytes go on several, each continuation starting with a space (RFC 5545). */
function fold(line: string): string {
  const encoder = new TextEncoder()
  const out: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  out.push(current)
  return out.join('\r\n ')
}

// ── Time zones ───────────────────────────────────────────────────────────────

/**
 * Definitions for the zones that follow the EU change of time (last Sunday of March and of
 * October at 01:00 UTC). Other zones go by their IANA name only, which Google, Apple and Outlook
 * understand.
 */
function vtimezone(timezone: string): string[] {
  if (!/^(Europe|Atlantic\/(Canary|Madeira|Faroe))\//.test(timezone)) return []
  const minutes = (day: string) => {
    const at = zonedToUtc(day, '12:00', timezone)
    return Math.round((Date.parse(`${day}T12:00:00Z`) - at.getTime()) / 60_000)
  }
  const winter = minutes('2026-01-15')
  const summer = minutes('2026-07-15')
  const offset = (m: number) =>
    `${m < 0 ? '-' : '+'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}${String(Math.abs(m) % 60).padStart(2, '0')}`
  const lines = ['BEGIN:VTIMEZONE', `TZID:${timezone}`]
  if (winter === summer) {
    lines.push('BEGIN:STANDARD', 'DTSTART:19700101T000000', `TZOFFSETFROM:${offset(winter)}`, `TZOFFSETTO:${offset(winter)}`, 'END:STANDARD')
  } else {
    // The change is at 01:00 UTC: in local time, 01:00 plus the offset before the change.
    const at = (m: number) => `${String(1 + m / 60).padStart(2, '0')}0000`
    lines.push(
      'BEGIN:DAYLIGHT',
      `DTSTART:19700329T${at(winter)}`,
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
      `TZOFFSETFROM:${offset(winter)}`,
      `TZOFFSETTO:${offset(summer)}`,
      'END:DAYLIGHT',
      'BEGIN:STANDARD',
      `DTSTART:19701025T${at(summer)}`,
      'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
      `TZOFFSETFROM:${offset(summer)}`,
      `TZOFFSETTO:${offset(winter)}`,
      'END:STANDARD',
    )
  }
  lines.push('END:VTIMEZONE')
  return lines
}

// ── Events ───────────────────────────────────────────────────────────────────

interface Shown {
  summary: string
  description: string | null
  location: string | null
  all_day: boolean
  start_time: string | null
  end_time: string | null
}

/** DTSTART, DTEND (or the RECURRENCE-ID value) of one occurrence. */
function when(day: string, shown: Shown, timezone: string, property: 'DTSTART' | 'DTEND' | 'RECURRENCE-ID' | 'EXDATE'): string {
  if (shown.all_day) return `${property};VALUE=DATE:${compactDate(day)}`
  const time = property === 'DTEND' ? shown.end_time! : shown.start_time!
  return `${property};TZID=${timezone}:${compactDate(day)}T${compactTime(time)}`
}

function times(day: string, shown: Shown, timezone: string): string[] {
  if (shown.all_day) return [when(day, shown, timezone, 'DTSTART'), when(addDays(day, 1), shown, timezone, 'DTEND')]
  // An end earlier than the start is the next day (23:00–01:00).
  const endDay = shown.end_time! <= shown.start_time! ? addDays(day, 1) : day
  return [when(day, shown, timezone, 'DTSTART'), when(endDay, shown, timezone, 'DTEND')]
}

function rrule(t: FeedTiming, shownAllDay: boolean): string {
  const parts = [t.repeat === 'daily' ? 'FREQ=DAILY' : t.repeat === 'monthly' ? 'FREQ=MONTHLY' : 'FREQ=WEEKLY']
  if (t.repeat === 'biweekly') parts.push('INTERVAL=2')
  if (t.repeat === 'weekly' || t.repeat === 'biweekly') {
    parts.push('BYDAY=' + [...(t.repeat_weekdays ?? [])].sort().map((d) => WEEKDAY_CODES[d - 1]).join(','))
    parts.push('WKST=MO')
  }
  if (t.repeat_until) {
    // With a time zone, UNTIL must be in UTC: the end of that day where the event is.
    parts.push(
      'UNTIL=' +
        (shownAllDay
          ? compactDate(t.repeat_until)
          : compactUtc(zonedToUtc(t.repeat_until, '23:59:59', t.timezone))),
    )
  }
  return 'RRULE:' + parts.join(';')
}

function vevent(uid: string, stamp: string, day: string, shown: Shown, timezone: string, extra: string[]): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, ...times(day, shown, timezone), `SUMMARY:${escape(shown.summary)}`]
  if (shown.location) lines.push(`LOCATION:${escape(shown.location)}`)
  if (shown.description) lines.push(`DESCRIPTION:${escape(shown.description)}`)
  lines.push(...extra, 'END:VEVENT')
  return lines
}

function describe(e: FeedEvent, notes: string | null): string {
  const folder = e.mine ? `Carpeta «${e.calendar}»` : `Carpeta «${e.calendar}» de ${e.owner}`
  return notes ? `${notes}\n\n${folder}` : folder
}

/** One event as VEVENTs: the series (or the one-off) plus a VEVENT per changed day. */
function eventLines(
  t: FeedTiming,
  uid: string,
  stamp: string,
  base: Shown,
  shownFor: (x: FeedException) => Shown,
  extra: string[],
): string[] {
  const exceptions = t.exceptions.filter((x) => isSeriesDate(t, x.occurrence_date))

  if (t.repeat === 'none') {
    const x = exceptions[0]
    if (x?.status === 'cancelled') return []
    const shown = x ? shownFor(x) : base
    return vevent(uid, stamp, x?.overrides.start_date ?? t.start_date, shown, t.timezone, extra)
  }

  const first = firstDate(t)
  if (!first) return []
  const series = [rrule(t, base.all_day)]
  for (const x of exceptions) {
    if (x.status === 'cancelled') series.push(when(x.occurrence_date, base, t.timezone, 'EXDATE'))
  }
  const lines = vevent(uid, stamp, first, base, t.timezone, [...series, ...extra])
  for (const x of exceptions) {
    if (x.status !== 'modified') continue
    const recurrenceId = when(x.occurrence_date, base, t.timezone, 'RECURRENCE-ID')
    lines.push(...vevent(uid, stamp, x.overrides.start_date ?? x.occurrence_date, shownFor(x), t.timezone, [recurrenceId, ...extra]))
  }
  return lines
}

export function buildIcs(feed: Feed, now: Date = new Date()): string {
  const stamp = compactUtc(now)
  const zones = new Set([feed.timezone, ...feed.events.map((e) => e.timezone), ...feed.busy.map((b) => b.timezone)])
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Family App//Calendario//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(`Family App · ${feed.name}`)}`,
    `X-WR-TIMEZONE:${feed.timezone}`,
    // Hints only: Google refreshes on its own schedule (every few hours).
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...[...zones].flatMap(vtimezone),
  ]

  for (const e of feed.events) {
    const summary = (title: string) => (e.mine ? title : `${e.owner} · ${title}`)
    const base: Shown = {
      summary: summary(e.title),
      description: describe(e, e.notes),
      location: e.location,
      all_day: e.all_day,
      start_time: e.start_time,
      end_time: e.end_time,
    }
    const shownFor = (x: FeedException): Shown => {
      const o = x.overrides
      return {
        summary: summary(o.title ?? e.title),
        description: describe(e, o.notes !== undefined ? o.notes : e.notes),
        location: o.location !== undefined ? o.location : e.location,
        all_day: o.all_day ?? e.all_day,
        start_time: o.start_time !== undefined ? o.start_time : e.start_time,
        end_time: o.end_time !== undefined ? o.end_time : e.end_time,
      }
    }
    const modified = `LAST-MODIFIED:${compactUtc(new Date(e.updated_at))}`
    lines.push(...eventLines(e, `${e.id}@family-app`, stamp, base, shownFor, [modified]))
  }

  for (const b of feed.busy) {
    const base: Shown = {
      summary: `Ocupado · ${b.owner}`,
      description: null,
      location: null,
      all_day: b.all_day,
      start_time: b.start_time,
      end_time: b.end_time,
    }
    const shownFor = (x: FeedException): Shown => ({
      ...base,
      all_day: x.overrides.all_day ?? b.all_day,
      start_time: x.overrides.start_time !== undefined ? x.overrides.start_time : b.start_time,
      end_time: x.overrides.end_time !== undefined ? x.overrides.end_time : b.end_time,
    })
    lines.push(...eventLines(b, `busy-${b.id}@family-app`, stamp, base, shownFor, []))
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
