<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import PersonAvatar from '@/components/PersonAvatar.vue'
import { daysText, streakOf, type Streak } from '@/lib/streak'
import { goBack } from '@/router/back'
import { useGroupStore } from '@/stores/group'
import { useStretchingStore } from '@/stores/stretching'
import { WEEKDAY_INITIALS, longDay, today, weekday } from '@/utils/days'

// The fire in the header: the stretching streak of everyone in the group with an account, most
// days in a row first. Mine includes what still waits on this device. Docs: docs/estiramientos.md §4.

const groupStore = useGroupStore()
const stretching = useStretchingStore()

const others = computed(() => groupStore.activeMembers.filter((m) => m.hasAccount && m.personId !== groupStore.me?.id))

watch(
  () => [groupStore.me?.id, others.value.map((m) => m.personId).join()] as const,
  ([me]) => {
    if (me) void stretching.load()
    void stretching.loadFamily(others.value.map((m) => m.personId))
  },
  { immediate: true },
)

interface Row {
  id: string
  name: string
  color: string
  me: boolean
  streak: Streak
}

const rows = computed<Row[]>(() => {
  const me = groupStore.me
  const list: Row[] = others.value.map((m) => ({
    id: m.personId,
    name: m.name,
    color: m.color,
    me: false,
    streak: streakOf(stretching.familyDays[m.personId] ?? [], today()),
  }))
  if (me) list.push({ id: me.id, name: me.displayName, color: me.color, me: true, streak: stretching.streak })
  return list.sort((a, b) => b.streak.current - a.streak.current || b.streak.best - a.streak.best || a.name.localeCompare(b.name, 'es'))
})

const ready = computed(() => stretching.familyStatus === 'ready' && stretching.status === 'ready')
const failed = computed(() => stretching.familyStatus === 'error' || stretching.status === 'error')

function retry() {
  void stretching.load()
  void stretching.loadFamily(others.value.map((m) => m.personId))
}

const STATE_TEXT = { done: 'estiró', wildcard: 'comodín', missed: 'no estiró', today: 'hoy, aún no', future: '' } as const

function todayText(s: Streak): string {
  if (s.doneToday) return 'Hoy ya ha estirado'
  if (s.current > 0) return 'Hoy aún no'
  return s.best > 0 ? `Su mejor racha: ${daysText(s.best)}` : 'Aún sin racha'
}
</script>

<template>
  <div class="page tone-stretch">
    <header class="page-header">
      <button type="button" class="back-link" @click="goBack()"><AppIcon name="back" :size="18" /> Volver</button>
      <h1 class="display-title">Rachas</h1>
      <p class="muted">Los días seguidos estirando de cada uno en {{ groupStore.group.name }}.</p>
    </header>

    <p v-if="!ready && !failed" class="empty muted" aria-busy="true">Cargando…</p>
    <div v-else-if="failed && !ready" class="empty" role="alert">
      <p class="muted">No se han podido cargar las rachas.</p>
      <button type="button" class="btn btn-ghost" @click="retry">Reintentar</button>
    </div>

    <ul v-else class="people">
      <li v-for="r in rows" :key="r.id" class="row" :class="{ mine: r.me }">
        <div class="who">
          <PersonAvatar :name="r.name" :color="r.color" :size="40" />
          <span class="who-text">
            <span class="name">{{ r.me ? 'Tú' : r.name }}</span>
            <span class="muted small">
              {{ r.me ? (r.streak.doneToday ? 'Hoy ya has estirado' : r.streak.current ? 'Hoy aún no' : 'Aún sin racha') : todayText(r.streak) }}
            </span>
          </span>
          <span
            class="fire"
            :class="{ lit: r.streak.doneToday }"
            :aria-label="`${daysText(r.streak.current)} seguidos`"
          >
            <AppIcon name="flame" :size="22" />
            <span>{{ r.streak.current }}</span>
          </span>
        </div>
        <ol class="week" aria-label="Esta semana">
          <li
            v-for="d in r.streak.week"
            :key="d.day"
            :class="d.state"
            :aria-label="`${longDay(d.day)}${STATE_TEXT[d.state] ? `: ${STATE_TEXT[d.state]}` : ''}`"
          >
            <span class="dot">
              <AppIcon v-if="d.state === 'done'" name="check" :size="12" />
              <AppIcon v-else-if="d.state === 'wildcard'" name="shield" :size="11" />
            </span>
            <span class="initial" aria-hidden="true">{{ WEEKDAY_INITIALS[weekday(d.day) - 1] }}</span>
          </li>
        </ol>
      </li>
    </ul>

    <div v-if="ready" class="cta">
      <RouterLink :to="{ name: 'stretching' }" class="btn btn-primary btn-block">
        <AppIcon name="stretch" :size="20" /> {{ stretching.streak.doneToday ? 'Ir a Estiramientos' : 'Estirar ahora' }}
      </RouterLink>
      <p class="muted small">
        Cuenta cada día que alguien termina una rutina de estiramientos. Cada semana hay un comodín que salva un día
        sin estirar.
      </p>
    </div>
  </div>
</template>

<style scoped>
.people {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0 var(--gutter);
  list-style: none;
}

.row {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 18px;
  border: 1.5px solid var(--line);
  background: var(--surface);
}

.row.mine {
  border-color: var(--primary);
}

.who {
  display: flex;
  align-items: center;
  gap: 12px;
}

.who-text {
  display: grid;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.name {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fire {
  display: flex;
  align-items: center;
  gap: 3px;
  min-height: 36px;
  padding: 0 12px 0 9px;
  border-radius: 999px;
  background: var(--bg);
  color: var(--text-2);
  font-size: 1.125rem;
  font-weight: 800;
}

.fire.lit {
  background: var(--qty-soft);
  color: #c2581c;
}

.week {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.week li {
  display: grid;
  justify-items: center;
  gap: 2px;
}

.dot {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--line);
  background: var(--bg);
  color: #fff;
}

.done .dot {
  border-color: var(--primary);
  background: var(--primary);
}

.wildcard .dot {
  border-color: var(--qty);
  background: var(--qty-soft);
  color: var(--qty-ink);
}

.today .dot {
  border-color: var(--primary);
  border-style: dashed;
  background: var(--surface);
}

.future .dot {
  opacity: 0.5;
}

.initial {
  font-size: 0.6875rem;
  font-weight: 700;
  color: var(--text-2);
}

.cta {
  display: grid;
  gap: 10px;
  margin: 18px var(--gutter) 0;
}

.cta p {
  margin: 0;
}

.empty {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 32px var(--gutter);
  text-align: center;
}
</style>
