<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import {
  EXHALE_RANGE,
  INHALE_RANGE,
  MINUTES,
  PHRASES,
  SAFETY,
  categoryById,
  circleSize,
  cleanSettings,
  countAt,
  exerciseById,
  momentAt,
  nudge,
  phraseFor,
  roundOf,
  roundsIn,
  secondsText,
  stepAt,
  timingHints,
  type BreathSettings,
  type Exercise,
} from '@/lib/breathing'
import { goBack } from '@/router/back'

// One breathing exercise, full screen: set the times, then follow the circle. It never holds the
// breath; a short «Prepárate» first, and the last round always ends. Settings stay on the device.

const route = useRoute()
const exercise = computed<Exercise | undefined>(() => exerciseById(String(route.params.id)))
const category = computed(() => (exercise.value ? categoryById(exercise.value.category) : undefined))

function back() {
  const tipo = exercise.value && exercise.value.category !== 'relax' ? exercise.value.category : undefined
  goBack({ name: 'breathing', query: tipo ? { tipo } : {} })
}

// ── Settings, per exercise, on this device ───────────────────

const storageKey = (e: Exercise) => `family-app:breathing:${e.id}`

function readSettings(e: Exercise): BreathSettings {
  try {
    return cleanSettings(e, JSON.parse(localStorage.getItem(storageKey(e)) ?? 'null'))
  } catch {
    return cleanSettings(e, null)
  }
}

const settings = ref<BreathSettings>(exercise.value ? readSettings(exercise.value) : cleanSettings({} as Exercise, null))
watch(exercise, (e) => {
  if (e) settings.value = readSettings(e)
})
watch(
  settings,
  (s) => {
    if (!exercise.value) return
    try {
      localStorage.setItem(storageKey(exercise.value), JSON.stringify(s))
    } catch {
      // Private mode or full storage: the defaults come back next time.
    }
  },
  { deep: true },
)

const isDefault = computed(
  () => !!exercise.value && settings.value.inhale === exercise.value.inhale && settings.value.exhale === exercise.value.exhale,
)
function resetTimes() {
  if (!exercise.value) return
  settings.value = { ...settings.value, inhale: exercise.value.inhale, exhale: exercise.value.exhale }
}

/** What the chosen times are good for, updated as they change. */
const hints = computed(() => (exercise.value ? timingHints(exercise.value, settings.value) : []))

const outLabel = computed(() => (exercise.value?.visual === 'phrases' ? 'Hablar' : 'Soltar el aire'))

// ── The session ──────────────────────────────────────────────

const LEAD_IN = 3
type State = 'setup' | 'running' | 'paused' | 'done'
const state = ref<State>('setup')
/** Seconds since «Empezar», counting the lead-in (negative = still getting ready). */
const elapsed = ref(-LEAD_IN)
let startedAt = 0
let frame = 0
/** A different first sentence each session. */
const phraseStart = ref(0)

const round = computed(() => (exercise.value ? roundOf(exercise.value, settings.value) : []))
const rounds = computed(() => roundsIn(round.value, settings.value.minutes))
const moment = computed(() => (elapsed.value < 0 ? null : momentAt(round.value, rounds.value, elapsed.value)))
const preparing = computed(() => state.value !== 'setup' && elapsed.value < 0)

const phraseList = computed(() => PHRASES[settings.value.phrases])
const phrase = computed(() => phraseFor(phraseList.value, moment.value?.round ?? 0, phraseStart.value))

function tick(now: number) {
  elapsed.value = (now - startedAt) / 1000 - LEAD_IN
  if (elapsed.value >= 0 && !moment.value) {
    finish()
    return
  }
  frame = requestAnimationFrame(tick)
}

function start() {
  phraseStart.value = Math.floor(Math.random() * phraseList.value.length)
  elapsed.value = -LEAD_IN
  resume()
}

