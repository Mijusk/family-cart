<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useGroupStore } from '@/stores/group'
import { useListStore, type Suggestion } from '@/stores/list'
import AppIcon from './AppIcon.vue'
import PhotoPicker from './PhotoPicker.vue'
import QuantityChip from './QuantityChip.vue'
import QuantityStepper from './QuantityStepper.vue'

const list = useListStore()
const groupStore = useGroupStore()

const name = ref('')
const quantity = ref(1)
const note = ref('')
const photo = ref<Blob | string | null>(null)
const showNote = ref(false)
const suggestionsOpen = ref(false)
const highlighted = ref(-1)
const nameInput = useTemplateRef('nameInput')

const suggestions = computed<Suggestion[]>(() => (suggestionsOpen.value ? list.suggest(name.value) : []))
const duplicate = computed(() => list.findPendingDuplicate(name.value))
const canSubmit = computed(() => name.value.trim().length > 0)

watch(name, () => {
  highlighted.value = -1
})

function reset() {
  name.value = ''
  quantity.value = 1
  note.value = ''
  photo.value = null
  showNote.value = false
  suggestionsOpen.value = false
  nameInput.value?.focus()
}

function pick(suggestion: Suggestion) {
  name.value = suggestion.product.displayName
  quantity.value = suggestion.product.lastQuantity
  suggestionsOpen.value = false
}

/** The picker only ever holds a new photo here, never a stored path. */
const newPhoto = () => (photo.value instanceof Blob ? photo.value : null)

function addSeparately() {
  if (!canSubmit.value) return
  list.addItem({ name: name.value, quantity: quantity.value, note: note.value, photo: newPhoto() })
  reset()
}

function mergeWithDuplicate() {
  if (!duplicate.value) return
  list.mergeInto(duplicate.value.id, quantity.value, note.value, newPhoto())
  reset()
}

function submit() {
  const picked = suggestions.value[highlighted.value]
  if (picked) return pick(picked)
  if (duplicate.value) return mergeWithDuplicate()
  addSeparately()
}

function onKeydown(event: KeyboardEvent) {
  const count = suggestions.value.length
  if (event.key === 'Escape') {
    suggestionsOpen.value = false
  } else if (count && event.key === 'ArrowDown') {
    event.preventDefault()
    highlighted.value = (highlighted.value + 1) % count
  } else if (count && event.key === 'ArrowUp') {
    event.preventDefault()
    highlighted.value = (highlighted.value - 1 + count) % count
  }
}
</script>

<template>
  <form class="add" autocomplete="off" @submit.prevent="submit">
    <label class="sr-only" for="new-item-name">Producto</label>
    <div class="name-row">
      <PhotoPicker v-model="photo" />
      <div class="combo">
        <input
          id="new-item-name"
          ref="nameInput"
          v-model="name"
          class="field name"
          placeholder="¿Qué falta en casa?"
          enterkeyhint="done"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="new-item-suggestions"
          :aria-expanded="suggestions.length > 0"
          @input="suggestionsOpen = true"
          @focus="suggestionsOpen = true"
          @blur="suggestionsOpen = false"
          @keydown="onKeydown"
        />
        <ul v-if="suggestions.length" id="new-item-suggestions" class="suggestions" role="listbox">
          <li v-for="(s, index) in suggestions" :key="s.product.id" role="option" :aria-selected="index === highlighted">
            <!-- mousedown.prevent keeps focus in the input so blur doesn't close the list before the click lands -->
            <button
              type="button"
              class="suggestion"
              :class="{ active: index === highlighted }"
              @mousedown.prevent
              @click="pick(s)"
            >
              <span class="suggestion-name">{{ s.product.displayName }}</span>
              <span v-if="s.pending" class="tag-pending">ya en la lista</span>
              <QuantityChip :quantity="s.product.lastQuantity" muted />
            </button>
          </li>
        </ul>
      </div>
    </div>

    <input
      v-if="showNote"
      v-model="note"
      class="field"
      placeholder="Nota: marca, tamaño, talla…"
      aria-label="Nota"
      maxlength="120"
    />

    <div v-if="duplicate" class="duplicate" role="status">
      <p>
        <strong>{{ duplicate.name }}</strong> ya está en la lista
        <span class="muted">
          (×{{ duplicate.quantity }}, {{ groupStore.isMe(duplicate.addedBy) ? 'lo añadiste tú' : `lo añadió ${groupStore.memberName(duplicate.addedBy)}` }})
        </span>
      </p>
      <div class="duplicate-actions">
        <QuantityStepper v-model="quantity" label="Cantidad a sumar" />
        <button type="submit" class="btn btn-warn merge">
          Sumar: {{ duplicate.quantity }} + {{ quantity }} = {{ duplicate.quantity + quantity }}
        </button>
      </div>
      <button type="button" class="separate" @click="addSeparately">Añadir como línea aparte</button>
    </div>

    <div v-else class="controls">
      <QuantityStepper v-model="quantity" />
      <button
        type="button"
        class="note-toggle"
        :class="{ on: showNote }"
        :aria-pressed="showNote"
        @click="showNote = !showNote"
      >
        <AppIcon name="note" :size="18" />
        Nota
      </button>
      <button type="submit" class="btn btn-primary add-btn" :disabled="!canSubmit">
        <AppIcon name="plus" :size="20" />
        Añadir
      </button>
    </div>
  </form>
</template>

<style scoped>
.add {
  display: grid;
  gap: 10px;
  padding: 14px var(--gutter) 16px;
  background: var(--surface);
  border-block: 1px solid var(--line);
}

@media (min-width: 592px) {
  .add {
    border-inline: 1px solid var(--line);
    border-radius: var(--radius);
  }
}

.name-row {
  display: flex;
  gap: 8px;
}

.combo {
  position: relative;
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 1.0625rem;
  min-height: 52px;
}

.suggestions {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 10px 24px -12px rgb(31 45 36 / 0.35);
}

.suggestion {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: var(--tap);
  padding: 6px 12px 6px 14px;
  text-align: left;
}

.suggestion:hover,
.suggestion.active {
  background: var(--primary-soft);
}

.suggestion-name {
  flex: 1;
  font-weight: 500;
}

.tag-pending {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--warn);
  background: var(--warn-soft);
  padding: 2px 8px;
  border-radius: 999px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.note-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: var(--tap);
  padding: 0 12px;
  border-radius: 999px;
  color: var(--text-2);
  font-weight: 500;
}

.note-toggle:hover,
.note-toggle.on {
  color: var(--primary);
  background: var(--primary-soft);
}

.add-btn {
  margin-left: auto;
}

.duplicate {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
  border-left: 4px solid var(--warn);
  background: var(--warn-soft);
  border-radius: 0 10px 10px 0;
}

.duplicate strong {
  color: var(--warn);
}

.duplicate-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.merge {
  flex: 1;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.separate {
  justify-self: start;
  padding: 6px 0;
  color: var(--warn);
  font-weight: 600;
  font-size: 0.9375rem;
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
