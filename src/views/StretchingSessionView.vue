<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import StretchFigure from '@/components/StretchFigure.vue'
import {
  HOLD_CHOICES,
  ROUTINES,
  SAFETY,
  cleanHold,
  durationText,
  momentAt,
  nextStart,
  planLength,
  planOf,
  previousStart,
  routineById,
  type Routine,
} from '@/lib/stretching'
import { goBack } from '@/router/back'

// Following a routine, full screen: each stretch drawn big with its countdown, a few seconds to
// change between them seeing the next one, and pause, back and skip. The hold time stays on the device.

const route = useRoute()
const routine = computed<Routine | undefined>(() => routineById(String(route.params.id)))

function back() {
  const first = routine.value?.id === ROUTINES[0]!.id
  goBack({ name: 'stretching', query: routine.value && !first ? { rutina: routine.value.id } : {} })
}

// ── Hold time, per routine, on this device ───────────────────

const storageKey = (r: Routine) => `family-app:stretching:${r.id}`

function readHold(r: Routine | undefined): number {
  if (!r) return cleanHold(null)
  try {
    return cleanHold(JSON.parse(localStorage.getItem(storageKey(r)) ?? 'null'), r.defaultHold)
  } catch {
    return cleanHold(null, r.defaultHold)
  }
}

const hold = ref(readHold(routine.value))
watch(routine, (r) => (hold.value = readHold(r)))
watch(hold, (h) => {
  if (!routine.value) return
  try {
    localStorage.setItem(storageKey(routine.value), JSON.stringify({ hold: h }))
  } catch {
    // Private mode or full storage: the default comes back next time.
  }
})

// ── The session ──────────────────────────────────────────────

const plan = computed(() => (routine.value ? planOf(routine.value.stretches, hold.value) : []))
const total = computed(() => planLength(plan.value))

/** ?desde=N (from 1): the stretch chosen in the list; the session starts getting ready for it. */
const firstIndex = computed(() => {
  const n = Number(route.query.desde)
  const count = routine.value?.stretches.length ?? 0
  return Number.isInteger(n) && n >= 1 && n <= count ? n - 1 : 0
})
const startAt = computed(() => {
  const ready = plan.value.find((s) => s.kind !== 'hold' && s.index === firstIndex.value)
  return ready?.start ?? 0
})

type State = 'setup' | 'running' | 'paused' | 'done'
const state = ref<State>('setup')
const elapsed = ref(0)
let startedAt = 0
let frame = 0

const moment = computed(() => (state.value === 'setup' ? null : momentAt(plan.value, elapsed.value)))
const kind = computed(() => moment.value?.segment.kind ?? null)
const index = computed(() => moment.value?.segment.index ?? firstIndex.value)
const stretch = computed(() => routine.value?.stretches[index.value])
const upNext = computed(() => routine.value?.stretches[index.value + 1])

/** «El último se aguanta el doble», «Los de las muñecas y los muslos duran el doble»… */
const longText = computed(() => {
  const list = routine.value?.stretches ?? []
  const longs = list.filter((s) => s.long)
  if (!longs.length) return ''
  if (longs.length === 1 && list[list.length - 1] === longs[0]) return 'El último dura el doble.'
  const names = longs.map((s) => s.title.replace(/^De pie: /, '').toLowerCase())
  const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0]
  return `${names.length > 1 ? 'Los de' : 'El de'} ${joined} ${names.length > 1 ? 'duran' : 'dura'} el doble, para hacer los dos lados.`
})

function tick(now: number) {
  elapsed.value = (now - startedAt) / 1000
  if (!momentAt(plan.value, elapsed.value)) {
    finish()
    return
  }
  frame = requestAnimationFrame(tick)
}

function runFrom(seconds: number) {
  cancelAnimationFrame(frame)
  elapsed.value = seconds
  startedAt = performance.now() - seconds * 1000
  if (state.value === 'running') frame = requestAnimationFrame(tick)
}

function start() {
  state.value = 'running'
  runFrom(startAt.value)
  void keepAwake()
}

function resume() {
  state.value = 'running'
  runFrom(elapsed.value)
  void keepAwake()
}

function pause() {
  cancelAnimationFrame(frame)
  state.value = 'paused'
  void letSleep()
}

