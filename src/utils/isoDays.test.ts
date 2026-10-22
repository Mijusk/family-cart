import { describe, expect, it } from 'vitest'
import * as days from './days'
import { addDays, deviceDay, relativeDay, zoneDay } from './isoDays'

describe('isoDays', () => {
  it('gives the day in a zone, or the device day if the zone is unknown', () => {
    const at = new Date('2026-10-25T23:30:00Z')
    expect(zoneDay('Europe/Madrid', at)).toBe('2026-10-26')
    expect(zoneDay('America/New_York', at)).toBe('2026-10-25')
    expect(zoneDay('Not/AZone', at)).toBe(deviceDay(at))
  })

  it('says how far a day is from a given today', () => {
    expect(relativeDay('2026-10-23', '2026-10-22')).toBe('Mañana')
    expect(relativeDay('2026-10-26', '2026-10-22')).toBe('Lunes, 26 de octubre')
  })

  it('is what days.ts exports, so the app and the Edge Function share it', () => {
    expect(days.addDays).toBe(addDays)
  })
})
