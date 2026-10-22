// Calendar tools: who I am, folders, people, the agenda, and creating or changing events. They
// read and write as the app does (src/stores/calendar.ts), through the person's own session, so
// RLS decides what they can see and touch.

import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { fromEvent, fromOverrides, toBusyEvent, toEvent, toException } from '../../../src/lib/mappers.ts'
import { isSeriesDate } from '../../../src/lib/recurrence.ts'
import type { CalendarEvent, EventException, EventOverrides, IsoDate } from '../../../src/types.ts'
import { addDays, weekdayShortDay } from '../../../src/utils/isoDays.ts'
import { agenda, eventSummary, nextDays, nowIn, timeText, type AgendaEvent } from './agenda.ts'
import { APP_URL, DEFAULT_TIMEZONE, ToolError, type Context, type Me } from './context.ts'
import { dateRange, dayOverrides, eventFields, MAX_RANGE_DAYS, type EventFields } from './input.ts'
import { CONFIRM_FIRST, data, done, tool } from './tools.ts'

const id = () => z.guid()
const date = () => z.string().max(10)
const time = () => z.string().max(8)

const eventLink = (eventId: string, day?: IsoDate) => `${APP_URL}/calendario/evento/${eventId}${day ? `?dia=${day}` : ''}`

const TITLE = z.string().max(200).describe('Título corto, como lo escribiría la persona («Dentista», «Natación Pablo»).')
const DATE = date().describe('Día, AAAA-MM-DD. Calcúlalo con la fecha de hoy de quien_soy.')
const ALL_DAY = z.boolean().optional().describe('true si no tiene hora (cumpleaños, excursión). Si es false hace falta hora_inicio.')
const START = time().nullable().optional().describe('HH:MM en 24 h, hora local del grupo. Si no te la han dicho, pregúntala.')
const END = time()
  .nullable()
  .optional()
  .describe('HH:MM en 24 h. Si no la dicen, dura 1 hora. Si es menor que la de inicio (23:00–01:00), acaba al día siguiente.')
const LOCATION = z.string().max(300).nullable().optional()
const NOTES = z.string().max(2500).nullable().optional()

/** Event fields besides title and date; left out = unchanged (or the default), null = clear. */
const MORE_EVENT_FIELDS = {
  todo_el_dia: ALL_DAY,
  hora_inicio: START,
  hora_fin: END,
  lugar: LOCATION,
  notas: NOTES,
  repeticion: z
    .enum(['none', 'daily', 'weekly', 'biweekly', 'monthly'])
    .optional()
    .describe('none (puntual), daily, weekly, biweekly (cada dos semanas) o monthly (el mismo día de cada mes).'),
  dias_semana: z
    .array(z.number().int())
    .max(7)
    .nullable()
    .optional()
    .describe('Para weekly y biweekly: 1 = lunes … 7 = domingo. Sin días, el de la fecha.'),
  repetir_hasta: date().nullable().optional().describe('Último día de la repetición (AAAA-MM-DD); null = sin fin.'),
  aviso_minutos: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe('Recordatorio: minutos antes del inicio (0 al empezar, 15, 60, 1440 = un día…; como mucho 43200). null = sin aviso. Si no lo piden, no pongas.'),
}

