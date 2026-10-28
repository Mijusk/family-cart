import { describe, expect, it } from 'vitest'
import { FOLDER_COLORS, whiteContrast } from './colors'

describe('whiteContrast', () => {
  it('goes from 1 on white to 21 on black', () => {
    expect(whiteContrast('#ffffff')).toBeCloseTo(1)
    expect(whiteContrast('#000000')).toBeCloseTo(21)
  })

  it('keeps every folder color readable with white text', () => {
    for (const c of FOLDER_COLORS) expect(whiteContrast(c), c).toBeGreaterThanOrEqual(4.5)
  })

  it('has no repeated folder colors', () => {
    expect(new Set(FOLDER_COLORS).size).toBe(FOLDER_COLORS.length)
  })
})
