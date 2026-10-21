import { describe, expect, it } from 'vitest'
import { cleanDisplayName, initials, normalizeName } from './text'

describe('text', () => {
  it('normalizeName matches products however they are typed', () => {
    expect(normalizeName('  Plátanos ')).toBe('platanos')
    expect(normalizeName('Leche   de  AVENA')).toBe('leche de avena')
    expect(normalizeName('Piñones')).toBe('pinones')
  })

  it('cleanDisplayName capitalizes the first letter only', () => {
    expect(cleanDisplayName('  pan   de molde ')).toBe('Pan de molde')
    expect(cleanDisplayName('iPhone')).toBe('IPhone')
    expect(cleanDisplayName('ñoquis DE patata')).toBe('Ñoquis DE patata')
  })

  it('initials of the first two words', () => {
    expect(initials('Abuela Carmen')).toBe('AC')
    expect(initials('marta')).toBe('M')
    expect(initials('  Ana  María López ')).toBe('AM')
  })
})
