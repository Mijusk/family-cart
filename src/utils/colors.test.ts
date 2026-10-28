import { describe, expect, it } from 'vitest'
import { FOLDER_COLORS, hexToHsv, hsvToHex, parseHex, whiteContrast } from './colors'

describe('hsv', () => {
  it('turns into lowercase hex', () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000')
    expect(hsvToHex({ h: 120, s: 1, v: 0.5 })).toBe('#008000')
    expect(hsvToHex({ h: 240, s: 0, v: 1 })).toBe('#ffffff')
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#ff0000')
  })

  it('goes back and forth without changing the color', () => {
    for (const c of [...FOLDER_COLORS, '#000000', '#ffffff', '#4a7bc8']) expect(hsvToHex(hexToHsv(c))).toBe(c)
  })

  it('reads the hue', () => {
    expect(hexToHsv('#0000ff')).toEqual({ h: 240, s: 1, v: 1 })
    expect(hexToHsv('#808080').s).toBe(0)
  })
})

describe('parseHex', () => {
  it('takes what people type', () => {
    expect(parseHex(' #3B6FB6 ')).toBe('#3b6fb6')
    expect(parseHex('3b6fb6')).toBe('#3b6fb6')
    expect(parseHex('#abc')).toBe('#aabbcc')
  })
  it('refuses anything else', () => {
    for (const t of ['', '#12', '#12345', 'blue', '#gggggg']) expect(parseHex(t)).toBeNull()
  })
})

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
