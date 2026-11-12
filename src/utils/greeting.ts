// The header's greeting, by the hour in the group's time zone.

/** «Buenos días» from 06:00, «Buenas tardes» from 14:00 (after lunch, as in Spain), «Buenas noches» from 21:00. */
export function greeting(hour: number): string {
  if (hour >= 6 && hour < 14) return 'Buenos días'
  if (hour >= 14 && hour < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

/** The hour (0–23) of a moment in a time zone. */
export function hourIn(timeZone: string, at: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(at)
  return Number(hour)
}

/** The first name, for a friendlier greeting: «Marta» from «Marta Martín». */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? ''
}
