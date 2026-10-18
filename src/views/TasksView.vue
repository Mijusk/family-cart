<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import GroupSwitcher from '@/components/GroupSwitcher.vue'
import TaskRows from '@/components/TaskRows.vue'
import { byDueDate, byPosition, recentlyDone } from '@/lib/tasks'
import { useGroupStore } from '@/stores/group'
import { useTasksStore } from '@/stores/tasks'
import { useToastStore } from '@/stores/toast'
import type { Task } from '@/types'
import { friendlyError } from '@/utils/errors'

// "Tareas": the lists of the chosen group. A tab per list plus "Todas"; filter Todas / Mías;
// manual order by dragging, or "Ordenar por fecha" just for the view. Done tasks fold away at the
// bottom. The view state lives in the URL (?lista=…&mias=1&orden=fecha), so back keeps it.

const groupStore = useGroupStore()
const store = useTasksStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

watch(
  () => groupStore.group.id,
  (id, before) => {
    // Another group has other lists.
    if (before && id !== before) void router.replace({ query: {} })
    store.ensureLoaded(id).catch(() => {})
  },
  { immediate: true },
)

function setQuery(key: 'lista' | 'mias' | 'orden', value: string | null) {
  const { [key]: _, ...rest } = route.query
  void router.replace({ query: value ? { ...rest, [key]: value } : rest })
}

/** The list on view; null is "Todas" (also when the list in the URL is gone). */
const currentList = computed(() => {
  const id = route.query.lista
  return typeof id === 'string' ? (store.groupLists.find((l) => l.id === id) ?? null) : null
})
const onlyMine = computed(() => route.query.mias === '1')
const byDate = computed(() => route.query.orden === 'fecha')

const shownLists = computed(() => (currentList.value ? [currentList.value] : store.groupLists))

function visible(task: Task): boolean {
  return !onlyMine.value || task.assignedTo === groupStore.me?.id
}

/** Pending tasks per list, in manual order (or by date). */
const sections = computed(() =>
  shownLists.value.map((list) => ({
    list,
    tasks: store
      .pendingOf(list.id)
      .filter(visible)
      .sort(byDate.value ? byDueDate : byPosition),
  })),
)

/** "Todas" by date is one list across all of them, soonest first. */
const flatByDate = computed(() =>
  !currentList.value && byDate.value ? sections.value.flatMap((s) => s.tasks).sort(byDueDate) : null,
)

const pendingCount = computed(() => sections.value.reduce((n, s) => n + s.tasks.length, 0))

const done = computed(() => {
  const ids = new Set(shownLists.value.map((l) => l.id))
  const today = store.today()
  return store.tasks
    .filter((t) => ids.has(t.listId) && visible(t) && recentlyDone(t, today, store.dayOf))
    .sort((a, b) => b.doneAt!.localeCompare(a.doneAt!))
})
const showDone = ref(false)

const countLabel = computed(() => {
  const n = pendingCount.value
  const who = onlyMine.value ? ' para ti' : ''
  if (n === 0) return `Nada pendiente${who}`
  return n === 1 ? `1 tarea pendiente${who}` : `${n} tareas pendientes${who}`
})

function listSummary(listId: string): string {
  return store.sharedGroupIds(listId).length ? '' : ' · privada'
}

// ── Adding ────────────────────────────────────────────────────

const newTitle = ref('')
/** In "Todas", which list a new task goes to. */
const pickedListId = ref<string | null>(null)
const addListId = computed(() => currentList.value?.id ?? pickedListId.value ?? store.groupLists[0]?.id ?? null)
const titleInput = useTemplateRef('titleInput')

watch(
  () => store.groupLists,
  (lists) => {
    if (pickedListId.value && !lists.some((l) => l.id === pickedListId.value)) pickedListId.value = null
  },
)

/** Shows at once and keeps the keyboard open for the next one; if saving fails, the task goes away. */
function add() {
  const title = newTitle.value.trim()
  const listId = addListId.value
  if (!title || !listId) return
  // With "Mías" on, a new task is mine, or it would vanish from the view.
  const mine = onlyMine.value && store.assignees(listId).some((a) => a.personId === groupStore.me?.id)
  store.addTask(listId, title.slice(0, 120), mine ? { assignedTo: groupStore.me!.id } : {}).catch((e) => toast.show(friendlyError(e)))
  newTitle.value = ''
  titleInput.value?.focus()
}

// ── Ticking and moving ────────────────────────────────────────

function toggle(task: Task) {
  const done = !task.doneAt
  store.setDone(task.id, done).then(
    () => {
      if (done) {
        toast.show(`«${task.title}» hecha`, () => {
          store.setDone(task.id, false).catch((e) => toast.show(friendlyError(e)))
        })
      }
    },
    (e) => toast.show(friendlyError(e)),
  )
}

