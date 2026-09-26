<script setup lang="ts">
defineProps<{ quantity: number; muted?: boolean }>()
</script>

<template>
  <span class="chip" :class="{ muted }" :aria-label="`Cantidad: ${quantity}`">×{{ quantity }}</span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--qty-soft);
  border: 1.5px solid var(--qty);
  color: var(--qty-ink);
  font-weight: 700;
  font-size: 0.9375rem;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.muted {
  background: transparent;
  border-color: var(--line);
  color: var(--text-2);
}
</style>
