<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { dueLabel } from '@/lib/tasks'
import { goBack } from '@/router/back'
import { useGroupStore } from '@/stores/group'
import { useTasksStore, type TaskChange } from '@/stores/tasks'
import { useToastStore } from '@/stores/toast'
import { timeAgo } from '@/utils/date'
import { addDays } from '@/utils/days'
import { friendlyError } from '@/utils/errors'

// A task: title, note, who and when, saved as it changes. ⓘ shows who created and edited it.

const groupStore = useGroupStore()
const store = useTasksStore()
const toast = useToastStore()
const route = useRoute()

watch(
  () => groupStore.group.id,
  (id) => store.ensureLoaded(id).catch(() => {}),
  { immediate: true },
)

const task = computed(() => store.taskById(String(route.params.id)))
const list = computed(() => (task.value ? store.listById(task.value.listId) : undefined))
const today = computed(() => store.today())

const back = () => goBack({ name: 'tasks', query: list.value ? { lista: list.value.id } : {} })

// ── Text fields: saved when leaving the field ─────────────────

const title = ref('')
const notes = ref('')
const editingText = ref<'title' | 'notes' | null>(null)

// Someone else's change shows up, unless I'm typing in that field.
watch(
  () => [task.value?.title, task.value?.notes] as const,
  ([t, n]) => {
    if (editingText.value !== 'title') title.value = t ?? ''
    if (editingText.value !== 'notes') notes.value = n ?? ''
  },
  { immediate: true },
)

const saving = ref(false)
async function save(change: TaskChange) {
  if (!task.value) return
  saving.value = true
  try {
    await store.updateTask(task.value.id, change)
  } catch (e) {
    toast.show(friendlyError(e))
  } finally {
    saving.value = false
  }
}

function saveTitle() {
  editingText.value = null
  const value = title.value.trim().slice(0, 120)
  if (!task.value) return
  if (!value) {
    title.value = task.value.title
    return toast.show('La tarea necesita un título.')
  }
  if (value !== task.value.title) void save({ title: value })
}

function saveNotes() {
  editingText.value = null
  const value = notes.value.trim() || null
  if (task.value && value !== task.value.notes) void save({ notes: value })
}

// ── Who and when ──────────────────────────────────────────────

const assignees = computed(() => {
  const all = task.value ? store.assignees(task.value.listId) : []
  // Someone outside this group can still be on it.
  for (const id of task.value?.assignees ?? []) {
    if (!all.some((a) => a.personId === id)) all.push({ personId: id, name: store.personName(id), color: store.personColor(id) })
  }
  return all
})

const isPrivate = computed(() => !!list.value && !store.sharedGroupIds(list.value.id).length)

/** A person on or off the task; null takes everyone off. */
function toggleAssignee(personId: string | null) {
  if (!task.value) return
  const current = task.value.assignees
  if (personId === null) {
    if (current.length) void save({ assignees: [] })
  } else {
    void save({ assignees: current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId] })
  }
}

function setDue(day: string | null) {
  if (task.value && day !== task.value.dueDate) void save({ dueDate: day || null })
}

const due = computed(() => (task.value ? dueLabel(task.value, today.value) : null))

// ── Done, delete, info ────────────────────────────────────────

function toggleDone() {
  if (!task.value) return
  store.setDone(task.value.id, !task.value.doneAt).catch((e) => toast.show(friendlyError(e)))
}

const deleting = ref(false)
async function remove() {
  if (!task.value || deleting.value) return
  deleting.value = true
  const { title: name } = task.value
  try {
    const undo = await store.deleteTask(task.value.id)
    back()
    toast.show(`«${name}» borrada`, () => {
      undo().catch((e) => toast.show(friendlyError(e)))
    })
  } catch (e) {
    toast.show(friendlyError(e))
  } finally {
    deleting.value = false
  }
}

