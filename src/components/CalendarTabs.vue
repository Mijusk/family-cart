<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppIcon from './AppIcon.vue'

// Switches between the calendar's views (Hoy, Semana, Mes), with a way to the folders.

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
  <p class="more">
    <RouterLink :to="{ name: 'folders' }"><AppIcon name="folder" :size="16" /> Mis carpetas</RouterLink>
  </p>
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

.more {
  margin: -4px var(--gutter) 8px;
  text-align: right;
}

.more a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  color: var(--text-2);
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
}

.tab.active {
  background: var(--primary);
  color: #fff;
}
</style>
