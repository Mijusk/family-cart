<script setup lang="ts">
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
</script>

<template>
  <div class="toast-region" aria-live="polite">
    <Transition name="toast">
      <div v-if="toast.current" :key="toast.current.id" class="toast">
        <span class="message">{{ toast.current.message }}</span>
        <button v-if="toast.current.undo" type="button" class="undo" @click="toast.runUndo">Deshacer</button>
        <button v-else type="button" class="undo" aria-label="Cerrar aviso" @click="toast.dismiss">OK</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-region {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--nav-height) + var(--safe-bottom) + 88px);
  z-index: 40;
  padding: 0 var(--gutter);
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: calc(var(--column) - 2 * var(--gutter));
  margin-inline: auto;
  padding: 6px 6px 6px 16px;
  border-radius: 12px;
  background: var(--text);
  color: #fff;
  box-shadow: 0 12px 28px -14px rgb(31 45 36 / 0.6);
  pointer-events: auto;
}

.message {
  flex: 1;
  font-weight: 500;
  line-height: 1.3;
  margin-block: 6px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}

.undo {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 8px;
  color: var(--qty);
  font-weight: 700;
}

.undo:hover {
  background: rgb(255 255 255 / 0.08);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}

/* A replaced toast fades out underneath its successor instead of stacking above it. */
.toast-leave-active {
  position: absolute;
  left: var(--gutter);
  right: var(--gutter);
  bottom: 0;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
