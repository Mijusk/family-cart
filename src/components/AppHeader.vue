<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useGroupStore } from '@/stores/group'
import { useInboxStore } from '@/stores/inbox'
import { firstName, greeting, hourIn } from '@/utils/greeting'
import AppIcon from './AppIcon.vue'
import AppMenu from './AppMenu.vue'

// Above every screen with the tab bar: a greeting for the time of day, the bell (the latest
// notifications) and the menu with the extra sections (Respiración…).

const groupStore = useGroupStore()
const inbox = useInboxStore()
const menuOpen = ref(false)

// The greeting follows the clock with the app open.
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => (timer = setInterval(() => (now.value = new Date()), 60_000)))
onUnmounted(() => clearInterval(timer))

const hello = computed(() => greeting(hourIn(groupStore.group.timezone, now.value)))
const name = computed(() => firstName(groupStore.me?.displayName ?? ''))
const bellLabel = computed(() => {
  const n = inbox.unreadCount
  return n ? `Avisos, ${n} ${n === 1 ? 'nuevo' : 'nuevos'}` : 'Avisos'
})
</script>

<template>
  <header class="app-header">
    <p class="hello">
      {{ hello }}<template v-if="name">, <strong>{{ name }}</strong></template>
    </p>
    <div class="actions">
      <RouterLink :to="{ name: 'notifications' }" class="icon-btn bell" :aria-label="bellLabel">
        <AppIcon name="bell" />
        <span v-if="inbox.unreadCount" class="badge" aria-hidden="true">{{ inbox.unreadCount > 9 ? '9+' : inbox.unreadCount }}</span>
      </RouterLink>
      <button type="button" class="icon-btn" aria-label="Menú" :aria-expanded="menuOpen" aria-controls="app-menu" @click="menuOpen = true">
        <AppIcon name="menu" />
      </button>
    </div>
    <AppMenu v-model:open="menuOpen" />
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px calc(var(--gutter) - 8px) 0 var(--gutter);
}

.hello {
  min-width: 0;
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.25rem;
  line-height: 1.2;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hello strong {
  font-weight: 600;
  color: var(--text);
}

.actions {
  display: flex;
  flex-shrink: 0;
}

.bell {
  position: relative;
}

.badge {
  position: absolute;
  top: 6px;
  right: 4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--late);
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  box-shadow: 0 0 0 2px var(--bg);
}
</style>
