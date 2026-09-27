/** Turns a Supabase/network error into something to show the family. */
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
  if (/invalid invite code/i.test(message)) return 'Ese enlace de invitación no es válido o ha caducado.'
  if (/member name taken/i.test(message)) return 'Ya hay alguien con ese nombre en el grupo. Prueba con otro.'
  if (/fetch|network|Failed to/i.test(message)) return 'No hay conexión con el servidor. Inténtalo de nuevo.'
  return 'Algo ha fallado. Inténtalo de nuevo.'
}
