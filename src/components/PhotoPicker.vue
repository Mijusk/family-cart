<script setup lang="ts">
import { ref, useTemplateRef, watch } from 'vue'
import { photoUrl, shrinkPhoto } from '@/lib/photos'
import { useToastStore } from '@/stores/toast'
import AppIcon from './AppIcon.vue'

/** A freshly picked (already shrunk) photo, the path of the stored one, or none. */
const model = defineModel<Blob | string | null>({ required: true })
withDefaults(defineProps<{ size?: number }>(), { size: 52 })

const toast = useToastStore()
const input = useTemplateRef('input')
const preview = ref<string | null>(null)
const busy = ref(false)

watch(
  model,
  async (value, _, onCleanup) => {
    preview.value = null
    if (value instanceof Blob) {
      const local = URL.createObjectURL(value)
      preview.value = local
      onCleanup(() => URL.revokeObjectURL(local))
    } else if (value) {
      try {
        const signed = await photoUrl(value)
        if (model.value === value) preview.value = signed
      } catch (error) {
        console.error(error)
      }
    }
  },
  { immediate: true },
)

async function onPick(event: Event) {
  const field = event.target as HTMLInputElement
  const file = field.files?.[0]
  field.value = '' // so picking the same file again still fires change
  if (!file) return
  busy.value = true
  try {
    model.value = await shrinkPhoto(file)
  } catch (error) {
    console.error(error)
    toast.show('No se pudo leer la foto. Prueba con otra.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="picker" :style="{ '--size': `${size}px` }">
    <!-- No capture attribute: phones then offer both the camera and the gallery. -->
    <input ref="input" type="file" accept="image/*" hidden @change="onPick" />
    <button
      type="button"
      class="square"
      :class="{ filled: model }"
      :aria-label="model ? 'Cambiar foto' : 'Añadir foto'"
      :disabled="busy"
      @click="input?.click()"
    >
      <img v-if="preview" :src="preview" alt="" />
      <span v-else-if="busy" class="spinner" aria-hidden="true" />
      <template v-else-if="!model">
        <AppIcon name="plus" :size="18" />
        <span class="label">Foto</span>
      </template>
    </button>
    <button v-if="model && !busy" type="button" class="clear" aria-label="Quitar foto" @click="model = null">
      <AppIcon name="close" :size="12" />
    </button>
  </div>
</template>

<style scoped>
.picker {
  position: relative;
  flex-shrink: 0;
  width: var(--size);
  height: var(--size);
}

.square {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 1px;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1.5px dashed color-mix(in srgb, var(--primary) 45%, var(--line));
  border-radius: 10px;
  background: var(--surface);
  color: var(--primary);
}

.square:hover {
  background: var(--primary-soft);
}

.square.filled {
  border-style: solid;
  border-color: var(--line);
}

.label {
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1;
}

img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Small × badge on the corner; the hit area is larger than what shows. */
.clear {
  position: absolute;
  top: -10px;
  right: -10px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
}

.clear::before {
  content: '';
  position: absolute;
  inset: 5px;
  border-radius: 50%;
  background: var(--text);
}

.clear :deep(svg) {
  position: relative;
  color: #fff;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--primary-soft);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
