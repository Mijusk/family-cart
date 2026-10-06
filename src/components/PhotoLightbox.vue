<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'

defineProps<{ src: string; alt: string }>()
const emit = defineEmits<{ close: [] }>()

const dialog = useTemplateRef('dialog')

// A modal <dialog> traps focus and closes on Esc (the cancel event); any tap closes it too.
onMounted(() => dialog.value?.showModal())
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="lightbox" :aria-label="alt" @click="emit('close')" @cancel.prevent="emit('close')">
      <img :src="src" :alt="alt" />
    </dialog>
  </Teleport>
</template>

<style scoped>
.lightbox {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  max-width: 100vw;
  max-height: 100dvh;
  margin: 0;
  padding: 16px;
  border: 0;
  background: transparent;
  cursor: zoom-out;
  animation: fade-in 0.15s ease-out;
}

.lightbox::backdrop {
  background: rgb(15 22 18 / 0.85);
}

img {
  max-width: 100%;
  max-height: calc(100dvh - 32px);
  border-radius: var(--radius);
  object-fit: contain;
  box-shadow: 0 20px 40px -20px rgb(0 0 0 / 0.6);
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
}
</style>
