import { computed, ref, type Ref } from 'vue'
import { defineStore } from 'pinia'
import type { RealtimeChannel, RealtimeSystemPayload } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  fromItem,
  toItem,
  toProduct,
  toTrip,
  type ItemRow,
  type ItemUpdate,
  type ProductRow,
  type TripRow,
} from '@/lib/mappers'
import type { Item, Product, Trip } from '@/types'
import { newId } from '@/utils/id'
import { cleanDisplayName, normalizeName } from '@/utils/text'
import { useGroupStore } from './group'
import { useToastStore } from './toast'

export interface NewItem {
  name: string
  quantity: number
  note?: string | null
}

export interface Suggestion {
  product: Product
  /** Already in the pending list, so picking it would be a duplicate. */
  pending: boolean
}

export interface TripSummary {
  trip: Trip
  items: Item[]
}

/** How far back the history goes. */
const HISTORY_DAYS = 60

const byNewest = (a: Item, b: Item) => b.addedAt.localeCompare(a.addedAt)
const isOnList = (item: Item) => item.status === 'pending' || item.status === 'not_found'

function upsert<T extends { id: string }>(list: Ref<T[]>, row: T) {
  const index = list.value.findIndex((x) => x.id === row.id)
  if (index === -1) list.value.push(row)
  else list.value[index] = row
}

/**
 * Every action updates local state first (so the UI reacts instantly) and then writes to
 * Supabase. Realtime echoes the row back to every device, including this one, where
 * upsert() makes the echo a no-op. If a write fails, the store reloads from the server.
 */
