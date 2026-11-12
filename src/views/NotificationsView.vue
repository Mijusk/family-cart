<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon, { type IconName } from '@/components/AppIcon.vue'
import { goBack } from '@/router/back'
import { useInboxStore } from '@/stores/inbox'
import type { InboxKind, InboxNotification } from '@/types'
import { dayLabel, timeOfDay } from '@/utils/date'

// The bell: what has reached this person in the last 30 days, newest first. Opening it marks
// everything as seen; the ones that were new keep their dot while the screen is open.

const inbox = useInboxStore()
const seenBefore = ref<number | null>(null)

const ICONS: Record<InboxKind, IconName> = {
  event_reminder: 'calendar',
  event_changed: 'edit',
  task_assigned: 'tasks',
  task_due: 'tasks',
  join_request: 'group',
  member_approved: 'group',
  breathing_reminder: 'wind',
}

const days = computed(() => {
  const groups: { label: string; items: InboxNotification[] }[] = []
  for (const n of inbox.items) {
    const label = dayLabel(n.createdAt)
    const last = groups.at(-1)
    if (last?.label === label) last.items.push(n)
    else groups.push({ label, items: [n] })
  }
  return groups
})

const isNew = (n: InboxNotification) => seenBefore.value !== null && inbox.isUnread(n, seenBefore.value)

onMounted(async () => {
  await inbox.load()
  seenBefore.value = inbox.seenAt
  await inbox.markSeen()
})
</script>

<template>
  <div class="page">
    <header class="page-header">
      <button type="button" class="back-link" @click="goBack()"><AppIcon name="back" :size="18" /> Volver</button>
      <h1 class="display-title">Avisos</h1>
      <p class="muted">
        Lo que te ha llegado en los últimos 30 días.
        <RouterLink :to="{ name: 'account' }">Elige qué te avisa</RouterLink>
      </p>
    </header>

    <p v-if="inbox.status === 'loading'" class="empty muted" aria-busy="true">Cargando…</p>
    <div v-else-if="inbox.status === 'error'" class="empty" role="alert">
      <p class="muted">No se han podido cargar los avisos.</p>
      <button type="button" class="btn btn-ghost" @click="inbox.load()">Reintentar</button>
    </div>
    <div v-else-if="!days.length" class="empty">
      <span class="empty-icon"><AppIcon name="bell" :size="28" /></span>
      <p class="muted">Aún no tienes avisos. Aquí verás los recordatorios, los cambios en tus eventos y las tareas que te asignen.</p>
    </div>

    <section v-for="day in days" :key="day.label">
      <h2 class="section-title"><span>{{ day.label }}</span></h2>
      <ul class="rows">
        <li v-for="n in day.items" :key="n.id">
          <RouterLink :to="n.url" class="notice" :class="{ fresh: isNew(n) }">
            <span class="kind" :class="n.kind"><AppIcon :name="ICONS[n.kind] ?? 'bell'" :size="20" /></span>
            <span class="text">
              <span class="title">{{ n.title }}</span>
              <span v-if="n.body" class="body">{{ n.body }}</span>
            </span>
            <span class="when">
              {{ timeOfDay(n.createdAt) }}
              <span v-if="isNew(n)" class="dot" aria-label="Nuevo" />
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.notice {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px var(--gutter);
  color: var(--text);
  text-decoration: none;
}

.notice:hover {
  background: var(--primary-soft);
}

.notice.fresh {
  background: color-mix(in srgb, var(--primary-soft) 60%, var(--surface));
}

.kind {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary);
}

.kind.task_assigned,
.kind.task_due {
  background: var(--qty-soft);
  color: var(--qty-ink);
}

.kind.join_request,
.kind.member_approved,
.kind.breathing_reminder {
  background: var(--warn-soft);
  color: var(--warn);
}

.text {
  display: grid;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.title {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.body {
  font-size: 0.875rem;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.when {
  display: grid;
  justify-items: end;
  gap: 6px;
  flex-shrink: 0;
  font-size: 0.8125rem;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--late);
}

.empty {
  display: grid;
  justify-items: center;
  gap: 12px;
  margin: 24px var(--gutter);
  padding: 28px 20px;
  text-align: center;
  border: 1.5px dashed var(--line);
  border-radius: var(--radius);
}

.empty p {
  margin: 0;
}

.empty-icon {
  color: var(--text-2);
}
</style>
