import type { ClockTime, IsoDate } from '@/types'

// The "metro lines" of the week view. Each occurrence of a day is a station. When it overlaps
// others, its line runs down past them to a stop: a short extra row with the time
// it ends, in its place in the day's order. So the list reads as a timeline (what overlaps what,
// when the day is free again) and stays compact: an occurrence nothing overlaps is a lone station.
// A lane whose line has stopped is free for the next one, like the branches of a git graph.

/** At most this many lines at once; more go as lone stations. */
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
  /** The line's stop: it ends here. */
  stop: boolean
  /** A line from the top of the row to its middle. */
  up: boolean
  /** A line from the middle to the bottom of the row. */
  down: boolean
}

export interface MetroRow {
  /** Index of the occurrence in the day's items. */
  item: number
  /** Its stop row, rather than its station. */
  end: boolean
  cells: (MetroCell | null)[]
}

const minutes = (t: ClockTime) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/**
 * The rows of a day, for `items` as the day lists them (from the day before first, then all day,
 * then by start): each item's station, and the stops of those with a line. Every row has the same
 * number of columns: the most any row uses.
 */
export function metroRows(items: MetroItem[], day: IsoDate): MetroRow[] {
  const timed = (o: MetroItem) => !o.allDay && o.startTime !== null && o.endTime !== null
  // When each item starts and ends, in minutes of `day`.
  const start = items.map((o) => (o.date < day ? -1 : timed(o) ? minutes(o.startTime!) : 0))
  const end = items.map((o) =>
    !timed(o) ? 0 : o.date < day ? minutes(o.endTime!) : o.crossesMidnight ? Infinity : minutes(o.endTime!),
  )
  // Still on when the day ends: the line runs off the bottom, into the next day.
  const onwards = (i: number) => end[i] === Infinity
  // A line when it overlaps another timed item, or the next item starts while it is on; with a
  // stop unless it runs into the next day.
  const overlaps = (i: number, j: number) => start[i]! < end[j]! && start[j]! < end[i]!
  const lined = items.map(
    (o, i) =>
      timed(o) &&
      ((i + 1 < items.length && start[i + 1]! < end[i]!) || items.some((p, j) => j !== i && timed(p) && overlaps(i, j))),
  )

  // Stations in the items' order; each stop after the stations that start before it ends, and
  // before those that start just then (they don't overlap).
  const order = [
    ...items.map((_, i) => ({ item: i, end: false, at: start[i]!, rank: 1 })),
    ...items.flatMap((_, i) => (lined[i] && !onwards(i) ? [{ item: i, end: true, at: end[i]!, rank: 0 }] : [])),
  ].sort((a, b) => a.at - b.at || a.rank - b.rank || (a.end ? 0 : a.item - b.item))

  const rows = order.map((r) => ({ item: r.item, end: r.end, cells: Array<MetroCell | null>(MAX_LANES + 1).fill(null) }))
  const stopRow = new Map(rows.flatMap((r, k) => (r.end ? [[r.item, k] as const] : [])))
  /** The first row each lane is free again from. */
  const freeFrom = Array<number>(MAX_LANES).fill(0)
  const dropped = new Set<number>()

  rows.forEach((row, k) => {
    if (row.end) return
    const i = row.item
    const cell = { color: items[i]!.color, faded: items[i]!.busy, stop: false }
    const lane = lined[i] ? freeFrom.findIndex((free) => free <= k) : -1
    if (lane === -1) {
      // No line, or no lane left: a lone station in the first column nothing crosses.
      if (lined[i]) dropped.add(i)
      const column = row.cells.findIndex((c) => c === null)
      row.cells[column] = { ...cell, dot: true, up: items[i]!.date < day, down: false }
      return
    }
    const last = onwards(i) ? rows.length - 1 : stopRow.get(i)!
    freeFrom[lane] = last + 1
    row.cells[lane] = { ...cell, dot: true, up: items[i]!.date < day, down: true }
    for (let n = k + 1; n <= last; n++) {
      const stop = n === last && !onwards(i)
      rows[n]!.cells[lane] = { ...cell, dot: false, stop, up: true, down: !stop }
    }
  })

  const kept = rows.filter((r) => !(r.end && dropped.has(r.item)))
  const columns = Math.max(1, ...kept.map((r) => r.cells.reduce((n, c, k) => (c ? k + 1 : n), 0)))
  return kept.map((r) => ({ ...r, cells: r.cells.slice(0, columns) }))
}
