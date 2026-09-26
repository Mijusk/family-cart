<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useListStore } from '@/stores/list'
import AppIcon, { type IconName } from './AppIcon.vue'

const list = useListStore()

const tabs: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Lista', icon: 'list' },
  { to: '/historial', label: 'Historial', icon: 'history' },
  { to: '/grupo', label: 'Grupo', icon: 'group' },
]
</script>

<template>
  <nav class="nav" aria-label="Secciones">
    <RouterLink v-for="tab in tabs" :key="tab.to" :to="tab.to" class="tab" exact-active-class="active">
      <span class="icon">
        <AppIcon :name="tab.icon" :size="24" />
        <span v-if="tab.to === '/' && list.pendingItems.length" class="badge">{{ list.pendingItems.length }}</span>
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
  max-width: calc(var(--column) / 3);
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
