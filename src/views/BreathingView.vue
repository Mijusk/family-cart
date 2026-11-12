<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon, { type IconName } from '@/components/AppIcon.vue'
import { CATEGORIES, SAFETY, categoryById, exercisesOf, secondsText, type BreathCategory } from '@/lib/breathing'
import { pushState, type PushState } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import { useGroupStore } from '@/stores/group'
import { useToastStore } from '@/stores/toast'
import { friendlyError } from '@/utils/errors'

// Respiración, in the menu: gentle guided exercises by kind (to relax, for sport, for speech),
// with their tips, a daily reminder and what to keep in mind. Design notes: docs/respiracion.md.

const route = useRoute()
const router = useRouter()
const groupStore = useGroupStore()
const toast = useToastStore()

const ICONS: Record<BreathCategory, IconName> = { relax: 'leaf', sport: 'mountain', speech: 'voice' }

/** The kind on screen goes in the URL (?tipo=), so back and a reload keep it. */
const category = computed(() => categoryById(String(route.query.tipo ?? '')) ?? CATEGORIES[0]!)
const exercises = computed(() => exercisesOf(category.value.id))

function pick(id: BreathCategory) {
  void router.replace({ query: { ...route.query, tipo: id === 'relax' ? undefined : id } })
}

// ── Daily reminder ────────────────────────────────────────────

const DEFAULT_TIME = '20:00'
const reminder = computed(() => groupStore.me?.breathingReminderTime ?? null)
const time = ref(reminder.value ?? DEFAULT_TIME)
watch(reminder, (t) => {
  if (t) time.value = t
})
const saving = ref(false)
const push = ref<PushState | null>(null)
void pushState().then((state) => (push.value = state))

async function saveReminder(at: string | null) {
  const me = groupStore.me
  if (!me || saving.value) return
  saving.value = true
  try {
    // A time, or null to turn it off (the generated types only know the time).
    const { error } = await supabase.rpc('set_breathing_reminder', { at: at as string })
    if (error) throw error
    groupStore.me = { ...me, breathingReminderTime: at }
    toast.show(at ? `Te lo recordaremos cada día a las ${at}` : 'Recordatorio quitado')
  } catch (e) {
    toast.show(friendlyError(e))
  } finally {
    saving.value = false
  }
}

function onTimeChange() {
  if (/^\d{2}:\d{2}$/.test(time.value) && time.value !== reminder.value) void saveReminder(time.value)
}
</script>

<template>
  <div class="page" :class="`tone-${category.id}`">
    <header class="page-header">
      <p class="eyebrow">Respiración</p>
      <h1 class="display-title">Respira con calma</h1>
      <p class="muted">Ejercicios suaves y guiados, sin aguantar el aire. Elige para qué los quieres.</p>
    </header>

    <div class="kinds" role="tablist" aria-label="Para qué">
      <button
        v-for="c in CATEGORIES"
        :key="c.id"
        type="button"
        role="tab"
        class="kind"
        :class="`tone-${c.id}`"
        :aria-selected="c.id === category.id"
        @click="pick(c.id)"
      >
        <span class="kind-icon"><AppIcon :name="ICONS[c.id]" :size="26" /></span>
        {{ c.label }}
      </button>
    </div>

    <section class="hero" role="tabpanel" :aria-label="category.title">
      <div class="hero-text">
        <h2 class="hero-title">{{ category.title }}</h2>
        <p>{{ category.intro }}</p>
      </div>
      <span class="hero-orb" aria-hidden="true"><span /></span>
    </section>

    <h2 class="section-title"><span>Ejercicios</span></h2>
    <ul class="exercises">
      <li v-for="e in exercises" :key="e.id">
        <RouterLink :to="{ name: 'breathing-exercise', params: { id: e.id } }" class="exercise">
          <span class="exercise-icon"><AppIcon name="wind" :size="22" /></span>
          <span class="exercise-text">
            <span class="exercise-title">{{ e.title }}</span>
            <span class="exercise-summary">{{ e.summary }}</span>
            <span class="times">
              <span>Toma aire {{ secondsText(e.inhale) }}</span>
              <span>{{ e.visual === 'phrases' ? 'Habla' : 'Suelta' }} {{ secondsText(e.exhale) }}</span>
            </span>
          </span>
          <AppIcon name="next" :size="20" class="go" />
        </RouterLink>
      </li>
    </ul>

    <h2 class="section-title"><span>Consejos</span></h2>
    <ul class="card tips">
      <li v-for="tip in category.tips" :key="tip">
        <AppIcon name="check" :size="18" />
        <span>{{ tip }}</span>
      </li>
    </ul>

    <h2 class="section-title"><span>Recordatorio diario</span></h2>
    <div class="card reminder">
      <p class="reminder-text">
        <AppIcon name="bell" :size="20" />
        <span v-if="reminder">Cada día a las <strong>{{ reminder }}</strong> te llega un aviso para respirar un rato.</span>
        <span v-else>Un aviso cada día, a la hora que elijas, para no olvidarte.</span>
      </p>
      <div class="reminder-row">
        <label class="time-field">
          <span class="muted">Hora</span>
          <input v-model="time" type="time" step="300" :disabled="saving" @change="reminder && onTimeChange()" />
        </label>
        <button
          type="button"
          class="btn"
          :class="reminder ? 'btn-ghost' : 'btn-primary'"
          :disabled="saving"
          @click="saveReminder(reminder ? null : time || DEFAULT_TIME)"
        >
          {{ reminder ? 'Quitar' : 'Recordármelo' }}
        </button>
      </div>
      <p v-if="reminder && push && push !== 'on'" class="muted small">
        En este dispositivo no tienes los avisos activados: lo verás en la campana. Para que te llegue al móvil,
        actívalos en <RouterLink :to="{ name: 'account' }">Cuenta</RouterLink>.
      </p>
    </div>

    <h2 class="section-title"><span>Importante</span></h2>
    <div class="card notes">
      <p>{{ SAFETY.general }}</p>
      <p>{{ SAFETY.noHolding }} {{ SAFETY.stop }}</p>
      <p class="alarm"><strong>Señales de alarma.</strong> {{ SAFETY.alarm }}</p>
      <p class="whom-title">A quién acudir</p>
      <ul class="whom">
        <li v-for="w in SAFETY.whom" :key="w.who"><strong>{{ w.who }}</strong>, {{ w.what }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.kinds {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 0 var(--gutter);
}

.kind {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 14px 6px 12px;
  border-radius: 18px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-weight: 700;
  font-size: 0.9375rem;
  transition:
    background-color 0.2s,
    border-color 0.2s;
}

.kind-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  background: var(--tone-soft);
  color: var(--tone);
}

