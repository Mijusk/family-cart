<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import PhotoThumb from '@/components/PhotoThumb.vue'
import QuantityChip from '@/components/QuantityChip.vue'
import { ALL_FOLDERS, useFolderView } from '@/composables/shoppingFolder'
import { goBack } from '@/router/back'
import { useListStore } from '@/stores/list'
import { useToastStore } from '@/stores/toast'
import type { Item } from '@/types'

const list = useListStore()
const toast = useToastStore()
const router = useRouter()
// The folder open in the list (?carpeta=…): only its things to pick; with «Todas», everything.
const folderView = useFolderView()
const { view, target } = folderView

// Opening this screen doesn't start a trip: the first item put in the cart (or marked as not
// found) does, so the family only sees "X está haciendo la compra" once I really am.
const tripId = ref<string | null>(null)
watch(
  () => list.myActiveTrip?.id,
  (id) => {
    if (id && !tripId.value) tripId.value = id
  },
  { immediate: true },
)
/** Set when this screen closes the trip itself, so the watcher below doesn't react to it. */
let leaving = false

// Leaving with an empty cart (back arrow, or the phone's back button) closes the trip.
onBeforeRouteLeave(() => {
  if (leaving) return
  leaving = true
  list.leaveEmptyTrip()
})

// The trip can also end while this screen is open: the 4-hour timeout, or this same member
// finishing or cancelling it from another device.
watch(
  () => list.tripById(tripId.value)?.finishedAt,
  (finishedAt) => {
    if (!finishedAt || leaving) return
    leaving = true
    const reason = list.tripById(tripId.value)?.closedReason
    if (reason === 'cancelled') {
      toast.show('La compra se canceló desde otro dispositivo')
      router.push({ name: 'list', query: folderView.query.value })
      return
    }
    toast.show(
      reason === 'timeout'
        ? 'Tu compra se cerró sola tras 4 horas sin finalizar'
        : 'La compra se finalizó desde otro dispositivo',
    )
    router.push({ name: 'history' })
  },
)

// Only what wasn't found on this trip is set aside; what someone missed on an earlier one is to pick again.
const notFoundHere = (i: Item) => i.status === 'not_found' && !!tripId.value && i.tripId === tripId.value
const inView = computed(() =>
  view.value === ALL_FOLDERS ? list.pendingItems : list.pendingItems.filter((i) => i.folderId === view.value),
)
const toPick = computed(() => inView.value.filter((i) => !notFoundHere(i)))
const notFound = computed(() => inView.value.filter(notFoundHere))
/** Shown under the title when the group has folders. */
const folderLabel = computed(() =>
  !list.folders.length ? '' : view.value === ALL_FOLDERS ? 'Todas las carpetas' : list.folderName(view.value),
)
/** With «Todas», the folder each thing to pick is in. */
const showFolder = computed(() => list.folders.length > 0 && view.value === ALL_FOLDERS)
const cart = computed(() => list.myCartItems)

const total = computed(() => toPick.value.length + notFound.value.length + cart.value.length)
const progress = computed(() => (total.value ? cart.value.length / total.value : 0))

const newName = ref('')

function addToCart() {
  list.addToCart(newName.value, target.value)
  newName.value = ''
}

function finish() {
  leaving = true
  const bought = list.finishTrip()
  toast.show(bought === 1 ? 'Compra guardada: 1 producto' : `Compra guardada: ${bought} productos`)
  router.push({ name: 'history' })
}

function cancel() {
  const n = cart.value.length
  if (n && !window.confirm(`¿Cancelar la compra? ${n === 1 ? 'El producto del carrito vuelve' : `Los ${n} productos del carrito vuelven`} a la lista.`)) {
    return
  }
  leaving = true
  list.cancelTrip()
  router.push({ name: 'list', query: folderView.query.value })
}
</script>

