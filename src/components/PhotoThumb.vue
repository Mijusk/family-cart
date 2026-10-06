<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { photoUrl } from '@/lib/photos'
import AppIcon from './AppIcon.vue'
import PhotoLightbox from './PhotoLightbox.vue'

const props = withDefaults(defineProps<{ path: string; alt: string; size?: number }>(), { size: 48 })

/** Another phone may still be uploading the photo when its row arrives, so failures are retried a few times. */
const RETRIES = 3
const RETRY_MS = 4000

const url = ref<string | null>(null)
const enlarged = ref<string | null>(null)
let retryTimer: ReturnType<typeof setTimeout> | undefined

async function load(path: string, attempt = 0) {
  try {
    const signed = await photoUrl(path)
    if (path === props.path) url.value = signed
  } catch (error) {
    if (path !== props.path) return
    if (attempt < RETRIES) retryTimer = setTimeout(() => load(path, attempt + 1), RETRY_MS)
    else console.error(error)
  }
}

watch(
  () => props.path,
  (path) => {
    clearTimeout(retryTimer)
    url.value = null
    void load(path)
  },
  { immediate: true },
)

onBeforeUnmount(() => clearTimeout(retryTimer))

// Asks again on open: the URL the thumbnail loaded with may have expired by now.
async function enlarge() {
  try {
    enlarged.value = await photoUrl(props.path)
  } catch (error) {
    console.error(error)
  }
}
</script>

<template>
  <button
    type="button"
    class="thumb"
    :style="{ '--size': `${size}px` }"
    :aria-label="`Ver foto de ${alt}`"
    @click="enlarge"
  >
    <img v-if="url" :src="url" alt="" />
    <AppIcon v-else name="camera" :size="18" />
    <PhotoLightbox v-if="enlarged" :src="enlarged" :alt="alt" @close="enlarged = null" />
  </button>
</template>

<style scoped>
.thumb {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: var(--size);
  height: var(--size);
  overflow: hidden;
  border-radius: 10px;
  background: var(--primary-soft);
  color: var(--text-2);
  cursor: zoom-in;
}

img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
