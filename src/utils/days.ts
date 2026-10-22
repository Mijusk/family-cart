import { ref } from 'vue'
import type { IsoDate } from '@/types'
import { deviceDay, relativeDay as relativeTo, zoneDay } from './isoDays'

// Calendar days as 'YYYY-MM-DD' strings: the pure functions live in isoDays.ts (shared with the
// mcp Edge Function); this file adds a "today" that templates can react to.
export * from './isoDays'

// "Today" without a given moment is reactive: computeds and templates that ask for it run again
// when the date changes with the app open (past midnight, or woken up on another day). A cheap
// check every minute and when the app comes back covers every zone asked for ('' = this device).
const dayChanges = ref(0)
const zonesInUse = new Set<string>()
let lastKey: string | null = null

function dayKey(): string {
  const now = new Date()
  return [...zonesInUse].map((zone) => (zone ? zoneDay(zone, now) : deviceDay(now))).join()
}

function checkDay() {
  const key = dayKey()
  if (key === lastKey) return
  lastKey = key
  dayChanges.value++
}

/** Makes the caller depend on the date changing in `zone`. */
function trackDay(zone: string) {
  if (!zonesInUse.has(zone)) {
    if (lastKey === null && typeof window !== 'undefined') {
      setInterval(checkDay, 60_000)
      document.addEventListener('visibilitychange', checkDay)
    }
    zonesInUse.add(zone)
    lastKey = dayKey()
  }
  void dayChanges.value
}

/** Today on this device. */
export function today(now?: Date): IsoDate {
  if (now) return deviceDay(now)
  trackDay('')
  return deviceDay(new Date())
}

/** The day a moment falls on in a time zone (a group's): today by default. */
export function dayIn(timeZone: string, at?: Date | string): IsoDate {
  if (at !== undefined) return zoneDay(timeZone, new Date(at))
  trackDay(timeZone)
  return zoneDay(timeZone, new Date())
}

/** "Hoy", "Mañana", "Ayer" or "Jueves, 16 de octubre". */
export function relativeDay(day: IsoDate, now = today()): string {
  return relativeTo(day, now)
}
