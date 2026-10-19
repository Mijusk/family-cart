import type { ClockTime, IsoDate } from '@/types'

// The time scale of the week view, like a calendar agenda: a day's timed occurrences as blocks
// whose height follows the clock. It runs from the first hour something starts to the last hour
// something ends; long stretches with nothing on shrink to a short "free" band, so an empty
// afternoon doesn't take a screen. Occurrences on at once sit side by side in columns.

/** Height of one hour. */
export const HOUR_PX = 44
/** Height of a shrunk stretch. */
export const GAP_PX = 34
/** Whole free hours from which a stretch shrinks. */
export const MIN_GAP_MINUTES = 120
/** A block is never shorter than this, so a short occurrence still shows its title. */
export const MIN_BLOCK_PX = 22
/** Room above the first hour and below the last one. */
const PAD_PX = 12

export interface TimelineItem {
  date: IsoDate
  allDay: boolean
  startTime: ClockTime | null
  endTime: ClockTime | null
  crossesMidnight: boolean
}

export interface TimelineBlock {
  /** Index of the occurrence in the day's items. */
  item: number
  top: number
  height: number
  /** Its column, and how many columns its group of overlapping occurrences has. */
  column: number
  columns: number
}

export interface Timeline {
  /** 0 when nothing is timed. */
  height: number
  blocks: TimelineBlock[]
  /** A line and a label per whole hour shown. */
  hours: { label: string; top: number }[]
  /** The shrunk stretches. */
  gaps: { top: number; minutes: number }[]
  /** Where a moment of the day goes, or null outside the scale or in a shrunk stretch. */
  at: (minute: number) => number | null
}

const minutes = (t: ClockTime) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const floorHour = (m: number) => Math.floor(m / 60) * 60
const ceilHour = (m: number) => Math.ceil(m / 60) * 60
const hourLabel = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:00`

/** The time scale of `day` for its items; all-day ones are left out (they go above it). */
export function timeline(items: TimelineItem[], day: IsoDate): Timeline {
  const timed = items.flatMap((o, item) => {
    if (o.allDay || o.startTime === null || o.endTime === null) return []
    const start = o.date < day ? 0 : minutes(o.startTime)
    const end = o.date < day ? minutes(o.endTime) : o.crossesMidnight ? 24 * 60 : minutes(o.endTime)
    // An occurrence without length still takes a moment.
    return [{ item, start, end: Math.max(end, start + 1) }]
  })
  if (!timed.length) return { height: 0, blocks: [], hours: [], gaps: [], at: () => null }

  // Busy stretches: the occurrences merged where they touch.
  const sorted = [...timed].sort((a, b) => a.start - b.start || b.end - a.end)
  const busy: { start: number; end: number }[] = []
  for (const o of sorted) {
    const last = busy.at(-1)
    if (last && o.start <= last.end) last.end = Math.max(last.end, o.end)
    else busy.push({ start: o.start, end: o.end })
  }

  // The scale, in pieces: whole hours that are shown, and free stretches that shrink.
  const pieces: { from: number; to: number; shrunk: boolean }[] = []
  let from = floorHour(busy[0]!.start)
  for (let k = 0; k + 1 < busy.length; k++) {
    const freeFrom = ceilHour(busy[k]!.end)
    const freeTo = floorHour(busy[k + 1]!.start)
    if (freeTo - freeFrom < MIN_GAP_MINUTES) continue
    pieces.push({ from, to: freeFrom, shrunk: false }, { from: freeFrom, to: freeTo, shrunk: true })
    from = freeTo
  }
  pieces.push({ from, to: Math.min(ceilHour(busy.at(-1)!.end), 24 * 60), shrunk: false })

  const tops: number[] = []
  let y = PAD_PX
  for (const p of pieces) {
    tops.push(y)
    y += p.shrunk ? GAP_PX : ((p.to - p.from) / 60) * HOUR_PX
  }
  const height = y + PAD_PX

  function at(minute: number): number | null {
    // The edges of a shrunk stretch belong to the hours around it.
    const k = pieces.findIndex((p) => !p.shrunk && minute >= p.from && minute <= p.to)
    const p = pieces[k]
    if (!p) return null
    return tops[k]! + ((minute - p.from) / 60) * HOUR_PX
  }
  // Occurrences never fall in a shrunk stretch, so their edges are always on the scale.
  const place = (minute: number) => at(minute)!

  const hours: Timeline['hours'] = []
  for (const p of pieces) {
    if (p.shrunk) continue
    for (let m = p.from; m <= p.to; m += 60) hours.push({ label: hourLabel(m), top: place(m) })
  }
  const gaps = pieces.flatMap((p, k) => (p.shrunk ? [{ top: tops[k]!, minutes: p.to - p.from }] : []))

  // Columns: within each group of occurrences that overlap one another, the first column free.
  const blocks: TimelineBlock[] = []
  let group: TimelineBlock[] = []
  let groupEnd = -1
  const columnEnds: number[] = []
  const closeGroup = () => {
    for (const b of group) b.columns = columnEnds.length
    group = []
    columnEnds.length = 0
  }
  for (const o of sorted) {
    if (o.start >= groupEnd) closeGroup()
    let column = columnEnds.findIndex((end) => end <= o.start)
    if (column === -1) column = columnEnds.push(0) - 1
    columnEnds[column] = o.end
    groupEnd = Math.max(groupEnd, o.end)
    const top = place(o.start)
    const block = { item: o.item, top, height: Math.max(place(o.end) - top, MIN_BLOCK_PX), column, columns: 1 }
    group.push(block)
    blocks.push(block)
  }
  closeGroup()

  return { height, blocks, hours, gaps, at }
}
