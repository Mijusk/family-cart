<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useGroupStore } from '@/stores/group'
import { lastCalendarView, lastTasksView } from '@/router/back'
import { useListStore } from '@/stores/list'
import AppIcon, { type IconName } from './AppIcon.vue'

const list = useListStore()
const route = useRoute()

/** Tabs stay lit on their inner screens (the history of Compra, an event of the calendar). */
function isActive(tab: { to: string; also?: string[] }): boolean {
  return [tab.to, ...(tab.also ?? [])].some((to) => route.path === to || route.path.startsWith(`${to}/`))
}
const groupStore = useGroupStore()

/** Only the sections this group uses, plus the group itself. */
const tabs = computed(() => {
  const { shoppingEnabled, tasksEnabled, calendarEnabled } = groupStore.group
  const all: { to: string; label: string; icon: IconName; show: boolean; link?: string; also?: string[] }[] = [
    // Back to the view last used (Semana, a list…), not always the first one.
    { to: '/calendario', label: 'Calendario', icon: 'calendar', show: calendarEnabled, link: lastCalendarView.value },
    { to: '/tareas', label: 'Tareas', icon: 'tasks', show: tasksEnabled, link: lastTasksView.value },
    { to: '/lista', label: 'Compra', icon: 'cart', show: shoppingEnabled, also: ['/historial'] },
    { to: '/grupo', label: 'Grupo', icon: 'group', show: true },
  ]
  return all.filter((tab) => tab.show)
})

/** What's waiting in each tab: things to buy, and for admins, people asking to join. */
const badges = computed<Record<string, number>>(() => ({
  '/lista': list.pendingItems.length,
  '/grupo': groupStore.isAdmin ? groupStore.pendingMembers.length : 0,
}))
</script>

<template>
  <nav class="nav" aria-label="Secciones" :style="{ '--tabs': tabs.length }">
    <RouterLink v-for="tab in tabs" :key="tab.to" :to="tab.link ?? tab.to" class="tab" :class="{ active: isActive(tab) }">
      <span class="icon">
        <AppIcon :name="tab.icon" :size="24" />
        <span v-if="badges[tab.to]" class="badge">{{ badges[tab.to] }}</span>
      </span>
      {{ tab.label }}
    </RouterLink>
  </nav>
</template>

<style scoped>
.nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  justify-content: center;
  height: calc(var(--nav-height) + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  background: var(--surface);
  border-top: 1px solid var(--line);
}

.tab {
  position: relative;
  flex: 1;
  max-width: calc(var(--column) / var(--tabs));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-2);
  text-decoration: none;
}

.tab.active {
  color: var(--primary);
}

.tab.active::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 30%;
  right: 30%;
  height: 3px;
  border-radius: 0 0 3px 3px;
  background: var(--primary);
}

.icon {
  position: relative;
  display: grid;
}

.badge {
  position: absolute;
  top: -4px;
  left: 16px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--qty);
  color: var(--text);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}
</style>
