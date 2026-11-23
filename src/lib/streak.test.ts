import { describe, expect, it } from 'vitest'
import { countsForStreak, streakMessage, streakOf } from './streak'

// 2026-11-23 is a Monday.

describe('streakOf', () => {
  it('starts at zero', () => {
    const s = streakOf([], '2026-11-25')
    expect(s).toMatchObject({ current: 0, best: 0, doneToday: false, wildcardUsedOn: null })
    expect(s.week.map((d) => d.state)).toEqual(['missed', 'missed', 'today', 'future', 'future', 'future', 'future'])
  })

  it('counts days in a row, today included once done', () => {
    expect(streakOf(['2026-11-23', '2026-11-24', '2026-11-25'], '2026-11-25')).toMatchObject({ current: 3, best: 3, doneToday: true })
  })

  it('today not done yet keeps the streak', () => {
    expect(streakOf(['2026-11-23', '2026-11-24'], '2026-11-25')).toMatchObject({ current: 2, doneToday: false })
  })

  it('the wildcard saves the first day missed in a week, without adding it', () => {
    const s = streakOf(['2026-11-23', '2026-11-25', '2026-11-26'], '2026-11-26')
    expect(s).toMatchObject({ current: 3, best: 3, wildcardUsedOn: '2026-11-24' })
    expect(s.week.map((d) => d.state).slice(0, 4)).toEqual(['done', 'wildcard', 'done', 'done'])
  })

  it('saves yesterday too, while today is still open', () => {
    expect(streakOf(['2026-11-23'], '2026-11-25')).toMatchObject({ current: 1, wildcardUsedOn: '2026-11-24' })
  })

  it('a second day missed in the same week ends it', () => {
    const s = streakOf(['2026-11-23', '2026-11-25', '2026-11-27'], '2026-11-27')
    expect(s).toMatchObject({ current: 1, best: 2, wildcardUsedOn: '2026-11-24' })
    expect(s.week[3]!.state).toBe('missed')
  })

  it('two days missed in a row: the wildcard covers one, the streak ends', () => {
    expect(streakOf(['2026-11-23'], '2026-11-26')).toMatchObject({ current: 0, best: 1 })
  })

  it('one wildcard per week: Sunday and the next Monday both saved', () => {
    // Sunday 29 belongs to the week of the 23rd, Monday 30 to the next one.
    const days = ['2026-11-27', '2026-11-28', '2026-12-01']
    expect(streakOf(days, '2026-12-01')).toMatchObject({ current: 3, best: 3, wildcardUsedOn: '2026-11-30' })
  })

  it('no wildcard spent without a streak going', () => {
    expect(streakOf(['2026-11-25'], '2026-11-25')).toMatchObject({ current: 1, wildcardUsedOn: null })
  })

  it('remembers the best run', () => {
    const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-24']
    expect(streakOf(days, '2026-11-24')).toMatchObject({ current: 1, best: 4 })
  })

  it('several routines the same day count once, future days are ignored', () => {
    expect(streakOf(['2026-11-24', '2026-11-24', '2026-11-26'], '2026-11-24')).toMatchObject({ current: 1, best: 1 })
  })
})

describe('countsForStreak', () => {
  it('needs most of the routine', () => {
    expect(countsForStreak(240, 300)).toBe(true)
    expect(countsForStreak(239, 300)).toBe(false)
    expect(countsForStreak(0, 0)).toBe(false)
  })
})

describe('streakMessage', () => {
  it('says what to do today', () => {
    expect(streakMessage(streakOf([], '2026-11-25'), '2026-11-25')).toBe('Estira hoy y empieza tu racha.')
    expect(streakMessage(streakOf(['2026-11-24'], '2026-11-25'), '2026-11-25')).toBe('Estira hoy para seguir con tu racha de 1 día.')
    expect(streakMessage(streakOf(['2026-11-23'], '2026-11-25'), '2026-11-25')).toBe('Ayer te salvó el comodín. Estira hoy para seguir.')
    expect(streakMessage(streakOf(['2026-11-25'], '2026-11-25'), '2026-11-25')).toBe('¡Hoy ya has estirado! Mañana, otro día más.')
    expect(streakMessage(streakOf(['2026-11-10'], '2026-11-25'), '2026-11-25')).toBe('Estira hoy y empieza una racha nueva.')
    // Sunday saved by last week's wildcard, Monday still open.
    expect(streakMessage(streakOf(['2026-11-28'], '2026-11-30'), '2026-11-30')).toBe('Ayer te salvó el comodín. Estira hoy para seguir.')
  })
})
