<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { goBack } from '@/router/back'
import { useCalendarStore } from '@/stores/calendar'
import { useGroupStore } from '@/stores/group'
import { useToastStore } from '@/stores/toast'
import type { Calendar, ShareLevel } from '@/types'
import { PERSON_COLORS } from '@/utils/colors'
import { friendlyError } from '@/utils/errors'
import { cleanDisplayName } from '@/utils/text'

// "Mis carpetas": create, rename, recolor, share and delete folders. Admins also manage the
// folders of the group's profiles without an account.

const groupStore = useGroupStore()
const calendar = useCalendarStore()
const toast = useToastStore()

watch(
  () => groupStore.group.id,
  (id) => calendar.load(id).catch(() => {}),
  { immediate: true },
)

// ── Whose folders ─────────────────────────────────────────────

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

const folders = computed(() =>
  calendar.calendars
    .filter((c) => c.ownerId === owner.value.personId)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
)

/** Groups a folder can be shared with: all mine for my folders; for a profile, this group. */
const groups = computed(() =>
  owner.value.isMe
    ? groupStore.activeMemberships.map((m) => ({ id: m.groupId, name: m.groupName }))
    : [{ id: groupStore.group.id, name: groupStore.group.name }],
)

function groupName(id: string): string {
  return groupStore.activeMemberships.find((m) => m.groupId === id)?.groupName ?? 'otro grupo'
}

