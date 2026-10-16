<script setup lang="ts">
import { RouterLink } from 'vue-router'

// Switches between the calendar's views: Hoy, Semana and Mes.

const tabs = [
  { name: 'calendar', label: 'Hoy' },
  { name: 'calendar-week', label: 'Semana' },
  { name: 'calendar-month', label: 'Mes' },
] as const
</script>

<template>
  <nav class="tabs" aria-label="Vista del calendario">
    <RouterLink v-for="tab in tabs" :key="tab.name" :to="{ name: tab.name }" class="tab" active-class="active" exact-active-class="active">
      {{ tab.label }}
    </RouterLink>
  </nav>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  margin: 0 var(--gutter) 12px;
  padding: 4px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
}

.tab {
  flex: 1;
  display: grid;
  place-items: center;
  min-height: 40px;
  border-radius: 999px;
  color: var(--text-2);
  font-weight: 600;
  text-decoration: none;
}

.tab.active {
  background: var(--primary);
  color: #fff;
}
</style>
