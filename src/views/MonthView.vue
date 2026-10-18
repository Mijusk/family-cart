<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import CalendarTabs from '@/components/CalendarTabs.vue'
import GroupSwitcher from '@/components/GroupSwitcher.vue'
import { useSwipe } from '@/composables/swipe'
import { timeLabel } from '@/lib/eventText'
import { useCalendarStore } from '@/stores/calendar'
import { useGroupStore } from '@/stores/group'
import {
  addDays,
  addMonths,
  dayOfMonth,
  daysBetween,
  isIsoDate,
  longDay,
  monthLabel,
  startOfMonth,
  startOfWeek,
  today,
  WEEKDAY_INITIALS,
} from '@/utils/days'

// "Mes": only what happens once (one-off events and days changed by an exception), so a month
// of daily routines doesn't bury it. ?mes=YYYY-MM-DD is any day of the month.

const groupStore = useGroupStore()
const calendar = useCalendarStore()
const route = useRoute()
const router = useRouter()

const month = computed(() => startOfMonth(isIsoDate(route.query.mes) ? route.query.mes : today()))
const isThisMonth = computed(() => month.value === startOfMonth(today()))

/** Whole weeks, Monday to Sunday, from the one holding the 1st to the one holding the last day. */
const weeks = computed(() => {
  const first = startOfWeek(month.value)
  const last = addDays(addMonths(month.value, 1), -1)
  const count = daysBetween(first, startOfWeek(last)) / 7 + 1
  return Array.from({ length: count }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)))
})

/** The day tapped (?dia=), kept in the URL so it is still open when coming back from an event. */
const selected = computed({
  get: () => (isIsoDate(route.query.dia) && route.query.dia.startsWith(month.value.slice(0, 7)) ? route.query.dia : null),
  set: (day: string | null) => void router.replace({ query: { ...(isThisMonth.value ? {} : { mes: month.value }), ...(day ? { dia: day } : {}) } }),
})

function moveMonth(n: number) {
  return router.replace({ query: { mes: addMonths(month.value, n) } })
}

const swipeArea = ref<HTMLElement | null>(null)
const slide = useSwipe(swipeArea, moveMonth)

watch(
  () => groupStore.group.id,
  (id) => calendar.load(id).catch(() => {}),
  { immediate: true },
)

const memberPeople = computed(() => new Set(groupStore.activeMembers.map((m) => m.personId)))

/** What happens once that starts on `day`. */
function onceOn(day: string) {
  return calendar
    .occurrencesOn(day)
    .filter((o) => o.date === day && (!o.repeating || o.modified))
    .filter((o) => calendar.peopleOf(o).some((id) => memberPeople.value.has(id)))
}

const cells = computed(() =>
  Object.fromEntries(weeks.value.flat().map((day) => [day, calendar.status === 'ready' ? onceOn(day) : []])),
)

const chosenItems = computed(() => (selected.value ? (cells.value[selected.value] ?? []) : []))

function ownerName(id: string): string {
  const member = groupStore.activeMembers.find((m) => m.personId === id)
  return member ? (groupStore.isMe(member.id) ? 'Tú' : member.name) : calendar.personName(id, 'Tú')
}

function label(day: string): string {
  const n = cells.value[day]?.length ?? 0
  return `${longDay(day)}${n ? `, ${n} ${n === 1 ? 'evento' : 'eventos'}` : ''}`
}
</script>