function resume() {
  startedAt = performance.now() - (elapsed.value + LEAD_IN) * 1000
  state.value = 'running'
  void keepAwake()
  frame = requestAnimationFrame(tick)
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

function again() {
  state.value = 'setup'
  elapsed.value = -LEAD_IN
}

// Hidden (another app, screen off): paused, so it doesn't run on without anyone.
function onVisibility() {
  if (document.visibilityState === 'hidden' && state.value === 'running') pause()
}
document.addEventListener('visibilitychange', onVisibility)

// The screen stays on while following the circle, where the browser allows it.
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

// ── What is drawn ────────────────────────────────────────────

/** 0.42 (empty) to 1 (full). */
const scale = computed(() => 0.42 + 0.58 * (moment.value ? circleSize(moment.value) : 0))
const kind = computed(() => moment.value?.phase.kind ?? null)

const phaseText = computed(() => {
  const e = exercise.value
  if (!e) return ''
  if (state.value === 'setup') return 'Cuando quieras'
  if (state.value === 'done') return 'Hecho'
  if (preparing.value) return 'Prepárate'
  switch (kind.value) {
    case 'inhale':
      return e.inhaleText
    case 'exhale':
    case 'speak':
      return e.exhaleText
    case 'rest':
      return 'Descansa, respira normal'
    default:
      return ''
  }
})

const counter = computed(() => {
  if (preparing.value) return String(Math.ceil(-elapsed.value))
  return moment.value ? String(moment.value.secondsLeft) : ''
})

/** Dots for the walking ones: the steps breathing in, then those breathing out. */
const dots = computed(() => {
  const e = exercise.value
  if (!e || e.visual !== 'steps') return []
  const inSteps = e.inhaleSteps ?? 2
  const outSteps = e.exhaleSteps ?? 4
  const m = moment.value
  const lit = !m ? -1 : m.phase.kind === 'inhale' ? stepAt(m.progress, inSteps) : inSteps + stepAt(m.progress, outSteps)
  return [
    ...Array.from({ length: inSteps }, (_, i) => ({ out: false, lit: i === lit, done: i < lit })),
    ...Array.from({ length: outSteps }, (_, i) => ({ out: true, lit: inSteps + i === lit, done: inSteps + i < lit })),
  ]
})

/** The bar of «sss»: fills breathing in, empties at an even pace breathing out. */
const barFill = computed(() => {
  const m = moment.value
  if (!m) return 0
  return m.phase.kind === 'inhale' ? m.progress : 1 - m.progress
})

const count = computed(() => (moment.value && kind.value === 'exhale' ? countAt(moment.value) : null))

const roundText = computed(() => (moment.value ? `${moment.value.round + 1} de ${rounds.value}` : ''))
const totalText = computed(() => {
  const seconds = Math.round(rounds.value * round.value.reduce((s, p) => s + p.seconds, 0))
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return sec ? `${min} min ${sec} s` : `${min} min`
})
</script>

<template>
  <div v-if="!exercise" class="page">
    <header class="page-header">
      <button type="button" class="back-link" @click="back"><AppIcon name="back" :size="18" /> Respiración</button>
      <h1 class="display-title">Este ejercicio no existe</h1>
    </header>
  </div>

  <div v-else class="session" :class="[`tone-${exercise.category}`, state]">
    <header class="top">
      <button type="button" class="back-link" @click="back"><AppIcon name="back" :size="18" /> {{ category?.label }}</button>
      <h1 class="title">{{ exercise.title }}</h1>
    </header>

    <div class="stage" :class="[`v-${exercise.visual}`, kind]" aria-hidden="true">
      <div class="orb-wrap">
        <template v-if="exercise.visual === 'wave'">
          <span class="ring r1" /><span class="ring r2" /><span class="ring r3" />
        </template>
        <span class="halo" :style="{ transform: `scale(${scale})` }" />
        <span class="orb" :style="{ transform: `scale(${scale})` }" />
        <span class="orb-label">
          <span v-if="count !== null && exercise.visual === 'count'" class="big-number">{{ count }}</span>
          <span v-else-if="counter" class="countdown">{{ counter }}</span>
        </span>
      </div>

      <div v-if="exercise.visual === 'bar'" class="bar"><span :style="{ transform: `scaleX(${barFill})` }" /></div>

      <div v-if="exercise.visual === 'steps'" class="dots">
        <span v-for="(d, i) in dots" :key="i" class="step" :class="{ out: d.out, lit: d.lit, done: d.done }" />
      </div>
    </div>

    <div class="words" aria-live="polite">
      <p class="phase">{{ phaseText }}</p>
      <p v-if="exercise.visual === 'phrases' && state !== 'setup' && state !== 'done' && !preparing" class="phrase" :class="{ next: kind !== 'speak' }">
        <span v-if="kind !== 'speak'" class="muted">{{ kind === 'rest' ? 'Ahora:' : 'Vas a decir:' }}</span>
        «{{ phrase }}»
      </p>
      <p v-if="roundText" class="muted round">Respiración {{ roundText }}</p>
    </div>

    <!-- Before starting: how it goes and the times. -->
    <section v-if="state === 'setup'" class="panel">
      <ol class="how">
        <li v-for="step in exercise.steps" :key="step">{{ step }}</li>
      </ol>

      <div class="setting">
        <span class="label">Duración</span>
        <div class="choices">
          <button
            v-for="m in MINUTES"
            :key="m"
            type="button"
            class="choice"
            :aria-pressed="settings.minutes === m"
            @click="settings.minutes = m"
          >
            {{ m }} min
          </button>
        </div>
      </div>

      <div class="setting">
        <span class="label">Tomar aire</span>
        <div class="stepper">
          <button type="button" class="icon-btn" aria-label="Menos tiempo para tomar aire" :disabled="settings.inhale <= INHALE_RANGE[0]" @click="settings.inhale = nudge(settings.inhale, -1, INHALE_RANGE)">
            <AppIcon name="minus" />
          </button>
          <span class="value">{{ secondsText(settings.inhale) }}</span>
          <button type="button" class="icon-btn" aria-label="Más tiempo para tomar aire" :disabled="settings.inhale >= INHALE_RANGE[1]" @click="settings.inhale = nudge(settings.inhale, 1, INHALE_RANGE)">
            <AppIcon name="plus" />
          </button>
        </div>
      </div>

      <div class="setting">
        <span class="label">{{ outLabel }}</span>
        <div class="stepper">
          <button type="button" class="icon-btn" :aria-label="`Menos tiempo para ${outLabel.toLowerCase()}`" :disabled="settings.exhale <= EXHALE_RANGE[0]" @click="settings.exhale = nudge(settings.exhale, -1, EXHALE_RANGE)">
            <AppIcon name="minus" />
          </button>
          <span class="value">{{ secondsText(settings.exhale) }}</span>
          <button type="button" class="icon-btn" :aria-label="`Más tiempo para ${outLabel.toLowerCase()}`" :disabled="settings.exhale >= EXHALE_RANGE[1]" @click="settings.exhale = nudge(settings.exhale, 1, EXHALE_RANGE)">
            <AppIcon name="plus" />
          </button>
        </div>
      </div>

      <div class="hints" aria-live="polite">
        <p v-for="h in hints" :key="h.text" class="hint" :class="h.tone">
          <AppIcon name="spark" :size="18" />
          <span>{{ h.text }}</span>
        </p>
      </div>

      <div v-if="exercise.visual === 'phrases'" class="setting">
        <span class="label">Frases</span>
        <div class="choices">
          <button type="button" class="choice" :aria-pressed="settings.phrases === 'short'" @click="settings.phrases = 'short'">Cortas</button>
          <button type="button" class="choice" :aria-pressed="settings.phrases === 'long'" @click="settings.phrases = 'long'">Un poco más largas</button>
        </div>
      </div>

      <p class="muted small">
        Sin pausas para aguantar el aire. Unos {{ totalText }}.
        <button v-if="!isDefault" type="button" class="link" @click="resetTimes">Volver a los tiempos de siempre</button>
      </p>

      <button type="button" class="btn btn-primary btn-block start" @click="start">
        <AppIcon name="play" :size="20" /> Empezar
      </button>
    </section>

    <section v-else-if="state === 'done'" class="panel done">
      <p class="done-text">Bien hecho. Tómate un momento antes de seguir con lo tuyo.</p>
      <div class="actions">
        <button type="button" class="btn btn-ghost" @click="again">Otra vez</button>
        <button type="button" class="btn btn-primary" @click="back">Terminar</button>
      </div>
    </section>

    <div v-else class="controls">
      <button v-if="state === 'running'" type="button" class="btn btn-ghost" @click="pause"><AppIcon name="pause" :size="20" /> Pausa</button>
      <button v-else type="button" class="btn btn-primary" @click="resume"><AppIcon name="play" :size="20" /> Seguir</button>
      <button type="button" class="btn btn-ghost" @click="finish">Terminar</button>
    </div>

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
  gap: 18px;
  padding: 18px var(--gutter) 6px;
}