export function registerCalendarTools(server: McpServer, ctx: Context) {
  tool(
    server,
    'quien_soy',
    'read',
    {
      title: 'Quién soy y qué día es',
      description:
        'Tu persona en Family App, tus grupos (con su zona horaria y secciones) y la fecha y hora actuales en cada zona, ' +
        'con los próximos 14 días y su día de la semana. Llámala antes de interpretar «hoy», «mañana» o «el jueves».',
      input: z.object({}),
    },
    async () => {
      const me = await ctx.me()
      const now = new Date()
      const zones = [...new Set(me.groups.map((g) => g.timezone))]
      if (!zones.length) zones.push(DEFAULT_TIMEZONE)
      const main = nowIn(zones[0]!, now)
      return data({
        persona_id: me.personId,
        nombre: me.name,
        grupos: me.groups.map((g) => ({
          grupo_id: g.id,
          nombre: g.name,
          zona_horaria: g.timezone,
          soy_admin: g.role === 'admin',
          secciones: { calendario: g.calendar, tareas: g.tasks, compra: g.shopping },
        })),
        ahora: zones.map((zona) => ({ zona_horaria: zona, ...nowIn(zona, now) })),
        proximos_dias: nextDays(main.fecha, 14),
      })
    },
  )

  tool(
    server,
    'listar_carpetas',
    'read',
    {
      title: 'Carpetas del calendario',
      description:
        'Las carpetas en las que puedes crear eventos: las tuyas y las de otras personas que puedes editar como administrador ' +
        '(p. ej. el colegio de un hijo). Dice de quién es cada una, con qué grupos se comparte y cuál usaste la última vez ' +
        '(la que se usa por defecto). Si la persona no dice carpeta y hay dudas, pregúntale.',
      input: z.object({}),
    },
    async () => {
      const me = await ctx.me()
      const [folders, editable, shares] = await Promise.all([
        ctx.db.from('calendars').select('id, owner_id, name, position').is('deleted_at', null),
        ctx.db.rpc('editable_calendar_ids'),
        ctx.db.from('calendar_shares').select('calendar_id, group_id, level'),
      ])
      for (const res of [folders, editable, shares]) if (res.error) throw res.error
      const editableIds = new Set(editable.data!)
      const mine = folders.data!.filter((c) => editableIds.has(c.id))
      const name = await ctx.names(mine.map((c) => c.owner_id))
      const groupName = (gid: string) => me.groups.find((g) => g.id === gid)?.name ?? 'otro grupo'
      const fallback = defaultFolder(me, mine)
      return data({
        carpetas: mine
          .sort((a, b) => Number(b.owner_id === me.personId) - Number(a.owner_id === me.personId) || a.position - b.position)
          .map((c) => {
            const shared = shares.data!.filter((s) => s.calendar_id === c.id)
            return {
              carpeta_id: c.id,
              nombre: c.name,
              de: name(c.owner_id),
              compartida_con: shared.length
                ? shared.map((s) => `${groupName(s.group_id)}${s.level === 'busy' ? ' (solo «ocupado»)' : ''}`)
                : 'privada',
              ...(c.id === fallback && { por_defecto: true }),
            }
          }),
      })
    },
  )

  tool(
    server,
    'listar_personas',
    'read',
    {
      title: 'Personas de tus grupos',
      description:
        'Las personas de tus grupos (también perfiles sin cuenta, como un hijo pequeño), con su persona_id. ' +
        'Sirve para «Con quién» al crear un evento, para asignar tareas y para «¿qué tiene Pablo el martes?».',
      input: z.object({ grupo_id: id().optional().describe('Solo las de este grupo.') }),
    },
    async ({ grupo_id }) => {
      const me = await ctx.me()
      const groups = me.groups.filter((g) => !grupo_id || g.id === grupo_id)
      if (!groups.length) throw new ToolError('No estás en ese grupo. Usa quien_soy para ver tus grupos.')
      const { data: rows, error } = await ctx.db
        .from('members')
        .select('person_id, group_id, role, people!members_person_id_fkey(display_name, user_id)')
        .in(
          'group_id',
          groups.map((g) => g.id),
        )
        .eq('status', 'active')
        .is('left_at', null)
      if (error) throw error
      const people = new Map<string, { persona_id: string; nombre: string; soy_yo?: true; sin_cuenta?: true; grupos: string[] }>()
      for (const r of rows) {
        const group = groups.find((g) => g.id === r.group_id)!
        const person = people.get(r.person_id) ?? {
          persona_id: r.person_id,
          nombre: r.people?.display_name ?? 'Alguien',
          ...(r.person_id === me.personId && { soy_yo: true as const }),
          ...(r.people && !r.people.user_id && { sin_cuenta: true as const }),
          grupos: [],
        }
        person.grupos.push(`${group.name}${r.role === 'admin' ? ' (admin)' : ''}`)
        people.set(r.person_id, person)
      }
      return data({ personas: [...people.values()] })
    },
  )

  tool(
    server,
    'ver_eventos',
    'read',
    {
      title: 'Ver el calendario',
      description:
        `Lo que hay cada día entre «desde» y «hasta» (como mucho ${MAX_RANGE_DAYS} días), con las repeticiones ya puestas en su día ` +
        'y los cambios de un solo día aplicados (los cancelados no salen). Lo de las carpetas compartidas en modo ocupado sale como ' +
        '«Ocupado», sin detalles. Filtra por persona (dueña o participante) o por grupo. Para cambiar o cancelar un solo día de algo ' +
        'que se repite, usa su evento_id y fecha_serie.',
      input: z.object({
        desde: date().describe('Primer día, AAAA-MM-DD.'),
        hasta: date().optional().describe('Último día, AAAA-MM-DD (incluido). Sin él, solo «desde».'),
        persona_id: id().optional().describe('Solo lo de esta persona (de listar_personas).'),
        grupo_id: id().optional().describe('Solo lo de las personas de este grupo, y sus franjas «Ocupado».'),
      }),
    },
    async ({ desde, hasta, persona_id, grupo_id }) => {
      const range = dateRange(desde, hasta)
      if (!range.ok) throw new ToolError(range.error)
      const { from, to } = range.value
      const me = await ctx.me()
      const groups = me.groups.filter((g) => !grupo_id || g.id === grupo_id)
      if (grupo_id && !groups.length) throw new ToolError('No estás en ese grupo. Usa quien_soy para ver tus grupos.')

      const events = await loadAgenda(ctx, from, to, groups.map((g) => g.id))
      let personIds: Set<string> | undefined
      if (grupo_id) {
        const { data: members, error } = await ctx.db
          .from('members')
          .select('person_id')
          .eq('group_id', grupo_id)
          .eq('status', 'active')
          .is('left_at', null)
        if (error) throw error
        personIds = new Set(members.map((m) => m.person_id))
      }
      const name = await ctx.names(events.flatMap((e) => [e.ownerId, ...e.participants]))
      return data({ desde: from, hasta: to, dias: agenda(events, from, to, name, { personId: persona_id, personIds }) })
    },
  )

  tool(
    server,
    'crear_evento',
    'create',
    {
      title: 'Crear un evento',
      description:
        'Crea un evento en el calendario de Family App, como el formulario de la app. Sin carpeta, va a la última usada ' +
        '(listar_carpetas la marca como por_defecto). Fechas AAAA-MM-DD y horas HH:MM en 24 h, en la hora local del grupo. ' +
        'Si falta la hora (y no es de todo el día) o no está claro el día o la carpeta, pregunta antes. ' +
        CONFIRM_FIRST,
      input: z.object({
        titulo: TITLE,
        fecha: DATE,
        ...MORE_EVENT_FIELDS,
        carpeta_id: id().optional().describe('De listar_carpetas. Sin ella, la última usada.'),
        participantes: z
          .array(id())
          .max(20)
          .optional()
          .describe('«Con quién»: persona_id de listar_personas (además de la dueña de la carpeta). Ven el evento y reciben su aviso.'),
        grupos_extra: z
          .array(id())
          .max(10)
          .optional()
          .describe('Grupos con los que compartir este evento además de los de su carpeta. Solo si la persona lo pide.'),
      }),
    },
    async (input) => {
      const me = await ctx.me()
      const folder = await editableFolder(ctx, me, input.carpeta_id)
      const fields = eventFields(input)
      if (!fields.ok) throw new ToolError(fields.error)

      const { data: row, error } = await ctx.db
        .from('events')
        .insert({ ...fromEvent({ ...fields.value, calendarId: folder.id }), timezone: await folderTimezone(ctx, me, folder.id) })
        .select()
        .single()
      if (error) throw error
      const event = toEvent(row)
      const extra = await addToEvent(ctx, event.id, folder, input.participantes ?? [], input.grupos_extra ?? [])
      return done(
        `Creado: ${eventSummary(event, folder.name)}${extra}\n` +
          `Ábrelo en Family App: ${eventLink(event.id)}`,
      )
    },
  )

  tool(
    server,
    'editar_evento',
    'change',
    {
      title: 'Cambiar un evento',
      description:
        'Cambia un evento entero (si se repite, toda la serie: todas las semanas). Pasa solo lo que cambia; lo que no pases se queda ' +
        'como está, y null lo borra (lugar, notas, aviso, fin de la repetición). Al mover la hora de inicio, la de fin se mueve con ella. ' +
        'Para un solo día de algo que se repite usa cambiar_dia o cancelar_dia. No se pueden borrar eventos. ' +
        CONFIRM_FIRST,
      input: z.object({
        evento_id: id().describe('De ver_eventos.'),
        titulo: TITLE.optional(),
        fecha: DATE.optional().describe('Nuevo primer día (AAAA-MM-DD). En algo que se repite, mueve toda la serie.'),
        ...MORE_EVENT_FIELDS,
        carpeta_id: id().optional().describe('Para moverlo a otra carpeta (de listar_carpetas).'),
        participantes: z
          .array(id())
          .max(20)
          .optional()
          .describe('La lista completa de «Con quién» tal como debe quedar (persona_id). Sin ella, no cambia.'),
      }),
    },
    async (input) => {
      const me = await ctx.me()
      const current = await editableEvent(ctx, input.evento_id)
      const folder = await editableFolder(ctx, me, input.carpeta_id ?? current.event.calendarId)
      const fields = eventFields(input, current.event)
      if (!fields.ok) throw new ToolError(fields.error)
      const { data: row, error } = await ctx.db
        .from('events')
        .update(fromEvent({ ...fields.value, calendarId: folder.id }))
        .eq('id', current.event.id)
        .select()
        .single()
      if (error) throw error
      if (input.participantes) await setParticipants(ctx, current.event.id, current.participants, input.participantes.filter((p) => p !== folder.ownerId))
      const event = toEvent(row)
      return done(`Cambiado: ${eventSummary(event, folder.name)}\nÁbrelo en Family App: ${eventLink(event.id)}`)
    },
  )

  tool(
    server,
    'cambiar_dia',
    'change',
    {
      title: 'Cambiar un solo día',
      description:
        'Cambia solo un día de un evento que se repite (este martes la clase es a otra hora o en otro sitio); los demás días siguen igual. ' +
        'fecha es la fecha_serie que da ver_eventos. Pasa solo lo que cambia ese día. Si con el cambio el día queda igual que la serie, ' +
        'vuelve a ser normal. ' +
        CONFIRM_FIRST,
      input: z.object({
        evento_id: id().describe('De ver_eventos.'),
        fecha: date().describe('La fecha_serie del día que cambia (AAAA-MM-DD).'),
        nueva_fecha: date().optional().describe('Para moverlo a otro día (como mucho a una semana).'),
        titulo: TITLE.optional(),
        todo_el_dia: ALL_DAY,
        hora_inicio: START,
        hora_fin: END,
        lugar: LOCATION,
        notas: NOTES,
      }),
    },
    async (input) => {
      const { event, exception } = await repeatingDay(ctx, input.evento_id, input.fecha)
      const current: Required<EventOverrides> = {
        title: event.title,
        notes: event.notes,
        location: event.location,
        allDay: event.allDay,
        startDate: input.fecha,
        startTime: event.startTime,
        endTime: event.endTime,
        ...(exception?.status === 'modified' ? exception.overrides : {}),
      }
      const overrides = dayOverrides(input, event, input.fecha, current)
      if (!overrides.ok) throw new ToolError(overrides.error)
      const empty = !Object.keys(overrides.value).length
      const fields = { status: 'modified', overrides: fromOverrides(overrides.value) as never }
      const { error } = empty
        ? await ctx.db.from('event_exceptions').delete().eq('event_id', event.id).eq('occurrence_date', input.fecha)
        : exception
          ? await ctx.db.from('event_exceptions').update(fields).eq('event_id', event.id).eq('occurrence_date', input.fecha)
          : await ctx.db.from('event_exceptions').insert({ event_id: event.id, occurrence_date: input.fecha, ...fields })
      if (error) throw error
      const shown = { ...event, startDate: input.fecha, ...overrides.value }
      const day = weekdayShortDay(input.fecha)
      return done(
        empty
          ? `El ${day} vuelve a ser como los demás días: ${event.title}, ${timeText(event)}.`
          : `Cambiado solo el ${day}: ${shown.title} · ${weekdayShortDay(shown.startDate)}, ${timeText(shown)}` +
              `${shown.location ? ` · ${shown.location}` : ''}. Los demás días siguen igual.\n` +
              `Ábrelo en Family App: ${eventLink(event.id, shown.startDate)}`,
      )
    },
  )

  tool(
    server,
    'cancelar_dia',
    'change',
    {
      title: 'Cancelar un solo día',
      description:
        'Cancela un solo día de un evento que se repite («este jueves no hay clase»); los demás días siguen. fecha es la fecha_serie ' +
        'de ver_eventos. No borra el evento: se puede deshacer desde la app. Un evento puntual no se cancela así (no se pueden ' +
        'borrar eventos desde aquí). ' +
        CONFIRM_FIRST,
      input: z.object({
        evento_id: id().describe('De ver_eventos.'),
        fecha: date().describe('La fecha_serie del día que se cancela (AAAA-MM-DD).'),
      }),
    },
    async ({ evento_id, fecha }) => {
      const { event, exception } = await repeatingDay(ctx, evento_id, fecha)
      const fields = { status: 'cancelled', overrides: {} }
      const { error } = exception
        ? await ctx.db.from('event_exceptions').update(fields).eq('event_id', event.id).eq('occurrence_date', fecha)
        : await ctx.db.from('event_exceptions').insert({ event_id: event.id, occurrence_date: fecha, ...fields })
      if (error) throw error
      return done(`Cancelado solo el ${weekdayShortDay(fecha)}: ${event.title}. Los demás días siguen igual; se puede deshacer desde la app (${eventLink(event.id, fecha)}).`)
    },
  )
}

