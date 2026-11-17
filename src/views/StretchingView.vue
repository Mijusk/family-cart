<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import StretchFigure from '@/components/StretchFigure.vue'
import { DEFAULT_HOLD, ROUTINES, SAFETY, durationText, planLength, planOf } from '@/lib/stretching'

// Estiramientos, in the menu: the routines (for now, the morning one), each stretch drawn, tips
// and what to keep in mind. Following one is StretchingSessionView. Design notes: docs/estiramientos.md.

const routine = ROUTINES[0]!
const duration = computed(() => durationText(planLength(planOf(routine.stretches, DEFAULT_HOLD))))
</script>

<template>
  <div class="page tone-stretch">
    <header class="page-header">
      <p class="eyebrow">Estiramientos</p>
      <h1 class="display-title">Estira el cuerpo</h1>
      <p class="muted">Rutinas guiadas, con un dibujo de cada estiramiento y el tiempo que toca.</p>
    </header>

    <section class="hero">
      <StretchFigure class="hero-figure" :pose="routine.stretches[8]!.pose" />
      <div class="hero-text">
        <h2 class="hero-title">{{ routine.title }}</h2>
        <p>{{ routine.intro }}</p>
        <p class="meta">
          <span>{{ routine.stretches.length }} estiramientos</span>
          <span>Unos {{ duration }}</span>
        </p>
      </div>
      <RouterLink :to="{ name: 'stretching-routine', params: { id: routine.id } }" class="btn btn-primary btn-block">
        <AppIcon name="play" :size="20" /> Empezar
      </RouterLink>
    </section>

    <h2 class="section-title"><span>Los estiramientos</span></h2>
    <ol class="stretches">
      <li v-for="(s, i) in routine.stretches" :key="s.id">
        <RouterLink :to="{ name: 'stretching-routine', params: { id: routine.id }, query: { desde: i + 1 } }" class="stretch">
          <StretchFigure :pose="s.pose" :title="s.title" />
          <span class="stretch-text">
            <span class="stretch-number">{{ i + 1 }}</span>
            <span class="stretch-title">{{ s.title }}</span>
          </span>
        </RouterLink>
      </li>
    </ol>
    <p class="muted small hint">Toca uno para empezar la rutina desde ahí.</p>

    <h2 class="section-title"><span>Consejos</span></h2>
    <ul class="card tips">
      <li v-for="tip in routine.tips" :key="tip">
        <AppIcon name="check" :size="18" />
        <span>{{ tip }}</span>
      </li>
    </ul>

    <h2 class="section-title"><span>Importante</span></h2>
    <div class="card notes">
      <p>{{ SAFETY.general }}</p>
      <p>{{ SAFETY.gentle }}</p>
      <p>{{ SAFETY.ask }}</p>
      <p class="alarm">{{ SAFETY.stop }}</p>
    </div>
  </div>
</template>

<style scoped>
.hero {
  display: grid;
  gap: 14px;
  margin: 0 var(--gutter);
  padding: 16px;
  border-radius: 20px;
  background: linear-gradient(135deg, var(--tone-soft), color-mix(in srgb, var(--tone-soft) 40%, var(--surface)));
}

.hero-figure {
  max-width: 260px;
  justify-self: center;
  width: 100%;
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
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px !important;
}

.meta span {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--surface);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-2);
}

.stretches {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0 var(--gutter);
  list-style: none;
}

.stretch {
  display: grid;
  gap: 8px;
  height: 100%;
  padding: 8px 8px 12px;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
}

.stretch:hover {
  border-color: var(--tone);
}

.stretch-text {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 0 4px;
}

.stretch-number {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--tone-soft);
  color: var(--tone);
  font-size: 0.75rem;
  font-weight: 700;
}

.stretch-title {
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.3;
}

.hint {
  margin: 10px var(--gutter) 0;
}

.small {
  font-size: 0.875rem;
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
</style>
