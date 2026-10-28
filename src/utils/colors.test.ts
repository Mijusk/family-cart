import { describe, expect, it } from 'vitest'
import { contrast, edgeOn, FOLDER_COLORS, folderPaint, hexToHsv, hsvToHex, INK, parseHex, textOn } from './colors'

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

describe('contrast', () => {
  it('goes from 1 to 21, either way round', () => {
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1)
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21)
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21)
  })

  it('keeps every folder color readable with white text', () => {
    for (const c of FOLDER_COLORS) {
      expect(contrast(c, '#ffffff'), c).toBeGreaterThanOrEqual(4.5)
      expect(textOn(c), c).toBe('#ffffff')
    }
  })
})

describe('folderPaint', () => {
  it('writes dark on light colors', () => {
    for (const c of ['#ffee00', '#a0e0ff', '#ffffff', '#f2c4d0']) expect(textOn(c), c).toBe(INK)
  })

  it('outlines only colors that melt into the white cards, a bit darker', () => {
    for (const c of [...FOLDER_COLORS, '#ffee00', '#a0e0ff']) expect(edgeOn(c), c).toBeNull()
    const edge = edgeOn('#f4f6f2')!
    expect(contrast(edge, '#ffffff')).toBeGreaterThan(1.5)
    // Same hue, give or take the rounding to 8 bits of a nearly grey color.
    expect(Math.abs(hexToHsv(edge).h - hexToHsv('#f4f6f2').h)).toBeLessThan(15)
    expect(folderPaint('#ffffff')).toEqual({ background: '#ffffff', color: INK, '--edge': edgeOn('#ffffff') })
    expect(folderPaint('#3b6fb6')).toEqual({ background: '#3b6fb6', color: '#ffffff', '--edge': 'transparent' })
  })

  it('has no repeated folder colors', () => {
    expect(new Set(FOLDER_COLORS).size).toBe(FOLDER_COLORS.length)
  })
})