function finish() {
  cancelAnimationFrame(frame)
  state.value = 'done'
  void letSleep()
}

function skip() {
  const to = nextStart(plan.value, elapsed.value)
  if (to === null) finish()
  else runFrom(to)
}

function previous() {
  runFrom(previousStart(plan.value, elapsed.value))
}

function again() {
  state.value = 'setup'
  elapsed.value = 0
}

// Hidden (another app, screen off): paused, so it doesn't run on without anyone.
function onVisibility() {
  if (document.visibilityState === 'hidden' && state.value === 'running') pause()
}
document.addEventListener('visibilitychange', onVisibility)

// The screen stays on while following the routine, where the browser allows it.
let wakeLock: { release(): Promise<void> } | null = null
async function keepAwake() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }
    wakeLock = (await nav.wakeLock?.request('screen')) ?? null
  } catch {
    wakeLock = null
  }
}
async function letSleep() {
  try {
    await wakeLock?.release()
  } catch {
    // Already released by the browser.
  }
  wakeLock = null
}

onUnmounted(() => {
  cancelAnimationFrame(frame)
  document.removeEventListener('visibilitychange', onVisibility)
  void letSleep()
})

// ── What is shown ────────────────────────────────────────────

const RING = 2 * Math.PI * 44
/** The ring empties as the seconds go by. */
const ringOffset = computed(() => RING * (moment.value?.progress ?? 0))

const label = computed(() => {
  if (kind.value === 'ready') return 'Prepárate'
  if (kind.value === 'change') return 'Cambia de postura'
  return 'Aguanta'
})

const counterText = computed(() => {
  if (state.value === 'setup' || state.value === 'done' || !routine.value) return ''
  return `${index.value + 1} de ${routine.value.stretches.length}`
})
</script>

<template>
  <div v-if="!routine" class="page">
    <header class="page-header">
      <button type="button" class="back-link" @click="back"><AppIcon name="back" :size="18" /> Estiramientos</button>
      <h1 class="display-title">Esta rutina no existe</h1>
    </header>
  </div>

  <div v-else class="session tone-stretch" :class="[state, kind]">
    <header class="top">
      <button type="button" class="back-link" @click="back"><AppIcon name="back" :size="18" /> Estiramientos</button>
      <h1 class="title">{{ routine.title }}</h1>
    </header>

    <!-- Before starting: the hold time and the first stretch. -->
    <template v-if="state === 'setup'">
      <div class="stage">
        <StretchFigure class="figure" :pose="stretch!.pose" :title="stretch!.title" />
        <p class="stretch-title">{{ firstIndex ? `Desde: ${stretch!.title}` : routine.summary }}</p>
      </div>

      <section class="panel">
        <div class="setting">
          <span class="label">Cada estiramiento</span>
          <div class="choices">
            <button v-for="h in HOLD_CHOICES" :key="h" type="button" class="choice" :aria-pressed="hold === h" @click="hold = h">
              {{ h }} s
            </button>
          </div>
        </div>
        <p class="muted small">
          {{ routine.stretches.length }} estiramientos, unos {{ durationText(total) }} en total, con unos segundos para
          cambiar de postura entre uno y otro. {{ longText }}
        </p>
        <button type="button" class="btn btn-primary btn-block" @click="start">
          <AppIcon name="play" :size="20" /> Empezar
        </button>
      </section>
    </template>

    <section v-else-if="state === 'done'" class="panel done">
      <StretchFigure class="figure small-figure" :pose="routine.stretches[routine.cover]!.pose" />
      <p class="done-text">{{ routine.doneText }}</p>
      <div class="actions">
        <button type="button" class="btn btn-ghost" @click="again">Otra vez</button>
        <button type="button" class="btn btn-primary" @click="back">Terminar</button>
      </div>
    </section>

    <template v-else-if="stretch">
      <div class="stage" aria-live="polite">
        <p class="count muted">{{ counterText }}</p>
        <Transition name="swap" mode="out-in">
          <StretchFigure :key="stretch.id" class="figure" :pose="stretch.pose" :title="stretch.title" />
        </Transition>
        <h2 class="stretch-title">{{ stretch.title }}</h2>
        <p class="how">{{ stretch.how }}</p>
      </div>

      <div class="timer">
        <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="44" class="ring-track" />
          <circle cx="50" cy="50" r="44" class="ring-fill" :stroke-dasharray="RING" :stroke-dashoffset="ringOffset" />
        </svg>
        <span class="timer-text">
          <span class="seconds">{{ moment?.secondsLeft }}</span>
          <span class="timer-label">{{ label }}</span>
        </span>
      </div>

      <p v-if="kind === 'hold' && upNext" class="next muted">Siguiente: {{ upNext.title }}</p>
      <p v-else-if="kind === 'hold'" class="next muted">Es el último</p>

      <div class="controls">
        <button type="button" class="icon-btn round" aria-label="Anterior" @click="previous"><AppIcon name="prev" /></button>
        <button v-if="state === 'running'" type="button" class="btn btn-ghost" @click="pause"><AppIcon name="pause" :size="20" /> Pausa</button>
        <button v-else type="button" class="btn btn-primary" @click="resume"><AppIcon name="play" :size="20" /> Seguir</button>
        <button type="button" class="icon-btn round" aria-label="Saltar" @click="skip"><AppIcon name="next" /></button>
      </div>
      <button type="button" class="link end" @click="finish">Terminar ahora</button>
    </template>

    <p class="stop"><AppIcon name="info" :size="16" /> {{ SAFETY.stop }}</p>
  </div>
