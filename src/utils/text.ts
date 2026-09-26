/** Canonical form used to match products: "  Plátanos " → "platanos". */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/** Trims and capitalizes the first letter, keeping the rest as typed. */
export function cleanDisplayName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  return trimmed.charAt(0).toLocaleUpperCase('es') + trimmed.slice(1)
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('es'))
    .join('')
}
