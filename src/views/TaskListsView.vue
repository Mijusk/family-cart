<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { goBack } from '@/router/back'
import { useGroupStore } from '@/stores/group'
import { useTasksStore } from '@/stores/tasks'
import { useToastStore } from '@/stores/toast'
import type { TaskList } from '@/types'
import { friendlyError } from '@/utils/errors'
import { cleanDisplayName } from '@/utils/text'

// "Mis listas": create, rename, share and delete task lists. Admins also manage the lists of the
// group's profiles without an account, as in "Mis carpetas".

const groupStore = useGroupStore()
const store = useTasksStore()
const toast = useToastStore()

watch(
  () => groupStore.group.id,
  (id) => store.load(id).catch(() => {}),
  { immediate: true },
)

// ── Whose lists ───────────────────────────────────────────────

const owners = computed(() => {
  const me = groupStore.me!
  const profiles = groupStore.isAdmin ? groupStore.activeMembers.filter((m) => !m.hasAccount) : []
  return [
    { personId: me.id, name: 'Tú', color: me.color, isMe: true },
    ...profiles.map((m) => ({ personId: m.personId, name: m.name, color: m.color, isMe: false })),
  ]
})
const ownerId = ref(groupStore.me!.id)
const owner = computed(() => owners.value.find((o) => o.personId === ownerId.value) ?? owners.value[0]!)

watch(owners, (list) => {
  if (!list.some((o) => o.personId === ownerId.value)) ownerId.value = list[0]!.personId
})

const lists = computed(() =>
  store.lists
    .filter((l) => l.ownerId === owner.value.personId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name)),
)

/** Groups a list can be shared with: all mine for my lists; for a profile, this group. */
const groups = computed(() =>
  owner.value.isMe
    ? groupStore.activeMemberships.map((m) => ({ id: m.groupId, name: m.groupName }))
    : [{ id: groupStore.group.id, name: groupStore.group.name }],
)

function groupName(id: string): string {
  return groupStore.activeMemberships.find((m) => m.groupId === id)?.groupName ?? 'otro grupo'
}

function shareSummary(l: TaskList): string {
  const shared = store.sharedGroupIds(l.id)
  if (!shared.length) return owner.value.isMe ? 'Privada: solo la ves tú' : `Privada: solo para ${owner.value.name}`
  return `Compartida con ${shared.map(groupName).join(', ')}`
}

function pendingLine(l: TaskList): string {
  const n = store.pendingOf(l.id).length
  return n === 1 ? '1 pendiente' : `${n} pendientes`
}

// ── Actions ───────────────────────────────────────────────────

const busy = ref<string | null>(null)
async function act(key: string, action: () => Promise<unknown>, done?: string) {
  if (busy.value) return
  busy.value = key
  try {
    await action()
    if (done) toast.show(done)
  } catch (e) {
    toast.show(friendlyError(e))
  } finally {
    busy.value = null
  }
}

/** The list being edited, with its unsaved name. */
const editing = reactive({ id: null as string | null, name: '' })

function toggle(l: TaskList) {
  if (editing.id === l.id) {
    editing.id = null
    return
  }
  Object.assign(editing, { id: l.id, name: l.name })
}

function save(l: TaskList) {
  const name = cleanDisplayName(editing.name)
  if (!name) return toast.show('Ponle nombre a la lista.')
  void act(`save:${l.id}`, () => store.renameList(l.id, name), 'Lista guardada')
}

function share(l: TaskList, groupId: string, shared: boolean) {
  void act(`share:${l.id}:${groupId}`, () => store.setShare(l.id, groupId, shared))
}

function remove(l: TaskList) {
  void act(`delete:${l.id}`, async () => {
    const undo = await store.deleteList(l.id)
    editing.id = null
    toast.show(`«${l.name}» enviada a la papelera`, () => {
      undo().catch((e) => toast.show(friendlyError(e)))
    })
  })
}

// ── New list ──────────────────────────────────────────────────

const adding = ref(false)
const draft = reactive({ name: '', groupIds: [] as string[] })

function startAdding() {
  // Shared with this group unless unticked.
  Object.assign(draft, { name: '', groupIds: [groupStore.group.id] })
  adding.value = true
}

