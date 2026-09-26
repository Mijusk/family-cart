import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as seed from '@/mocks/seed'
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

const byNewest = (a: Item, b: Item) => b.addedAt.localeCompare(a.addedAt)
const isOnList = (item: Item) => item.status === 'pending' || item.status === 'not_found'

export const useListStore = defineStore('list', () => {
  const groupStore = useGroupStore()
  const toast = useToastStore()

  const items = ref<Item[]>(structuredClone(seed.items))
  const products = ref<Product[]>(structuredClone(seed.products))
  const trips = ref<Trip[]>(structuredClone(seed.trips))

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

  // ── Internal helpers ───────────────────────────────────────

  function rememberProduct(name: string, quantity: number) {
    const key = normalizeName(name)
    const product = products.value.find((p) => p.normalizedName === key)
    if (product) {
      product.displayName = name
      product.lastQuantity = quantity
      product.timesUsed++
    } else {
      products.value.push({
        id: newId(),
        groupId: groupStore.group.id,
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

  /** Puts back a snapshot taken before an edit or delete. */
  function restore(snapshot: Item) {
    const index = items.value.findIndex((i) => i.id === snapshot.id)
    if (index === -1) items.value.push(snapshot)
    else items.value[index] = snapshot
  }

  function removeById(id: string) {
    items.value = items.value.filter((i) => i.id !== id)
  }

  // ── List actions ───────────────────────────────────────────

  function addItem(input: NewItem): Item {
    const name = cleanDisplayName(input.name)
    const item: Item = {
      id: newId(),
      groupId: groupStore.group.id,
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
    rememberProduct(name, item.quantity)
    toast.show(`Añadido: ${name}`, () => removeById(item.id))
    return item
  }

  /** Adds quantity to an existing pending line instead of creating a duplicate. */
  function mergeInto(id: string, quantity: number, note?: string | null) {
    const item = findItem(id)
    if (!item) return
    const snapshot = { ...item }
    item.quantity += Math.max(1, quantity)
    const extraNote = note?.trim()
    if (extraNote && extraNote !== item.note) {
      item.note = item.note ? `${item.note} · ${extraNote}` : extraNote
    }
    rememberProduct(item.name, quantity)
    toast.show(`${item.name}: ahora ${item.quantity}`, () => restore(snapshot))
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
    if (changed) toast.show('Cambios guardados', () => restore(snapshot))
  }

  function deleteItem(id: string) {
    const item = findItem(id)
    if (!item) return
    const snapshot = { ...item }
    removeById(id)
    toast.show(`Borrado: ${item.name}`, () => restore(snapshot))
  }

  // ── Shopping trip actions ──────────────────────────────────

  function startTrip(): Trip {
    if (myActiveTrip.value) return myActiveTrip.value
    const trip: Trip = {
      id: newId(),
      groupId: groupStore.group.id,
      memberId: groupStore.currentMemberId,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    }
    trips.value.push(trip)
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
  }

  function markNotFound(id: string) {
    const item = findItem(id)
    const trip = myActiveTrip.value
    if (!item || !trip) return
    item.status = 'not_found'
    item.tripId = trip.id
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
