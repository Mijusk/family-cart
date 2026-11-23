import type { IsoDate } from '@/types'
import { addDays, daysBetween, startOfWeek } from '@/utils/days'

// The stretching streak (docs/estiramientos.md §4), worked out from the days someone finished a
// routine: days in a row, the best run ever and the weekly wildcard. Pure, so the same days give
// the same streak on every device and nothing but the days needs storing.
//
// - A day counts when a routine is finished (or most of it: see countsForStreak).
// - Today is still open: not having stretched yet doesn't break anything.
// - One wildcard a week (Monday to Sunday): the first day missed in a week, while there is a
//   streak going, is saved by it. It keeps the streak alive but doesn't add a day. A second day
//   missed in the same week ends the streak.

/** Share of the routine that has to be followed for the day to count («Terminar ahora» near the end). */
export const STREAK_SHARE = 0.8

/** Whether a session counts: the seconds actually followed against the whole routine's. */
export function countsForStreak(followedSeconds: number, totalSeconds: number): boolean {
  return totalSeconds > 0 && followedSeconds >= totalSeconds * STREAK_SHARE
}

export type StreakDayState = 'done' | 'wildcard' | 'missed' | 'today' | 'future'

export interface Streak {
  /** Days stretched in a row, up to today (today only once done). */
  current: number
  /** The longest run ever, the current one included. */
  best: number
  doneToday: boolean
  /** The day this week's wildcard saved, or null while it's still free. */
  wildcardUsedOn: IsoDate | null
  /** The last day any wildcard saved (last week's too). */
  lastSavedOn: IsoDate | null
  /** Monday to Sunday of this week. */
  week: { day: IsoDate; state: StreakDayState }[]
}

export function streakOf(doneDays: Iterable<IsoDate>, today: IsoDate): Streak {
  const done = new Set<IsoDate>()
  for (const d of doneDays) if (d <= today) done.add(d)
  const wildcards = new Map<IsoDate, IsoDate>() // week's Monday → day it saved
  let current = 0
  let best = 0

  const first = [...done].sort()[0]
  if (first) {
    for (let d = first; d <= today; d = addDays(d, 1)) {
      if (done.has(d)) {
        current++
        best = Math.max(best, current)
      } else if (d === today) {
        // Still time to stretch today.
      } else if (current > 0 && !wildcards.has(startOfWeek(d))) {
        wildcards.set(startOfWeek(d), d)
      } else {
        current = 0
      }
    }
  }

  const monday = startOfWeek(today)
  const saved = new Set(wildcards.values())
  const lastSavedOn = [...saved].sort().pop() ?? null
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i)
    let state: StreakDayState
    if (done.has(day)) state = 'done'
    else if (day === today) state = 'today'
    else if (day > today) state = 'future'
    else state = saved.has(day) ? 'wildcard' : 'missed'
    return { day, state }
  })

  return { current, best, doneToday: done.has(today), wildcardUsedOn: wildcards.get(monday) ?? null, lastSavedOn, week }
}

/** «1 día», «5 días». */
export function daysText(n: number): string {
  return n === 1 ? '1 día' : `${n} días`
}

/** What the streak card says under the number. */
export function streakMessage(s: Streak, today: IsoDate): string {
  if (s.doneToday) return s.current > 1 ? '¡Hoy ya has estirado! Sigue así mañana.' : '¡Hoy ya has estirado! Mañana, otro día más.'
  if (s.current > 0) {
    // Yesterday saved by the wildcard: today is the one that keeps it going.
    const savedYesterday = s.lastSavedOn !== null && daysBetween(s.lastSavedOn, today) === 1
    return savedYesterday
      ? 'Ayer te salvó el comodín. Estira hoy para seguir.'
      : `Estira hoy para seguir con tu racha de ${daysText(s.current)}.`
  }
  return s.best > 0 ? 'Estira hoy y empieza una racha nueva.' : 'Estira hoy y empieza tu racha.'
}
