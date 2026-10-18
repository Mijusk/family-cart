<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import CalendarTabs from '@/components/CalendarTabs.vue'
import GroupSwitcher from '@/components/GroupSwitcher.vue'
import PersonAvatar from '@/components/PersonAvatar.vue'
import { useSwipe } from '@/composables/swipe'
import { timeLabel } from '@/lib/eventText'
import { useCalendarStore } from '@/stores/calendar'
import { useGroupStore } from '@/stores/group'
import { addDays, isIsoDate, longDay, relativeDay, today } from '@/utils/days'

// "Hoy": what each person of the group has on one day. ?dia=YYYY-MM-DD moves to another day.

const groupStore = useGroupStore()
const calendar = useCalendarStore()
const route = useRoute()
const router = useRouter()

const day = computed(() => (isIsoDate(route.query.dia) ? route.query.dia : today()))
const isToday = computed(() => day.value === today())

function moveDay(n: number) {
  void router.replace({ query: { dia: addDays(day.value, n) } })
}

useSwipe(moveDay)

function backToToday() {
  void router.replace({ query: {} })
}

watch(
  () => groupStore.group.id,
  (id) => calendar.ensureLoaded(id).catch(() => {}),
  { immediate: true },
)

/** The active members of the group with something that day, me first, with what they have. */
const rows = computed(() => {
  const occurrences = calendar.occurrencesOn(day.value)
  const members = [...groupStore.activeMembers].sort((a, b) => Number(groupStore.isMe(b.id)) - Number(groupStore.isMe(a.id)))
  return members
    .map((member) => ({
      member,
      items: occurrences.filter((o) => calendar.peopleOf(o).includes(member.personId)),
    }))
    .filter((row) => row.items.length)
})
</script>

<template>
  <div class="page">
    <header class="page-header">
      <p class="eyebrow">Calendario</p>
      <GroupSwitcher />
    </header>

    <CalendarTabs />

    <nav class="day-nav" aria-label="Cambiar de día">
      <button type="button" class="icon-btn" aria-label="Día anterior" @click="moveDay(-1)">
        <AppIcon name="prev" />
      </button>
      <span class="day-label">
        <strong>{{ relativeDay(day) }}</strong>
        <span v-if="relativeDay(day) !== longDay(day)" class="muted">{{ longDay(day) }}</span>
      </span>
      <button type="button" class="icon-btn" aria-label="Día siguiente" @click="moveDay(1)">
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

    <p v-else-if="!rows.length" class="state muted">Nadie tiene nada este día.</p>

    <template v-else>
      <section v-for="row in rows" :key="row.member.id" :aria-label="row.member.name">
        <h2 class="person">
          <PersonAvatar :name="row.member.name" :color="row.member.color" :size="28" />
          <span>{{ groupStore.isMe(row.member.id) ? 'Tú' : row.member.name }}</span>
        </h2>
        <ul class="rows">
          <li v-for="o in row.items" :key="o.key">
            <span v-if="o.busy" class="occurrence busy">
              <span class="bar" :style="{ background: o.color }" />
              <span class="when">{{ timeLabel(o, day) }}</span>
              <span class="what"><span class="title">Ocupado</span></span>
            </span>
            <RouterLink v-else :to="{ name: 'event', params: { id: o.eventId }, query: { dia: o.seriesDate } }" class="occurrence">
              <span class="bar" :style="{ background: o.color }" />
              <span class="when">{{ timeLabel(o, day) }}</span>
              <span class="what">
                <span class="title">{{ o.title }}</span>
                <span v-if="o.location" class="muted where">{{ o.location }}</span>
              </span>
              <AppIcon v-if="o.repeating" name="repeat" :size="16" class="repeat" />
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>

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

.person {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 22px var(--gutter) 8px;
  font-size: 1rem;
  font-weight: 700;
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

.where {
  font-size: 0.875rem;
}

.repeat {
  color: var(--text-2);
  flex-shrink: 0;
}
</style>