<template>
  <div class="page swipe-page">
    <header class="page-header">
      <p class="eyebrow">Calendario</p>
      <GroupSwitcher />
    </header>

    <CalendarTabs />

    <nav class="month-nav" aria-label="Cambiar de mes">
      <button type="button" class="icon-btn" aria-label="Mes anterior" @click="slide(-1)"><AppIcon name="prev" /></button>
      <span class="month-label">
        <strong>{{ monthLabel(month) }}</strong>
      </span>
      <button type="button" class="icon-btn" aria-label="Mes siguiente" @click="slide(1)"><AppIcon name="next" /></button>
    </nav>
    <p v-if="!isThisMonth" class="center">
      <button type="button" class="link" @click="router.replace({ query: {} })">Volver a este mes</button>
    </p>

    <p v-if="calendar.status === 'loading'" class="state muted">Cargando…</p>
    <div v-else-if="calendar.status === 'error'" class="state">
      <p class="muted">No se pudo cargar el calendario.</p>
      <button type="button" class="btn btn-ghost" @click="calendar.load(groupStore.group.id).catch(() => {})">Reintentar</button>
    </div>

    <div v-else ref="swipeArea" class="appear">
      <div class="grid" role="grid" :aria-label="monthLabel(month)">
        <div class="head" role="row">
          <span v-for="(w, i) in WEEKDAY_INITIALS" :key="i" role="columnheader">{{ w }}</span>
        </div>
        <div v-for="(week, w) in weeks" :key="w" class="week" role="row">
          <button
            v-for="day in week"
            :key="day"
            type="button"
            class="cell"
            role="gridcell"
            :class="{ outside: !day.startsWith(month.slice(0, 7)), today: day === today(), selected: day === selected }"
            :aria-label="label(day)"
            :aria-pressed="day === selected"
            @click="selected = day === selected ? null : day"
          >
            <span class="num">{{ dayOfMonth(day) }}</span>
            <span class="dots" aria-hidden="true">
              <span v-for="o in (cells[day] ?? []).slice(0, 3)" :key="o.key" class="dot" :style="{ background: o.color }" />
              <span v-if="(cells[day]?.length ?? 0) > 3" class="more">+</span>
            </span>
          </button>
        </div>
      </div>
      <p class="hint muted">Aquí solo salen los eventos de un día concreto. Lo que se repite está en Hoy y Semana.</p>

      <section v-if="selected" class="chosen" :aria-label="longDay(selected)">
        <h2 class="chosen-head">
          <RouterLink :to="{ name: 'calendar', query: { dia: selected } }">{{ longDay(selected) }}</RouterLink>
        </h2>
        <ul class="rows">
          <li v-if="!chosenItems.length" class="nothing muted">Nada puntual este día</li>
          <li v-for="o in chosenItems" :key="o.key">
            <span v-if="o.busy" class="occurrence busy">
              <span class="bar" :style="{ background: o.color }" />
              <span class="when">{{ timeLabel(o, selected) }}</span>
              <span class="what"><span class="title">Ocupado</span><span class="muted who">{{ ownerName(o.ownerId) }}</span></span>
            </span>
            <RouterLink v-else :to="{ name: 'event', params: { id: o.eventId }, query: { dia: o.seriesDate } }" class="occurrence">
              <span class="bar" :style="{ background: o.color }" />
              <span class="when">{{ timeLabel(o, selected) }}</span>
              <span class="what"><span class="title">{{ o.title }}</span><span class="muted who">{{ ownerName(o.ownerId) }}</span></span>
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>

    <div class="dock">
      <RouterLink :to="{ name: 'event-new', query: { dia: selected ?? (isThisMonth ? today() : month) } }" class="btn btn-primary btn-block">
        <AppIcon name="plus" />
        Nuevo evento
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.month-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 calc(var(--gutter) - 8px);
}

.month-label {
  flex: 1;
  text-align: center;
}

.month-label strong {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
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

.state {
  display: grid;
  justify-items: center;
  gap: 12px;
  margin: 32px var(--gutter);
  text-align: center;
}

.grid {
  margin: 12px calc(var(--gutter) - 8px) 0;
}

.head,
.week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.head span {
  padding: 6px 0;
  text-align: center;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-2);
}

.cell {
  display: grid;
  grid-template-rows: auto 1fr;
  justify-items: center;
  gap: 4px;
  min-height: 56px;
  padding: 6px 2px;
  border-radius: var(--radius);
  color: var(--text);
}

.cell.outside {
  color: var(--text-2);
  opacity: 0.55;
}

.cell.today .num {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  margin: -4px 0;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-weight: 700;
}

.cell.selected {
  background: var(--primary-soft);
}

.num {
  font-size: 0.9375rem;
  font-variant-numeric: tabular-nums;
}

.dots {
  display: flex;
  align-items: center;
  gap: 3px;
  min-height: 8px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.more {
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  color: var(--text-2);
}

.hint {
  margin: 12px var(--gutter) 0;
  font-size: 0.875rem;
}

.chosen-head {
  padding: 20px var(--gutter) 6px;
  font-size: 1rem;
  font-weight: 700;
}

.chosen-head a {
  color: inherit;
  text-decoration: none;
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
</style>