// ── Reading ─────────────────────────────────────────────────

/** Everything visible in [from, to] as the store loads it, plus the busy slots of `groupIds`. */
async function loadAgenda(ctx: Context, from: IsoDate, to: IsoDate, groupIds: string[]): Promise<AgendaEvent[]> {
  // The day before too: what starts then may run past midnight into the first day.
  const start = addDays(from, -1)
  const [folders, eventRows, exceptionRows, editable, ...busy] = await Promise.all([
    ctx.db.from('calendars').select('id, name').is('deleted_at', null),
    ctx.db
      .from('events')
      .select('*, event_participants(person_id)')
      .is('deleted_at', null)
      .or(`repeat.neq.none,and(start_date.gte.${start},start_date.lte.${to})`),
    ctx.db
      .from('event_exceptions')
      .select('event_id, occurrence_date, status, overrides')
      .or(`and(occurrence_date.gte.${start},occurrence_date.lte.${to}),and(overrides->>start_date.gte.${start},overrides->>start_date.lte.${to})`),
    ctx.db.rpc('editable_calendar_ids'),
    ...groupIds.map((gid) => ctx.db.rpc('busy_events', { gid })),
  ])
  for (const res of [folders, eventRows, exceptionRows, editable, ...busy]) if (res.error) throw res.error

  const events = eventRows.data!.map(toEvent)
  const owners = events.length ? await ctx.db.rpc('event_owners', { event_ids: events.map((e) => e.id) }) : { data: [], error: null }
  if (owners.error) throw owners.error
  const ownerOf = new Map(owners.data!.map((o) => [o.event_id, o.owner_id]))
  const folderName = new Map(folders.data!.map((c) => [c.id, c.name]))
  const editableIds = new Set(editable.data!)
  const exceptions = exceptionRows.data!.map(toException)
  const participants = new Map(eventRows.data!.map((r) => [r.id, r.event_participants.map((p) => p.person_id)]))

  const result: AgendaEvent[] = events
    .filter((e) => ownerOf.has(e.id))
    .map((e) => ({
      id: e.id,
      title: e.title,
      notes: e.notes,
      location: e.location,
      folder: folderName.get(e.calendarId) ?? null,
      ownerId: ownerOf.get(e.id)!,
      participants: participants.get(e.id) ?? [],
      editable: editableIds.has(e.calendarId),
      timing: e,
      exceptions: exceptions.filter((x) => x.eventId === e.id),
    }))
  // The same busy slot comes once per group it is shared with.
  const seen = new Set(result.map((e) => e.id))
  for (const res of busy) {
    for (const b of res.data!.map(toBusyEvent)) {
      if (seen.has(b.id)) continue
      seen.add(b.id)
      result.push({
        id: b.id,
        title: null,
        notes: null,
        location: null,
        folder: null,
        ownerId: b.ownerId,
        participants: [],
        editable: false,
        timing: b,
        exceptions: b.exceptions,
      })
    }
  }
  return result
}

