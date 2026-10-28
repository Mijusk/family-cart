/** Person colors. Must match random_person_color() in the database schema. */
export const PERSON_COLORS = ['#3a6b52', '#a8522f', '#3b6fb6', '#8f6a1f', '#7d4f9a', '#277a7a', '#b5476f', '#5f7a2e'] as const

/** Folder colors: the person colors plus more, all dark enough for white text. */
export const FOLDER_COLORS = [
  ...PERSON_COLORS,
  '#b83232',
  '#2f5d8a',
  '#4b4fa8',
  '#9a3d8f',
  '#1d6b5c',
  '#6b4f3a',
  '#4a5568',
  '#8a3b3b',
] as const

/** Hue 0–360, saturation and value 0–1, as the custom color picker moves them. */
export interface Hsv {
  h: number
  s: number
  v: number
}

/** Lowercase #rrggbb, the only form the database takes. */
export function hsvToHex({ h, s, v }: Hsv): string {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(5)}${channel(3)}${channel(1)}`
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  return { h: h * 60, s: max ? d / max : 0, v: max }
}

/** #rgb or #rrggbb, with or without #, any case; else null. */
export function parseHex(text: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim())
  if (!m) return null
  const digits = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!
  return `#${digits.toLowerCase()}`
}

/** WCAG relative luminance of #rrggbb. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast between two #rrggbb colors. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** The app's text color (--text), for light folder colors. */
export const INK = '#1f2d24'
/** The app's cards (--surface); a folder color this close to it gets an edge. */
const SURFACE = '#ffffff'

/** White text, unless the color is light enough that dark text reads better. */
export function textOn(hex: string): string {
  return contrast(hex, '#ffffff') >= 4.5 || contrast(hex, '#ffffff') >= contrast(hex, INK) ? '#ffffff' : INK
}

/**
 * The color, darker, to outline it when it would melt into the white cards: light and washed
 * out (a bright yellow is light too, but its hue shows). Else null.
 */
export function edgeOn(hex: string): string | null {
  const hsv = hexToHsv(hex)
  if (contrast(hex, SURFACE) >= 1.5 || hsv.s >= 0.3) return null
  return hsvToHex({ ...hsv, v: hsv.v * 0.72 })
}

/**
 * How to paint something in a folder's color: its text color, and --edge for a 1px inset ring
 * (`box-shadow: inset 0 0 0 1px var(--edge)`) when the color is too close to the background.
 */
export function folderPaint(hex: string): Record<string, string> {
  return { background: hex, color: textOn(hex), '--edge': edgeOn(hex) ?? 'transparent' }
}