function shareSummary(c: Calendar): string {
  const shared = calendar.sharedGroupIds(c.id)
  if (!shared.length) return owner.value.isMe ? 'Privada: solo la ves tú' : 'Privada'
  return shared.map((g) => `${groupName(g)}${calendar.shareLevel(c.id, g) === 'busy' ? ' (solo ocupado)' : ''}`).join(', ')
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

/** The folder being edited, with its unsaved name and color. */
const editing = reactive({ id: null as string | null, name: '', color: '' })

function toggle(c: Calendar) {
  if (editing.id === c.id) {
    editing.id = null
    return
  }
  Object.assign(editing, { id: c.id, name: c.name, color: c.color })
}

function save(c: Calendar) {
  const name = cleanDisplayName(editing.name)
  if (!name) return toast.show('Ponle nombre a la carpeta.')
  void act(`save:${c.id}`, async () => {
    await calendar.updateCalendar(c.id, { name, color: editing.color })
    editing.id = null
  }, 'Carpeta guardada')
}

function share(c: Calendar, groupId: string, level: ShareLevel | null) {
  void act(`share:${c.id}:${groupId}`, () => calendar.setShare(c.id, groupId, level))
}

function remove(c: Calendar) {
  void act(`delete:${c.id}`, async () => {
    const undo = await calendar.deleteCalendar(c.id)
    editing.id = null
    toast.show(`«${c.name}» enviada a la papelera`, () => {
      undo().catch((e) => toast.show(friendlyError(e)))
    })
  })
}

const LEVELS: { value: ShareLevel | null; label: string }[] = [
  { value: null, label: 'No' },
  { value: 'full', label: 'Completo' },
  { value: 'busy', label: 'Ocupado' },
]

// ── New folder ────────────────────────────────────────────────

const adding = ref(false)
const draft = reactive({ name: '', color: PERSON_COLORS[2] as string })

function add() {
  const name = cleanDisplayName(draft.name)
  if (!name) return
  void act('add', async () => {
    const created = await calendar.createCalendar(name, draft.color, owner.value.personId)
    draft.name = ''
    adding.value = false
    Object.assign(editing, { id: created.id, name: created.name, color: created.color })
  })
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <button type="button" class="back-link" @click="goBack()"><AppIcon name="back" :size="18" /> Calendario</button>
      <h1 class="display-title">{{ owner.isMe ? 'Mis carpetas' : `Carpetas de ${owner.name}` }}</h1>
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
        <span class="dot round" :style="{ background: o.color }" />{{ o.name }}
      </button>
    </div>

    <p class="intro muted">
      Compartir una carpeta comparte todos sus eventos. En modo <strong>ocupado</strong> el grupo solo ve las horas, sin
      título ni detalles, y sus administradores no pueden editarla.
    </p>

    <p v-if="calendar.status === 'loading'" class="state muted">Cargando…</p>
    <div v-else-if="calendar.status === 'error'" class="state">
      <p class="muted">No se pudieron cargar las carpetas.</p>
      <button type="button" class="btn btn-ghost" @click="calendar.load(groupStore.group.id).catch(() => {})">Reintentar</button>
    </div>

    <template v-else>
      <p v-if="!folders.length" class="state muted">{{ owner.isMe ? 'Aún no tienes carpetas.' : `${owner.name} aún no tiene carpetas.` }}</p>

      <ul class="folders">
        <li v-for="c in folders" :key="c.id" class="folder">
          <button type="button" class="folder-head" :aria-expanded="editing.id === c.id" @click="toggle(c)">
            <span class="dot" :style="{ background: c.color }" />
            <span class="folder-text">
              <span class="name">{{ c.name }}</span>
              <span class="muted summary">{{ shareSummary(c) }}</span>
            </span>
            <AppIcon name="edit" :size="18" class="muted" />
          </button>

          <div v-if="editing.id === c.id" class="editor">
            <label class="label">
              Nombre
              <input v-model="editing.name" class="field" maxlength="60" />
            </label>
            <div class="colors" role="radiogroup" aria-label="Color">
              <button
                v-for="color in PERSON_COLORS"
                :key="color"
                type="button"
                class="swatch"
                role="radio"
                :aria-checked="editing.color === color"
                :aria-label="`Color ${color}`"
                :style="{ background: color }"
                @click="editing.color = color"
              >
                <AppIcon v-if="editing.color === color" name="check" :size="16" />
              </button>
            </div>
            <button
              v-if="editing.name !== c.name || editing.color !== c.color"
              type="button"
              class="btn btn-primary"
              :disabled="!!busy"
              @click="save(c)"
            >
              Guardar cambios
            </button>

            <fieldset v-for="g in groups" :key="g.id" class="share">
              <legend>Compartir con {{ g.name }}</legend>
              <div class="segmented">
                <button
                  v-for="l in LEVELS"
                  :key="l.label"
                  type="button"
                  :aria-pressed="calendar.shareLevel(c.id, g.id) === l.value"
                  :disabled="!!busy"
                  @click="share(c, g.id, l.value)"
                >
                  {{ l.label }}
                </button>
              </div>
            </fieldset>

            <button type="button" class="btn btn-ghost delete" :disabled="!!busy" @click="remove(c)">
              <AppIcon name="trash" :size="18" /> Borrar carpeta
            </button>
          </div>
        </li>
      </ul>

      <form v-if="adding" class="add" @submit.prevent="add">
        <label class="label">
          Nombre de la carpeta nueva
          <input v-model="draft.name" class="field" maxlength="60" placeholder="Personal, Trabajo, Colegio…" autofocus />
        </label>
        <div class="colors" role="radiogroup" aria-label="Color de la carpeta nueva">
          <button
            v-for="color in PERSON_COLORS"
            :key="color"
            type="button"
            class="swatch"
            role="radio"
            :aria-checked="draft.color === color"
            :aria-label="`Color ${color}`"
            :style="{ background: color }"
            @click="draft.color = color"
          >
            <AppIcon v-if="draft.color === color" name="check" :size="16" />
          </button>
        </div>
        <p class="muted hint">Nace privada. Luego eliges con qué grupos compartirla.</p>
        <div class="row">
          <button type="submit" class="btn btn-primary" :disabled="!draft.name.trim() || !!busy">Crear</button>
          <button type="button" class="btn btn-ghost" @click="adding = false">Cancelar</button>
        </div>
      </form>
      <button v-else type="button" class="add-link" @click="adding = true"><AppIcon name="plus" :size="18" /> Nueva carpeta</button>

      <p class="trash-link">
        <RouterLink :to="{ name: 'trash' }"><AppIcon name="trash" :size="16" /> Papelera</RouterLink>
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

.folders {
  margin: 0;
  padding: 0;
  list-style: none;
}

.folder {
  border-bottom: 1px solid var(--line);
}

.folder-head {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 64px;
  padding: 10px var(--gutter);
  text-align: left;
  color: inherit;
}

.folder-head:hover {
  background: var(--primary-soft);
}

.dot {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  flex-shrink: 0;
}

.dot.round {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.folder-text {
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

.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.swatch {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: #fff;
}

.swatch[aria-checked='true'] {
  outline: 3px solid color-mix(in srgb, var(--text) 35%, transparent);
  outline-offset: 2px;
}

.share {
  margin: 0;
  padding: 0;
  border: 0;
}

.share legend {
  margin-bottom: 6px;
  font-weight: 600;
  font-size: 0.9375rem;
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
  flex: 1;
  min-height: 40px;
  border-radius: 999px;
  color: var(--text-2);
  font-weight: 600;
}

.segmented button[aria-pressed='true'] {
  background: var(--primary);
  color: #fff;
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