// ── Writing ─────────────────────────────────────────────────

interface Folder {
  id: string
  name: string
  ownerId: string
}

/** The folder of the last event I created; else my first folder; else any I can edit (as the form). */
function defaultFolder(me: Me, editable: { id: string; owner_id: string }[]): string | null {
  if (me.lastCalendarId && editable.some((c) => c.id === me.lastCalendarId)) return me.lastCalendarId
  return (editable.find((c) => c.owner_id === me.personId) ?? editable[0])?.id ?? null
}

/** A folder I can add events to: the one asked for, or the default. */
async function editableFolder(ctx: Context, me: Me, folderId: string | undefined): Promise<Folder> {
  const [folders, editable] = await Promise.all([
    ctx.db.from('calendars').select('id, owner_id, name').is('deleted_at', null),
    ctx.db.rpc('editable_calendar_ids'),
  ])
  if (folders.error) throw folders.error
  if (editable.error) throw editable.error
  const mine = folders.data.filter((c) => editable.data.includes(c.id))
  const id = folderId ?? defaultFolder(me, mine)
  if (!id) throw new ToolError('No tienes ninguna carpeta en la que crear eventos. Crea una en la app: Calendario → Mis carpetas.')
  const folder = mine.find((c) => c.id === id)
  if (!folder) throw new ToolError('No puedes añadir eventos a esa carpeta. Usa listar_carpetas para ver en cuáles sí.')
  return { id: folder.id, name: folder.name, ownerId: folder.owner_id }
}

