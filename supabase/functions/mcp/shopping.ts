// Shopping tools: see the list and add products, merging with a pending line of the same product
// in the same folder as the app does (src/stores/list.ts, merge_item). Folders belong to the group;
// the default one is the folder the person last added to. Folders can be made from here, but
// nothing is renamed, ticked off or removed.

import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { normalizeName } from '../../../src/utils/text.ts'
import { APP_URL, pickGroup, ToolError, type Context, type MyGroup } from './context.ts'
import { itemFields, shoppingFolderName, type ItemFields } from './input.ts'
import { CONFIRM_FIRST, data, done, tool } from './tools.ts'

const MAX_PRODUCTS = 30

/** Items without a folder, as the app calls them. */
const GENERAL = 'General'

const STATUS: Record<string, string> = { pending: 'por comprar', in_cart: 'en el carro' }

const GROUP_INPUT = z.guid().optional().describe('Si estás en varios grupos con compra, cuál (de quien_soy).')

interface Folder {
  id: string
  name: string
}

async function loadFolders(ctx: Context, group: MyGroup): Promise<Folder[]> {
  const { data: rows, error } = await ctx.db.from('shopping_folders').select('id, name').eq('group_id', group.id).order('name')
  if (error) throw error
  return rows
}

const listLink = (folderId: string | null) => `${APP_URL}/lista?carpeta=${folderId ?? 'general'}`

