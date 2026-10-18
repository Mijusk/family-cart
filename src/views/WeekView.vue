<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import CalendarTabs from '@/components/CalendarTabs.vue'
import GroupSwitcher from '@/components/GroupSwitcher.vue'
import { timeLabel } from '@/lib/eventText'
import { useCalendarStore } from '@/stores/calendar'
import { useGroupStore } from '@/stores/group'
import { addDays, isIsoDate, longDay, shortDay, startOfWeek, today } from '@/utils/days'

// "Semana": the chosen group's week, Monday to Sunday. ?semana=YYYY-MM-DD is any day of the week.
// Filters by person and by folder narrow it down; none selected means everyone and every folder.
// They live in the URL (?personas=…&carpetas=…), so coming back from an event keeps them.

const groupStore = useGroupStore()
const calendar = useCalendarStore()
const route = useRoute()
const router = useRouter()

const weekStart = computed(() => startOfWeek(isIsoDate(route.query.semana) ? route.query.semana : today()))
const days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart.value, i)))
const isThisWeek = computed(() => weekStart.value === startOfWeek(today()))

const weekLabel = computed(() => `${shortDay(weekStart.value)} – ${shortDay(addDays(weekStart.value, 6))}`)

function moveWeek(n: number) {
  void router.replace({ query: { ...route.query, semana: addDays(weekStart.value, n * 7) } })
}

function thisWeek() {
  const { semana: _, ...rest } = route.query
  void router.replace({ query: rest })
}

// ── Filters ───────────────────────────────────────────────────

/** A set of ids kept in a query parameter as a comma-separated list. */
function queryIds(key: 'personas' | 'carpetas') {
  return computed({
    get: () => new Set(typeof route.query[key] === 'string' && route.query[key] ? route.query[key].split(',') : []),
    set: (ids: Set<string>) => {
      const { [key]: _, ...rest } = route.query
      void router.replace({ query: ids.size ? { ...rest, [key]: [...ids].join(',') } : rest })
    },
  })
}

const people = queryIds('personas')
const folders = queryIds('carpetas')

watch(
  () => groupStore.group.id,
  (id, before) => {
    // Another group: its people and folders are others.
    if (before && id !== before) void router.replace({ query: {} })
    calendar.load(id).catch(() => {})
  },
  { immediate: true },
)

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  if (!next.delete(id)) next.add(id)
  return next
}

const members = computed(() =>
  [...groupStore.activeMembers].sort((a, b) => Number(groupStore.isMe(b.id)) - Number(groupStore.isMe(a.id))),
)
const memberPeople = computed(() => new Set(members.value.map((m) => m.personId)))

/** Folders of the people on view. */
const availableFolders = computed(() =>
  calendar.calendars
    .filter((c) => (people.value.size ? people.value.has(c.ownerId) : memberPeople.value.has(c.ownerId)))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
)
const activeFolders = computed(() => new Set(availableFolders.value.filter((c) => folders.value.has(c.id)).map((c) => c.id)))

function shows(o: ReturnType<typeof calendar.occurrencesOn>[number]): boolean {
  const who = calendar.peopleOf(o)
  if (!who.some((id) => memberPeople.value.has(id))) return false
  if (people.value.size && !who.some((id) => people.value.has(id))) return false
  if (activeFolders.value.size) {
    // A busy slot has no folder to match.
    const event = o.busy ? undefined : calendar.eventById(o.eventId)
    if (!event || !activeFolders.value.has(event.calendarId)) return false
  }
  return true
}

const week = computed(() =>
  days.value.map((day) => ({ day, items: calendar.occurrencesOn(day).filter(shows) })),
)

const filtered = computed(() => people.value.size > 0 || activeFolders.value.size > 0)

function clearFilters() {
  const { personas: _p, carpetas: _c, ...rest } = route.query
  void router.replace({ query: rest })
}

