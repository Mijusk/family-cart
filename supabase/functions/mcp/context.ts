// What every tool needs: the signed-in person, their groups, names of people, and errors in
// Spanish. Each request gets its own context (the function keeps no state between requests).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../src/lib/database.types.ts'
import { errorText, friendlyError } from '../../../src/utils/errors.ts'

export type Db = SupabaseClient<Database>

export interface MyGroup {
  id: string
  name: string
  timezone: string
  /** My member row in it (the shopping list's added_by). */
  memberId: string
  role: 'admin' | 'member'
  calendar: boolean
  tasks: boolean
  shopping: boolean
}

export interface Me {
  personId: string
  name: string
  lastCalendarId: string | null
  /** Active memberships, newest first (as the app orders them). */
  groups: MyGroup[]
}

/** A problem to tell the person as is (the message is already in Spanish). */
export class ToolError extends Error {}

export const APP_URL = (Deno.env.get('APP_URL') ?? 'https://family-cart-ecru.vercel.app').replace(/\/$/, '')

export const DEFAULT_TIMEZONE = 'Europe/Madrid'

export interface Context {
  db: Db
  me(): Promise<Me>
  /** Display names; me as "<name> (tú)", unknown people as "Alguien". */
  names(ids: Iterable<string>): Promise<(id: string) => string>
}

export function createContext(db: Db, userId: string): Context {
  let me: Promise<Me> | null = null
  const known = new Map<string, string>()

  const context: Context = {
    db,
    me: () => (me ??= loadMe(db, userId)),
    async names(ids) {
      const self = await context.me()
      known.set(self.personId, `${self.name} (tú)`)
      const missing = [...new Set(ids)].filter((id) => !known.has(id))
      if (missing.length) {
        const { data, error } = await db.from('people').select('id, display_name').in('id', missing)
        if (error) throw error
        for (const p of data) known.set(p.id, p.display_name)
      }
      return (id) => known.get(id) ?? 'Alguien'
    },
  }
  return context
}

async function loadMe(db: Db, userId: string): Promise<Me> {
  const { data, error } = await db
    .from('people')
    .select(
      'id, display_name, last_calendar_id, members!members_person_id_fkey(id, group_id, role, status, created_at, left_at, groups(name, timezone, calendar_enabled, tasks_enabled, shopping_enabled))',
    )
    .eq('user_id', userId)
    .is('members.left_at', null)
    .order('created_at', { referencedTable: 'members', ascending: false })
    .maybeSingle()
  if (error) throw error
  if (!data) throw new ToolError('Esta cuenta aún no tiene perfil en Family App. Ábrela una vez, crea un grupo o únete a uno, y vuelve a probar.')
  return {
    personId: data.id,
    name: data.display_name,
    lastCalendarId: data.last_calendar_id,
    groups: data.members
      .filter((m) => m.status === 'active' && m.groups)
      .map((m) => ({
        id: m.group_id,
        name: m.groups!.name,
        timezone: m.groups!.timezone || DEFAULT_TIMEZONE,
        memberId: m.id,
        role: m.role as MyGroup['role'],
        calendar: m.groups!.calendar_enabled,
        tasks: m.groups!.tasks_enabled,
        shopping: m.groups!.shopping_enabled,
      })),
  }
}

/** The group a tool works on: the one asked for, or the only one that fits. */
export function pickGroup(me: Me, groupId: string | undefined, fits: (g: MyGroup) => boolean, what: string): MyGroup {
  const candidates = me.groups.filter(fits)
  if (groupId) {
    const group = me.groups.find((g) => g.id === groupId)
    if (!group) throw new ToolError('No estás en ese grupo. Usa quien_soy para ver tus grupos.')
    if (!fits(group)) throw new ToolError(`El grupo «${group.name}» no usa ${what}.`)
    return group
  }
  if (candidates.length === 1) return candidates[0]!
  if (!candidates.length) throw new ToolError(`Ninguno de tus grupos usa ${what}.`)
  throw new ToolError(`Estás en varios grupos que usan ${what} (${candidates.map((g) => g.name).join(', ')}): pregunta cuál y pasa su grupo_id.`)
}

/** Errors the app never shows (it doesn't offer those choices) but the AI can run into. */
const TOOL_ERRORS: [RegExp, string][] = [
  [/not allowed for connected apps/i, 'Las apps conectadas no pueden hacer esto. Hazlo desde Family App.'],
  [/connected app access revoked/i, 'Se ha quitado el acceso a Family App desde la app (Cuenta → Conectado con IA). Para volver a usarla, conecta otra vez.'],
  [/row-level security.*event_participants/i, 'Alguna de esas personas no comparte grupo con la dueña de la carpeta, o no puedes editar el evento.'],
  [/row-level security.*event_shares/i, 'No se puede compartir con ese grupo: la persona dueña de la carpeta tiene que estar en él.'],
  [/row-level security.*"events"/i, 'No puedes crear ni cambiar eventos en esa carpeta.'],
  [/row-level security.*event_exceptions/i, 'No puedes cambiar ese evento.'],
  [/row-level security.*"items"/i, 'No puedes añadir a la lista de la compra de ese grupo.'],
  [/invalid input syntax for type uuid/i, 'Ese identificador no es válido: usa los que dan las otras herramientas.'],
]

/** What to tell the AI when a tool fails; the raw error goes to the logs (never the token). */
export function toolErrorText(tool: string, error: unknown): string {
  if (error instanceof ToolError) return error.message
  const raw = errorText(error)
  console.error(`mcp tool ${tool} failed: ${raw}`)
  return TOOL_ERRORS.find(([pattern]) => pattern.test(raw))?.[1] ?? friendlyError(error)
}
