import type { ClockTime, IsoDate } from '@/types'

// The "metro lines" of the week view. Each timed occurrence of a day is a station on a lane; its
// line runs down past the rows that start while it is still on, and ends there. A lane whose line
// has ended is free for the next station, like the branches of a git graph. Rows stay a list:
// a line spans rows, not a time scale.

/** At most this many lanes a day; more at once go without a line. */
export const MAX_LANES = 4

export interface MetroItem {
  color: string
  busy: boolean
  date: IsoDate
  allDay: boolean
  startTime: ClockTime | null
  endTime: ClockTime | null
  crossesMidnight: boolean
}

/** What one column of a row's gutter shows. Lines run along the column's middle. */
export interface MetroCell {
  color: string
  /** A busy slot: lighter. */
  faded: boolean
  /** The station: this row's own occurrence. */
  dot: boolean
  /** A line from the top of the row to its middle. */
  up: boolean
  /** A line from the middle to the bottom of the row. */
  down: boolean
  /** The line ends near the bottom of this row (it doesn't reach the next one). */
  end: boolean
}

export type MetroRow = (MetroCell | null)[]

const minutes = (t: ClockTime) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/**
 * The gutter of each row, for `items` as the day lists them (from the day before first, then all
 * day, then by start). Every row has the same number of columns: the most any row uses.
 */
export function metroRows(items: MetroItem[], day: IsoDate): MetroRow[] {
  const timed = (o: MetroItem) => !o.allDay && o.startTime !== null && o.endTime !== null
  // When each row starts and when each timed occurrence ends, in minutes of `day`.
  const start = items.map((o) => (o.date < day ? -1 : timed(o) ? minutes(o.startTime!) : 0))
  const end = items.map((o) =>
    !timed(o) ? 0 : o.date < day ? minutes(o.endTime!) : o.crossesMidnight ? Infinity : minutes(o.endTime!),
  )

  const rows: MetroRow[] = items.map(() => Array<MetroCell | null>(MAX_LANES + 1).fill(null))
  /** The first row each lane is free again from. */
  const freeFrom = Array<number>(MAX_LANES).fill(0)

  items.forEach((o, i) => {
    const cell = { color: o.color, faded: o.busy }
    const lane = timed(o) ? freeFrom.findIndex((row) => row <= i) : -1
    if (lane === -1) {
      // All day, or no lane left: a station without a line, in the first column nothing crosses.
      const column = rows[i]!.findIndex((c) => c === null)
      rows[i]![column] = { ...cell, dot: true, up: false, down: false, end: false }
      return
    }
    // The rows it is still on for: those that start before it ends.
    let last = i
    while (last + 1 < items.length && start[last + 1]! < end[i]!) last++
    // Still on when the day ends: the line runs off the bottom, into the next day.
    const onwards = end[i] === Infinity
    freeFrom[lane] = last + 1
    rows[i]![lane] = { ...cell, dot: true, up: o.date < day, down: last > i || onwards, end: false }
    for (let k = i + 1; k <= last; k++) {
      rows[k]![lane] = { ...cell, dot: false, up: true, down: true, end: k === last && !onwards }
    }
  })

  const columns = Math.max(1, ...rows.map((row) => row.reduce((n, c, k) => (c ? k + 1 : n), 0)))
  return rows.map((row) => row.slice(0, columns))
}
