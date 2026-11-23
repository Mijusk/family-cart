<script setup lang="ts">
import { useId } from 'vue'

// The streak's fire with its number inside: lit (orange and yellow) once today is done, grey
// while it's still to do. Big in the streak card, small next to Estiramientos in the menu.

withDefaults(defineProps<{ count: number; lit?: boolean; size?: number }>(), { lit: false, size: 64 })

const id = useId()
</script>

<template>
  <svg
    class="streak-flame"
    :class="{ lit }"
    :width="size"
    :height="size * 1.2"
    viewBox="0 0 60 72"
    role="img"
    :aria-label="`Racha: ${count} ${count === 1 ? 'día' : 'días'}`"
  >
    <defs>
      <linearGradient :id="`${id}-outer`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="outer-top" />
        <stop offset="1" class="outer-bottom" />
      </linearGradient>
      <linearGradient :id="`${id}-inner`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="inner-top" />
        <stop offset="1" class="inner-bottom" />
      </linearGradient>
    </defs>
    <path
      :fill="`url(#${id}-outer)`"
      d="M31 2c3 10 12 16 18 25 5 7 8 14 8 22 0 13-11 21-27 21S3 62 3 49c0-9 4-16 9-21 1 5 3 8 6 10-1-14 4-27 13-36z"
    />
    <path
      :fill="`url(#${id}-inner)`"
      d="M30 25c3 7 9 11 13 17 3 4 4 7 4 11 0 9-7 14-17 14s-17-5-17-14c0-5 3-9 6-12 1 3 2 5 4 6 0-9 3-16 7-22z"
    />
    <text x="30" y="60" text-anchor="middle" class="number" :class="{ long: count > 99 }">{{ count }}</text>
  </svg>
</template>

<style scoped>
.streak-flame {
  display: block;
  flex: none;
  overflow: visible;
}

.outer-top {
  stop-color: #b8c2b9;
}
.outer-bottom {
  stop-color: #9aa69c;
}
.inner-top {
  stop-color: #e4e9e2;
}
.inner-bottom {
  stop-color: #d3dad1;
}

.lit .outer-top {
  stop-color: #f39a2b;
}
.lit .outer-bottom {
  stop-color: #e2541c;
}
.lit .inner-top {
  stop-color: #ffe27a;
}
.lit .inner-bottom {
  stop-color: #ffc23d;
}

.number {
  font-family: var(--font-display);
  font-size: 25px;
  font-weight: 800;
  fill: #5b6b5f;
}

.number.long {
  font-size: 18px;
}

.lit .number {
  fill: #8a3210;
}
</style>