.orb-wrap {
  position: relative;
  display: grid;
  place-items: center;
  width: min(68vw, 280px);
  aspect-ratio: 1;
}

.orb-wrap > * {
  grid-area: 1 / 1;
}

.orb,
.halo {
  width: 100%;
  height: 100%;
  border-radius: 999px;
  will-change: transform;
}

.orb {
  background: radial-gradient(circle at 35% 30%, #fff 0, var(--tone-bright) 42%, var(--tone) 100%);
  box-shadow: 0 18px 50px color-mix(in srgb, var(--tone) 35%, transparent);
}

.halo {
  background: var(--tone-bright);
  opacity: 0.25;
  filter: blur(14px);
}

.orb-label {
  z-index: 1;
  color: #fff;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 6px rgb(0 0 0 / 0.18);
}

.countdown {
  font-size: 2.25rem;
  font-weight: 600;
  opacity: 0.9;
}

.big-number {
  font-family: var(--font-display);
  font-size: 4rem;
  font-weight: 600;
}

/* Pursed lips: soft rings leave the circle while breathing out. */
.ring {
  width: 60%;
  height: 60%;
  border-radius: 999px;
  border: 2px solid var(--tone-bright);
  opacity: 0;
}

.v-wave.exhale .ring {
  animation: ripple 2.4s ease-out infinite;
}

.v-wave.exhale .r2 {
  animation-delay: 0.8s;
}

.v-wave.exhale .r3 {
  animation-delay: 1.6s;
}

@keyframes ripple {
  from {
    transform: scale(0.8);
    opacity: 0.7;
  }
  to {
    transform: scale(1.7);
    opacity: 0;
  }
}

.bar {
  width: min(80vw, 320px);
  height: 14px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tone) 14%, var(--surface));
  overflow: hidden;
}

.bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--tone-bright), var(--tone));
  transform-origin: left;
}

.dots {
  display: flex;
  gap: 10px;
}

.step {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 2px solid var(--tone-bright);
  background: var(--surface);
  transition:
    background-color 0.2s,
    transform 0.2s;
}

.step.out {
  border-color: var(--tone);
}

.step.done {
  background: color-mix(in srgb, var(--tone-bright) 50%, var(--surface));
}

.step.lit {
  background: var(--tone);
  transform: scale(1.25);
}

.words {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 8px var(--gutter) 0;
  text-align: center;
}

.words p {
  margin: 0;
}

.phase {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text);
}

.phrase {
  max-width: 22em;
  padding: 12px 16px;
  border-radius: 16px;
  background: var(--surface);
  border: 1.5px solid var(--tone);
  font-size: 1.375rem;
  font-weight: 600;
  color: var(--tone);
  transition: opacity 0.3s;
}

.phrase.next {
  border-color: var(--line);
  font-size: 1.0625rem;
  color: var(--text-2);
}

.phrase .muted {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
}

.round {
  font-size: 0.875rem;
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

.how {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 22px;
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

.stepper {
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1.5px solid var(--line);
  border-radius: 999px;
}

.stepper .icon-btn {
  width: 44px;
  height: 44px;
}

.stepper .icon-btn:disabled {
  opacity: 0.35;
}

.value {
  min-width: 4ch;
  text-align: center;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.hints {
  display: grid;
  gap: 8px;
}

.hint {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--tone-soft);
  color: var(--text);
  font-size: 0.9375rem;
  line-height: 1.4;
}

.hint :deep(svg) {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--tone);
}

/* A nudge to change the times: the soft amber of the app, never red. */
.hint.care {
  background: var(--qty-soft);
}

.hint.care :deep(svg) {
  color: var(--qty-ink);
}

.small {
  margin: 0;
  font-size: 0.875rem;
}

.link {
  color: var(--primary);
  font-weight: 600;
  text-decoration: underline;
}

.start {
  margin-top: 4px;
}

.controls,
.actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 20px var(--gutter) 0;
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

@media (prefers-reduced-motion: reduce) {
  .v-wave.exhale .ring {
    animation: none;
  }
}
</style>
