<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { namesList, useEditors } from '@/lib/editors'
import { historyText, reminderLabel, repeatLabel, timeLabel } from '@/lib/eventText'
import { goBack } from '@/router/back'
import { useCalendarStore } from '@/stores/calendar'
import { useGroupStore } from '@/stores/group'
import { useToastStore } from '@/stores/toast'
import type { HistoryEntry } from '@/types'
import { timeAgo } from '@/utils/date'
import { isIsoDate, longDay, relativeDay } from '@/utils/days'
import { friendlyError } from '@/utils/errors'

// One event, as it is on one day of its series (?dia=YYYY-MM-DD, the series date).

const groupStore = useGroupStore()
const calendar = useCalendarStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

const eventId = computed(() => String(route.params.id))
const event = computed(() => calendar.eventById(eventId.value))
const seriesDate = computed(() => (isIsoDate(route.query.dia) ? route.query.dia : event.value?.startDate ?? ''))

watch(
  () => [eventId.value, route.query.dia] as const,
  ([id, day]) => calendar.ensureEvent(groupStore.group.id, id, isIsoDate(day) ? day : null).catch(() => {}),
  { immediate: true },
)

const repeating = computed(() => event.value?.repeat !== 'none')
const exception = computed(() =>
  calendar.exceptionsOf(eventId.value).find((x) => x.occurrenceDate === seriesDate.value && x.status === 'modified'),
)
/** The event with this day's changes applied. */
const shown = computed(() => event.value && { ...event.value, ...(exception.value?.overrides ?? {}) })
/** The day this occurrence happens: its series date, unless this day was moved. */
const shownDay = computed(() =>
  repeating.value ? (exception.value?.overrides.startDate ?? seriesDate.value) : (event.value?.startDate ?? seriesDate.value),
)
const owner = computed(() => calendar.owners[eventId.value])
const folder = computed(() => (event.value ? calendar.calendarById(event.value.calendarId) : undefined))
const canEdit = computed(() => !!event.value && calendar.canEdit(event.value))
const editors = useEditors(eventId)

function groupName(id: string): string {
  return groupStore.activeMemberships.find((m) => m.groupId === id)?.groupName ?? 'otro grupo'
}

/** Groups that see it: those of its folder plus its own extra ones. */
const groups = computed(() => {
  if (!event.value) return []
  const ids = new Set([...calendar.sharedGroupIds(event.value.calendarId), ...(calendar.eventGroups[eventId.value] ?? [])])
  return [...ids].map(groupName)
})

const participantNames = computed(() => (calendar.participants[eventId.value] ?? []).map((id) => calendar.personName(id, null)))

// ── Info and history ──────────────────────────────────────────

const showInfo = ref(false)
const history = ref<HistoryEntry[] | null>(null)
const loadingHistory = ref(false)

async function openHistory() {
  loadingHistory.value = true
  try {
    history.value = await calendar.loadHistory(eventId.value)
  } catch (e) {
    toast.show(friendlyError(e))
  } finally {
    loadingHistory.value = false
  }
}

watch(eventId, () => {
  showInfo.value = false
  history.value = null
})

const historyNames = { person: (id: string) => calendar.personName(id, null), group: groupName }

// ── Actions ───────────────────────────────────────────────────

/** Which question is open for a repeating event: change or delete, this day or the series. */
const asking = ref<'edit' | 'delete' | null>(null)
const busy = ref(false)

function edit(scope: 'day' | 'series') {
  void router.push({
    name: 'event-edit',
    params: { id: eventId.value },
    query: scope === 'day' ? { dia: seriesDate.value, solo: 'dia' } : { dia: seriesDate.value },
  })
}

function startEdit() {
  if (repeating.value) asking.value = asking.value === 'edit' ? null : 'edit'
  else edit('series')
}

function duplicate() {
  void router.push({ name: 'event-new', query: { copia: eventId.value, dia: shownDay.value } })
}

function startDelete() {
  if (repeating.value) asking.value = asking.value === 'delete' ? null : 'delete'
  else void remove('series')
}

