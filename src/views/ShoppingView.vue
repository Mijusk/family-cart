<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import QuantityChip from '@/components/QuantityChip.vue'
import { useListStore } from '@/stores/list'
import { useToastStore } from '@/stores/toast'

const list = useListStore()
const toast = useToastStore()
const router = useRouter()

// Opening this screen directly (reload, shared URL) starts a trip, same as the button on the list.
const tripId = list.startTrip().id
/** Set when this screen closes the trip itself, so the watcher below doesn't react to it. */
let leaving = false

// The trip can also end while this screen is open: the 4-hour timeout, or this same member
// finishing or cancelling it from another device. Tapping items would then do nothing.
watch(
  () => list.tripById(tripId)?.finishedAt,
  (finishedAt) => {
    if (!finishedAt || leaving) return
    leaving = true
    const reason = list.tripById(tripId)?.closedReason
    if (reason === 'cancelled') {
      toast.show('La compra se canceló desde otro dispositivo')
      router.push({ name: 'list' })
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

const toPick = computed(() => list.pendingItems.filter((i) => i.status === 'pending'))
const notFound = computed(() => list.pendingItems.filter((i) => i.status === 'not_found'))
const cart = computed(() => list.myCartItems)

const total = computed(() => toPick.value.length + notFound.value.length + cart.value.length)
const progress = computed(() => (total.value ? cart.value.length / total.value : 0))

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
  router.push({ name: 'list' })
}
</script>

<template>
  <div class="page shopping">
    <header class="bar">
      <RouterLink :to="{ name: 'list' }" class="icon-btn" aria-label="Volver a la lista (la compra sigue abierta)">
        <AppIcon name="back" />
      </RouterLink>
      <div class="bar-title">
        <h1>Modo compra</h1>
        <p class="muted">{{ cart.length }} de {{ total }} en el carrito</p>
      </div>
      <button type="button" class="cancel" @click="cancel">Cancelar</button>
      <div class="progress" role="progressbar" :aria-valuenow="cart.length" aria-valuemin="0" :aria-valuemax="total">
        <span :style="{ transform: `scaleX(${progress})` }" />
      </div>
    </header>

    <h2 class="section-title">
      <span>Por coger</span>
      <span>{{ toPick.length }}</span>
    </h2>
    <ul v-if="toPick.length" class="rows">
      <li v-for="item in toPick" :key="item.id" class="shop-row">
        <button type="button" class="pick" @click="list.toggleInCart(item.id)">
          <span class="box" aria-hidden="true" />
          <span class="text">
            <span class="name">{{ item.name }}</span>
            <span v-if="item.note" class="note">{{ item.note }}</span>
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
          <button type="button" class="pick" @click="list.toggleInCart(item.id)">
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
          <button type="button" class="pick" :aria-label="`Sacar ${item.name} del carrito`" @click="list.toggleInCart(item.id)">
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