/**
 * The zone a new event's times are in: that of the first of my groups its folder is shared with,
 * else of my newest group. (The app leaves the column's default, Europe/Madrid, which is every
 * group's zone today.)
 */
async function folderTimezone(ctx: Context, me: Me, folderId: string): Promise<string> {
  const { data: shares, error } = await ctx.db.from('calendar_shares').select('group_id').eq('calendar_id', folderId)
  if (error) throw error
  const group = me.groups.find((g) => shares.some((s) => s.group_id === g.id)) ?? me.groups[0]
  return group?.timezone ?? DEFAULT_TIMEZONE
}

/** Adds who goes and the extra groups to a new event; a sentence on top of the summary. */
async function addToEvent(ctx: Context, eventId: string, folder: Folder, people: string[], groups: string[]): Promise<string> {
  const participants = [...new Set(people)].filter((p) => p !== folder.ownerId)
  const extra: string[] = []
  try {
    if (groups.length) {
      const { data: shared, error } = await ctx.db.from('calendar_shares').select('group_id').eq('calendar_id', folder.id)
      if (error) throw error
      const added = [...new Set(groups)].filter((g) => !shared.some((s) => s.group_id === g))
      if (added.length) {
        const res = await ctx.db.from('event_shares').insert(added.map((group_id) => ({ event_id: eventId, group_id })))
        if (res.error) throw res.error
      }
    }
    if (participants.length) {
      const res = await ctx.db.from('event_participants').insert(participants.map((person_id) => ({ event_id: eventId, person_id })))
      if (res.error) throw res.error
      const name = await ctx.names(participants)
      extra.push(` · con ${participants.map(name).join(', ')}`)
    }
  } catch (e) {
    // The event is saved; say so, so the AI doesn't create it again.
    throw new ToolError(
      `El evento se ha creado (${eventLink(eventId)}), pero no se pudieron añadir los participantes o grupos: ${
        e instanceof ToolError ? e.message : 'revisa que esas personas o grupos sean de los tuyos'
      }. Puedes probar con editar_evento.`,
    )
  }
  return extra.join('')
}