function move(id: string, beforeId: string | null, afterId: string | null) {
  store.moveTask(id, beforeId, afterId).catch((e) => toast.show(friendlyError(e)))
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div class="header-row">
        <p class="eyebrow">Tareas</p>
        <RouterLink :to="{ name: 'task-lists' }" class="header-link"><AppIcon name="list" :size="16" /> Mis listas</RouterLink>
      </div>
      <GroupSwitcher />
      <p class="muted">{{ countLabel }}</p>
    </header>

    <p v-if="store.status === 'loading'" class="state muted">Cargando…</p>
    <div v-else-if="store.status === 'error'" class="state">
      <p class="muted">No se pudieron cargar las tareas.</p>
      <button type="button" class="btn btn-ghost" @click="store.load(groupStore.group.id).catch(() => {})">Reintentar</button>
    </div>
    <div v-else-if="!store.groupLists.length" class="state">
      <p class="muted">No hay listas de tareas en este grupo.</p>
      <RouterLink :to="{ name: 'task-lists' }" class="btn btn-ghost">Crear una lista</RouterLink>
    </div>

    <template v-else>
      <nav class="tabs" aria-label="Listas">
        <button type="button" class="chip" :aria-pressed="!currentList" @click="setQuery('lista', null)">Todas</button>
        <button
          v-for="l in store.groupLists"
          :key="l.id"
          type="button"
          class="chip"
          :aria-pressed="currentList?.id === l.id"
          @click="setQuery('lista', l.id)"
        >
          {{ l.name }}<span class="muted">{{ listSummary(l.id) }}</span>
        </button>
      </nav>

      <div class="toolbar">
        <div class="segmented" role="group" aria-label="De quién">
          <button type="button" :aria-pressed="!onlyMine" @click="setQuery('mias', null)">Todas</button>
          <button type="button" :aria-pressed="onlyMine" @click="setQuery('mias', '1')">Mías</button>
        </div>
        <button type="button" class="sort" :aria-pressed="byDate" @click="setQuery('orden', byDate ? null : 'fecha')">
          <AppIcon name="sort" :size="18" /> Ordenar por fecha
        </button>
      </div>

      <form class="add" @submit.prevent="add">
        <input ref="titleInput" v-model="newTitle" class="field" maxlength="120" placeholder="Añadir tarea…" enterkeyhint="done" aria-label="Nueva tarea" />
        <!-- mousedown.prevent keeps focus (and the phone keyboard) in the input -->
        <button type="submit" class="btn btn-primary" :disabled="!newTitle.trim()" aria-label="Añadir" @mousedown.prevent>
          <AppIcon name="plus" />
        </button>
        <label v-if="!currentList && store.groupLists.length > 1" class="add-to muted">
          a
          <select v-model="pickedListId" class="list-select">
            <option :value="null" disabled hidden>{{ store.groupLists[0]!.name }}</option>
            <option v-for="l in store.groupLists" :key="l.id" :value="l.id">{{ l.name }}</option>
          </select>
        </label>
      </form>

      <template v-if="flatByDate">
        <TaskRows v-if="flatByDate.length" :tasks="flatByDate" show-list @toggle="toggle" />
        <p v-else class="nothing muted">Nada pendiente.</p>
      </template>
      <template v-else>
        <section v-for="s in sections" :key="s.list.id">
          <h2 v-if="!currentList" class="section-title">
            <RouterLink :to="{ query: { ...route.query, lista: s.list.id } }" replace>{{ s.list.name }}</RouterLink>
            <span>{{ s.tasks.length }}</span>
          </h2>
          <TaskRows v-if="s.tasks.length" :tasks="s.tasks" :sortable="!byDate" @toggle="toggle" @move="move" />
          <p v-else class="nothing muted">Nada pendiente.</p>
        </section>
      </template>

      <template v-if="done.length">
        <button type="button" class="done-toggle" :aria-expanded="showDone" @click="showDone = !showDone">
          Hechas ({{ done.length }})
          <AppIcon name="chevron" :size="18" :class="{ open: showDone }" />
        </button>
        <TaskRows v-if="showDone" :tasks="done" :show-list="!currentList" @toggle="toggle" />
      </template>
    </template>
  </div>
</template>

<style scoped>
.state {
  display: grid;
  justify-items: center;
  gap: 12px;
  margin: 32px var(--gutter);
  text-align: center;
}

.tabs {
  display: flex;
  gap: 8px;
  padding: 0 var(--gutter) 8px;
  overflow-x: auto;
}

.chip {
  flex-shrink: 0;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  white-space: nowrap;
}

.chip[aria-pressed='true'] {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.chip .muted {
  font-weight: 500;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px var(--gutter) 8px;
}

.segmented {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
}

.segmented button {
  min-height: 36px;
  padding: 0 16px;
  border-radius: 999px;
  color: var(--text-2);
  font-weight: 600;
}

.segmented button[aria-pressed='true'] {
  background: var(--primary);
  color: #fff;
}

.sort {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 999px;
  color: var(--text-2);
  font-weight: 600;
  font-size: 0.9375rem;
}

.sort[aria-pressed='true'] {
  background: var(--primary-soft);
  color: var(--primary-strong);
}

.add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 4px var(--gutter) 8px;
}

.add .field {
  flex: 1;
  min-width: 0;
}

.add .btn {
  width: 52px;
  padding: 0;
  justify-content: center;
}

.add-to {
  flex-basis: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9375rem;
}

.list-select {
  min-height: 36px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 600;
}

.section-title a {
  color: inherit;
  text-decoration: none;
}

.nothing {
  padding: 4px var(--gutter) 8px;
  font-size: 0.9375rem;
}

.done-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 48px;
  margin-top: 16px;
  padding: 0 var(--gutter);
  color: var(--text-2);
  font-weight: 700;
  font-size: 0.875rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.done-toggle .open {
  transform: rotate(180deg);
}
</style>