<template>
  <div class="page shopping">
    <header class="bar">
      <button
        type="button"
        class="icon-btn"
        :aria-label="cart.length ? 'Volver a la lista (la compra sigue abierta)' : 'Volver a la lista'"
        @click="goBack({ name: 'list', query: folderView.query.value })"
      >
        <AppIcon name="back" />
      </button>
      <div class="bar-title">
        <h1>Modo compra</h1>
        <p class="muted">
          <template v-if="folderLabel">{{ folderLabel }} · </template>{{ cart.length }} de {{ total }} en el carrito
        </p>
      </div>
      <button v-if="list.myActiveTrip" type="button" class="cancel" @click="cancel">Cancelar</button>
      <div class="progress" role="progressbar" :aria-valuenow="cart.length" aria-valuemin="0" :aria-valuemax="total">
        <span :style="{ transform: `scaleX(${progress})` }" />
      </div>
    </header>

    <form class="quick-add" autocomplete="off" @submit.prevent="addToCart">
      <input
        v-model="newName"
        class="field"
        placeholder="Otra cosa…"
        aria-label="Producto para añadir al carrito"
        maxlength="80"
        enterkeyhint="done"
      />
      <button type="submit" class="btn btn-primary" :disabled="!newName.trim()">
        <AppIcon name="plus" :size="20" />
        Al carrito
      </button>
    </form>

    <h2 class="section-title">
      <span>Por coger</span>
      <span>{{ toPick.length }}</span>
    </h2>
    <ul v-if="toPick.length" class="rows">
      <li v-for="item in toPick" :key="item.id" class="shop-row">
        <PhotoThumb v-if="item.photoPath" class="shop-thumb" :path="item.photoPath" :alt="item.name" />
        <button type="button" class="pick" :class="{ 'has-thumb': item.photoPath }" @click="list.toggleInCart(item.id)">
          <span class="box" aria-hidden="true" />
          <span class="text">
            <span class="name">{{ item.name }}</span>
            <span v-if="item.note" class="note">{{ item.note }}</span>
            <span v-if="showFolder" class="note">{{ list.folderName(item.folderId) }}</span>
            <span v-if="item.status === 'not_found'" class="missed">No estaba la última vez</span>
          </span>
          <QuantityChip :quantity="item.quantity" />
        </button>
        <button type="button" class="missing" @click="list.markNotFound(item.id)">
          <AppIcon name="notFound" :size="18" />
          <span>No lo encontré</span>
        </button>
      </li>
    </ul>
    <p v-else class="done muted">
      {{ cart.length ? '¡Todo en el carrito! Ya puedes finalizar la compra.' : 'No queda nada por coger.' }}
    </p>

    <template v-if="notFound.length">
      <h2 class="section-title warn-title">
        <span>No encontrados</span>
        <span>{{ notFound.length }}</span>
      </h2>
      <ul class="rows">
        <li v-for="item in notFound" :key="item.id" class="shop-row is-not-found">
          <PhotoThumb v-if="item.photoPath" class="shop-thumb" :path="item.photoPath" :alt="item.name" />
          <button type="button" class="pick" :class="{ 'has-thumb': item.photoPath }" @click="list.toggleInCart(item.id)">
            <span class="box" aria-hidden="true" />
            <span class="text">
              <span class="name">{{ item.name }}</span>
              <span class="note">Vuelve a la lista marcado · tócalo si al final lo encuentras</span>
            </span>
            <QuantityChip :quantity="item.quantity" muted />
          </button>
        </li>
      </ul>
    </template>

    <template v-if="cart.length">
      <h2 class="section-title">
        <span>En el carrito</span>
        <span>{{ cart.length }}</span>
      </h2>
      <ul class="rows">
        <li v-for="item in cart" :key="item.id" class="shop-row in-cart">
          <PhotoThumb v-if="item.photoPath" class="shop-thumb" :path="item.photoPath" :alt="item.name" />
          <button type="button" class="pick" :class="{ 'has-thumb': item.photoPath }" :aria-label="`Sacar ${item.name} del carrito`" @click="list.toggleInCart(item.id)">
            <span class="box checked" aria-hidden="true"><AppIcon name="check" :size="18" /></span>
            <span class="text">
              <span class="name">{{ item.name }}</span>
            </span>
            <QuantityChip :quantity="item.quantity" muted />
          </button>
        </li>
      </ul>
    </template>

    <div class="dock">
      <button type="button" class="btn btn-primary btn-block" :disabled="!cart.length" @click="finish">
        <AppIcon name="check" />
        Finalizar compra<template v-if="cart.length"> · {{ cart.length }}</template>
      </button>
    </div>
  </div>
</template>

<style scoped>
.bar {
  position: sticky;
  top: 0;
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px 12px;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
}

.bar-title {
  flex: 1;
}

.bar-title h1 {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.375rem;
  line-height: 1.2;
}

.bar-title p {
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}

.cancel {
  min-height: 44px;
  padding: 0 12px;
  color: var(--text-2);
  font-weight: 600;
}

.cancel:hover {
  color: var(--warn);
}

.progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 3px;
  overflow: hidden;
}

.progress span {
  display: block;
  height: 100%;
  background: var(--primary);
  transform-origin: left;
  transition: transform 0.25s ease-out;
}

.quick-add {
  display: flex;
  gap: 8px;
  padding: 12px var(--gutter) 0;
}

.quick-add .field {
  flex: 1;
  min-width: 0;
}

.quick-add .btn {
  flex-shrink: 0;
}

.shop-row {
  display: flex;
  align-items: stretch;
}

.pick {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 68px;
  padding: 10px 12px 10px var(--gutter);
  text-align: left;
}

.shop-thumb {
  align-self: center;
  margin-left: var(--gutter);
}

.pick.has-thumb {
  padding-left: 12px;
}

.pick:active {
  background: var(--primary-soft);
}

.box {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--primary) 55%, var(--line));
  flex-shrink: 0;
  color: #fff;
}

.box.checked {
  background: var(--primary);
  border-color: var(--primary);
}

.text {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}

.name {
  font-weight: 600;
  font-size: 1.125rem;
  overflow-wrap: anywhere;
}

.note {
  font-size: 0.875rem;
  color: var(--text-2);
}

.missing {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 84px;
  padding: 0 8px;
  flex-shrink: 0;
  border-left: 1px solid var(--line);
  color: var(--warn);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.15;
  text-align: center;
}

.missing span {
  max-width: 100%;
}

.missing:active {
  background: var(--warn-soft);
}

/* Only real pointers get hover: on touch screens it sticks to whatever row slid under the finger. */
@media (hover: hover) {
  .missing:hover {
    background: var(--warn-soft);
  }
}

.is-not-found {
  box-shadow: inset 4px 0 0 var(--warn);
}

.is-not-found .box {
  border-color: color-mix(in srgb, var(--warn) 60%, var(--line));
}

.warn-title {
  color: var(--warn);
}

.missed {
  font-size: 0.8125rem;
  color: var(--text-2);
}

.in-cart .name {
  color: var(--text-2);
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--text-2) 60%, transparent);
  font-weight: 500;
}

.done {
  margin: 4px var(--gutter) 0;
  padding: 18px;
  text-align: center;
  border: 1.5px dashed var(--line);
  border-radius: var(--radius);
}
</style>
