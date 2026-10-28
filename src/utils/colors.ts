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

/** WCAG contrast of white text on a #rrggbb background. */
export function whiteContrast(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return 1.05 / (luminance + 0.05)
}
