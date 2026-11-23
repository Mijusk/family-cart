<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import StreakFlame from '@/components/StreakFlame.vue'
import { daysText, streakMessage, type Streak } from '@/lib/streak'
import { WEEKDAY_INITIALS, WEEKDAY_NAMES, longDay, today, weekday } from '@/utils/days'

// The stretching streak: days in a row with a flame, this week from Monday to Sunday and the
// weekly wildcard. In Estiramientos and, smaller, when a routine is finished.

const props = defineProps<{ streak: Streak; compact?: boolean }>()

const message = computed(() => streakMessage(props.streak, today()))

const wildcardText = computed(() => {
  const used = props.streak.wildcardUsedOn
  return used ? `Comodín usado el ${WEEKDAY_NAMES[weekday(used) - 1]}` : 'Comodín de la semana libre'
})

const STATE_TEXT = { done: 'estirado', wildcard: 'salvado por el comodín', missed: 'sin estirar', today: 'hoy', future: '' } as const
</script>

<template>
  <section class="streak" :class="{ compact, lit: streak.doneToday }" aria-label="Racha de estiramientos">
    <div class="head">
      <StreakFlame :count="streak.current" :lit="streak.doneToday" :size="compact ? 46 : 60" />
      <div class="count">
        <span class="title">{{ streak.current }} {{ streak.current === 1 ? 'día seguido' : 'días seguidos' }}</span>
        <span v-if="!compact && streak.best > streak.current" class="best">Tu mejor racha: {{ daysText(streak.best) }}</span>
      </div>
    </div>

    <p class="message">{{ message }}</p>

    <ol class="week" aria-label="Esta semana">
      <li
        v-for="d in streak.week"
        :key="d.day"
        :class="d.state"
        :aria-label="`${longDay(d.day)}${STATE_TEXT[d.state] ? `: ${STATE_TEXT[d.state]}` : ''}`"
      >
        <span class="dot">
          <AppIcon v-if="d.state === 'done'" name="check" :size="16" />
          <AppIcon v-else-if="d.state === 'wildcard'" name="shield" :size="15" />
        </span>
        <span class="initial" aria-hidden="true">{{ WEEKDAY_INITIALS[weekday(d.day) - 1] }}</span>
      </li>
    </ol>

    <p class="wildcard" :class="{ used: streak.wildcardUsedOn }">
      <AppIcon name="shield" :size="16" /> {{ wildcardText }}
    </p>
    <p v-if="!compact" class="how muted small">
      Cuenta cada día que terminas una rutina, cualquiera. Si un día no puedes, el comodín guarda tu racha:
      uno por semana, de lunes a domingo.
    </p>
  </section>
</template>

<style scoped>
.streak {
  display: grid;
  gap: 10px;
  margin: 14px var(--gutter) 0;
  padding: 14px 16px;
  border-radius: 20px;
  border: 1.5px solid var(--line);
  background: var(--surface);
}

.compact {
  margin: 0;
  padding: 12px 14px;
}

.head {
  display: flex;
  align-items: center;
  gap: 14px;
}

.count {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.title {
  font-family: var(--font-display);
  font-size: 1.375rem;
  font-weight: 700;
  line-height: 1.15;
}

.compact .title {
  font-size: 1.125rem;
}

.best {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--text-2);
}

.message {
  margin: 0;
  font-weight: 600;
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
  gap: 4px;
}

.dot {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid var(--line);
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
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-2);
}

.today .initial {
  color: var(--primary);
}

p.wildcard {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--qty-ink);
}

p.wildcard.used {
  color: var(--text-2);
}

.how {
  margin: 0;
}
</style>
