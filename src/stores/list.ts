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
import { deletePhoto, newPhotoPath, showPhotoLocally, uploadPhoto } from '@/lib/photos'
import type { Item, Product, Trip } from '@/types'
import { newId } from '@/utils/id'
import { cleanDisplayName, normalizeName } from '@/utils/text'
import { useGroupStore } from './group'
import { useToastStore } from './toast'

export interface NewItem {
  name: string
  quantity: number
  note?: string | null
  /** Already shrunk (see shrinkPhoto). */
  photo?: Blob | null
}

/** For edits: a new photo, null to remove it, undefined to leave it as it is. */
export type PhotoChange = Blob | null | undefined

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
    unload()
    groupId.value = gid
    await refresh()
    subscribe(gid)
  }

  /** Stops listening to the current group and drops its data (switching or leaving groups). */
  function unload() {
    if (channel) void supabase.removeChannel(channel)
    channel = null
    groupId.value = null
    items.value = []
    products.value = []
    trips.value = []
  }

  /**
   * Replaces local state with the server's. A snapshot taken while local changes are still
   * on their way would silently undo them (e.g. drop a trip just started, so the app starts
   * a second one), so it first waits for queued writes, and discards the snapshot and tries
   * again if new changes were made while it was being fetched.
   */
  async function refresh() {
    const gid = groupId.value
    if (!gid) return
    for (;;) {
      const seq = writeSeq
      await writes
      const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString()
      const [itemsRes, productsRes, tripsRes] = await Promise.all([
        supabase.from('items').select().eq('group_id', gid).or(`status.neq.purchased,purchased_at.gte."${since}"`),
        supabase.from('products').select().eq('group_id', gid),
        supabase.from('trips').select().eq('group_id', gid).or(`finished_at.is.null,finished_at.gte."${since}"`),
      ])
      // Switched group while loading: this answer belongs to the old one.
      if (groupId.value !== gid) return
      if (itemsRes.error) throw itemsRes.error
      if (productsRes.error) throw productsRes.error
      if (tripsRes.error) throw tripsRes.error
      if (seq !== writeSeq) continue
      items.value = itemsRes.data.map(toItem)
      products.value = productsRes.data.map(toProduct)
      trips.value = tripsRes.data.map(toTrip)
      return
    }
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
  /** Bumped on every queued write, so refresh() can tell if its snapshot is already outdated. */
  let writeSeq = 0
  function persist(request: () => PromiseLike<{ error: unknown }>) {
    writeSeq++
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
      // Not awaited: refresh() waits for this queue to drain, which includes this very write.
      void refresh().catch(console.error)
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

  /**
   * Deletes a file nothing points to any more. Queued behind the writes that stopped using
   * it; if it fails, all that's left is a stray file, so the user isn't bothered.
   */
  function removePhoto(path: string) {
    writes = writes
      .then(() => deletePhoto(path))
      .then(({ error }) => {
        if (error) console.error(error)
      }, console.error)
  }

  /** Once an edit or delete can no longer be undone, the photo it replaced can go. */
  function dropIfUnused(id: string, path: string | null) {
    if (path && findItem(id)?.photoPath !== path) removePhoto(path)
  }

  /**
   * Runs inside a queued write. If the upload fails the item goes back to its previous
   * photo (or none) and the user is told; the rest of the change is still saved.
   */
  async function uploadFor(id: string, path: string, photo: Blob, previous: string | null): Promise<boolean> {
    let error: unknown
    try {
      ;({ error } = await uploadPhoto(path, photo))
    } catch (e) {
      error = e
    }
    if (!error) return true
    console.error(error)
    const item = findItem(id)
    if (item?.photoPath === path) item.photoPath = previous
    toast.show('No se pudo subir la foto. Revisa la conexión.')
    return false
  }

  /** New photo (or none) for an existing item. The old file stays until the change can't be undone. */
  function setPhoto(item: Item, photo: Blob | null) {
    const { id } = item
    const previous = item.photoPath
    const path = photo && newPhotoPath(item.groupId)
    if (photo && path) showPhotoLocally(path, photo)
    item.photoPath = path
    persist(async () => {
      if (photo && path && !(await uploadFor(id, path, photo, previous))) return { error: null }
      return supabase.from('items').update({ photo_path: path }).eq('id', id)
    })
  }

  function updateRemote(id: string, changes: ItemUpdate) {
    persist(() => supabase.from('items').update(changes).eq('id', id))
  }

  /** Undo for edits and merges: puts name, quantity, note and photo back as they were. */
  function restoreFields(snapshot: Item) {
    const item = findItem(snapshot.id)
    if (!item) return
    const discarded = item.photoPath !== snapshot.photoPath ? item.photoPath : null
    Object.assign(item, { name: snapshot.name, quantity: snapshot.quantity, note: snapshot.note, photoPath: snapshot.photoPath })
    updateRemote(snapshot.id, {
      name: snapshot.name,
      quantity: snapshot.quantity,
      note: snapshot.note,
      photo_path: snapshot.photoPath,
    })
    if (discarded) removePhoto(discarded)
  }

  /** Undo for deletes: inserts the row again with the same id. */
  function restoreDeleted(snapshot: Item) {
    upsert(items, snapshot)
    persist(() => supabase.from('items').insert(fromItem(snapshot)))
  }

  /** Deletes the row but keeps its photo, so the delete can still be undone. */
  function deleteRow(id: string) {
    removeLocal(id)
    persist(() => supabase.from('items').delete().eq('id', id))
  }

  /** Undo for adds: the row and its photo go for good. */
  function removeItem(id: string) {
    const path = findItem(id)?.photoPath
    deleteRow(id)
    if (path) removePhoto(path)
  }

  // ── List actions ───────────────────────────────────────────

  function addItem(input: NewItem): Item {
    const name = cleanDisplayName(input.name)
    const photo = input.photo ?? null
    const photoPath = photo && newPhotoPath(groupId.value!)
    if (photo && photoPath) showPhotoLocally(photoPath, photo)
    const item: Item = {
      id: newId(),
      groupId: groupId.value!,
      name,
      quantity: Math.max(1, input.quantity),
      note: input.note?.trim() || null,
      photoPath,
      status: 'pending',
      addedBy: groupStore.currentMemberId,
      addedAt: new Date().toISOString(),
      tripId: null,
      purchasedBy: null,
      purchasedAt: null,
    }
    items.value.push(item)
    rememberProductLocally(name, item.quantity)
    persist(async () => {
      const uploaded = !photo || !photoPath || (await uploadFor(item.id, photoPath, photo, null))
      return supabase.from('items').insert({ ...fromItem(item), photo_path: uploaded ? photoPath : null })
    })
    toast.show(`Añadido: ${name}`, () => removeItem(item.id))
    return item
  }

  /** Adds quantity to an existing pending line instead of creating a duplicate. */
  function mergeInto(id: string, quantity: number, note?: string | null, photo?: Blob | null) {
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
    // Queued before the RPC, whose answer then already carries the new photo.
    if (photo) setPhoto(item, photo)
    // The RPC adds on the server, so a concurrent add from another phone isn't lost.
    persist(async () => {
      const res = await supabase.rpc('merge_item', { item_id: id, add_quantity: add, extra_note: extraNote ?? undefined })
      if (res.data) upsert(items, toItem(res.data))
      return res
    })
    toast.show(
      `${item.name}: ahora ${item.quantity}`,
      () => restoreFields(snapshot),
      () => dropIfUnused(id, snapshot.photoPath),
    )
  }

  /** Adds to the list, merging with a pending line of the same product if there is one. */
  function addOrMerge(input: NewItem) {
    const duplicate = findPendingDuplicate(input.name)
    if (duplicate) mergeInto(duplicate.id, input.quantity, input.note, input.photo)
    else addItem(input)
  }

  function updateItem(id: string, changes: Pick<Item, 'name' | 'quantity' | 'note'> & { photo?: PhotoChange }) {
    const item = findItem(id)
    if (!item) return
    const snapshot = { ...item }
    item.name = cleanDisplayName(changes.name) || item.name
    item.quantity = Math.max(1, changes.quantity)
    item.note = changes.note?.trim() || null
    const photoChanged = changes.photo !== undefined && (changes.photo !== null || item.photoPath !== null)
    const fieldsChanged =
      item.name !== snapshot.name || item.quantity !== snapshot.quantity || item.note !== snapshot.note
    if (!fieldsChanged && !photoChanged) return
    if (fieldsChanged) updateRemote(id, { name: item.name, quantity: item.quantity, note: item.note })
    if (photoChanged) setPhoto(item, changes.photo ?? null)
    toast.show(
      'Cambios guardados',
      () => restoreFields(snapshot),
      () => dropIfUnused(id, snapshot.photoPath),
    )
  }

  function deleteItem(id: string) {
    const item = findItem(id)
    if (!item) return
    const snapshot = { ...item }
    deleteRow(id)
    toast.show(
      `Borrado: ${item.name}`,
      () => restoreDeleted(snapshot),
      () => dropIfUnused(id, snapshot.photoPath),
    )
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
    unload,
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
