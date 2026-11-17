import { describe, expect, it } from 'vitest'
import {
  CHANGE_SECONDS,
  DEFAULT_HOLD,
  LEAD_IN,
  ROUTINES,
  cleanHold,
  durationText,
  holdOf,
  momentAt,
  nextStart,
  planLength,
  planOf,
  previousStart,
  routineById,
} from './stretching'
import { figureSvg } from './stretchFigure'

const morning = routineById('despertar')!
const plan = planOf(morning.stretches, 15)

describe('routines', () => {
  it('the morning one has the 18 stretches of the video, unique ids, only the sumo held longer', () => {
    expect(morning.stretches).toHaveLength(18)
    expect(new Set(morning.stretches.map((s) => s.id)).size).toBe(18)
    expect(morning.stretches.filter((s) => s.long).map((s) => s.id)).toEqual(['sumo'])
  })

  it('every routine has a title, tips and stretches with how to do them', () => {
    for (const r of ROUTINES) {
      expect(r.title).not.toBe('')
      expect(r.tips.length).toBeGreaterThan(0)
      for (const s of r.stretches) expect(s.how.length).toBeGreaterThan(20)
    }
  })

  it('every pose draws an SVG inside its board', () => {
    for (const s of morning.stretches) {
      const svg = figureSvg(s.pose, s.title)
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg).toContain(`aria-label="${s.title}"`)
      expect(svg).not.toContain('NaN')
      const p = s.pose
      const points = [p.neck, p.hip, p.headNeck, p.head.center, ...p.arms.flatMap((a) => [a.shoulder, a.elbow, a.hand]), ...p.legs.flatMap((l) => [l.hip, l.knee, l.foot])]
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(10)
        expect(x).toBeLessThanOrEqual(190)
        expect(y).toBeGreaterThanOrEqual(10)
        expect(y).toBeLessThanOrEqual(140)
      }
    }
  })
})

describe('settings', () => {
  it('keeps a known hold time and falls back to 15 s otherwise', () => {
    expect(cleanHold({ hold: 20 })).toBe(20)
    expect(cleanHold(30)).toBe(30)
    expect(cleanHold({ hold: 12 })).toBe(DEFAULT_HOLD)
    expect(cleanHold(null)).toBe(DEFAULT_HOLD)
    expect(cleanHold('15')).toBe(DEFAULT_HOLD)
  })

  it('the long ones are held twice as long', () => {
    expect(holdOf(morning.stretches[0]!, 15)).toBe(15)
    expect(holdOf(morning.stretches[17]!, 15)).toBe(30)
  })
})

describe('the session', () => {
  it('gets ready, then holds each stretch with a change in between', () => {
    expect(plan[0]).toEqual({ kind: 'ready', index: 0, start: 0, seconds: LEAD_IN })
    expect(plan[1]).toEqual({ kind: 'hold', index: 0, start: LEAD_IN, seconds: 15 })
    expect(plan[2]).toEqual({ kind: 'change', index: 1, start: LEAD_IN + 15, seconds: CHANGE_SECONDS })
    expect(plan).toHaveLength(36)
    // 3 + 17 × 15 + 30 + 17 × 3
    expect(planLength(plan)).toBe(3 + 17 * 15 + 30 + 17 * 3)
  })

  it('says where it is and how many seconds are left', () => {
    expect(momentAt(plan, 0)).toMatchObject({ segment: { kind: 'ready' }, secondsLeft: 3 })
    expect(momentAt(plan, 3)).toMatchObject({ segment: { kind: 'hold', index: 0 }, secondsLeft: 15, progress: 0 })
    expect(momentAt(plan, 17.9)).toMatchObject({ segment: { kind: 'hold', index: 0 }, secondsLeft: 1 })
    expect(momentAt(plan, 18)).toMatchObject({ segment: { kind: 'change', index: 1 }, secondsLeft: 3 })
    expect(momentAt(plan, planLength(plan) - 0.1)).toMatchObject({ segment: { kind: 'hold', index: 17 } })
    expect(momentAt(plan, planLength(plan))).toBeNull()
  })

  it('«Saltar» goes to holding the next stretch, and past the last one ends', () => {
    expect(nextStart(plan, 1)).toBe(3)
    expect(nextStart(plan, 5)).toBe(21)
    expect(nextStart(plan, 19)).toBe(21)
    expect(nextStart(plan, planLength(plan) - 1)).toBeNull()
    expect(nextStart(plan, planLength(plan) + 1)).toBeNull()
  })

  it('«Anterior» restarts the stretch, or goes to the one before if it has just begun', () => {
    expect(previousStart(plan, 10)).toBe(3)
    expect(previousStart(plan, 22)).toBe(3)
    expect(previousStart(plan, 30)).toBe(21)
    expect(previousStart(plan, 20)).toBe(3)
    expect(previousStart(plan, 1)).toBe(3)
    expect(previousStart(plan, planLength(plan) + 5)).toBe(plan[35]!.start)
  })

  it('writes the duration', () => {
    expect(durationText(373)).toBe('6 min 13 s')
    expect(durationText(300)).toBe('5 min')
    expect(durationText(45)).toBe('45 s')
  })
})
