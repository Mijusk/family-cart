<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import ColorPanel from '@/components/ColorPanel.vue'
import { FOLDER_COLORS, whiteContrast } from '@/utils/colors'

const color = defineModel<string>({ required: true })
defineProps<{ label: string }>()

const isCustom = computed(() => !(FOLDER_COLORS as readonly string[]).includes(color.value))
const open = ref(false)
// Events are drawn with white text on the folder color.
const tooLight = computed(() => isCustom.value && whiteContrast(color.value) < 3)

function pick(c: string) {
  color.value = c
  open.value = false
}
</script>

<template>
  <div class="colors" role="radiogroup" :aria-label="label">
    <button
      v-for="c in FOLDER_COLORS"
      :key="c"
      type="button"
      class="swatch"
      role="radio"
      :aria-checked="color === c"
      :aria-label="`Color ${c}`"
      :style="{ background: c }"
      @click="pick(c)"
    >
      <AppIcon v-if="color === c" name="check" :size="16" />
    </button>
    <button
      type="button"
      class="swatch custom"
      role="radio"
      :aria-checked="isCustom"
      :aria-expanded="open"
      aria-label="Otro color"
      title="Otro color"
      :style="isCustom ? { background: color } : undefined"
      @click="open = !open"
    >
      <AppIcon :name="isCustom ? 'check' : 'plus'" :size="16" />
    </button>
  </div>
  <ColorPanel v-if="open" v-model="color" class="custom-panel" />
  <p v-if="tooLight" class="muted hint light">Es un color muy claro: el texto de los eventos se leerá mal.</p>
</template>

<style scoped>
.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.swatch {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: #fff;
}

.swatch[aria-checked='true'] {
  outline: 3px solid color-mix(in srgb, var(--text) 35%, transparent);
  outline-offset: 2px;
}

.custom {
  background: conic-gradient(#b83232, #8f6a1f, #5f7a2e, #277a7a, #3b6fb6, #7d4f9a, #b5476f, #b83232);
}

.custom-panel {
  margin-top: 10px;
}

.light {
  margin: 6px 0 0;
  color: var(--warn);
}
</style>
