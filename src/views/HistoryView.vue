<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import QuantityChip from '@/components/QuantityChip.vue'
import { useGroupStore } from '@/stores/group'
import { useListStore, type TripSummary } from '@/stores/list'
import type { Item } from '@/types'
import { dayLabel, timeOfDay } from '@/utils/date'
import { normalizeName } from '@/utils/text'

const list = useListStore()
const groupStore = useGroupStore()

/** Trips grouped under a day heading ("Hoy", "Ayer", "Sábado, 19 de septiembre"). */
const days = computed(() => {
  const groups: { label: string; trips: TripSummary[] }[] = []
  for (const summary of list.history) {
    const label = dayLabel(summary.trip.finishedAt!)
    const last = groups.at(-1)
    if (last?.label === label) last.trips.push(summary)
    else groups.push({ label, trips: [summary] })
  }
  return groups
})

const pendingNames = computed(() => new Set(list.pendingItems.map((i) => normalizeName(i.name))))

function readd(item: Item) {
  list.addOrMerge({ name: item.name, quantity: item.quantity, note: item.note })
}

function whoBought(summary: TripSummary) {
  const n = summary.items.length
  const products = n === 1 ? '1 producto' : `${n} productos`
  return groupStore.isMe(summary.trip.memberId)
    ? `Compraste ${products}`
    : `${groupStore.memberName(summary.trip.memberId)} compró ${products}`
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <p class="eyebrow">Compra Familiar</p>
      <h1 class="display-title">Historial</h1>
      <p class="muted">Toca + para volver a apuntar algo en la lista.</p>
    </header>

    <div v-if="!days.length" class="empty muted">Todavía no hay compras terminadas.</div>

    <section v-for="day in days" :key="day.label" class="day">
      <h2 class="day-title">{{ day.label }}</h2>
      <div v-for="summary in day.trips" :key="summary.trip.id" class="trip">
        <p class="section-title">
          <span>{{ whoBought(summary) }}</span>
          <span>{{ timeOfDay(summary.trip.finishedAt!) }}</span>
        </p>
        <p v-if="summary.trip.closedReason === 'timeout'" class="auto-closed">
          <AppIcon name="history" :size="14" />
          Cerrada automáticamente tras 4 horas sin finalizar
        </p>
        <ul class="rows">
          <li v-for="item in summary.items" :key="item.id" class="history-row">
            <span class="text">
              <span class="name">{{ item.name }}</span>
              <span v-if="item.note" class="note">{{ item.note }}</span>
              <span v-if="pendingNames.has(normalizeName(item.name))" class="on-list">Ya en la lista</span>
            </span>
            <QuantityChip :quantity="item.quantity" muted />
            <button type="button" class="readd" :aria-label="`Volver a añadir ${item.name}`" @click="readd(item)">
              <AppIcon name="plus" />
            </button>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.day + .day {
  margin-top: 18px;
}

.day-title {
  padding: 8px var(--gutter) 0;
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
}

.section-title {
  padding-top: 10px;
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.875rem;
  font-weight: 600;
}

.section-title span:last-child {
  font-variant-numeric: tabular-nums;
}

.auto-closed {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: -4px;
  padding: 0 var(--gutter) 8px;
  font-size: 0.8125rem;
  font-style: italic;
  color: var(--text-2);
}

.trip + .trip {
  margin-top: 6px;
}

.history-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 60px;
  padding: 6px 8px 6px var(--gutter);
}

.text {
  flex: 1;
  min-width: 0;
  display: grid;
}

.name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.note {
  font-size: 0.875rem;
  color: var(--text-2);
}

.on-list {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--warn);
}

.readd {
  display: grid;
  place-items: center;
  width: var(--tap);
  height: var(--tap);
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
  flex-shrink: 0;
}

@media (hover: hover) {
  .readd:hover {
    background: var(--primary);
    color: #fff;
  }
}

.readd:active {
  transform: scale(0.94);
}

.empty {
  margin: 24px var(--gutter);
  padding: 28px 20px;
  text-align: center;
  border: 1.5px dashed var(--line);
  border-radius: var(--radius);
}
</style>