const showInfo = ref(false)
const edited = computed(() => !!task.value?.updatedBy && task.value.updatedAt !== task.value.createdAt)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <button type="button" class="back-link" @click="back"><AppIcon name="back" :size="18" /> {{ list?.name ?? 'Tareas' }}</button>
    </header>

    <p v-if="!task && store.status === 'loading'" class="state muted">Cargando…</p>
    <div v-else-if="!task && store.status === 'error'" class="state">
      <p class="muted">No se pudo cargar la tarea.</p>
      <button type="button" class="btn btn-ghost" @click="store.load(groupStore.group.id).catch(() => {})">Reintentar</button>
    </div>
    <div v-else-if="!task" class="state">
      <p class="muted">Esta tarea ya no existe: puede que la hayan borrado o que la lista ya no esté compartida contigo.</p>
      <button type="button" class="btn btn-ghost" @click="back">Volver a las tareas</button>
    </div>

    <form v-else class="task" @submit.prevent>
      <div class="title-row">
        <button
          type="button"
          class="check"
          role="checkbox"
          :aria-checked="!!task.doneAt"
          :aria-label="task.doneAt ? 'Desmarcar' : 'Marcar como hecha'"
          @click="toggleDone"
        >
          <AppIcon v-if="task.doneAt" name="check" :size="18" />
        </button>
        <textarea
          v-model="title"
          class="title-field"
          :class="{ done: !!task.doneAt }"
          rows="1"
          maxlength="120"
          aria-label="Título"
          @focus="editingText = 'title'"
          @blur="saveTitle"
          @keydown.enter.prevent="($event.target as HTMLTextAreaElement).blur()"
        />
        <button
          type="button"
          class="icon-btn"
          :aria-expanded="showInfo"
          aria-label="Quién la creó y la cambió"
          @click="showInfo = !showInfo"
        >
          <AppIcon name="info" />
        </button>
      </div>

      <div v-if="showInfo" class="info muted">
        <p>Creada por <strong>{{ store.personName(task.createdBy, 'ti') }}</strong> {{ timeAgo(task.createdAt) }}</p>
        <p v-if="edited">Editada por <strong>{{ store.personName(task.updatedBy, 'ti') }}</strong> {{ timeAgo(task.updatedAt) }}</p>
        <p v-if="task.doneAt">Hecha por <strong>{{ store.personName(task.doneBy, 'ti') }}</strong> {{ timeAgo(task.doneAt) }}</p>
      </div>

      <label class="label">
        Nota
        <textarea
          v-model="notes"
          class="field notes"
          rows="3"
          maxlength="2000"
          placeholder="Detalles, dónde, con quién…"
          @focus="editingText = 'notes'"
          @blur="saveNotes"
        />
      </label>

      <fieldset class="group">
        <legend class="label">Para quién</legend>
        <div class="choices">
          <button type="button" class="choice" :aria-pressed="!task.assignees.length" @click="toggleAssignee(null)">Nadie</button>
          <button
            v-for="a in assignees"
            :key="a.personId"
            type="button"
            class="choice"
            :aria-pressed="task.assignees.includes(a.personId)"
            @click="toggleAssignee(a.personId)"
          >
            <AppIcon v-if="task.assignees.includes(a.personId)" name="check" :size="16" />
            <span class="dot" :style="{ background: a.color }" />{{ a.name }}
          </button>
        </div>
        <p v-if="isPrivate" class="muted small">La lista es privada: solo se puede asignar a la persona dueña de la lista.</p>
      </fieldset>

      <fieldset class="group">
        <legend class="label">
          Fecha
          <span v-if="due" class="due" :class="{ late: due.overdue }">{{ due.text }}</span>
        </legend>
        <div class="choices">
          <button type="button" class="choice" :aria-pressed="task.dueDate === today" @click="setDue(today)">Hoy</button>
          <button type="button" class="choice" :aria-pressed="task.dueDate === addDays(today, 1)" @click="setDue(addDays(today, 1))">Mañana</button>
          <input
            type="date"
            class="field date"
            :value="task.dueDate ?? ''"
            aria-label="Otro día"
            @change="setDue(($event.target as HTMLInputElement).value || null)"
          />
          <button v-if="task.dueDate" type="button" class="choice" @click="setDue(null)">Sin fecha</button>
        </div>
      </fieldset>

      <p class="muted small">
        En <strong>{{ list?.name }}</strong>{{ isPrivate ? ' (privada)' : '' }}
      </p>

      <button type="button" class="btn btn-ghost delete" :disabled="deleting" @click="remove">
        <AppIcon name="trash" :size="18" /> Borrar tarea
      </button>
    </form>
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

.task {
  display: grid;
  gap: 20px;
  padding: 0 var(--gutter);
}

.title-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.check {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  margin-left: -8px;
}

.check::before {
  content: '';
  grid-area: 1 / 1;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--line);
  background: var(--surface);
}

.check[aria-checked='true']::before {
  border-color: var(--primary);
  background: var(--primary);
}

.check :deep(svg) {
  grid-area: 1 / 1;
  color: #fff;
}

.title-field {
  flex: 1;
  min-width: 0;
  padding: 6px 0;
  border: 0;
  border-bottom: 1.5px solid transparent;
  background: transparent;
  color: var(--text);
  font-family: var(--font-display);
  font-size: 1.625rem;
  font-weight: 600;
  line-height: 1.2;
  resize: none;
  field-sizing: content;
}

.title-field:focus {
  outline: none;
  border-bottom-color: var(--primary);
}

.title-field.done {
  color: var(--text-2);
  text-decoration: line-through;
}

.info {
  display: grid;
  gap: 4px;
  margin-top: -8px;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--line);
  font-size: 0.9375rem;
}

.notes {
  resize: vertical;
}

.group {
  margin: 0;
  padding: 0;
  border: 0;
  display: grid;
  gap: 8px;
}

.group legend {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.date {
  width: auto;
  min-height: 40px;
  padding: 0 12px;
}

.due {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary-strong);
  font-size: 0.875rem;
}

.due.late {
  background: var(--late-soft);
  color: var(--late);
}

.small {
  font-size: 0.875rem;
}

.delete {
  justify-self: start;
  color: var(--warn);
}
</style>
