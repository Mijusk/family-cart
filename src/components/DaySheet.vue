<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { timeLabel } from '@/lib/eventText'
import { HOUR_PX, timeline } from '@/lib/timeline'
import type { IsoDate, Occurrence } from '@/types'
import { folderPaint } from '@/utils/colors'
import { today } from '@/utils/days'

// One day as a time scale (src/lib/timeline.ts), as Semana and Hoy show it: all-day occurrences
// as chips on top, then the timed ones as blocks whose height follows the clock.

const props = defineProps<{
  day: IsoDate
  items: Occurrence[]
  /** «Recordatorio»s: small chips with the bell, after the all-day ones (Hoy only). */
  reminders?: Occurrence[]
  /** Who an occurrence belongs to, as it reads on the block. */
  ownerName: (personId: string) => string
}>()

const timed = computed(() => props.items.filter((o) => !o.reminderOnly))
const allDay = computed(() => timed.value.filter((o) => o.allDay))
const scale = computed(() => timeline(timed.value, props.day))

// The current time, as a line across today's scale.
const now = ref(new Date())
const clock = setInterval(() => (now.value = new Date()), 60_000)
onUnmounted(() => clearInterval(clock))
const nowMinute = computed(() => now.value.getHours() * 60 + now.value.getMinutes())
const nowLabel = computed(() => `${String(now.value.getHours()).padStart(2, '0')}:${String(now.value.getMinutes()).padStart(2, '0')}`)
const nowTop = computed(() => (props.day === today() ? scale.value.at(nowMinute.value) : null))

/** How much a block has room to say. */
function fits(height: number): { time: boolean; who: boolean } {
  return { time: height >= HOUR_PX * 0.75, who: height >= HOUR_PX * 1.25 }
}

/** The time in a block: as in the lists, without the spaces, so it fits a narrow column. */
function blockTime(o: Occurrence): string {
  return timeLabel(o, props.day).replace(' – ', '–')
}

function freeLabel(minutes: number): string {
  return `${minutes / 60} h libres`
}
</script>

<template>
  <div class="sheet">
    <ul v-if="allDay.length || reminders?.length" class="all-day">
      <li v-for="o in allDay" :key="o.key">
        <span v-if="o.busy" class="chip busy" :style="folderPaint(o.color)">Ocupado · {{ ownerName(o.ownerId) }}</span>
        <RouterLink v-else :to="{ name: 'event', params: { id: o.eventId }, query: { dia: o.seriesDate } }" class="chip" :style="folderPaint(o.color)">
          {{ o.title }} · {{ ownerName(o.ownerId) }}
        </RouterLink>
      </li>
      <li v-for="o in reminders" :key="o.key">
        <RouterLink :to="{ name: 'event', params: { id: o.eventId }, query: { dia: o.seriesDate } }" class="chip reminder" :style="{ '--folder': o.color }">
          <AppIcon name="bell" :size="13" />{{ o.startTime }} {{ o.title }} · {{ ownerName(o.ownerId) }}
        </RouterLink>
      </li>
    </ul>
    <div v-if="scale.height" class="scale" :style="{ height: `${scale.height}px` }">
      <template v-for="h in scale.hours" :key="h.top">
        <span class="hour" :style="{ top: `${h.top}px` }">{{ h.label }}</span>
        <span class="hour-line" :style="{ top: `${h.top}px` }" />
      </template>
      <span v-for="g in scale.gaps" :key="g.top" class="gap muted" :style="{ top: `${g.top}px` }">
        <span aria-hidden="true">· · ·</span>{{ freeLabel(g.minutes) }}
      </span>
      <div class="blocks">
        <template v-for="b in scale.blocks" :key="timed[b.item]!.key">
          <template v-for="o in [timed[b.item]!]" :key="o.key">
            <span
              v-if="o.busy"
              class="block busy"
              :style="{ top: `${b.top}px`, height: `${b.height}px`, left: `${(b.column / b.columns) * 100}%`, width: `${100 / b.columns}%`, ...folderPaint(o.color) }"
            >
              <strong>Ocupado</strong>
              <span v-if="fits(b.height).time">{{ blockTime(o) }}</span>
              <span v-if="fits(b.height).who">{{ ownerName(o.ownerId) }}</span>
            </span>
            <RouterLink
              v-else
              :to="{ name: 'event', params: { id: o.eventId }, query: { dia: o.seriesDate } }"
              class="block"
              :style="{ top: `${b.top}px`, height: `${b.height}px`, left: `${(b.column / b.columns) * 100}%`, width: `${100 / b.columns}%`, ...folderPaint(o.color) }"
            >
              <strong>{{ o.title }}</strong>
              <span v-if="fits(b.height).time">{{ blockTime(o) }}</span>
              <span v-if="fits(b.height).who">{{ ownerName(o.ownerId) }}</span>
            </RouterLink>
          </template>
        </template>
      </div>
      <template v-if="nowTop !== null">
        <span class="now-label" :style="{ top: `${nowTop}px` }">{{ nowLabel }}</span>
        <span class="now-line" :style="{ top: `${nowTop}px` }" />
      </template>
    </div>
  </div>
</template>

<style scoped>
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
  box-shadow: inset 0 0 0 1px var(--edge, transparent);
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
  box-shadow:
    inset 0 0 0 1px var(--edge, transparent),
    0 0 0 1.5px var(--surface);
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

/* A «Recordatorio»: quieter than what takes time, only its folder's color as an edge. */
.chip.reminder {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--surface);
  color: var(--text-2);
  box-shadow: inset 0 0 0 1.5px var(--folder);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
</style>
