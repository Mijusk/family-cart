<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGroupStore } from '@/stores/group'
import { useListStore } from '@/stores/list'
import type { Item } from '@/types'
import { timeAgo } from '@/utils/date'
import AppIcon from './AppIcon.vue'
import PhotoPicker from './PhotoPicker.vue'
import PhotoThumb from './PhotoThumb.vue'
import QuantityChip from './QuantityChip.vue'
import QuantityStepper from './QuantityStepper.vue'

const props = defineProps<{ item: Item; editing: boolean }>()
const emit = defineEmits<{ edit: []; close: [] }>()

const list = useListStore()
const groupStore = useGroupStore()

const draft = ref<{ name: string; quantity: number; note: string; photo: Blob | string | null }>({
  name: '',
  quantity: 1,
  note: '',
  photo: null,
})

watch(
  () => props.editing,
  (editing) => {
    if (!editing) return
    draft.value = {
      name: props.item.name,
      quantity: props.item.quantity,
      note: props.item.note ?? '',
      photo: props.item.photoPath,
    }
  },
  { immediate: true },
)

const notFoundLabel = computed(() => {
  if (props.item.status !== 'not_found') return null
  const trip = list.tripById(props.item.tripId)
  if (!trip) return 'No se encontró'
  const who = groupStore.isMe(trip.memberId) ? 'No lo encontraste' : `${groupStore.memberName(trip.memberId)} no lo encontró`
  return `${who} · ${timeAgo(trip.startedAt)}`
})

function save() {
  if (!draft.value.name.trim()) return
  const { photo, ...fields } = draft.value
  // A string is the photo it already had: unchanged.
  list.updateItem(props.item.id, { ...fields, photo: typeof photo === 'string' ? undefined : photo })
  emit('close')
}

function remove() {
  list.deleteItem(props.item.id)
  emit('close')
}
</script>

<template>
  <li class="row" :class="{ 'is-editing': editing, 'is-not-found': item.status === 'not_found' }">
    <form v-if="editing" class="edit" @submit.prevent="save" @keydown.esc="emit('close')">
      <div class="name-row">
        <PhotoPicker v-model="draft.photo" :size="48" />
        <input v-model="draft.name" class="field" aria-label="Nombre" required />
      </div>
      <input v-model="draft.note" class="field" placeholder="Nota (opcional)" aria-label="Nota" maxlength="120" />
      <div class="edit-row">
        <QuantityStepper v-model="draft.quantity" />
        <button type="button" class="icon-btn delete" aria-label="Borrar producto" @click="remove">
          <AppIcon name="trash" />
        </button>
      </div>
      <div class="edit-row">
        <button type="button" class="btn btn-ghost" @click="emit('close')">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>

    <div v-else class="line">
      <PhotoThumb v-if="item.photoPath" class="line-thumb" :path="item.photoPath" :alt="item.name" />
      <button
        type="button"
        class="view"
        :class="{ 'has-thumb': item.photoPath }"
        :aria-label="`Editar ${item.name}`"
        @click="emit('edit')"
      >
        <span class="text">
          <span class="name">{{ item.name }}</span>
          <span v-if="item.note" class="note">{{ item.note }}</span>
          <span v-if="notFoundLabel" class="not-found">
            <AppIcon name="notFound" :size="15" />
            {{ notFoundLabel }}
          </span>
          <span class="meta">{{ groupStore.memberName(item.addedBy) }} · {{ timeAgo(item.addedAt) }}</span>
        </span>
        <QuantityChip :quantity="item.quantity" />
      </button>
    </div>
  </li>
</template>

<style scoped>
.row.is-not-found {
  box-shadow: inset 4px 0 0 var(--warn);
}

.row.is-editing {
  background: color-mix(in srgb, var(--primary-soft) 45%, var(--surface));
}

.line {
  display: flex;
  align-items: center;
}

.line-thumb {
  margin-left: var(--gutter);
}

.view {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  padding: 12px var(--gutter);
  text-align: left;
}

.view.has-thumb {
  padding-left: 12px;
}

.view:hover {
  background: color-mix(in srgb, var(--primary-soft) 40%, transparent);
}

.text {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}

.name {
  font-weight: 600;
  font-size: 1.0625rem;
  overflow-wrap: anywhere;
}

.note {
  color: var(--text);
  font-size: 0.9375rem;
  opacity: 0.85;
}

.meta {
  font-size: 0.8125rem;
  color: var(--text-2);
}

.not-found {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--warn);
}

.edit {
  display: grid;
  gap: 8px;
  padding: 12px var(--gutter);
}

.name-row {
  display: flex;
  gap: 8px;
}

.edit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.edit-row .btn {
  flex: 1;
}

.delete {
  color: var(--warn);
}

.delete:hover {
  background: var(--warn-soft);
  color: var(--warn);
}
</style>
