import { describe, expect, it } from 'vitest'
import { GAP_PX, HOUR_PX, MIN_BLOCK_PX, timeline, type TimelineItem } from './timeline'

const day = '2026-10-21'
const item = (startTime: string, endTime: string, change: Partial<TimelineItem> = {}): TimelineItem => ({
  date: day,
  allDay: false,
  startTime,
  endTime,
  crossesMidnight: endTime < startTime,
  ...change,
})

describe('timeline', () => {
  it('empty without timed occurrences', () => {
    const t = timeline([{ date: day, allDay: true, startTime: null, endTime: null, crossesMidnight: false }], day)
    expect(t.height).toBe(0)
    expect(t.blocks).toEqual([])
    expect(t.at(600)).toBeNull()
  })

  it('runs from the first hour something starts to the last hour something ends', () => {
    const t = timeline([item('09:30', '10:15')], day)
    expect(t.hours.map((h) => h.label)).toEqual(['09:00', '10:00', '11:00'])
    expect(t.blocks[0]!.height).toBe(HOUR_PX * 0.75)
  })

  it('shrinks long free stretches', () => {
    const t = timeline([item('08:00', '09:00'), item('15:00', '16:00')], day)
    expect(t.gaps).toEqual([{ top: expect.any(Number), minutes: 6 * 60 }])
    // Hours inside the gap are not on the scale.
    expect(t.at(12 * 60)).toBeNull()
    expect(t.hours.map((h) => h.label)).toEqual(['08:00', '09:00', '15:00', '16:00'])
    const [a, b] = t.blocks
    expect(b!.top - (a!.top + a!.height)).toBe(GAP_PX)
  })

  it('keeps short free stretches at full size', () => {
    const t = timeline([item('08:00', '09:00'), item('10:30', '11:00')], day)
    expect(t.gaps).toEqual([])
  })

  it('puts overlapping occurrences side by side and reuses a free column', () => {
    const t = timeline([item('10:00', '12:00'), item('11:00', '13:00'), item('12:00', '12:30')], day)
    const byItem = Object.fromEntries(t.blocks.map((b) => [b.item, b]))
    expect(byItem[0]).toMatchObject({ column: 0, columns: 2 })
    expect(byItem[1]).toMatchObject({ column: 1, columns: 2 })
    // Starts when the first ends: takes its column.
    expect(byItem[2]).toMatchObject({ column: 0, columns: 2 })
  })

  it('separate groups each have their own columns', () => {
    const t = timeline([item('10:00', '11:00'), item('11:00', '12:00')], day)
    expect(t.blocks.map((b) => [b.column, b.columns])).toEqual([[0, 1], [0, 1]])
  })

  it('a short occurrence still gets the minimum height', () => {
    expect(timeline([item('10:00', '10:05')], day).blocks[0]!.height).toBe(MIN_BLOCK_PX)
  })

  it('crossing midnight: to the end of the day, and from its start the next day', () => {
    const tonight = timeline([item('23:00', '01:00')], day)
    expect(tonight.hours.at(-1)!.label).toBe('00:00')
    const tomorrow = timeline([item('23:00', '01:00')], '2026-10-22')
    expect(tomorrow.hours.map((h) => h.label)).toEqual(['00:00', '01:00'])
  })
})
