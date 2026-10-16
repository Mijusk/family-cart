/** Turns a Supabase/network error into something to show the family. */
export function friendlyError(error: unknown): string {
  const message = errorText(error)

  // Accounts (Supabase Auth)
  if (/invalid login credentials/i.test(message)) return 'Email o contraseña incorrectos.'
  if (/email not confirmed/i.test(message)) return 'Antes de entrar, confirma tu email con el enlace que te enviamos.'
  if (/already registered|already been registered|already exists/i.test(message)) return 'Ya hay una cuenta con ese email. Prueba a entrar.'
  if (/password should be|weak password|password.*characters/i.test(message)) return 'La contraseña es demasiado corta: usa al menos 8 caracteres.'
  if (/same.*password|different from the old/i.test(message)) return 'La nueva contraseña tiene que ser distinta de la anterior.'
  if (/invalid.*email|unable to validate email/i.test(message)) return 'Ese email no parece válido.'
  if (/rate limit|too many|security purposes/i.test(message)) return 'Demasiados intentos seguidos. Espera un poco y vuelve a probar.'
  if (/auth session missing|jwt expired|refresh token/i.test(message)) return 'Tu sesión ha caducado. Vuelve a entrar.'

  // Groups and profiles
  if (/invalid invite code/i.test(message)) return 'Ese enlace de invitación no es válido o ha caducado.'
  if (/invalid claim code/i.test(message)) return 'Ese código de perfil no existe o ya se ha usado.'
  if (/account already in use/i.test(message)) return 'Esta cuenta ya está en algún grupo. Usa el código con una cuenta recién creada.'
  if (/last admin/i.test(message)) return 'El grupo necesita al menos un administrador. Nombra a otro antes.'
  if (/profile without account/i.test(message)) return 'Un perfil sin cuenta no puede ser administrador.'
  if (/not an admin/i.test(message)) return 'Solo los administradores del grupo pueden hacer esto.'
  if (/groups_some_section/i.test(message)) return 'El grupo necesita al menos una sección activa.'

  // Calendar
  if (/calendar is deleted/i.test(message)) return 'Esa carpeta está en la papelera. Restáurala primero.'
  if (/event not found|calendar not found/i.test(message)) return 'Ese evento o carpeta ya no existe o no tienes permiso para cambiarlo.'
  if (/row-level security.*calendar_shares/i.test(message))
    return 'No se puede compartir con ese grupo: la persona dueña de la carpeta tiene que estar en él.'
  // Tasks
  if (/task list is deleted/i.test(message)) return 'Esa lista está en la papelera. Restáurala primero.'
  if (/task not found|task list not found/i.test(message)) return 'Esa tarea o lista ya no existe o no tienes permiso para cambiarla.'
  if (/row-level security.*task_list_shares/i.test(message))
    return 'No se puede compartir con ese grupo: la persona dueña de la lista tiene que estar en él.'
  if (/row-level security.*"tasks"/i.test(message))
    return 'No se pudo guardar: esa persona no ve esta lista, o la lista ya no está compartida contigo.'
  if (/tasks_title_check/i.test(message)) return 'La tarea necesita un título de hasta 120 caracteres.'

  // An update that matched nothing: someone else deleted it, or took away my access, meanwhile.
  if (/JSON object requested|single JSON object/i.test(message)) return 'Esto ya no existe o ya no puedes cambiarlo. Vuelve atrás para ver cómo está ahora.'
  if (/events_times/i.test(message)) return 'Revisa las horas: un evento con hora necesita inicio y fin distintos.'
  if (/events_weekdays/i.test(message)) return 'Elige al menos un día de la semana para la repetición.'
  if (/events_until/i.test(message)) return 'La repetición no puede terminar antes de empezar.'

  if (/fetch|network|Failed to/i.test(message)) return 'No hay conexión con el servidor. Inténtalo de nuevo.'
  return 'Algo ha fallado. Inténtalo de nuevo.'
}

/** The raw message of an error: Supabase query errors are plain objects, not `Error`s. */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return typeof error === 'string' ? error : ''
}

/** True when the request never reached the server (offline, DNS, blocked), not when it answered with an error. */
export function isNetworkError(error: unknown): boolean {
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(errorText(error))
}