export const useListStore = defineStore('list', () => {
  const groupStore = useGroupStore()
  const toast = useToastStore()

  const groupId = ref<string | null>(null)
  const items = ref<Item[]>([])
  const products = ref<Product[]>([])
  const trips = ref<Trip[]>([])
  let channel: RealtimeChannel | null = null

  // ── Getters ────────────────────────────────────────────────

  /** Everything still to buy, including items someone could not find. */
  const pendingItems = computed(() => items.value.filter(isOnList).sort(byNewest))

  const activeTrips = computed(() => trips.value.filter((t) => !t.finishedAt))

  const myActiveTrip = computed(
    () => activeTrips.value.find((t) => t.memberId === groupStore.currentMemberId) ?? null,
  )

  /** Items currently in anyone's cart. */
  const inCartItems = computed(() => items.value.filter((i) => i.status === 'in_cart'))

  const myCartItems = computed(() =>
    myActiveTrip.value ? inCartItems.value.filter((i) => i.tripId === myActiveTrip.value!.id) : [],
  )

  /** Finished trips that bought something, newest first. */
  const history = computed<TripSummary[]>(() =>
    trips.value
      .filter((t) => t.finishedAt)
      .sort((a, b) => b.finishedAt!.localeCompare(a.finishedAt!))
      .map((trip) => ({
        trip,
        items: items.value.filter((i) => i.tripId === trip.id && i.status === 'purchased'),
      }))
      .filter((summary) => summary.items.length > 0),
  )

  function tripById(id: string | null): Trip | undefined {
    return trips.value.find((t) => t.id === id)
  }

  function findPendingDuplicate(name: string): Item | undefined {
    const key = normalizeName(name)
    if (!key) return undefined
    return pendingItems.value.find((i) => normalizeName(i.name) === key)
  }

  function suggest(query: string, limit = 5): Suggestion[] {
    const q = normalizeName(query)
    if (!q) return []
    const pendingKeys = new Set(pendingItems.value.map((i) => normalizeName(i.name)))
    return products.value
      .filter((p) => p.normalizedName.includes(q) && p.normalizedName !== q)
      .sort((a, b) => {
        const aStarts = a.normalizedName.startsWith(q) ? 0 : 1
        const bStarts = b.normalizedName.startsWith(q) ? 0 : 1
        return aStarts - bStarts || b.timesUsed - a.timesUsed
      })
      .slice(0, limit)
      .map((product) => ({ product, pending: pendingKeys.has(product.normalizedName) }))
  }

  // ── Loading & realtime ─────────────────────────────────────

  async function load(gid: string) {
    groupId.value = gid
    await refresh()
    subscribe(gid)
  }

  async function refresh() {
    const gid = groupId.value
    if (!gid) return
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString()
    const [itemsRes, productsRes, tripsRes] = await Promise.all([
      supabase.from('items').select().eq('group_id', gid).or(`status.neq.purchased,purchased_at.gte."${since}"`),
      supabase.from('products').select().eq('group_id', gid),
      supabase.from('trips').select().eq('group_id', gid).or(`finished_at.is.null,finished_at.gte."${since}"`),
    ])
    if (itemsRes.error) throw itemsRes.error
    if (productsRes.error) throw productsRes.error
    if (tripsRes.error) throw tripsRes.error
    items.value = itemsRes.data.map(toItem)
    products.value = productsRes.data.map(toProduct)
    trips.value = tripsRes.data.map(toTrip)
  }

  function subscribe(gid: string) {
    if (channel) void supabase.removeChannel(channel)
    const filter = `group_id=eq.${gid}`
    channel = supabase
      .channel(`list:${gid}`)
      .on<ItemRow>('postgres_changes', { event: 'INSERT', schema: 'public', table: 'items', filter }, (p) =>
        upsert(items, toItem(p.new)),
      )
      .on<ItemRow>('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'items', filter }, (p) =>
        upsert(items, toItem(p.new)),
      )
      // Delete events can't be filtered and only carry the id; unknown ids are simply ignored.
      .on<ItemRow>('postgres_changes', { event: 'DELETE', schema: 'public', table: 'items' }, (p) => {
        if (p.old.id) removeLocal(p.old.id)
      })
      .on<TripRow>('postgres_changes', { event: '*', schema: 'public', table: 'trips', filter }, (p) => {
        if (p.eventType !== 'DELETE') upsert(trips, toTrip(p.new))
      })
      .on<ProductRow>('postgres_changes', { event: '*', schema: 'public', table: 'products', filter }, (p) => {
        if (p.eventType !== 'DELETE') upsert(products, toProduct(p.new))
      })
      // Catch up on anything missed before the listeners were live: SUBSCRIBED also fires after a
      // reconnect (phone back from background), and the system event when Postgres changes actually start.
      .on('system', {}, (p: RealtimeSystemPayload) => {
        if (p.extension === 'postgres_changes' && p.status === 'ok') refresh().catch(console.error)
      })
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') refresh().catch(console.error)
      })
  }

  /**
   * Queues a Supabase write. Writes run one after another so the server sees them in the
   * order they happened (a trip is created before items reference it, an add before its undo).
   * Takes a function because query builders only fire when awaited. On failure it tells the
   * user and resyncs with the server.
   */
  let writes: Promise<void> = Promise.resolve()
  function persist(request: () => PromiseLike<{ error: unknown }>) {
    writes = writes.then(async () => {
      let error: unknown
      try {
        ;({ error } = await request())
      } catch (e) {
        error = e // a rejected write must not stall the queue
      }
      if (!error) return
      console.error(error)
      toast.show('No se pudo guardar el cambio. Revisa la conexión.')
      await refresh().catch(console.error)
    })
  }

  // ── Internal helpers ───────────────────────────────────────

  /** Optimistic copy of what the items trigger does on the server. */
  function rememberProductLocally(name: string, quantity: number) {
    const key = normalizeName(name)
    const product = products.value.find((p) => p.normalizedName === key)
    if (product) {
      product.displayName = name
      product.lastQuantity = quantity
      product.timesUsed++
    } else {
      products.value.push({
        id: newId(),
        groupId: groupId.value!,
        normalizedName: key,
        displayName: name,
        lastQuantity: quantity,
        timesUsed: 1,
      })
    }
  }

  function findItem(id: string): Item | undefined {
    return items.value.find((i) => i.id === id)
  }

  function removeLocal(id: string) {
    items.value = items.value.filter((i) => i.id !== id)
  }

  function updateRemote(id: string, changes: ItemUpdate) {
    persist(() => supabase.from('items').update(changes).eq('id', id))
  }

  /** Undo for edits and merges: puts name, quantity and note back as they were. */
  function restoreFields(snapshot: Item) {
    const item = findItem(snapshot.id)
    if (!item) return
    Object.assign(item, { name: snapshot.name, quantity: snapshot.quantity, note: snapshot.note })
    updateRemote(snapshot.id, { name: snapshot.name, quantity: snapshot.quantity, note: snapshot.note })
  }

  /** Undo for deletes: inserts the row again with the same id. */
  function restoreDeleted(snapshot: Item) {
    upsert(items, snapshot)
    persist(() => supabase.from('items').insert(fromItem(snapshot)))
  }

  function removeItem(id: string) {
    removeLocal(id)
    persist(() => supabase.from('items').delete().eq('id', id))
  }

  // ── List actions ───────────────────────────────────────────

  function addItem(input: NewItem): Item {
    const name = cleanDisplayName(input.name)
    const item: Item = {
      id: newId(),
      groupId: groupId.value!,
      name,
      quantity: Math.max(1, input.quantity),
      note: input.note?.trim() || null,
      status: 'pending',
      addedBy: groupStore.currentMemberId,
      addedAt: new Date().toISOString(),
      tripId: null,
      purchasedBy: null,
      purchasedAt: null,
    }
    items.value.push(item)
    rememberProductLocally(name, item.quantity)
    persist(() => supabase.from('items').insert(fromItem(item)))
    toast.show(`Añadido: ${name}`, () => removeItem(item.id))
    return item
  }

  /** Adds quantity to an existing pending line instead of creating a duplicate. */
  function mergeInto(id: string, quantity: number, note?: string | null) {
    const item = findItem(id)
    if (!item) return
    const snapshot = { ...item }
    const add = Math.max(1, quantity)
    const extraNote = note?.trim() || null
    item.quantity = Math.min(999, item.quantity + add)
    if (extraNote && extraNote !== item.note) {
      item.note = item.note ? `${item.note} · ${extraNote}` : extraNote
    }
    rememberProductLocally(item.name, add)
    // The RPC adds on the server, so a concurrent add from another phone isn't lost.
    persist(async () => {
      const res = await supabase.rpc('merge_item', { item_id: id, add_quantity: add, extra_note: extraNote ?? undefined })
      if (res.data) upsert(items, toItem(res.data))
      return res
    })
    toast.show(`${item.name}: ahora ${item.quantity}`, () => restoreFields(snapshot))
  }

  /** Adds to the list, merging with a pending line of the same product if there is one. */
  function addOrMerge(input: NewItem) {
    const duplicate = findPendingDuplicate(input.name)
    if (duplicate) mergeInto(duplicate.id, input.quantity, input.note)
    else addItem(input)
  }

  function updateItem(id: string, changes: Pick<Item, 'name' | 'quantity' | 'note'>) {
    const item = findItem(id)
    if (!item) return
    const snapshot = { ...item }
    item.name = cleanDisplayName(changes.name) || item.name
    item.quantity = Math.max(1, changes.quantity)
    item.note = changes.note?.trim() || null
    const changed =
      item.name !== snapshot.name || item.quantity !== snapshot.quantity || item.note !== snapshot.note
    if (!changed) return
    updateRemote(id, { name: item.name, quantity: item.quantity, note: item.note })
    toast.show('Cambios guardados', () => restoreFields(snapshot))
  }

  function deleteItem(id: string) {
    const item = findItem(id)
    if (!item) return
    const snapshot = { ...item }
    removeItem(id)
    toast.show(`Borrado: ${item.name}`, () => restoreDeleted(snapshot))
  }

  // ── Shopping trip actions ──────────────────────────────────

  function startTrip(): Trip {
    if (myActiveTrip.value) return myActiveTrip.value
    const trip: Trip = {
      id: newId(),
      groupId: groupId.value!,
      memberId: groupStore.currentMemberId,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      closedReason: null,
    }
    trips.value.push(trip)
    persist(() =>
      supabase
        .from('trips')
        .insert({ id: trip.id, group_id: trip.groupId, member_id: trip.memberId, started_at: trip.startedAt }),
    )
    return trip
  }

  /** Tap in shopping mode: list → cart, or cart → back to the list. */
  function toggleInCart(id: string) {
    const item = findItem(id)
    const trip = myActiveTrip.value
    if (!item || !trip) return
    if (item.status === 'in_cart') {
      item.status = 'pending'
      item.tripId = null
    } else {
      item.status = 'in_cart'
      item.tripId = trip.id
    }
    updateRemote(id, { status: item.status, trip_id: item.tripId })
  }

  function markNotFound(id: string) {
    const item = findItem(id)
    const trip = myActiveTrip.value
    if (!item || !trip) return
    item.status = 'not_found'
    item.tripId = trip.id
    updateRemote(id, { status: item.status, trip_id: item.tripId })
  }

  /** Cart items become purchased; returns how many were bought. */
  function finishTrip(): number {
    const trip = myActiveTrip.value
    if (!trip) return 0
    const now = new Date().toISOString()
    const bought = myCartItems.value
    for (const item of bought) {
      item.status = 'purchased'
      item.purchasedBy = trip.memberId
      item.purchasedAt = now
    }
    trip.finishedAt = now
    trip.closedReason = 'manual'
    persist(() => supabase.rpc('finish_trip', { trip_id: trip.id }))
    return bought.length
  }

  /** Abandons the trip, returning anything in the cart to the list. */
  function cancelTrip() {
    const trip = myActiveTrip.value
    if (!trip) return
    for (const item of myCartItems.value) {
      item.status = 'pending'
      item.tripId = null
    }
    trip.finishedAt = new Date().toISOString()
    trip.closedReason = 'cancelled'
    persist(() => supabase.rpc('cancel_trip', { trip_id: trip.id }))
  }

  return {
    items,
    products,
    trips,
    pendingItems,
    activeTrips,
    myActiveTrip,
    inCartItems,
    myCartItems,
    history,
    tripById,
    findPendingDuplicate,
    suggest,
    load,
    addItem,
    mergeInto,
    addOrMerge,
    updateItem,
    deleteItem,
    startTrip,
    toggleInCart,
    markNotFound,
    finishTrip,
    cancelTrip,
  }
})