async function setParticipants(ctx: Context, eventId: string, current: string[], wanted: string[]) {
  const added = wanted.filter((p) => !current.includes(p))
  const removed = current.filter((p) => !wanted.includes(p))
  if (added.length) {
    const { error } = await ctx.db.from('event_participants').insert(added.map((person_id) => ({ event_id: eventId, person_id })))
    if (error) throw error
  }
  if (removed.length) {
    const { error } = await ctx.db.from('event_participants').delete().eq('event_id', eventId).in('person_id', removed)
    if (error) throw error
  }
}

/** An event I can edit, with who goes. */
async function editableEvent(ctx: Context, eventId: string): Promise<{ event: CalendarEvent & EventFields; participants: string[] }> {
  const [row, editable] = await Promise.all([
    ctx.db.from('events').select('*, event_participants(person_id)').eq('id', eventId).is('deleted_at', null).maybeSingle(),
    ctx.db.rpc('editable_calendar_ids'),
  ])
  if (row.error) throw row.error
  if (editable.error) throw editable.error
  if (!row.data) throw new ToolError('Ese evento no existe o no lo ves. Usa ver_eventos para buscarlo.')
  const event = toEvent(row.data)
  if (!editable.data.includes(event.calendarId)) throw new ToolError(`No puedes cambiar «${event.title}»: es de una carpeta que no editas.`)
  return { event, participants: row.data.event_participants.map((p) => p.person_id) }
}

/** A day of a repeating event I can edit, with the change it already has. */
async function repeatingDay(ctx: Context, eventId: string, day: string): Promise<{ event: CalendarEvent; exception: EventException | null }> {
  const { event } = await editableEvent(ctx, eventId)
  if (event.repeat === 'none') {
    throw new ToolError(`«${event.title}» no se repite: para cambiarlo usa editar_evento. Un evento puntual no se puede cancelar desde aquí.`)
  }
  if (!isSeriesDate(event, day)) {
    throw new ToolError(`«${event.title}» no cae el ${day}. Usa la fecha_serie que da ver_eventos.`)
  }
  const { data: row, error } = await ctx.db
    .from('event_exceptions')
    .select('event_id, occurrence_date, status, overrides')
    .eq('event_id', eventId)
    .eq('occurrence_date', day)
    .maybeSingle()
  if (error) throw error
  return { event, exception: row ? toException(row) : null }
}
