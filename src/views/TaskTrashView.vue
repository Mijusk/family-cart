<script setup lang="ts">
import { ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { goBack } from '@/router/back'
import { useGroupStore } from '@/stores/group'
import { useTasksStore } from '@/stores/tasks'
import { useToastStore } from '@/stores/toast'
import type { TaskTrashItem } from '@/types'
import { timeAgo } from '@/utils/date'
import { friendlyError } from '@/utils/errors'

// Papelera of Tareas: deleted lists I manage and deleted tasks of lists I see. They come back for
// 30 days; after that, or when deleted here for good, they are gone.

const groupStore = useGroupStore()
const store = useTasksStore()
const toast = useToastStore()

const items = ref<TaskTrashItem[] | null>(null)
const failed = ref(false)

async function refresh() {
  failed.value = false
  try {
    items.value = await store.loadTrash()
  } catch (e) {
    console.error(e)
    failed.value = true
  }
}

watch(
  () => groupStore.group.id,
  async (id) => {
    await store.load(id).catch(() => {})
    await refresh()
  },
  { immediate: true },
)

/** Item waiting for "¿Eliminar definitivamente?" to be confirmed. */
const confirming = ref<string | null>(null)
const busy = ref<string | null>(null)

async function act(item: TaskTrashItem, action: () => Promise<unknown>, done: string) {
  if (busy.value) return
  busy.value = item.id
  try {
    await action()
    confirming.value = null
    toast.show(done)
    await refresh()
  } catch (e) {
    toast.show(friendlyError(e))
  } finally {
    busy.value = null
  }
}

const restore = (item: TaskTrashItem) => act(item, () => store.restore(item), `«${item.title}» recuperada`)
const purge = (item: TaskTrashItem) => act(item, () => store.purge(item), `«${item.title}» eliminada`)

function detail(item: TaskTrashItem): string {
  if (item.kind === 'list') {
    const n = item.taskCount
    return `Lista${n ? ` con ${n} ${n === 1 ? 'tarea' : 'tareas'}` : ' vacía'}`
  }
  return item.listName ? `Tarea de ${item.listName}` : 'Tarea'
}

function deletedLine(item: TaskTrashItem): string {
  const who = item.deletedBy ? store.personName(item.deletedBy, 'ti') : null
  return `Borrada ${who ? `por ${who} ` : ''}${timeAgo(item.deletedAt)}`
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <button type="button" class="back-link" @click="goBack({ name: 'task-lists' })"><AppIcon name="back" :size="18" /> Mis listas</button>
      <h1 class="display-title">Papelera</h1>
    </header>

    <p class="intro muted">
      Lo borrado se puede recuperar durante 30 días; después se elimina solo. Una tarea borrada junto con su lista vuelve al
      recuperar la lista.
    </p>

    <div v-if="failed" class="state">
      <p class="muted">No se pudo cargar la papelera.</p>
      <button type="button" class="btn btn-ghost" @click="refresh">Reintentar</button>
    </div>
    <p v-else-if="!items" class="state muted">Cargando…</p>
    <p v-else-if="!items.length" class="state muted">La papelera está vacía.</p>

    <ul v-else class="items">
      <li v-for="item in items" :key="`${item.kind}:${item.id}`" class="item">
        <div class="item-head">
          <AppIcon :name="item.kind === 'list' ? 'tasks' : 'check'" :size="20" class="muted" />
          <span class="item-text">
            <span class="title">{{ item.title }}</span>
            <span class="muted small">{{ detail(item) }}</span>
            <span class="muted small">{{ deletedLine(item) }}</span>
          </span>
        </div>
        <div v-if="confirming === item.id" class="confirm">
          <p>¿Eliminar «{{ item.title }}» para siempre? No se podrá recuperar.</p>
          <div class="row">
            <button type="button" class="btn btn-warn" :disabled="!!busy" @click="purge(item)">Eliminar</button>
            <button type="button" class="btn btn-ghost" @click="confirming = null">Cancelar</button>
          </div>
        </div>
        <div v-else class="row actions">
          <button type="button" class="btn btn-ghost" :disabled="!!busy" @click="restore(item)">Recuperar</button>
          <button type="button" class="btn btn-ghost subtle" :disabled="!!busy" @click="confirming = item.id">
            Eliminar definitivamente
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.intro {
  margin: 4px var(--gutter) 8px;
  font-size: 0.9375rem;
}

.state {
  display: grid;
  justify-items: center;
  gap: 12px;
  margin: 32px var(--gutter);
  text-align: center;
}

.items {
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  display: grid;
  gap: 10px;
  padding: 14px var(--gutter);
  border-bottom: 1px solid var(--line);
}

.item-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.item-text {
  display: grid;
  min-width: 0;
}

.title {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.small {
  font-size: 0.875rem;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.actions {
  padding-left: 32px;
}

.subtle {
  color: var(--text-2);
}

.confirm {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius);
  background: var(--warn-soft);
}
</style>
