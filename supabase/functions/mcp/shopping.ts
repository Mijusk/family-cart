// Shopping tools: see the list and add products, merging with a pending line of the same product
// as the app does (src/stores/list.ts, merge_item). Nothing is ticked off or removed from here.

import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { normalizeName } from '../../../src/utils/text.ts'
import { APP_URL, pickGroup, ToolError, type Context } from './context.ts'
import { itemFields, type ItemFields } from './input.ts'
import { CONFIRM_FIRST, data, done, tool } from './tools.ts'

const MAX_PRODUCTS = 30

const STATUS: Record<string, string> = { pending: 'por comprar', in_cart: 'en el carro' }

export function registerShoppingTools(server: McpServer, ctx: Context) {
  tool(
    server,
    'ver_compra',
    'read',
    {
      title: 'Ver la lista de la compra',
      description: 'Lo que hay en la lista de la compra de un grupo: lo que falta por comprar y lo que alguien ya lleva en el carro.',
      input: z.object({ grupo_id: z.guid().optional().describe('Si estás en varios grupos con compra, cuál (de quien_soy).') }),
    },
    async ({ grupo_id }) => {
      const group = pickGroup(await ctx.me(), grupo_id, (g) => g.shopping, 'la lista de la compra')
      const { data: rows, error } = await ctx.db
        .from('items')
        .select('name, quantity, note, status')
        .eq('group_id', group.id)
        .in('status', ['pending', 'in_cart'])
        .order('added_at')
      if (error) throw error
      return data({
        grupo: group.name,
        productos: rows.map((r) => ({
          nombre: r.name,
          ...(r.quantity > 1 && { cantidad: r.quantity }),
          ...(r.note && { nota: r.note }),
          estado: STATUS[r.status] ?? r.status,
        })),
      })
    },
  )

  tool(
    server,
    'anadir_compra',
    'create',
    {
      title: 'Añadir a la lista de la compra',
      description:
        `Añade productos (como mucho ${MAX_PRODUCTS} de una vez) a la lista de la compra de un grupo. Si ya hay uno igual por comprar, ` +
        'suma la cantidad en lugar de repetirlo, como la app. Nombres cortos, como se dicen en casa («Leche», «Tomates»). ' +
        CONFIRM_FIRST,
      input: z.object({
        grupo_id: z.guid().optional().describe('Si estás en varios grupos con compra, cuál (de quien_soy).'),
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
    async ({ grupo_id, productos }) => {
      const group = pickGroup(await ctx.me(), grupo_id, (g) => g.shopping, 'la lista de la compra')
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
      const { data: pending, error } = await ctx.db.from('items').select('id, name').eq('group_id', group.id).eq('status', 'pending')
      if (error) throw error

      const lines: string[] = []
      for (const [key, item] of wanted) {
        const duplicate = pending.find((i) => normalizeName(i.name) === key)
        if (duplicate) {
          const res = await ctx.db.rpc('merge_item', { item_id: duplicate.id, add_quantity: item.quantity, extra_note: item.note ?? undefined })
          if (res.error) throw res.error
          lines.push(`${duplicate.name}: ahora ${res.data.quantity}`)
        } else {
          const res = await ctx.db
            .from('items')
            .insert({ group_id: group.id, name: item.name, quantity: item.quantity, note: item.note, added_by: group.memberId })
          if (res.error) throw res.error
          lines.push(`${item.name}${item.quantity > 1 ? ` (${item.quantity})` : ''}`)
        }
      }
      return done(`Añadido a la compra de ${group.name}: ${lines.join(', ')}.\nVer la lista: ${APP_URL}/lista`)
    },
  )
}
