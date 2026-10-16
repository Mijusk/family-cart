<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { useCalendarStore, type EventDraft } from '@/stores/calendar'
import { useGroupStore } from '@/stores/group'
import { useToastStore } from '@/stores/toast'
import type { RepeatKind } from '@/types'
import { PERSON_COLORS } from '@/utils/colors'
import { isIsoDate, longDay, today, WEEKDAY_INITIALS, WEEKDAY_NAMES, weekday } from '@/utils/days'
import { friendlyError } from '@/utils/errors'
import { cleanDisplayName } from '@/utils/text'

// Creates an event (/calendario/nuevo, ?copia=<id> to duplicate one), edits a whole event
// (/calendario/evento/:id/editar) or only one day of a repeating one (…/editar?solo=dia).

const groupStore = useGroupStore()
const calendar = useCalendarStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

const NEW_FOLDER = '__new'

const editingId = computed(() => (route.name === 'event-edit' ? String(route.params.id) : null))
const copyOf = computed(() => (typeof route.query.copia === 'string' ? route.query.copia : null))
const queryDay = computed(() => (isIsoDate(route.query.dia) ? route.query.dia : null))
/** Changing only one day of a repeating event: no folder, repetition or groups here. */
const onlyDay = computed(() => !!editingId.value && route.query.solo === 'dia')

const pageTitle = computed(() => {
  if (onlyDay.value) return 'Cambiar este día'
  if (editingId.value) return 'Editar evento'
  return copyOf.value ? 'Duplicar evento' : 'Nuevo evento'
})