</template>

<style scoped>
.session {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding-bottom: calc(16px + var(--safe-bottom));
  background: linear-gradient(180deg, var(--tone-soft) 0%, var(--bg) 70%);
}

.top {
  display: grid;
  gap: 4px;
  padding: 20px var(--gutter) 0;
}

.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--tone);
}

.stage {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 12px var(--gutter) 0;
  text-align: center;
}

.figure {
  width: min(100%, 360px);
  border-radius: 16px;
  box-shadow: 0 10px 30px rgb(31 45 36 / 0.08);
}

.small-figure {
  width: min(70%, 220px);
  justify-self: center;
}

.change .figure {
  opacity: 0.75;
}

.count {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
}

.stretch-title {
  margin: 6px 0 0;
  font-family: var(--font-display);
  font-size: 1.375rem;
  font-weight: 600;
  color: var(--text);
}

.how {
  max-width: 26em;
  margin: 0;
  color: var(--text-2);
}

.timer {
  position: relative;
  display: grid;
  place-items: center;
  width: 112px;
  height: 112px;
  margin: 14px auto 0;
}

.timer > * {
  grid-area: 1 / 1;
}

.ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-track {
  fill: var(--surface);
  stroke: color-mix(in srgb, var(--tone) 14%, var(--surface));
  stroke-width: 8;
}

.ring-fill {
  fill: none;
  stroke: var(--tone);
  stroke-width: 8;
  stroke-linecap: round;
}

.ready .ring-fill,
.change .ring-fill {
  stroke: var(--qty);
}

.timer-text {
  position: relative;
  display: grid;
  justify-items: center;
  line-height: 1.1;
}

.seconds {
  font-family: var(--font-display);
  font-size: 2.25rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.timer-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-2);
}

.next {
  margin: 10px var(--gutter) 0;
  text-align: center;
  font-size: 0.9375rem;
}

.controls,
.actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 16px var(--gutter) 0;
}

.round {
  width: 52px;
  height: 52px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  background: var(--surface);
}

.end {
  align-self: center;
  margin-top: 10px;
}

.link {
  color: var(--text-2);
  font-weight: 600;
  text-decoration: underline;
}

.panel {
  display: grid;
  gap: 16px;
  margin: 16px var(--gutter) 0;
  padding: 18px 16px;
  border-radius: 20px;
  background: var(--surface);
  border: 1px solid var(--line);
}

.setting {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.label {
  font-weight: 700;
}

.small {
  margin: 0;
  font-size: 0.875rem;
}

.done .actions {
  padding: 0;
}

.done-text {
  margin: 0;
  text-align: center;
}

.stop {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: auto var(--gutter) 0;
  padding-top: 20px;
  font-size: 0.875rem;
  color: var(--text-2);
}

.stop :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
}

.swap-enter-active,
.swap-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.swap-enter-from {
  opacity: 0;
  transform: translateX(16px);
}

.swap-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}

@media (prefers-reduced-motion: reduce) {
  .swap-enter-active,
  .swap-leave-active {
    transition: none;
  }
}
</style>
