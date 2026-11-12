<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import CalendarTabs from '@/components/CalendarTabs.vue'
import DaySheet from '@/components/DaySheet.vue'
import GroupSwitcher from '@/components/GroupSwitcher.vue'
import { useSwipe } from '@/composables/swipe'
import { useCalendarStore } from '@/stores/calendar'
import { useGroupStore } from '@/stores/group'
import { addDays, isIsoDate, longDay, relativeDay, today } from '@/utils/days'

// "Hoy": what the group has on one day, as a time scale like each day of Semana. ?dia=YYYY-MM-DD moves to another day.

const groupStore = useGroupStore()
const calendar = useCalendarStore()
const route = useRoute()
const router = useRouter()

const day = computed(() => (isIsoDate(route.query.dia) ? route.query.dia : today()))
const isToday = computed(() => day.value === today())

function moveDay(n: number) {
  return router.replace({ query: { dia: addDays(day.value, n) } })
}

const swipeArea = ref<HTMLElement | null>(null)
const slide = useSwipe(swipeArea, moveDay)

function backToToday() {
  void router.replace({ query: {} })
}

watch(
  () => [groupStore.group.id, day.value] as const,
  ([id, shown]) => calendar.ensureLoaded(id, shown).catch(() => {}),
  { immediate: true },
)

const memberPeople = computed(() => new Set(groupStore.activeMembers.map((m) => m.personId)))

/** What the group's active members have that day, on one time scale as in Semana. */
const items = computed(() =>
  calendar
    .occurrencesOn(day.value)
    // A «Recordatorio» shows on its own day only (one at 23:50 doesn't run into the next).
    .filter((o) => calendar.peopleOf(o).some((id) => memberPeople.value.has(id)) && (!o.reminderOnly || o.date === day.value)),
)
const timed = computed(() => items.value.filter((o) => !o.reminderOnly))
const reminders = computed(() => items.value.filter((o) => o.reminderOnly))

function ownerName(id: string): string {
  const member = groupStore.activeMembers.find((m) => m.personId === id)
  return member ? (groupStore.isMe(member.id) ? 'Tú' : member.name) : calendar.personName(id, 'Tú')
}
</script>

<template>
  <div class="page swipe-page">
    <header class="page-header">
      <div class="title-row">
        <h1 class="page-title">Calendario</h1>
        <GroupSwitcher variant="pill" />
      </div>
    </header>

    <CalendarTabs />

    <nav class="day-nav" aria-label="Cambiar de día">
      <button type="button" class="icon-btn" aria-label="Día anterior" @click="slide(-1)">
        <AppIcon name="prev" />
      </button>
      <span class="day-label">
        <strong>{{ relativeDay(day) }}</strong>
        <span v-if="relativeDay(day) !== longDay(day)" class="muted">{{ longDay(day) }}</span>
      </span>
      <button type="button" class="icon-btn" aria-label="Día siguiente" @click="slide(1)">
        <AppIcon name="next" />
      </button>
    </nav>
    <p v-if="!isToday" class="to-today">
      <button type="button" class="link" @click="backToToday">Volver a hoy</button>
    </p>

    <p v-if="calendar.status === 'loading'" class="state muted">Cargando…</p>
    <div v-else-if="calendar.status === 'error'" class="state">
      <p class="muted">No se pudo cargar el calendario.</p>
      <button type="button" class="btn btn-ghost" @click="calendar.load(groupStore.group.id).catch(() => {})">Reintentar</button>
    </div>

    <div v-else ref="swipeArea" class="appear">
      <p v-if="!items.length" class="state muted">Nadie tiene nada este día.</p>
      <DaySheet v-else class="day-sheet" :day="day" :items="timed" :reminders="reminders" :owner-name="ownerName" />
    </div>

    <div class="dock">
      <RouterLink :to="{ name: 'event-new', query: { dia: day } }" class="btn btn-primary btn-block">
        <AppIcon name="plus" />
        Nuevo evento
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.day-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 calc(var(--gutter) - 8px);
}

.day-label {
  flex: 1;
  display: grid;
  text-align: center;
  line-height: 1.25;
}

.day-label strong {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
}

.day-label .muted {
  font-size: 0.875rem;
}

.to-today {
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

.day-sheet {
  margin-top: 12px;
}
</style>
