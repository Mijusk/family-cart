import { describe, expect, it } from 'vitest'
import { firstName, greeting, hourIn } from './greeting'

describe('greeting', () => {
  it('changes at 06:00, 14:00 and 21:00', () => {
    expect(greeting(5)).toBe('Buenas noches')
    expect(greeting(6)).toBe('Buenos días')
    expect(greeting(13)).toBe('Buenos días')
    expect(greeting(14)).toBe('Buenas tardes')
    expect(greeting(20)).toBe('Buenas tardes')
    expect(greeting(21)).toBe('Buenas noches')
    expect(greeting(0)).toBe('Buenas noches')
  })
})

describe('hourIn', () => {
  it('reads the hour in the given zone', () => {
    const at = new Date('2026-11-12T13:30:00Z')
    expect(hourIn('Europe/Madrid', at)).toBe(14)
    expect(hourIn('America/Mexico_City', at)).toBe(7)
    expect(hourIn('UTC', new Date('2026-11-12T00:10:00Z'))).toBe(0)
  })
})

describe('firstName', () => {
  it('keeps the first word', () => {
    expect(firstName('Marta Martín')).toBe('Marta')
    expect(firstName('  Abuela Carmen ')).toBe('Abuela')
    expect(firstName('Pablo')).toBe('Pablo')
  })
})
