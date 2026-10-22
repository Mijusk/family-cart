// Task tools: see the lists, add and change tasks, tick them off. As src/stores/tasks.ts does,
// through the person's own session; done_at/done_by only through the set_task_done RPC.

import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { toTask } from '../../../src/lib/mappers.ts'
import { addDays, zoneDay } from '../../../src/utils/isoDays.ts'
import { taskSummary } from './agenda.ts'
import { APP_URL, DEFAULT_TIMEZONE, ToolError, type Context } from './context.ts'
import { taskFields } from './input.ts'
import { CONFIRM_FIRST, data, done, tool } from './tools.ts'

/** More than this would not help a chat; the app has them all. */
const MAX_TASKS = 300
/** Done tasks of the last days, when asked for. */
const DONE_DAYS = 7

const taskLink = (taskId: string) => `${APP_URL}/tareas/${taskId}`

const ASSIGNEES = z
  .array(z.guid())
  .max(10)
  .describe('persona_id de listar_personas. Tienen que ver la lista (estar en un grupo con el que se comparte).')

export function registerTaskTools(server: McpServer, ctx: Context) {
  tool(
    server,
    'ver_tareas',
    'read',
    {
      title: 'Ver las tareas',
      description:
        'Tus listas de tareas (las tuyas y las compartidas contigo) y sus tareas pendientes, con fecha y a quién están asignadas. ' +
        'Usa lista_id para crear tareas en una lista y tarea_id para cambiarlas o marcarlas como hechas.',
      input: z.object({
        lista_id: z.guid().optional().describe('Solo esta lista.'),
        incluir_hechas: z.boolean().optional().describe(`También las hechas en los últimos ${DONE_DAYS} días.`),
      }),
    },
    async ({ lista_id, incluir_hechas }) => {
      const me = await ctx.me()
      const today = zoneDay(me.groups[0]?.timezone ?? DEFAULT_TIMEZONE, new Date())
      const doneSince = `${addDays(today, -DONE_DAYS)}T00:00:00Z`
      let lists = ctx.db.from('task_lists').select('id, name, owner_id, created_at').is('deleted_at', null)
      let tasks = ctx.db
        .from('tasks')
        .select()
        .is('deleted_at', null)
        .or(incluir_hechas ? `done_at.is.null,done_at.gte.${doneSince}` : 'done_at.is.null')
        .order('position')
        .limit(MAX_TASKS)
      if (lista_id) {
        lists = lists.eq('id', lista_id)
        tasks = tasks.eq('list_id', lista_id)
      }
      const [listRows, shareRows, taskRows] = await Promise.all([lists, ctx.db.from('task_list_shares').select('list_id, group_id'), tasks])
      for (const res of [listRows, shareRows, taskRows]) if (res.error) throw res.error
      if (lista_id && !listRows.data!.length) throw new ToolError('Esa lista no existe o no la ves.')
      const all = taskRows.data!.map(toTask)
      const name = await ctx.names([...listRows.data!.map((l) => l.owner_id), ...all.flatMap((t) => t.assignees)])
      const groupName = (gid: string) => me.groups.find((g) => g.id === gid)?.name ?? 'otro grupo'
      return data({
        listas: listRows
          .data!.sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((l) => {
            const groups = shareRows.data!.filter((s) => s.list_id === l.id).map((s) => groupName(s.group_id))
            return { lista_id: l.id, nombre: l.name, de: name(l.owner_id), compartida_con: groups.length ? groups : 'privada' }
          }),
        tareas: all.map((t) => ({
          tarea_id: t.id,
          lista_id: t.listId,
          titulo: t.title,
          ...(t.notes && { notas: t.notes }),
          ...(t.dueDate && { fecha: t.dueDate }),
          ...(t.assignees.length && { asignada_a: t.assignees.map(name) }),
          ...(t.doneAt && { hecha: true }),
        })),
        ...(all.length === MAX_TASKS && { nota: `Solo las primeras ${MAX_TASKS}: filtra por lista para ver el resto.` }),
      })
    },
  )

  tool(
    server,
    'crear_tarea',
    'create',
    {
      title: 'Crear una tarea',
      description:
        'Añade una tarea al final de una lista (lista_id de ver_tareas). Si la persona no dice en qué lista y tiene varias, pregunta. ' +
        CONFIRM_FIRST,
      input: z.object({
        lista_id: z.guid(),
        titulo: z.string().max(200),
        notas: z.string().max(2500).optional(),
        fecha: z.string().max(10).optional().describe('Para cuándo, AAAA-MM-DD (opcional).'),
        asignar_a: ASSIGNEES.optional(),
      }),
    },
    async ({ lista_id, titulo, notas, fecha, asignar_a }) => {
      const fields = taskFields({ titulo, notas, fecha })
      if (!fields.ok) throw new ToolError(fields.error)
      const [list, last] = await Promise.all([
        ctx.db.from('task_lists').select('name').eq('id', lista_id).is('deleted_at', null).maybeSingle(),
        ctx.db.from('tasks').select('position').eq('list_id', lista_id).order('position', { ascending: false }).limit(1),
      ])
      if (list.error) throw list.error
      if (last.error) throw last.error
      if (!list.data) throw new ToolError('Esa lista no existe o no la ves. Usa ver_tareas para ver tus listas.')
      const { data: row, error } = await ctx.db
        .from('tasks')
        .insert({
          list_id: lista_id,
          title: fields.value.title,
          notes: fields.value.notes,
          due_date: fields.value.dueDate,
          assignees: [...new Set(asignar_a ?? [])],
          position: Number(last.data[0]?.position ?? 0) + 1,
        })
        .select()
        .single()
      if (error) throw error
      const task = toTask(row)
      const name = await ctx.names(task.assignees)
      const who = task.assignees.length ? ` · para ${task.assignees.map(name).join(', ')}` : ''
      return done(`Tarea creada: ${taskSummary(task, list.data.name)}${who}\nÁbrela en Family App: ${taskLink(task.id)}`)
    },
  )

  tool(
    server,
    'editar_tarea',
    'change',
    {
      title: 'Cambiar una tarea',
      description:
        'Cambia el título, las notas, la fecha o a quién está asignada una tarea. Pasa solo lo que cambia; null borra las notas o la ' +
        'fecha. asignar_a es la lista completa tal como debe quedar. No se pueden borrar tareas. ' +
        CONFIRM_FIRST,
      input: z.object({
        tarea_id: z.guid(),
        titulo: z.string().max(200).optional(),
        notas: z.string().max(2500).nullable().optional(),
        fecha: z.string().max(10).nullable().optional(),
        asignar_a: ASSIGNEES.optional(),
      }),
    },
    async ({ tarea_id, titulo, notas, fecha, asignar_a }) => {
      const { data: current, error: readError } = await ctx.db.from('tasks').select().eq('id', tarea_id).is('deleted_at', null).maybeSingle()
      if (readError) throw readError
      if (!current) throw new ToolError('Esa tarea no existe o no la ves. Usa ver_tareas para buscarla.')
      const base = toTask(current)
      const fields = taskFields({ titulo, notas, fecha }, base)
      if (!fields.ok) throw new ToolError(fields.error)
      const { data: row, error } = await ctx.db
        .from('tasks')
        .update({
          title: fields.value.title,
          notes: fields.value.notes,
          due_date: fields.value.dueDate,
          ...(asignar_a && { assignees: [...new Set(asignar_a)] }),
        })
        .eq('id', tarea_id)
        .select()
        .single()
      if (error) throw error
      const task = toTask(row)
      const name = await ctx.names(task.assignees)
      const who = task.assignees.length ? ` · para ${task.assignees.map(name).join(', ')}` : ''
      return done(`Tarea cambiada: ${taskSummary(task, null)}${who}\nÁbrela en Family App: ${taskLink(task.id)}`)
    },
  )

  tool(
    server,
    'marcar_tarea',
    'change',
    {
      title: 'Marcar una tarea como hecha',
      description: 'Marca una tarea como hecha (o pendiente otra vez, con hecha: false). ' + CONFIRM_FIRST,
      input: z.object({ tarea_id: z.guid(), hecha: z.boolean() }),
    },
    async ({ tarea_id, hecha }) => {
      const { data: row, error: readError } = await ctx.db.from('tasks').select('title').eq('id', tarea_id).is('deleted_at', null).maybeSingle()
      if (readError) throw readError
      if (!row) throw new ToolError('Esa tarea no existe o no la ves. Usa ver_tareas para buscarla.')
      const { error } = await ctx.db.rpc('set_task_done', { task_id: tarea_id, done: hecha })
      if (error) throw error
      return done(hecha ? `Hecha: ${row.title}.` : `Pendiente otra vez: ${row.title}.`)
    },
  )
}
