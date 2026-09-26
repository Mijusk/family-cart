// Fake data used until the app is connected to Supabase.
import type { Group, Item, Member, Product, Trip } from '@/types'
import { normalizeName } from '@/utils/text'

const GROUP_ID = 'g1'
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

export const CURRENT_MEMBER_ID = 'm1'

export const group: Group = {
  id: GROUP_ID,
  name: 'Casa Martín',
  inviteCode: 'HUERTA-7Q4K',
  createdAt: ago(62 * DAY),
}

export const members: Member[] = [
  { id: 'm1', groupId: GROUP_ID, name: 'Luis', createdAt: ago(62 * DAY) },
  { id: 'm2', groupId: GROUP_ID, name: 'Marta', createdAt: ago(62 * DAY) },
  { id: 'm3', groupId: GROUP_ID, name: 'Daniel', createdAt: ago(40 * DAY) },
  { id: 'm4', groupId: GROUP_ID, name: 'Abuela Carmen', createdAt: ago(12 * DAY) },
]

export const trips: Trip[] = [
  { id: 't1', groupId: GROUP_ID, memberId: 'm2', startedAt: ago(9 * DAY + 4 * HOUR), finishedAt: ago(9 * DAY + 3 * HOUR) },
  { id: 't2', groupId: GROUP_ID, memberId: 'm1', startedAt: ago(5 * DAY + 7 * HOUR), finishedAt: ago(5 * DAY + 6 * HOUR + 10 * MINUTE) },
  { id: 't3', groupId: GROUP_ID, memberId: 'm2', startedAt: ago(DAY + 2 * HOUR + 40 * MINUTE), finishedAt: ago(DAY + 2 * HOUR) },
]

type Seed = [name: string, quantity: number, note: string | null, addedBy: string, addedAgo: number]

let seq = 0
function pending([name, quantity, note, addedBy, addedAgo]: Seed): Item {
  return {
    id: `i${++seq}`,
    groupId: GROUP_ID,
    name,
    quantity,
    note,
    status: 'pending',
    addedBy,
    addedAt: ago(addedAgo),
    tripId: null,
    purchasedBy: null,
    purchasedAt: null,
  }
}

function purchased(seed: Seed, trip: Trip): Item {
  return {
    ...pending(seed),
    status: 'purchased',
    tripId: trip.id,
    purchasedBy: trip.memberId,
    purchasedAt: trip.finishedAt,
  }
}

const [t1, t2, t3] = trips as [Trip, Trip, Trip]

export const items: Item[] = [
  pending(['Leche semidesnatada', 6, null, 'm2', 3 * HOUR]),
  pending(['Plátanos', 1, 'De Canarias, que no estén muy maduros', 'm4', 5 * HOUR]),
  pending(['Pan de molde', 2, 'Integral', 'm3', 20 * MINUTE]),
  pending(['Huevos', 12, 'Camperos', 'm1', 26 * HOUR]),
  pending(['Tomate triturado', 3, null, 'm2', 30 * HOUR]),
  pending(['Detergente lavadora', 1, 'El de siempre, sin perfume', 'm4', 2 * DAY]),
  pending(['Yogures naturales', 8, null, 'm3', 45 * MINUTE]),
  {
    ...pending(['Cilantro fresco', 1, null, 'm1', 3 * DAY]),
    status: 'not_found',
    tripId: t3.id,
  },

  purchased(['Leche semidesnatada', 6, null, 'm2', 10 * DAY], t1),
  purchased(['Arroz', 2, 'Bomba', 'm1', 10 * DAY], t1),
  purchased(['Aceite de oliva', 1, 'Virgen extra, 1 L', 'm4', 11 * DAY], t1),
  purchased(['Manzanas', 1, null, 'm3', 10 * DAY], t1),

  purchased(['Pechuga de pollo', 2, null, 'm2', 6 * DAY], t2),
  purchased(['Pasta', 3, 'Macarrones', 'm3', 6 * DAY], t2),
  purchased(['Papel higiénico', 1, 'Paquete de 12', 'm4', 7 * DAY], t2),
  purchased(['Café molido', 2, null, 'm1', 6 * DAY], t2),
  purchased(['Tomate triturado', 2, null, 'm2', 6 * DAY], t2),

  purchased(['Yogures naturales', 8, null, 'm3', 2 * DAY], t3),
  purchased(['Pan de molde', 1, 'Integral', 'm3', 2 * DAY], t3),
  purchased(['Queso rallado', 1, null, 'm1', 2 * DAY], t3),
  purchased(['Lechuga', 2, null, 'm4', 2 * DAY], t3),
  purchased(['Huevos', 12, 'Camperos', 'm2', 3 * DAY], t3),
]

/** Catalog derived from every item ever added, as the backend will maintain it. */
export const products: Product[] = (() => {
  const byName = new Map<string, Product>()
  const chronological = [...items].sort((a, b) => a.addedAt.localeCompare(b.addedAt))
  for (const item of chronological) {
    const key = normalizeName(item.name)
    const existing = byName.get(key)
    if (existing) {
      existing.lastQuantity = item.quantity
      existing.timesUsed++
    } else {
      byName.set(key, {
        id: `p${byName.size + 1}`,
        groupId: GROUP_ID,
        normalizedName: key,
        displayName: item.name,
        lastQuantity: item.quantity,
        timesUsed: 1,
      })
    }
  }
  return [...byName.values()]
})()
