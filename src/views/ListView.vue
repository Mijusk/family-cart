<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AddItemForm from '@/components/AddItemForm.vue'
import AppIcon from '@/components/AppIcon.vue'
import PendingItemRow from '@/components/PendingItemRow.vue'
import QuantityChip from '@/components/QuantityChip.vue'
import { useGroupStore } from '@/stores/group'
import { useListStore } from '@/stores/list'

const list = useListStore()
const groupStore = useGroupStore()
const router = useRouter()

const editingId = ref<string | null>(null)

/** Trips by other members that are happening right now. */
const othersShopping = computed(() =>
  list.activeTrips
    .filter((t) => !groupStore.isMe(t.memberId))
    .map((trip) => ({
      trip,
      name: groupStore.memberName(trip.memberId),
      count: list.inCartItems.filter((i) => i.tripId === trip.id).length,
    })),
)

const othersCart = computed(() => list.inCartItems.filter((i) => i.tripId !== list.myActiveTrip?.id))

const countLabel = computed(() => {
  const n = list.pendingItems.length
  if (n === 0) return 'No falta nada'
  return n === 1 ? '1 cosa por comprar' : `${n} cosas por comprar`
})

function goShopping() {
  list.startTrip()
  router.push({ name: 'shopping' })
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <p class="eyebrow">Compra Familiar</p>
      <h1 class="display-title">{{ groupStore.group.name }}</h1>
      <p class="muted">{{ countLabel }}</p>
    </header>

    <AddItemForm />

    <p v-for="s in othersShopping" :key="s.trip.id" class="live">
      <span class="pulse" aria-hidden="true" />
      <span>
        <strong>{{ s.name }}</strong> está haciendo la compra ahora
        <span v-if="s.count"> · {{ s.count }} en el carrito</span>
      </span>
    </p>

    <template v-if="list.pendingItems.length">
      <h2 class="section-title">
        <span>Por comprar</span>
        <span>{{ list.pendingItems.length }}</span>
      </h2>
      <ul class="rows">
        <PendingItemRow
          v-for="item in list.pendingItems"
          :key="item.id"
          :item="item"
          :editing="editingId === item.id"
          @edit="editingId = item.id"
          @close="editingId = null"
        />
      </ul>
    </template>

    <div v-else class="empty">
      <p class="empty-title">La lista está vacía</p>
      <p class="muted">Cuando falte algo en casa, apúntalo arriba y aparecerá aquí para toda la familia.</p>
    </div>

    <template v-if="othersCart.length">
      <h2 class="section-title"><span>Ya en el carrito</span></h2>
      <ul class="rows">
        <li v-for="item in othersCart" :key="item.id" class="cart-row">
          <AppIcon name="check" :size="20" class="cart-check" />
          <span class="cart-name">{{ item.name }}</span>
          <span class="muted cart-who">{{ groupStore.memberName(list.tripById(item.tripId)?.memberId ?? null) }}</span>
          <QuantityChip :quantity="item.quantity" muted />
        </li>
      </ul>
    </template>

    <div class="dock">
      <button type="button" class="btn btn-primary btn-block" @click="goShopping">
        <AppIcon name="cart" />
        <template v-if="list.myActiveTrip">
          Seguir comprando<span v-if="list.myCartItems.length"> · {{ list.myCartItems.length }} en el carrito</span>
        </template>
        <template v-else>Voy a hacer la compra</template>
      </button>
    </div>
  </div>
</template>

<style scoped>
.live {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px var(--gutter) 0;
  font-size: 0.9375rem;
}

.pulse {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary) 50%, transparent);
  animation: pulse 1.8s infinite;
  flex-shrink: 0;
}

@keyframes pulse {
  70% {
    box-shadow: 0 0 0 8px transparent;
  }
}

.empty {
  margin: 32px var(--gutter);
  padding: 28px 20px;
  text-align: center;
  border: 1.5px dashed var(--line);
  border-radius: var(--radius);
}

.empty-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 6px;
}

.cart-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 8px var(--gutter);
  color: var(--text-2);
}

.cart-check {
  color: var(--primary);
}

.cart-name {
  flex: 1;
  text-decoration: line-through;
}

.cart-who {
  font-size: 0.8125rem;
}
</style>