function ownerName(id: string): string {
  const member = groupStore.activeMembers.find((m) => m.personId === id)
  return member ? (groupStore.isMe(member.id) ? 'Tú' : member.name) : calendar.personName(id, 'Tú')
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <p class="eyebrow">Calendario</p>
      <GroupSwitcher />
    </header>

    <CalendarTabs />

    <nav class="week-nav" aria-label="Cambiar de semana">
      <button type="button" class="icon-btn" aria-label="Semana anterior" @click="moveWeek(-1)"><AppIcon name="prev" /></button>
      <span class="week-label">
        <strong>{{ isThisWeek ? 'Esta semana' : weekLabel }}</strong>
        <span v-if="isThisWeek" class="muted">{{ weekLabel }}</span>
      </span>
      <button type="button" class="icon-btn" aria-label="Semana siguiente" @click="moveWeek(1)"><AppIcon name="next" /></button>
    </nav>
    <p v-if="!isThisWeek" class="center">
      <button type="button" class="link" @click="thisWeek">Volver a esta semana</button>
    </p>

    <div class="filters" role="group" aria-label="Filtros">
      <button
        v-for="m in members"
        :key="m.id"
        type="button"
        class="chip"
        :class="{ on: people.has(m.personId) }"
        :aria-pressed="people.has(m.personId)"
        @click="people = toggle(people, m.personId)"
      >
        <span class="swatch" :style="{ background: m.color }" />{{ groupStore.isMe(m.id) ? 'Tú' : m.name }}
      </button>
    </div>
    <div v-if="availableFolders.length" class="filters" role="group" aria-label="Carpetas">
      <button
        v-for="c in availableFolders"
        :key="c.id"
        type="button"
        class="chip"
        :class="{ on: activeFolders.has(c.id) }"
        :aria-pressed="activeFolders.has(c.id)"
        @click="folders = toggle(folders, c.id)"
      >
        <span class="swatch folder" :style="{ background: c.color }" />{{ c.name }}
      </button>
    </div>
    <p v-if="filtered" class="center"><button type="button" class="link" @click="clearFilters">Quitar filtros</button></p>

    <p v-if="calendar.status === 'loading'" class="state muted">Cargando…</p>
    <div v-else-if="calendar.status === 'error'" class="state">
      <p class="muted">No se pudo cargar el calendario.</p>
      <button type="button" class="btn btn-ghost" @click="calendar.load(groupStore.group.id).catch(() => {})">Reintentar</button>
    </div>

    <template v-else>
      <section v-for="d in week" :key="d.day" class="day" :data-day="d.day" :aria-label="longDay(d.day)">
        <h2 class="day-head" :class="{ today: d.day === today() }">
          <RouterLink :to="{ name: 'calendar', query: { dia: d.day } }">{{ longDay(d.day) }}</RouterLink>
        </h2>
        <ul class="rows">
          <li v-if="!d.items.length" class="nothing muted">Nada</li>
          <li v-for="o in d.items" :key="o.key">
            <span v-if="o.busy" class="occurrence busy">
              <span class="bar" :style="{ background: o.color }" />
              <span class="when">{{ timeLabel(o, d.day) }}</span>
              <span class="what">
                <span class="title">Ocupado</span>
                <span class="muted who">{{ ownerName(o.ownerId) }}</span>
              </span>
            </span>
            <RouterLink v-else :to="{ name: 'event', params: { id: o.eventId }, query: { dia: o.seriesDate } }" class="occurrence">
              <span class="bar" :style="{ background: o.color }" />
              <span class="when">{{ timeLabel(o, d.day) }}</span>
              <span class="what">
                <span class="title">{{ o.title }}</span>
                <span class="muted who">{{ ownerName(o.ownerId) }}</span>
              </span>
              <AppIcon v-if="o.repeating" name="repeat" :size="16" class="repeat" />
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>

    <div class="dock">
      <RouterLink :to="{ name: 'event-new', query: { dia: today() >= weekStart && today() <= addDays(weekStart, 6) ? today() : weekStart } }" class="btn btn-primary btn-block">
        <AppIcon name="plus" />
        Nuevo evento
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.week-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 calc(var(--gutter) - 8px);
}

.week-label {
  flex: 1;
  display: grid;
  text-align: center;
  line-height: 1.25;
}

.week-label strong {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
}

.week-label .muted {
  font-size: 0.875rem;
}

.center {
  text-align: center;
}

.link {
  min-height: 40px;
  padding: 0 12px;
  color: var(--primary);
  font-weight: 600;
  font-size: 0.9375rem;
}

.filters {
  display: flex;
  gap: 8px;
  padding: 8px var(--gutter);
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
  font-size: 0.9375rem;
}

.chip.on {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.swatch.folder {
  border-radius: 3px;
}

.state {
  display: grid;
  justify-items: center;
  gap: 12px;
  margin: 32px var(--gutter);
  text-align: center;
}

.day-head {
  /* Stays at the top while its day scrolls by, so a long day still says which one it is. */
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 20px var(--gutter) 6px;
  background: var(--bg);
  font-size: 1rem;
  font-weight: 700;
}

.day-head a {
  color: inherit;
  text-decoration: none;
}

.day-head.today a {
  color: var(--primary);
}

.nothing {
  padding: 6px var(--gutter);
  font-size: 0.9375rem;
}

.occurrence {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px var(--gutter);
  color: inherit;
  text-decoration: none;
}

a.occurrence:hover {
  background: var(--primary-soft);
}

.bar {
  align-self: stretch;
  width: 4px;
  border-radius: 2px;
  flex-shrink: 0;
}

.busy .bar {
  opacity: 0.45;
}

.when {
  width: 7.5rem;
  flex-shrink: 0;
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
}

.what {
  flex: 1;
  min-width: 0;
  display: grid;
}

.title {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.busy .title {
  font-weight: 500;
  color: var(--text-2);
}

.who {
  font-size: 0.875rem;
}

.repeat {
  color: var(--text-2);
  flex-shrink: 0;
}
</style>
