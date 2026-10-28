<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { FOLDER_COLORS, whiteContrast } from '@/utils/colors'

const color = defineModel<string>({ required: true })
defineProps<{ label: string }>()

const isCustom = computed(() => !(FOLDER_COLORS as readonly string[]).includes(color.value))
// Events are drawn with white text on the folder color.
const tooLight = computed(() => isCustom.value && whiteContrast(color.value) < 3)

function pick(event: Event) {
  // The database only takes lowercase #rrggbb.
  color.value = (event.target as HTMLInputElement).value.toLowerCase()
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
      @click="color = c"
    >
      <AppIcon v-if="color === c" name="check" :size="16" />
    </button>
    <label
      class="swatch custom"
      role="radio"
      :aria-checked="isCustom"
      :class="{ chosen: isCustom }"
      :style="isCustom ? { background: color } : undefined"
      title="Otro color"
    >
      <AppIcon :name="isCustom ? 'check' : 'plus'" :size="16" />
      <input type="color" :value="color" aria-label="Elegir otro color" @input="pick" />
    </label>
  </div>
  <p v-if="tooLight" class="muted hint light">Es un color muy claro: el texto de los eventos se leerá mal.</p>
</template>

<style scoped>
.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.swatch {
  position: relative;
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
  cursor: pointer;
  background: conic-gradient(#b83232, #8f6a1f, #5f7a2e, #277a7a, #3b6fb6, #7d4f9a, #b5476f, #b83232);
}

.custom input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.custom:focus-within {
  outline: 3px solid color-mix(in srgb, var(--primary) 55%, transparent);
  outline-offset: 2px;
}

.light {
  margin: 6px 0 0;
  color: var(--warn);
}
</style>
