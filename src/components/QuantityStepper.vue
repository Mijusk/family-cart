<script setup lang="ts">
import AppIcon from './AppIcon.vue'

const MIN = 1
const MAX = 99

const quantity = defineModel<number>({ required: true })
defineProps<{ label?: string }>()

function set(value: number) {
  quantity.value = Math.min(MAX, Math.max(MIN, Math.round(value) || MIN))
}

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  if (raw !== '') set(Number(raw))
}
</script>

<template>
  <div class="stepper" role="group" :aria-label="label ?? 'Cantidad'">
    <button type="button" class="step" :disabled="quantity <= MIN" aria-label="Menos" @click="set(quantity - 1)">
      <AppIcon name="minus" :size="18" />
    </button>
    <input
      class="value"
      type="number"
      inputmode="numeric"
      :min="MIN"
      :max="MAX"
      :value="quantity"
      aria-label="Cantidad"
      @input="onInput"
      @blur="set(quantity)"
      @focus="($event.target as HTMLInputElement).select()"
    />
    <button type="button" class="step" :disabled="quantity >= MAX" aria-label="Más" @click="set(quantity + 1)">
      <AppIcon name="plus" :size="18" />
    </button>
  </div>
</template>

<style scoped>
.stepper {
  display: inline-flex;
  align-items: center;
  height: var(--tap);
  border: 1.5px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  flex-shrink: 0;
}

.step {
  display: grid;
  place-items: center;
  width: 44px;
  height: 100%;
  border-radius: 999px;
  color: var(--primary);
}

.step:disabled {
  color: var(--line);
  cursor: default;
}

.step:not(:disabled):hover {
  background: var(--primary-soft);
}

.value {
  width: 2.5ch;
  border: 0;
  background: none;
  text-align: center;
  font-weight: 700;
  font-size: 1.0625rem;
  font-variant-numeric: tabular-nums;
  color: var(--qty-ink);
  -moz-appearance: textfield;
  appearance: textfield;
}

.value::-webkit-inner-spin-button,
.value::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.value:focus {
  outline: none;
}
</style>