function add() {
  const name = cleanDisplayName(draft.name)
  if (!name) return
  const groupIds = draft.groupIds.filter((id) => groups.value.some((g) => g.id === id))
  void act('add', async () => {
    const created = await store.createList(name, owner.value.personId, groupIds)
    adding.value = false
    Object.assign(editing, { id: created.id, name: created.name })
  })
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <button type="button" class="back-link" @click="goBack({ name: 'tasks' })"><AppIcon name="back" :size="18" /> Tareas</button>
      <h1 class="display-title">{{ owner.isMe ? 'Mis listas' : `Listas de ${owner.name}` }}</h1>
    </header>

    <div v-if="owners.length > 1" class="owners" role="radiogroup" aria-label="De quién">
      <button
        v-for="o in owners"
        :key="o.personId"
        type="button"
        class="chip"
        role="radio"
        :aria-checked="o.personId === owner.personId"
        @click="((ownerId = o.personId), (editing.id = null), (adding = false))"
      >
        <span class="dot" :style="{ background: o.color }" />{{ o.name }}
      </button>
    </div>

    <p class="intro muted">
      Una lista compartida con un grupo la ve y la usa todo el grupo: añadir, marcar y ordenar tareas. Sin grupos, es privada.
    </p>

    <p v-if="store.status === 'loading'" class="state muted">Cargando…</p>
    <div v-else-if="store.status === 'error'" class="state">
      <p class="muted">No se pudieron cargar las listas.</p>
      <button type="button" class="btn btn-ghost" @click="store.load(groupStore.group.id).catch(() => {})">Reintentar</button>
    </div>

    <template v-else>
      <p v-if="!lists.length" class="state muted">{{ owner.isMe ? 'Aún no tienes listas.' : `${owner.name} aún no tiene listas.` }}</p>

      <ul class="lists">
        <li v-for="l in lists" :key="l.id" class="list">
          <button type="button" class="list-head" :aria-expanded="editing.id === l.id" @click="toggle(l)">
            <AppIcon name="tasks" class="muted" />
            <span class="list-text">
              <span class="name">{{ l.name }}</span>
              <span class="muted summary">{{ shareSummary(l) }} · {{ pendingLine(l) }}</span>
            </span>
            <AppIcon name="edit" :size="18" class="muted" />
          </button>

          <div v-if="editing.id === l.id" class="editor">
            <label class="label">
              Nombre
              <input v-model="editing.name" class="field" maxlength="60" />
            </label>
            <button v-if="editing.name !== l.name" type="button" class="btn btn-primary" :disabled="!!busy" @click="save(l)">
              Guardar nombre
            </button>

            <fieldset class="share">
              <legend>Compartir con</legend>
              <label v-for="g in groups" :key="g.id" class="check-row">
                <input
                  type="checkbox"
                  :checked="store.sharedGroupIds(l.id).includes(g.id)"
                  :disabled="!!busy"
                  @change="share(l, g.id, ($event.target as HTMLInputElement).checked)"
                />
                {{ g.name }}
              </label>
              <p class="muted hint">Sin ningún grupo marcado, la lista es privada.</p>
            </fieldset>

            <button type="button" class="btn btn-ghost delete" :disabled="!!busy" @click="remove(l)">
              <AppIcon name="trash" :size="18" /> Borrar lista
            </button>
          </div>
        </li>
      </ul>

      <form v-if="adding" class="add" @submit.prevent="add">
        <label class="label">
          Nombre de la lista nueva
          <input v-model="draft.name" class="field" maxlength="60" placeholder="Casa, Recados, Amigos…" autofocus />
        </label>
        <fieldset class="share">
          <legend>Compartir con</legend>
          <label v-for="g in groups" :key="g.id" class="check-row">
            <input v-model="draft.groupIds" type="checkbox" :value="g.id" />
            {{ g.name }}
          </label>
          <p class="muted hint">Sin ningún grupo marcado, la lista es privada.</p>
        </fieldset>
        <div class="row">
          <button type="submit" class="btn btn-primary" :disabled="!draft.name.trim() || !!busy">Crear</button>
          <button type="button" class="btn btn-ghost" @click="adding = false">Cancelar</button>
        </div>
      </form>
      <button v-else type="button" class="add-link" @click="startAdding"><AppIcon name="plus" :size="18" /> Nueva lista</button>

      <p class="trash-link">
        <RouterLink :to="{ name: 'task-trash' }"><AppIcon name="trash" :size="16" /> Papelera</RouterLink>
      </p>
    </template>
  </div>
</template>

<style scoped>
.owners {
  display: flex;
  gap: 8px;
  padding: 0 var(--gutter) 8px;
  overflow-x: auto;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
}

.chip[aria-checked='true'] {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.intro {
  margin: 4px var(--gutter) 8px;
  font-size: 0.9375rem;
}

.state {
  display: grid;
  justify-items: center;
  gap: 12px;
  margin: 24px var(--gutter);
  text-align: center;
}

.lists {
  margin: 0;
  padding: 0;
  list-style: none;
}

.list {
  border-bottom: 1px solid var(--line);
}

.list-head {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 64px;
  padding: 10px var(--gutter);
  text-align: left;
  color: inherit;
}

.list-head:hover {
  background: var(--primary-soft);
}

.list-text {
  flex: 1;
  min-width: 0;
  display: grid;
}

.name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.summary {
  font-size: 0.875rem;
}

.editor,
.add {
  display: grid;
  gap: 14px;
  padding: 4px var(--gutter) 20px;
}

.add {
  padding-top: 16px;
}

.share {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: 0;
}

.share legend {
  margin-bottom: 6px;
  font-weight: 600;
  font-size: 0.9375rem;
}

.check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  font-weight: 600;
}

.check-row input {
  width: 20px;
  height: 20px;
  accent-color: var(--primary);
}

.delete {
  justify-self: start;
  color: var(--warn);
}

.hint {
  font-size: 0.875rem;
}

.row {
  display: flex;
  gap: 8px;
}

.add-link {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding: 0 var(--gutter);
  color: var(--primary);
  font-weight: 600;
}

.trash-link {
  margin: 16px var(--gutter);
}

.trash-link a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  color: var(--text-2);
  font-weight: 600;
  text-decoration: none;
}
</style>
