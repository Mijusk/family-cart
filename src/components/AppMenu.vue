<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useGroupStore } from '@/stores/group'
import AppIcon, { type IconName } from './AppIcon.vue'
import PersonAvatar from './PersonAvatar.vue'

// The side menu behind the three lines: room for sections that don't fit in the tab bar.

const open = defineModel<boolean>('open', { required: true })
const groupStore = useGroupStore()
const route = useRoute()
const panel = ref<HTMLElement | null>(null)

const links: { to: string; label: string; hint: string; icon: IconName }[] = [
  { to: '/respiracion', label: 'Respiración', hint: 'Ejercicios guiados para relajarte, el deporte y el habla', icon: 'wind' },
  { to: '/avisos', label: 'Avisos', hint: 'Lo último que te ha llegado', icon: 'bell' },
  { to: '/cuenta', label: 'Cuenta', hint: 'Tu nombre, tu color y qué te avisa', icon: 'user' },
]

function close() {
  open.value = false
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

// Focus goes into the panel and back to the button; Escape and any navigation close it.
let opener: HTMLElement | null = null
watch(open, async (isOpen) => {
  if (isOpen) {
    opener = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', onKey)
    await nextTick()
    panel.value?.querySelector<HTMLElement>('a, button')?.focus()
  } else {
    document.removeEventListener('keydown', onKey)
    opener?.focus()
  }
})
watch(() => route.fullPath, close)
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="menu">
      <div v-if="open" class="menu-layer" @click.self="close">
        <nav id="app-menu" ref="panel" class="menu" aria-label="Menú">
          <div class="menu-top">
            <div v-if="groupStore.me" class="who">
              <PersonAvatar :name="groupStore.me.displayName" :color="groupStore.me.color" :size="40" />
              <span class="who-text">
                <span class="who-name">{{ groupStore.me.displayName }}</span>
                <span class="muted">{{ groupStore.group.name }}</span>
              </span>
            </div>
            <button type="button" class="icon-btn" aria-label="Cerrar el menú" @click="close">
              <AppIcon name="close" />
            </button>
          </div>
          <ul class="menu-links">
            <li v-for="link in links" :key="link.to">
              <RouterLink :to="link.to" class="menu-link" :class="{ active: route.path.startsWith(link.to) }">
                <span class="menu-icon"><AppIcon :name="link.icon" /></span>
                <span class="menu-text">
                  <span class="menu-label">{{ link.label }}</span>
                  <span class="menu-hint">{{ link.hint }}</span>
                </span>
              </RouterLink>
            </li>
          </ul>
        </nav>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.menu-layer {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: flex-end;
  background: rgb(31 45 36 / 0.35);
}

.menu {
  width: min(340px, 86vw);
  height: 100%;
  padding: 12px 8px calc(16px + var(--safe-bottom)) 16px;
  overflow-y: auto;
  background: var(--surface);
  box-shadow: -8px 0 32px rgb(31 45 36 / 0.18);
}

.menu-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

.who {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.who-text {
  display: grid;
  min-width: 0;
}

.who-name {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.who-text .muted {
  font-size: 0.875rem;
}

.menu-links {
  display: grid;
  gap: 4px;
  margin: 12px 8px 0 0;
  padding: 0;
  list-style: none;
}

.menu-link {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  border-radius: var(--radius);
  color: var(--text);
  text-decoration: none;
}

.menu-link:hover,
.menu-link.active {
  background: var(--primary-soft);
}

.menu-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: var(--bg);
  color: var(--primary);
}

.menu-text {
  display: grid;
  gap: 2px;
}

.menu-label {
  font-weight: 700;
}

.menu-hint {
  font-size: 0.8125rem;
  color: var(--text-2);
}

.menu-enter-active,
.menu-leave-active {
  transition: background-color 0.22s ease;
}

.menu-enter-active .menu,
.menu-leave-active .menu {
  transition: transform 0.22s ease;
}

.menu-enter-from,
.menu-leave-to {
  background-color: transparent;
}

.menu-enter-from .menu,
.menu-leave-to .menu {
  transform: translateX(100%);
}

@media (prefers-reduced-motion: reduce) {
  .menu-enter-active .menu,
  .menu-leave-active .menu {
    transition: none;
  }
}
</style>