export function registerShoppingTools(server: McpServer, ctx: Context) {
  tool(
    server,
    'ver_compra',
    'read',
    {
      title: 'Ver la lista de la compra',
      description:
        'Lo que hay en la lista de la compra de un grupo: lo que falta por comprar y lo que alguien ya lleva en el carro, ' +
        `con la carpeta de cada cosa («Casa», «Coche»…; sin carpeta, «${GENERAL}»), las carpetas del grupo con su carpeta_id ` +
        'y la carpeta por defecto (la última en la que añadió la persona).',
      input: z.object({ grupo_id: GROUP_INPUT }),
    },
    async ({ grupo_id }) => {
      const group = pickGroup(await ctx.me(), grupo_id, (g) => g.shopping, 'la lista de la compra')
      const [folders, items] = await Promise.all([
        loadFolders(ctx, group),
        ctx.db
          .from('items')
          .select('name, quantity, note, status, folder_id')
          .eq('group_id', group.id)
          .in('status', ['pending', 'in_cart'])
          .order('added_at'),
      ])
      if (items.error) throw items.error
      const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name ?? GENERAL
      const byDefault = folders.some((f) => f.id === group.lastShoppingFolderId) ? group.lastShoppingFolderId : null
      return data({
        grupo: group.name,
        carpetas: [
          { carpeta_id: null, nombre: GENERAL },
          ...folders.map((f) => ({ carpeta_id: f.id, nombre: f.name })),
        ],
        carpeta_por_defecto: { carpeta_id: byDefault, nombre: folderName(byDefault) },
        productos: items.data.map((r) => ({
          nombre: r.name,
          ...(r.quantity > 1 && { cantidad: r.quantity }),
          ...(r.note && { nota: r.note }),
          carpeta: folderName(r.folder_id),
          estado: STATUS[r.status] ?? r.status,
        })),
      })
    },
  )

  tool(
    server,
    'crear_carpeta_compra',
    'create',
    {
      title: 'Crear una carpeta de la compra',
      description:
        'Crea una carpeta en la lista de la compra de un grupo («Coche», «Trabajo», «Farmacia»…), para toda la familia. ' +
        'Si ya hay una con ese nombre, no se crea otra: devuelve esa. Úsala solo si ninguna de ver_compra encaja. ' +
        'Devuelve su carpeta_id para anadir_compra. ' +
        CONFIRM_FIRST,
      input: z.object({
        grupo_id: GROUP_INPUT,
        nombre: z.string().max(200).describe('Nombre corto («Coche», «Trabajo»).'),
      }),
    },
    async ({ grupo_id, nombre }) => {
      const group = pickGroup(await ctx.me(), grupo_id, (g) => g.shopping, 'la lista de la compra')
      const name = shoppingFolderName(nombre)
      if (!name.ok) throw new ToolError(name.error)
      const key = normalizeName(name.value)
      if (key === normalizeName(GENERAL)) {
        throw new ToolError(`«${GENERAL}» ya existe: es donde va lo que no tiene carpeta (carpeta_id null).`)
      }
      const existing = (await loadFolders(ctx, group)).find((f) => normalizeName(f.name) === key)
      if (existing) {
        return done(
          `Ya había una carpeta «${existing.name}» en la compra de ${group.name} (carpeta_id ${existing.id}): no se ha creado otra.\n` +
            `Verla: ${listLink(existing.id)}`,
        )
      }
      const { data: row, error } = await ctx.db
        .from('shopping_folders')
        .insert({ group_id: group.id, name: name.value, created_by: group.memberId })
        .select('id, name')
        .single()
      if (error) throw error
      return done(`Carpeta «${row.name}» creada en la compra de ${group.name} (carpeta_id ${row.id}).\nVerla: ${listLink(row.id)}`)
    },
  )

  tool(
    server,
    'anadir_compra',
    'create',
    {
      title: 'Añadir a la lista de la compra',
      description:
        `Añade productos (como mucho ${MAX_PRODUCTS} de una vez) a una carpeta de la lista de la compra de un grupo. Si ya hay uno ` +
        'igual por comprar en esa carpeta, suma la cantidad en lugar de repetirlo, como la app. Nombres cortos, como se dicen en ' +
        'casa («Leche», «Tomates»). Para repartir en varias carpetas, una llamada por carpeta. ' +
        CONFIRM_FIRST,
      input: z.object({
        grupo_id: GROUP_INPUT,
        carpeta_id: z
          .guid()
          .nullable()
          .optional()
          .describe(
            `Carpeta (de ver_compra o crear_carpeta_compra); null es «${GENERAL}». Sin ella, la carpeta por defecto de ver_compra ` +
              '(la última que usó la persona).',
          ),
        productos: z
          .array(
            z.object({
              nombre: z.string().max(120),
              cantidad: z.number().int().optional().describe('Unidades, de 1 a 999. Sin ella, 1.'),
              nota: z.string().max(200).optional().describe('Marca, tamaño… (opcional).'),
            }),
          )
          .min(1)
          .max(MAX_PRODUCTS),
      }),
    },
    async ({ grupo_id, carpeta_id, productos }) => {
      const group = pickGroup(await ctx.me(), grupo_id, (g) => g.shopping, 'la lista de la compra')
      const folders = await loadFolders(ctx, group)
      let folderId: string | null
      if (carpeta_id === undefined) {
        folderId = folders.some((f) => f.id === group.lastShoppingFolderId) ? group.lastShoppingFolderId : null
      } else {
        folderId = carpeta_id
        if (folderId && !folders.some((f) => f.id === folderId)) {
          throw new ToolError('Esa carpeta no es de la lista de la compra de ese grupo: usa las de ver_compra.')
        }
      }
      const folderName = folders.find((f) => f.id === folderId)?.name ?? GENERAL

      // Everything checked before writing anything; the same product twice goes as one line.
      const wanted = new Map<string, ItemFields>()
      for (const p of productos) {
        const item = itemFields(p)
        if (!item.ok) throw new ToolError(item.error)
        const key = normalizeName(item.value.name)
        const same = wanted.get(key)
        if (!same) {
          wanted.set(key, item.value)
          continue
        }
        // As mergeInto() in the app: quantities add up, a different note is kept after the first.
        same.quantity = Math.min(999, same.quantity + item.value.quantity)
        const note = item.value.note
        if (note && note !== same.note) same.note = (same.note ? `${same.note} · ${note}` : note).slice(0, 120)
      }
      const pendingQuery = ctx.db.from('items').select('id, name').eq('group_id', group.id).eq('status', 'pending')
      const { data: pending, error } = await (folderId ? pendingQuery.eq('folder_id', folderId) : pendingQuery.is('folder_id', null))
      if (error) throw error

      const lines: string[] = []
      for (const [key, item] of wanted) {
        const duplicate = pending.find((i) => normalizeName(i.name) === key)
        if (duplicate) {
          const res = await ctx.db.rpc('merge_item', { item_id: duplicate.id, add_quantity: item.quantity, extra_note: item.note ?? undefined })
          if (res.error) throw res.error
          lines.push(`${duplicate.name}: ahora ${res.data.quantity}`)
        } else {
          const res = await ctx.db.from('items').insert({
            group_id: group.id,
            folder_id: folderId,
            name: item.name,
            quantity: item.quantity,
            note: item.note,
            added_by: group.memberId,
          })
          if (res.error) throw res.error
          lines.push(`${item.name}${item.quantity > 1 ? ` (${item.quantity})` : ''}`)
        }
      }
      const where = folders.length ? ` (carpeta ${folderName})` : ''
      return done(`Añadido a la compra de ${group.name}${where}: ${lines.join(', ')}.\nVer la lista: ${listLink(folderId)}`)
    },
  )
}
