<script setup lang="ts">
import { initials } from '@/utils/text'

/** A person's initials on their color. Decorative: the name is always shown next to it. */
withDefaults(defineProps<{ name: string; color: string; size?: number }>(), { size: 42 })
</script>

<template>
  <span
    class="avatar"
    :style="{ background: color, width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.36}px` }"
    aria-hidden="true"
  >
    {{ initials(name) }}
  </span>
</template>

<style scoped>
.avatar {
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  font-weight: 700;
  flex-shrink: 0;
}
</style>