const form = reactive({
  title: '',
  calendarId: '',
  allDay: false,
  startDate: today(),
  startTime: '09:00',
  endTime: '10:00',
  repeat: 'none' as RepeatKind,
  weekdays: [] as number[],
  repeatUntil: '',
  location: '',
  notes: '',
  groupIds: [] as string[],
  newFolderName: '',
  newFolderColor: PERSON_COLORS[2] as string,
})
const ready = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return `${String((h! + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** The next full hour today; 09:00 on any other day. */
function defaultStart(day: string): string {
  if (day !== today()) return '09:00'
  const next = new Date().getHours() + 1
  return next > 23 ? '23:00' : `${String(next).padStart(2, '0')}:00`
}

function fill() {
  const source = calendar.eventById(editingId.value ?? copyOf.value ?? '')
  if (source) {
    const day = queryDay.value
    const exception = onlyDay.value
      ? calendar.exceptionsOf(source.id).find((x) => x.occurrenceDate === day && x.status === 'modified')
      : undefined
    const shown = { ...source, ...(exception?.overrides ?? {}) }
    Object.assign(form, {
      title: shown.title,
      calendarId: calendar.editableCalendars.some((c) => c.id === source.calendarId) ? source.calendarId : defaultCalendar(),
      allDay: shown.allDay,
      // A duplicate goes to the day it was opened on; the day the user changes it to after.
      startDate: onlyDay.value ? shown.startDate : editingId.value ? source.startDate : (day ?? shown.startDate),
      startTime: shown.startTime ?? '09:00',
      endTime: shown.endTime ?? '10:00',
      repeat: copyOf.value ? 'none' : source.repeat,
      weekdays: copyOf.value ? [] : [...(source.repeatWeekdays ?? [])],
      repeatUntil: copyOf.value ? '' : (source.repeatUntil ?? ''),
      location: shown.location ?? '',
      notes: shown.notes ?? '',
      groupIds: editingId.value ? [...(calendar.eventGroups[source.id] ?? [])] : [],
    })
    if (onlyDay.value && day) form.startDate = exception?.overrides.startDate ?? day
  } else {
    const day = queryDay.value ?? today()
    form.startDate = day
    form.startTime = defaultStart(day)
    form.endTime = addHour(form.startTime)
    form.calendarId = defaultCalendar()
  }
  ready.value = true
}

/** The folder of the last event I created; else my first folder; else a new one. */
function defaultCalendar(): string {
  const editable = calendar.editableCalendars
  const last = groupStore.me?.lastCalendarId
  if (last && editable.some((c) => c.id === last)) return last
  return (editable.find((c) => c.ownerId === groupStore.me?.id) ?? editable[0])?.id ?? NEW_FOLDER
}

watch(
  () => calendar.status,
  (status) => {
    if (status === 'ready' && !ready.value) fill()
  },
  { immediate: true },
)
if (calendar.status !== 'ready') void calendar.load(groupStore.group.id).catch(() => {})

const notFound = computed(() => ready.value && (editingId.value || copyOf.value) && !calendar.eventById(editingId.value ?? copyOf.value!))

// ── Folder ───────────────────────────────────────────────────

/** My folders first, then those of others I can edit, labelled with their owner. */
const folderOptions = computed(() => {
  const mine = groupStore.me?.id
  const sorted = [...calendar.editableCalendars].sort((a, b) => Number(b.ownerId === mine) - Number(a.ownerId === mine))
  return sorted.map((c) => ({
    id: c.id,
    label: c.ownerId === mine ? c.name : `${c.name} (de ${calendar.personName(c.ownerId)})`,
  }))
})

const folderOwnerId = computed(() =>
  form.calendarId === NEW_FOLDER ? groupStore.me?.id : calendar.calendarById(form.calendarId)?.ownerId,
)

// ── Repetition ───────────────────────────────────────────────

watch(
  () => form.repeat,
  (repeat) => {
    if ((repeat === 'weekly' || repeat === 'biweekly') && !form.weekdays.length) form.weekdays = [weekday(form.startDate)]
  },
)

function toggleWeekday(d: number) {
  form.weekdays = form.weekdays.includes(d) ? form.weekdays.filter((x) => x !== d) : [...form.weekdays, d].sort()
}

const crossesMidnight = computed(() => !form.allDay && form.endTime < form.startTime)

// ── Extra groups ─────────────────────────────────────────────

/**
 * Groups this event can be added to, besides those of its folder. The owner has to be in the
 * group: for my own folders any of my groups; for someone else's, the current group if they are in it.
 */
const groupOptions = computed(() => {
  const shared = form.calendarId === NEW_FOLDER ? [] : calendar.sharedGroupIds(form.calendarId)
  const ownerIsMe = folderOwnerId.value === groupStore.me?.id
  const candidates = groupStore.activeMemberships.filter(
    (m) =>
      ownerIsMe ||
      (m.groupId === groupStore.group.id && groupStore.activeMembers.some((a) => a.personId === folderOwnerId.value)) ||
      form.groupIds.includes(m.groupId),
  )
  return candidates.map((m) => ({ id: m.groupId, name: m.groupName, viaFolder: shared.includes(m.groupId) }))
})

function toggleGroup(id: string) {
  form.groupIds = form.groupIds.includes(id) ? form.groupIds.filter((g) => g !== id) : [...form.groupIds, id]
}

// ── Save ─────────────────────────────────────────────────────

function validate(): string | null {
  if (!form.title.trim()) return 'Ponle un título al evento.'
  if (!form.startDate) return 'Elige la fecha.'
  if (!form.allDay && (!form.startTime || !form.endTime)) return 'Indica la hora de inicio y de fin.'
  if (!form.allDay && form.startTime === form.endTime) return 'La hora de fin tiene que ser distinta de la de inicio.'
  if (onlyDay.value) return null
  if (form.calendarId === NEW_FOLDER && !form.newFolderName.trim()) return 'Ponle nombre a la carpeta nueva.'
  if ((form.repeat === 'weekly' || form.repeat === 'biweekly') && !form.weekdays.length)
    return 'Elige al menos un día de la semana.'
  if (form.repeat !== 'none' && form.repeatUntil && form.repeatUntil < form.startDate)
    return 'La repetición no puede terminar antes de empezar.'
  return null
}

const trimOrNull = (s: string) => s.trim() || null

async function save() {
  error.value = validate()
  if (error.value || saving.value) return
  saving.value = true
  const shown = {
    title: cleanDisplayName(form.title),
    notes: trimOrNull(form.notes),
    location: trimOrNull(form.location),
    allDay: form.allDay,
    startDate: form.startDate,
    startTime: form.allDay ? null : form.startTime,
    endTime: form.allDay ? null : form.endTime,
  }
  try {
    if (onlyDay.value) {
      await calendar.saveOccurrence(calendar.eventById(editingId.value!)!, queryDay.value!, shown)
      await router.replace({ name: 'event', params: { id: editingId.value! }, query: { dia: queryDay.value! } })
      toast.show('Cambiado solo este día')
      return
    }
    // Kept in the form at once, so a retry after a failed save doesn't create the folder twice.
    if (form.calendarId === NEW_FOLDER) {
      form.calendarId = (await calendar.createCalendar(cleanDisplayName(form.newFolderName), form.newFolderColor)).id
    }
    const calendarId = form.calendarId
    const weekly = form.repeat === 'weekly' || form.repeat === 'biweekly'
    const draft: EventDraft = {
      ...shown,
      calendarId,
      repeat: form.repeat,
      repeatWeekdays: weekly ? form.weekdays : null,
      repeatUntil: form.repeat !== 'none' && form.repeatUntil ? form.repeatUntil : null,
    }
    const groupIds = form.groupIds.filter((id) => !calendar.sharedGroupIds(calendarId).includes(id))
    const id = await calendar.saveEvent(draft, groupIds, editingId.value ?? undefined)
    if (editingId.value) {
      await router.replace({ name: 'event', params: { id }, query: { dia: queryDay.value ?? draft.startDate } })
      toast.show('Evento guardado')
    } else {
      await router.replace({ name: 'calendar', query: { dia: draft.startDate } })
      toast.show(`«${draft.title}» añadido el ${longDay(draft.startDate).toLowerCase()}`)
    }
  } catch (e) {
    error.value = friendlyError(e)
  } finally {
    saving.value = false
  }
}

const cancelTo = computed(() =>
  editingId.value
    ? { name: 'event', params: { id: editingId.value }, query: queryDay.value ? { dia: queryDay.value } : {} }
    : { name: 'calendar', query: queryDay.value ? { dia: queryDay.value } : {} },
)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <RouterLink :to="cancelTo" class="back-link"><AppIcon name="close" :size="18" /> Cancelar</RouterLink>
      <h1 class="display-title">{{ pageTitle }}</h1>
      <p v-if="onlyDay && queryDay" class="muted">
        {{ longDay(queryDay) }}. El resto de la serie no cambia.
      </p>
    </header>

    <p v-if="!ready" class="state muted">Cargando…</p>
    <div v-else-if="notFound" class="state">
      <p class="muted">Este evento ya no existe o no lo puedes ver.</p>
      <RouterLink :to="{ name: 'calendar' }" class="btn btn-ghost">Ir al calendario</RouterLink>
    </div>

    <form v-else class="form" novalidate @submit.prevent="save">
      <label class="label">
        Título
        <input v-model="form.title" class="field" maxlength="120" autocomplete="off" required />
      </label>

      <template v-if="!onlyDay">
        <label class="label">
          Carpeta
          <select v-model="form.calendarId" class="field">
            <option v-for="o in folderOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
            <option :value="NEW_FOLDER">Nueva carpeta…</option>
          </select>
        </label>
        <div v-if="form.calendarId === NEW_FOLDER" class="new-folder">
          <label class="label">
            Nombre de la carpeta
            <input v-model="form.newFolderName" class="field" maxlength="60" placeholder="Personal, Trabajo, Colegio…" />
          </label>
          <div class="colors" role="radiogroup" aria-label="Color de la carpeta">
            <button
              v-for="c in PERSON_COLORS"
              :key="c"
              type="button"
              class="swatch"
              role="radio"
              :aria-checked="form.newFolderColor === c"
              :aria-label="`Color ${c}`"
              :style="{ background: c }"
              @click="form.newFolderColor = c"
            >
              <AppIcon v-if="form.newFolderColor === c" name="check" :size="16" />
            </button>
          </div>
          <p class="muted hint">De momento la carpeta es solo tuya; compartirla con el grupo llega más adelante.</p>
        </div>
      </template>

      <label class="check">
        <input v-model="form.allDay" type="checkbox" />
        Todo el día
      </label>

      <label class="label">
        Fecha
        <input v-model="form.startDate" type="date" class="field" required />
      </label>

      <div v-if="!form.allDay" class="times">
        <label class="label">
          Empieza
          <input v-model="form.startTime" type="time" class="field" required />
        </label>
        <label class="label">
          Termina
          <input v-model="form.endTime" type="time" class="field" required />
        </label>
      </div>
      <p v-if="crossesMidnight" class="muted hint">Termina al día siguiente.</p>

      <template v-if="!onlyDay">
        <label class="label">
          Repetir
          <select v-model="form.repeat" class="field">
            <option value="none">No se repite</option>
            <option value="daily">Cada día</option>
            <option value="weekly">Cada semana</option>
            <option value="biweekly">Cada dos semanas</option>
            <option value="monthly">Cada mes (el mismo día)</option>
          </select>
        </label>
        <div v-if="form.repeat === 'weekly' || form.repeat === 'biweekly'" class="weekdays" role="group" aria-label="Días de la semana">
          <button
            v-for="(initial, i) in WEEKDAY_INITIALS"
            :key="i"
            type="button"
            class="weekday"
            :aria-pressed="form.weekdays.includes(i + 1)"
            :aria-label="WEEKDAY_NAMES[i]"
            @click="toggleWeekday(i + 1)"
          >
            {{ initial }}
          </button>
        </div>
        <label v-if="form.repeat !== 'none'" class="label">
          Hasta (opcional)
          <input v-model="form.repeatUntil" type="date" class="field" :min="form.startDate" />
        </label>
      </template>

      <label class="label">
        Lugar
        <input v-model="form.location" class="field" maxlength="200" autocomplete="off" />
      </label>

      <label class="label">
        Notas
        <textarea v-model="form.notes" class="field" rows="3" maxlength="2000" />
      </label>

      <fieldset v-if="!onlyDay && groupOptions.length" class="groups">
        <legend class="label">Lo ve también</legend>
        <label v-for="g in groupOptions" :key="g.id" class="check">
          <input
            type="checkbox"
            :checked="g.viaFolder || form.groupIds.includes(g.id)"
            :disabled="g.viaFolder"
            @change="toggleGroup(g.id)"
          />
          {{ g.name }}
          <span v-if="g.viaFolder" class="muted">· por la carpeta</span>
        </label>
      </fieldset>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>

      <div class="dock">
        <div>
          <button type="submit" class="btn btn-primary btn-block" :disabled="saving">
            {{ saving ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </div>
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

.page-header .display-title {
  margin-top: 8px;
}

.form {
  display: grid;
  gap: 16px;
  padding: 0 var(--gutter);
}

select.field {
  appearance: auto;
}

textarea.field {
  resize: vertical;
}

.times {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.check {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  font-weight: 600;
  font-size: 0.9375rem;
}

.check input {
  width: 20px;
  height: 20px;
  accent-color: var(--primary);
}

.hint {
  margin-top: -8px;
  font-size: 0.875rem;
}

.new-folder {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius);
  border: 1.5px dashed var(--line);
}

.new-folder .hint {
  margin-top: 0;
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

.weekdays {
  display: flex;
  gap: 6px;
  margin-top: -6px;
}

.weekday {
  flex: 1;
  max-width: 48px;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 1.5px solid var(--line);
  background: var(--surface);
  font-weight: 700;
  color: var(--text-2);
}

.weekday[aria-pressed='true'] {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.groups {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: 0;
}

.groups legend {
  margin-bottom: 4px;
}
</style>
