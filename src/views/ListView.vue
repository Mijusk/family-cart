<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AddItemForm from '@/components/AddItemForm.vue'
import AppIcon from '@/components/AppIcon.vue'
import GroupSwitcher from '@/components/GroupSwitcher.vue'
import PendingItemRow from '@/components/PendingItemRow.vue'
import QuantityChip from '@/components/QuantityChip.vue'
import ShoppingFolderBar from '@/components/ShoppingFolderBar.vue'
import { ALL_FOLDERS, useFolderView } from '@/composables/shoppingFolder'
import { useGroupStore } from '@/stores/group'
import { useListStore } from '@/stores/list'
import type { Item } from '@/types'

const list = useListStore()
const groupStore = useGroupStore()
const router = useRouter()
const folderView = useFolderView()
const { view, target } = folderView

const editingId = ref<string | null>(null)

/** What the open folder has to buy; with «Todas», one section per folder that has something. */
const sections = computed<{ id: string | null; title: string; items: Item[] }[]>(() => {
  if (view.value !== ALL_FOLDERS) {
    const items = list.pendingItems.filter((i) => i.folderId === view.value)
    return items.length ? [{ id: view.value, title: 'Por comprar', items }] : []
  }
  return [null, ...list.sortedFolders.map((f) => f.id)]
    .map((id) => ({
      id,
      title: list.folders.length ? list.folderName(id) : 'Por comprar',
      items: list.pendingItems.filter((i) => i.folderId === id),
    }))
    .filter((s) => s.items.length)
})

const shown = computed(() => sections.value.reduce((n, s) => n + s.items.length, 0))

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
  const n = shown.value
  const where = list.folders.length && view.value !== ALL_FOLDERS ? ` en ${list.folderName(view.value)}` : ''
  if (n === 0) return `No falta nada${where}`
  return n === 1 ? `1 cosa por comprar${where}` : `${n} cosas por comprar${where}`
})

// The trip itself starts with the first item put in the cart. Shopping mode shows the open folder.
function goShopping() {
  router.push({ name: 'shopping', query: folderView.query.value })
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div class="header-row">
        <p class="eyebrow">Compra</p>
        <RouterLink :to="{ name: 'history' }" class="header-link"><AppIcon name="history" :size="16" /> Historial</RouterLink>
      </div>
      <GroupSwitcher />
      <p class="muted">{{ countLabel }}</p>
    </header>

    <ShoppingFolderBar :view="view" @show="folderView.show" />

    <AddItemForm :folder-id="target" />

    <p v-for="s in othersShopping" :key="s.trip.id" class="live">
      <span class="pulse" aria-hidden="true" />
      <span>
        <strong>{{ s.name }}</strong> está haciendo la compra ahora
        <span v-if="s.count"> · {{ s.count }} en el carrito</span>
      </span>
    </p>

    <template v-for="section in sections" :key="section.id ?? ''">
      <h2 class="section-title">
        <span>{{ section.title }}</span>
        <span>{{ section.items.length }}</span>
      </h2>
      <ul class="rows">
        <PendingItemRow
          v-for="item in section.items"
          :key="item.id"
          :item="item"
          :editing="editingId === item.id"
          @edit="editingId = item.id"
          @close="editingId = null"
        />
      </ul>
    </template>

    <div v-if="!sections.length" class="empty">
      <template v-if="list.folders.length && view !== ALL_FOLDERS">
        <p class="empty-title">{{ list.folderName(view) }} está vacía</p>
        <p class="muted">Lo que apuntes aquí arriba irá a esta carpeta, para toda la familia.</p>
      </template>
      <template v-else>
        <p class="empty-title">La lista está vacía</p>
        <p class="muted">Cuando falte algo en casa, apúntalo arriba y aparecerá aquí para toda la familia.</p>
      </template>
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
