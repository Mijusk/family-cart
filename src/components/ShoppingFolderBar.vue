<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { ALL_FOLDERS, type FolderView } from '@/composables/shoppingFolder'
import { GENERAL_FOLDER, useListStore } from '@/stores/list'
import AppIcon from './AppIcon.vue'

// The shopping list's folders as tabs: «Todas», «General» and the group's own, plus making a new
// one and renaming or deleting the one open. Without folders, only the button to make the first.

const props = defineProps<{ view: FolderView }>()
const emit = defineEmits<{ show: [folder: FolderView] }>()

const list = useListStore()

/** What the bar is doing: showing the tabs, naming a new folder, or editing the open one. */
const mode = ref<'tabs' | 'new' | 'edit'>('tabs')
const draft = ref('')
const error = ref('')
const nameInput = useTemplateRef('nameInput')

/** Pending items per folder (null: «General»), for the counts on the tabs. */
const counts = computed(() => {
  const counts = new Map<string | null, number>()
  for (const item of list.pendingItems) counts.set(item.folderId, (counts.get(item.folderId) ?? 0) + 1)
  return counts
})

const openFolder = computed(() => list.folders.find((f) => f.id === props.view))

async function startEditing(next: 'new' | 'edit') {
  mode.value = next
  draft.value = next === 'edit' ? (openFolder.value?.name ?? '') : ''
  error.value = ''
  await nextTick()
  nameInput.value?.focus()
}

function close() {
  mode.value = 'tabs'
  error.value = ''
}

function save() {
  if (!draft.value.trim()) return
  if (mode.value === 'new') {
    const folder = list.createFolder(draft.value)
    if (folder) emit('show', folder.id)
  } else if (openFolder.value && !list.renameFolder(openFolder.value.id, draft.value)) {
    error.value = 'Ya hay una carpeta con ese nombre.'
    return
  }
  close()
}

function remove() {
  if (!openFolder.value) return
  list.deleteFolder(openFolder.value.id)
  emit('show', null)
  close()
}
</script>

<template>
  <form v-if="mode !== 'tabs'" class="folder-form" @submit.prevent="save" @keydown.esc="close">
    <div class="form-row">
      <input
        ref="nameInput"
        v-model="draft"
        class="field"
        :placeholder="mode === 'new' ? 'Nombre: Coche, Trabajo…' : 'Nombre de la carpeta'"
        aria-label="Nombre de la carpeta"
        maxlength="40"
        enterkeyhint="done"
      />
      <button type="submit" class="btn btn-primary" :disabled="!draft.trim()">
        {{ mode === 'new' ? 'Crear' : 'Guardar' }}
      </button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="mode === 'edit'" class="hint muted">
      Al borrarla, lo que tenga pasa a {{ GENERAL_FOLDER }}.
    </p>
    <div class="form-row">
      <button type="button" class="btn btn-ghost" @click="close">Cancelar</button>
      <button v-if="mode === 'edit'" type="button" class="btn btn-ghost delete" @click="remove">
        <AppIcon name="trash" :size="18" />
        Borrar carpeta
      </button>
    </div>
  </form>

  <nav v-else-if="list.folders.length" class="folder-tabs" aria-label="Carpetas de la compra">
    <button type="button" class="choice" :aria-pressed="view === ALL_FOLDERS" @click="emit('show', ALL_FOLDERS)">
      Todas<span v-if="list.pendingItems.length" class="muted">{{ list.pendingItems.length }}</span>
    </button>
    <button type="button" class="choice" :aria-pressed="view === null" @click="emit('show', null)">
      {{ GENERAL_FOLDER }}<span v-if="counts.get(null)" class="muted">{{ counts.get(null) }}</span>
    </button>
    <button
      v-for="folder in list.sortedFolders"
      :key="folder.id"
      type="button"
      class="choice"
      :aria-pressed="view === folder.id"
      @click="emit('show', folder.id)"
    >
      {{ folder.name }}<span v-if="counts.get(folder.id)" class="muted">{{ counts.get(folder.id) }}</span>
    </button>
    <button
      v-if="openFolder"
      type="button"
      class="choice icon-choice"
      :aria-label="`Cambiar o borrar ${openFolder.name}`"
      @click="startEditing('edit')"
    >
      <AppIcon name="edit" :size="18" />
    </button>
    <button type="button" class="choice icon-choice" aria-label="Nueva carpeta" @click="startEditing('new')">
      <AppIcon name="plus" :size="18" />
    </button>
  </nav>

  <div v-else class="folder-tabs">
    <button type="button" class="choice" @click="startEditing('new')">
      <AppIcon name="folder" :size="18" />
      Nueva carpeta
    </button>
  </div>
</template>

<style scoped>
.folder-tabs {
  display: flex;
  gap: 8px;
  padding: 0 var(--gutter) 12px;
  overflow-x: auto;
  scrollbar-width: none;
}

.folder-tabs::-webkit-scrollbar {
  display: none;
}

.icon-choice {
  padding: 0 10px;
}

.folder-form {
  display: grid;
  gap: 8px;
  padding: 0 var(--gutter) 12px;
}

.form-row {
  display: flex;
  gap: 8px;
}

.form-row .field {
  flex: 1;
  min-width: 0;
}

.error {
  color: var(--warn);
  font-size: 0.875rem;
  font-weight: 600;
}

.hint {
  font-size: 0.875rem;
}

.delete {
  margin-left: auto;
  color: var(--warn);
}
</style>