async function remove(scope: 'day' | 'series') {
  if (busy.value || !event.value) return
  busy.value = true
  const title = shown.value!.title
  try {
    const undo =
      scope === 'day' ? await calendar.cancelOccurrence(eventId.value, seriesDate.value) : await calendar.deleteEvent(eventId.value)
    goBack()
    toast.show(scope === 'day' ? `«${title}» quitado de este día` : `«${title}» enviado a la papelera`, () => {
      undo().catch((e) => toast.show(friendlyError(e)))
    })
  } catch (e) {
    toast.show(friendlyError(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <button type="button" class="back-link" @click="goBack()"><AppIcon name="back" :size="18" /> Volver</button>
    </header>

    <div v-if="calendar.status === 'error'" class="state">
      <p class="muted">No se pudo cargar el evento.</p>
      <button type="button" class="btn btn-ghost" @click="calendar.load(groupStore.group.id).catch(() => {})">Reintentar</button>
    </div>
    <p v-else-if="calendar.status !== 'ready'" class="state muted">Cargando…</p>
    <div v-else-if="!event || !shown" class="state">
      <p class="muted">Este evento ya no existe o no lo puedes ver.</p>
      <RouterLink :to="{ name: 'calendar' }" class="btn btn-ghost">Ir al calendario</RouterLink>
    </div>

    <template v-else>
      <section class="card">
        <div class="title-row">
          <span class="dot" :style="{ background: owner?.color }" />
          <h1 class="display-title title">{{ shown.title }}</h1>
          <button
            type="button"
            class="icon-btn"
            :aria-expanded="showInfo"
            aria-label="Quién lo creó y lo cambió"
            @click="showInfo = !showInfo"
          >
            <AppIcon name="info" />
          </button>
        </div>
        <p class="muted owner">
          <template v-if="owner">De {{ calendar.personName(owner.ownerId, 'ti') }}</template>
          <template v-if="folder"> · {{ folder.name }}</template>
        </p>

        <div v-if="showInfo" class="info">
          <p>
            Creado por <strong>{{ calendar.personName(event.createdBy, 'ti') }}</strong> {{ timeAgo(event.createdAt) }}
          </p>
          <p v-if="event.updatedBy">
            Última edición: <strong>{{ calendar.personName(event.updatedBy, 'tú') }}</strong>, {{ timeAgo(event.updatedAt) }}
          </p>
          <button v-if="!history" type="button" class="link" :disabled="loadingHistory" @click="openHistory">Ver historial</button>
          <ol v-else class="history">
            <li v-for="entry in history" :key="entry.id">
              <strong>{{ calendar.personName(entry.changedBy, null) }}</strong> {{ historyText(entry, historyNames) }}
              <span class="muted">· {{ timeAgo(entry.changedAt) }}</span>
            </li>
          </ol>
        </div>

        <ul class="facts">
          <li>
            <AppIcon name="calendar" :size="20" />
            <span>
              {{ relativeDay(shownDay) === longDay(shownDay) ? longDay(shownDay) : `${relativeDay(shownDay)}, ${longDay(shownDay).toLowerCase()}` }}
              <br />
              <span class="muted">{{ timeLabel({ ...shown, date: shownDay }, shownDay, true) }}</span>
            </span>
          </li>
          <li v-if="repeating">
            <AppIcon name="repeat" :size="20" />
            <span>
              {{ repeatLabel(event) }}
              <template v-if="exception"><br /><span class="muted">Este día está cambiado</span></template>
            </span>
          </li>
          <li v-if="shown.location">
            <AppIcon name="pin" :size="20" />
            <span>{{ shown.location }}</span>
          </li>
          <li v-if="shown.notes">
            <AppIcon name="note" :size="20" />
            <span class="notes">{{ shown.notes }}</span>
          </li>
          <li v-if="groups.length">
            <AppIcon name="group" :size="20" />
            <span>Lo ve {{ groups.join(', ') }}</span>
          </li>
          <li v-if="participantNames.length">
            <AppIcon name="user" :size="20" />
            <span>Con {{ participantNames.join(', ') }}</span>
          </li>
          <li v-if="event.reminderMinutes !== null">
            <AppIcon name="bell" :size="20" />
            <span>Aviso: {{ reminderLabel(event.reminderMinutes).toLowerCase() }}</span>
          </li>
        </ul>
      </section>

      <p v-if="editors.length" class="editing-notice" role="status">
        {{ namesList(editors) }} {{ editors.length === 1 ? 'está' : 'están' }} editando este evento.
      </p>

      <div v-if="canEdit" class="actions">
        <button type="button" class="btn btn-ghost" :aria-expanded="asking === 'edit'" @click="startEdit">
          <AppIcon name="edit" :size="18" /> Editar
        </button>
        <button type="button" class="btn btn-ghost" @click="duplicate"><AppIcon name="copy" :size="18" /> Duplicar</button>
        <button type="button" class="btn btn-ghost" :aria-expanded="asking === 'delete'" :disabled="busy" @click="startDelete">
          <AppIcon name="trash" :size="18" /> Borrar
        </button>
      </div>

      <div v-if="asking" class="ask" role="group" :aria-label="asking === 'edit' ? 'Qué cambiar' : 'Qué borrar'">
        <p>{{ asking === 'edit' ? '¿Qué quieres cambiar?' : '¿Qué quieres borrar?' }}</p>
        <button type="button" class="btn btn-ghost" :disabled="busy" @click="asking === 'edit' ? edit('day') : remove('day')">
          Solo el {{ longDay(seriesDate).toLowerCase() }}
        </button>
        <button
          type="button"
          class="btn"
          :class="asking === 'edit' ? 'btn-ghost' : 'btn-warn'"
          :disabled="busy"
          @click="asking === 'edit' ? edit('series') : remove('series')"
        >
          Toda la serie
        </button>
      </div>
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

.card {
  padding: 4px var(--gutter) 20px;
}

.title-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.dot {
  width: 14px;
  height: 14px;
  margin-top: 12px;
  border-radius: 4px;
  flex-shrink: 0;
}

.title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.owner {
  margin: 4px 0 0 26px;
}

.info {
  display: grid;
  gap: 6px;
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--line);
  font-size: 0.9375rem;
}

.link {
  justify-self: start;
  min-height: 40px;
  color: var(--primary);
  font-weight: 600;
}

.history {
  display: grid;
  gap: 6px;
  margin: 4px 0 0;
  padding-left: 18px;
}

.facts {
  display: grid;
  gap: 14px;
  margin: 20px 0 0;
  padding: 0;
  list-style: none;
}

.facts li {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.facts li > :first-child {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--text-2);
}

.notes {
  white-space: pre-line;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 var(--gutter);
}

.ask {
  display: grid;
  gap: 10px;
  margin: 16px var(--gutter) 0;
  padding: 16px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--line);
}

.ask p {
  font-weight: 600;
}
</style>
