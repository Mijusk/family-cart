<script setup lang="ts">
import { computed } from 'vue'
import { figureSvg, type Pose } from '@/lib/stretchFigure'

// One stretch drawn. The SVG is built from numbers and fixed colours only, so v-html is safe.

const props = defineProps<{ pose: Pose; title?: string }>()
const svg = computed(() => figureSvg(props.pose, props.title))
</script>

<template>
  <span class="stretch-figure" v-html="svg" />
</template>

<style scoped>
.stretch-figure {
  display: block;
  line-height: 0;
}

.stretch-figure :deep(svg) {
  width: 100%;
  height: auto;
}
</style>
