<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGroupStore } from '@/stores/group'
import AppIcon from './AppIcon.vue'

/** title: the big group name at the top of a screen; eyebrow: the small label above another title. */
withDefaults(defineProps<{ variant?: 'title' | 'eyebrow' }>(), { variant: 'title' })

const groupStore = useGroupStore()
const router = useRouter()
const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const menu = useTemplateRef<HTMLElement>('menu')

function onPointerDown(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) open.value = false
}

watch(open, async (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDown)
    await nextTick()
    menu.value?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
  } else {
    document.removeEventListener('pointerdown', onPointerDown)
  }
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown))

function choose(groupId: string) {
  open.value = false
  void groupStore.switchGroup(groupId)
}

function addGroup() {
  open.value = false
  void router.push({ name: 'welcome' })
}
</script>

<template>
  <div ref="root" class="switcher" :class="variant" @keydown.esc="open = false">
    <component :is="variant === 'title' ? 'h1' : 'p'" class="heading">
      <button
        type="button"
        class="trigger"
        aria-haspopup="menu"
        :aria-expanded="open"
        :aria-label="`${groupStore.group.name}. Cambiar de grupo`"
        @click="open = !open"
      >
        <span class="name">{{ groupStore.group.name }}</span>
        <AppIcon name="chevron" :size="variant === 'title' ? 22 : 14" class="chevron" :class="{ flipped: open }" />
      </button>
    </component>

    <div v-if="open" ref="menu" class="menu" role="menu" aria-label="Tus grupos">
      <button
        v-for="m in groupStore.memberships"
        :key="m.groupId"
        type="button"
        class="option"
        role="menuitemradio"
        :aria-checked="m.groupId === groupStore.group.id"
        @click="choose(m.groupId)"
      >
        <span class="option-name">{{ m.groupName }}</span>
        <AppIcon v-if="m.groupId === groupStore.group.id" name="check" :size="18" class="current" />
      </button>
      <button type="button" class="option add" role="menuitem" @click="addGroup">
        <AppIcon name="plus" :size="18" />
        Crear o unirme a otro grupo
      </button>
    </div>
  </div>
</template>

<style scoped>
.switcher {
  position: relative;
}

.heading {
  margin: 0;
}

.trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 44px;
  margin-left: -4px;
  padding: 0 4px;
  border-radius: 8px;
  text-align: left;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
}

.trigger:hover {
  background: color-mix(in srgb, var(--primary-soft) 70%, transparent);
}

.name {
  overflow-wrap: anywhere;
}

.chevron {
  flex-shrink: 0;
  color: var(--text-2);
  transition: transform 0.15s;
}

.chevron.flipped {
  transform: rotate(180deg);
}

/* Same look as the page's title / eyebrow it replaces. */
.title .heading {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 2rem;
  line-height: 1.1;
  letter-spacing: -0.01em;
}

.eyebrow .heading {
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-2);
}

.eyebrow .trigger {
  min-height: 32px;
}

.menu {
  position: absolute;
  z-index: 25;
  top: calc(100% + 6px);
  left: 0;
  min-width: min(300px, calc(100vw - 2 * var(--gutter)));
  padding: 4px 0;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 10px 24px -12px rgb(31 45 36 / 0.35);
  font-family: var(--font-ui);
  font-size: 1rem;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  color: var(--text);
}

.option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: var(--tap);
  padding: 6px 14px;
  text-align: left;
}

.option:hover,
.option:focus-visible {
  background: var(--primary-soft);
  outline: none;
}

.option-name {
  flex: 1;
  font-weight: 600;
}

.current {
  color: var(--primary);
}

.add {
  border-top: 1px solid var(--line);
  margin-top: 4px;
  padding-top: 10px;
  color: var(--primary);
  font-weight: 600;
}
</style>
