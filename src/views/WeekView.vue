<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import CalendarTabs from '@/components/CalendarTabs.vue'
import GroupSwitcher from '@/components/GroupSwitcher.vue'
import { useSwipe } from '@/composables/swipe'
import { timeLabel } from '@/lib/eventText'
import { HOUR_PX, timeline } from '@/lib/timeline'
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
  return router.replace({ query: { ...route.query, semana: addDays(weekStart.value, n * 7) } })
}

const swipeArea = ref<HTMLElement | null>(null)
const slide = useSwipe(swipeArea, moveWeek)

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
    calendar.ensureLoaded(id).catch(() => {})
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
  days.value.map((day) => {
    const items = calendar.occurrencesOn(day).filter(shows)
    return { day, items, allDay: items.filter((o) => o.allDay), scale: timeline(items, day) }
  }),
)

// The current time, as a line across today's scale.
const now = ref(new Date())
const clock = setInterval(() => (now.value = new Date()), 60_000)
onUnmounted(() => clearInterval(clock))
const nowMinute = computed(() => now.value.getHours() * 60 + now.value.getMinutes())
const nowLabel = computed(() => `${String(now.value.getHours()).padStart(2, '0')}:${String(now.value.getMinutes()).padStart(2, '0')}`)

/** How much a block has room to say. */
function fits(height: number): { time: boolean; who: boolean } {
  return { time: height >= HOUR_PX * 0.75, who: height >= HOUR_PX * 1.25 }
}

/** The time in a block: as in the lists, without the spaces, so it fits a narrow column. */
function blockTime(o: Parameters<typeof timeLabel>[0], day: string): string {
  return timeLabel(o, day).replace(' – ', '–')
}

function freeLabel(minutes: number): string {
  return `${minutes / 60} h libres`
}

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
  <div class="page swipe-page">
    <header class="page-header">
      <p class="eyebrow">Calendario</p>
      <GroupSwitcher />
    </header>

    <CalendarTabs />

    <nav class="week-nav" aria-label="Cambiar de semana">
      <button type="button" class="icon-btn" aria-label="Semana anterior" @click="slide(-1)"><AppIcon name="prev" /></button>
      <span class="week-label">
        <strong>{{ isThisWeek ? 'Esta semana' : weekLabel }}</strong>
        <span v-if="isThisWeek" class="muted">{{ weekLabel }}</span>
      </span>
      <button type="button" class="icon-btn" aria-label="Semana siguiente" @click="slide(1)"><AppIcon name="next" /></button>
    </nav>
    <p v-if="!isThisWeek" class="center">
      <button type="button" class="link" @click="thisWeek">Volver a esta semana</button>
    </p>

    <div class="filters" role="group" aria-label="Filtros">
      <button
        v-for="m in members"
        :key="m.id"
        type="button"
        class="choice"
        :aria-pressed="people.has(m.personId)"
        @click="people = toggle(people, m.personId)"
      >
        <AppIcon v-if="people.has(m.personId)" name="check" :size="16" />
        <span class="swatch" :style="{ background: m.color }" />{{ groupStore.isMe(m.id) ? 'Tú' : m.name }}
      </button>
    </div>
    <div v-if="availableFolders.length" class="filters" role="group" aria-label="Carpetas">
      <button
        v-for="c in availableFolders"
        :key="c.id"
        type="button"
        class="choice"
        :aria-pressed="activeFolders.has(c.id)"
        @click="folders = toggle(folders, c.id)"
      >
        <AppIcon v-if="activeFolders.has(c.id)" name="check" :size="16" />
        <span class="swatch folder" :style="{ background: c.color }" />{{ c.name }}
      </button>
    </div>
    <p v-if="filtered" class="center"><button type="button" class="link" @click="clearFilters">Quitar filtros</button></p>

    <p v-if="calendar.status === 'loading'" class="state muted">Cargando…</p>
    <div v-else-if="calendar.status === 'error'" class="state">
      <p class="muted">No se pudo cargar el calendario.</p>
      <button type="button" class="btn btn-ghost" @click="calendar.load(groupStore.group.id).catch(() => {})">Reintentar</button>
    </div>

    <div v-else ref="swipeArea" class="appear">
      <section v-for="d in week" :key="d.day" class="day" :class="{ past: d.day < today() }" :data-day="d.day" :aria-label="longDay(d.day)">
        <h2 class="day-head" :class="{ today: d.day === today() }">
          <RouterLink :to="{ name: 'calendar', query: { dia: d.day } }">{{ longDay(d.day) }}</RouterLink>
        </h2>
        <p v-if="!d.items.length" class="nothing muted">Nada</p>
        <div v-else class="sheet">
          <ul v-if="d.allDay.length" class="all-day">
            <li v-for="o in d.allDay" :key="o.key">
              <span v-if="o.busy" class="chip busy" :style="{ background: o.color }">Ocupado · {{ ownerName(o.ownerId) }}</span>
              <RouterLink v-else :to="{ name: 'event', params: { id: o.eventId }, query: { dia: o.seriesDate } }" class="chip" :style="{ background: o.color }">
                {{ o.title }} · {{ ownerName(o.ownerId) }}
              </RouterLink>
            </li>
          </ul>
          <div v-if="d.scale.height" class="scale" :style="{ height: `${d.scale.height}px` }">
            <template v-for="h in d.scale.hours" :key="h.top">
              <span class="hour" :style="{ top: `${h.top}px` }">{{ h.label }}</span>
              <span class="hour-line" :style="{ top: `${h.top}px` }" />
            </template>
            <span v-for="g in d.scale.gaps" :key="g.top" class="gap muted" :style="{ top: `${g.top}px` }">
              <span aria-hidden="true">· · ·</span>{{ freeLabel(g.minutes) }}
            </span>
            <div class="blocks">
              <template v-for="b in d.scale.blocks" :key="d.items[b.item]!.key">
                <template v-for="o in [d.items[b.item]!]" :key="o.key">
                  <span
                    v-if="o.busy"
                    class="block busy"
                    :style="{ top: `${b.top}px`, height: `${b.height}px`, left: `${(b.column / b.columns) * 100}%`, width: `${100 / b.columns}%`, background: o.color }"
                  >
                    <strong>Ocupado</strong>
                    <span v-if="fits(b.height).time">{{ blockTime(o, d.day) }}</span>
                    <span v-if="fits(b.height).who">{{ ownerName(o.ownerId) }}</span>
                  </span>
                  <RouterLink
                    v-else
                    :to="{ name: 'event', params: { id: o.eventId }, query: { dia: o.seriesDate } }"
                    class="block"
                    :style="{ top: `${b.top}px`, height: `${b.height}px`, left: `${(b.column / b.columns) * 100}%`, width: `${100 / b.columns}%`, background: o.color }"
                  >
                    <strong>{{ o.title }}</strong>
                    <span v-if="fits(b.height).time">{{ blockTime(o, d.day) }}</span>
                    <span v-if="fits(b.height).who">{{ ownerName(o.ownerId) }}</span>
                  </RouterLink>
                </template>
              </template>
            </div>
            <template v-if="d.day === today() && d.scale.at(nowMinute) !== null">
              <span class="now-label" :style="{ top: `${d.scale.at(nowMinute)}px` }">{{ nowLabel }}</span>
              <span class="now-line" :style="{ top: `${d.scale.at(nowMinute)}px` }" />
            </template>
          </div>
        </div>
      </section>
    </div>

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

.swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.choice[aria-pressed='true'] .swatch {
  box-shadow: 0 0 0 2px #fff;
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

/* Days already gone stay readable but step back, so what is left of the week stands out. */
.day.past .day-head a,
.day.past .sheet,
.day.past .nothing {
  opacity: 0.5;
}

.nothing {
  padding: 6px var(--gutter);
  font-size: 0.9375rem;
}

/* ── Time scale (src/lib/timeline.ts) ── */

.sheet {
  --axis: 44px;
  background: var(--surface);
  border-block: 1px solid var(--line);
}

@media (min-width: 592px) {
  .sheet {
    border-inline: 1px solid var(--line);
    border-radius: var(--radius);
  }
}

.all-day {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 8px var(--gutter) 0 calc(var(--gutter) + var(--axis));
  list-style: none;
}

.chip {
  display: block;
  padding: 3px 8px;
  border-radius: 6px;
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
  text-decoration: none;
}

.scale {
  position: relative;
  margin: 0 var(--gutter) 0 calc(var(--gutter) - 6px);
}

.hour {
  position: absolute;
  left: 0;
  width: calc(var(--axis) - 8px);
  margin-top: -0.45rem;
  text-align: right;
  font-size: 0.6875rem;
  line-height: 0.9rem;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.hour-line {
  position: absolute;
  left: var(--axis);
  right: 0;
  border-top: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
}

.gap {
  position: absolute;
  left: 0;
  right: 0;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 0.75rem;
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--bg) 70%, transparent) 0 6px, transparent 6px 12px);
  border-radius: 6px;
}

.gap span {
  letter-spacing: 0.3em;
}

.blocks {
  position: absolute;
  inset: 0 0 0 var(--axis);
}

.block {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 7px;
  border-radius: 8px;
  /* A white edge keeps neighbours apart. */
  box-shadow: 0 0 0 1.5px var(--surface);
  overflow: hidden;
  color: #fff;
  text-decoration: none;
  line-height: 1.25;
}

.block strong {
  font-size: 0.8125rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.block span {
  font-size: 0.75rem;
  opacity: 0.92;
  /* One line; in a narrow column the end time gives way first. */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

.block.busy {
  opacity: 0.5;
}

a.block:hover {
  filter: brightness(1.08);
}

.now-line {
  position: absolute;
  left: calc(var(--axis) - 4px);
  right: 0;
  border-top: 2px solid var(--late);
  pointer-events: none;
}

.now-line::before {
  content: '';
  position: absolute;
  left: -4px;
  top: -5px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--late);
}

.now-label {
  position: absolute;
  left: 0;
  width: calc(var(--axis) - 8px);
  margin-top: -0.45rem;
  text-align: right;
  font-size: 0.6875rem;
  line-height: 0.9rem;
  font-weight: 700;
  color: var(--late);
  background: var(--surface);
  font-variant-numeric: tabular-nums;
}
</style>