.kind[aria-selected='true'] {
  border-color: var(--tone);
  background: var(--tone);
  color: #fff;
}

.kind[aria-selected='true'] .kind-icon {
  background: rgb(255 255 255 / 0.2);
  color: #fff;
}

.hero {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px var(--gutter) 0;
  padding: 20px;
  border-radius: 20px;
  overflow: hidden;
  background: linear-gradient(135deg, var(--tone-soft), color-mix(in srgb, var(--tone-soft) 40%, var(--surface)));
}

.hero-text {
  flex: 1;
}

.hero-title {
  margin: 0 0 6px;
  font-family: var(--font-display);
  font-size: 1.375rem;
  font-weight: 600;
  color: var(--tone);
}

.hero-text p {
  margin: 0;
  color: var(--text);
}

/* A small circle breathing on its own: in 4 s, out 6 s. */
.hero-orb {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 84px;
  height: 84px;
}

.hero-orb span {
  width: 100%;
  height: 100%;
  border-radius: 999px;
  background: radial-gradient(circle at 35% 30%, #fff 0, var(--tone-bright) 45%, var(--tone) 100%);
  opacity: 0.85;
  animation: orb 10s ease-in-out infinite;
}

@keyframes orb {
  0%,
  100% {
    transform: scale(0.55);
  }
  40% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-orb span {
    animation: none;
    transform: scale(0.8);
  }
}

.exercises {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0 var(--gutter);
  list-style: none;
}

.exercise {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 12px 14px 14px;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
}

.exercise:hover {
  border-color: var(--tone);
}

.exercise-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--tone-soft);
  color: var(--tone);
}

.exercise-text {
  display: grid;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.exercise-title {
  font-weight: 700;
}

.exercise-summary {
  font-size: 0.875rem;
  color: var(--text-2);
}

.times {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.times span {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-2);
}

.go {
  flex-shrink: 0;
  color: var(--text-2);
}

.card {
  margin: 0 var(--gutter);
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: var(--surface);
}

.tips {
  display: grid;
  gap: 10px;
  list-style: none;
}

.tips li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.tips :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--tone);
}

.reminder {
  display: grid;
  gap: 12px;
}

.reminder-text {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 0;
}

.reminder-text :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--tone);
}

.reminder-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.time-field {
  display: grid;
  gap: 4px;
  font-size: 0.8125rem;
}

.time-field input {
  min-height: var(--tap);
  padding: 0 12px;
  border-radius: var(--radius);
  border: 1.5px solid var(--line);
  background: var(--surface);
  font-size: 1.0625rem;
  font-variant-numeric: tabular-nums;
}

.small {
  margin: 0;
  font-size: 0.875rem;
}

.notes {
  display: grid;
  gap: 10px;
  font-size: 0.9375rem;
}

.notes p {
  margin: 0;
}

.alarm {
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--late-soft);
  color: var(--late);
}

.whom-title {
  font-weight: 700;
}

.whom {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 20px;
}
</style>
