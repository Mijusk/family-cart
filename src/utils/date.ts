const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
const weekdayDate = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })
const time = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })
const shortDate = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' })

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "ahora", "hace 5 minutos", "ayer", "hace 3 días"… */
export function timeAgo(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now
  const abs = Math.abs(diff)
  if (abs < MINUTE) return 'ahora'
  if (abs < HOUR) return relative.format(Math.round(diff / MINUTE), 'minute')
  if (abs < DAY) return relative.format(Math.round(diff / HOUR), 'hour')
  return relative.format(Math.round(diff / DAY), 'day')
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** "Hoy", "Ayer" or "Sábado, 19 de septiembre". */
export function dayLabel(iso: string, now = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY)
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  const label = weekdayDate.format(new Date(iso))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function timeOfDay(iso: string): string {
  return time.format(new Date(iso))
}

export function longDate(iso: string): string {
  return shortDate.format(new Date(iso))
}
