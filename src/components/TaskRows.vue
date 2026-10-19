<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { dueLabel } from '@/lib/tasks'
import { useTasksStore } from '@/stores/tasks'
import type { Task } from '@/types'
import { timeAgo } from '@/utils/date'
import AppIcon from './AppIcon.vue'
import PersonAvatar from './PersonAvatar.vue'

// Rows of tasks: tick, open, and (when `sortable`) drag the grip to reorder, with the mouse or
// pressing and dragging on a phone. Emits the new neighbours; the store turns them into a position.

const props = defineProps<{ tasks: Task[]; sortable?: boolean; showList?: boolean }>()
const emit = defineEmits<{ toggle: [task: Task]; move: [id: string, beforeId: string | null, afterId: string | null] }>()

const store = useTasksStore()
const today = computed(() => store.today())

// ── Dragging ──────────────────────────────────────────────────

const rows = ref<HTMLElement[]>([])
const drag = ref<{ id: string; from: number; to: number; startY: number; dy: number; height: number; mids: number[] } | null>(null)

function start(event: PointerEvent, index: number) {
  if (!props.sortable || event.button > 0) return
  event.preventDefault()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  const rects = rows.value.slice(0, props.tasks.length).map((el) => el.getBoundingClientRect())
  drag.value = {
    id: props.tasks[index]!.id,
    from: index,
    to: index,
    startY: event.clientY,
    dy: 0,
    height: rects[index]!.height,
    mids: rects.map((r) => r.top + r.height / 2),
  }
}

function move(event: PointerEvent) {
  const d = drag.value
  if (!d) return
  d.dy = event.clientY - d.startY
  const center = d.mids[d.from]! + d.dy
  // Where it lands: after every other row whose middle it has passed.
  d.to = d.mids.filter((mid, i) => i !== d.from && mid < center).length
}

function end() {
  const d = drag.value
  drag.value = null
  if (!d || d.to === d.from) return
  const order = props.tasks.filter((t) => t.id !== d.id)
  emit('move', d.id, order[d.to - 1]?.id ?? null, order[d.to]?.id ?? null)
}

/** The dragged row follows the finger; the ones it passes make room for it. */
function offset(index: number): number {
  const d = drag.value
  if (!d) return 0
  if (index === d.from) return d.dy
  if (d.from < d.to && index > d.from && index <= d.to) return -d.height
  if (d.to < d.from && index >= d.to && index < d.from) return d.height
  return 0
}

const names = new Intl.ListFormat('es', { type: 'conjunction' })

/** "Tú", "Daniel y Pablo"… */
function whoLine(task: Task): string {
  return names.format(task.assignees.map((id) => store.personName(id)))
}

function doneLine(task: Task): string {
  return `Hecha por ${store.personName(task.doneBy, 'ti')} ${timeAgo(task.doneAt!)}`
}
</script>

<template>
  <ul class="rows tasks">
    <li
      v-for="(task, i) in tasks"
      :key="task.id"
      :ref="(el) => (rows[i] = el as HTMLElement)"
      class="task"
      :class="{ dragging: drag?.id === task.id, done: !!task.doneAt }"
      :style="drag ? { transform: `translateY(${offset(i)}px)` } : undefined"
    >
      <button
        type="button"
        class="check"
        role="checkbox"
        :aria-checked="!!task.doneAt"
        :aria-label="task.doneAt ? `Desmarcar ${task.title}` : `Marcar ${task.title} como hecha`"
        @click="emit('toggle', task)"
      >
        <AppIcon v-if="task.doneAt" name="check" :size="16" />
      </button>
      <RouterLink :to="{ name: 'task', params: { id: task.id } }" class="body">
        <span class="title">{{ task.title }}</span>
        <span v-if="task.doneAt" class="meta muted">{{ doneLine(task) }}</span>
        <span v-else-if="task.dueDate || task.assignees.length || task.notes || showList" class="meta">
          <span v-if="dueLabel(task, today)" class="due" :class="{ late: dueLabel(task, today)!.overdue }">
            {{ dueLabel(task, today)!.text }}
          </span>
          <span v-if="task.assignees.length" class="who muted">
            <span class="avatars">
              <PersonAvatar
                v-for="id in task.assignees.slice(0, 3)"
                :key="id"
                :name="store.personName(id)"
                :color="store.personColor(id)"
                :size="20"
              />
            </span>
            {{ whoLine(task) }}
          </span>
          <span v-if="showList" class="muted">{{ store.listById(task.listId)?.name }}</span>
          <AppIcon v-if="task.notes" name="note" :size="16" class="muted" />
        </span>
      </RouterLink>
      <span
        v-if="sortable"
        class="grip"
        role="button"
        :aria-label="`Mover ${task.title}`"
        @pointerdown="start($event, i)"
        @pointermove="move"
        @pointerup="end"
        @pointercancel="drag = null"
      >
        <AppIcon name="grip" :size="20" />
      </span>
    </li>
  </ul>
</template>

<style scoped>
.task {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 60px;
  padding-left: calc(var(--gutter) - 8px);
  background: var(--surface);
  position: relative;
  transition: transform 0.15s;
}

.task.dragging {
  z-index: 2;
  transition: none;
  box-shadow: 0 6px 18px color-mix(in srgb, var(--text) 18%, transparent);
}

.check {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
}

.check::before {
  content: '';
  grid-area: 1 / 1;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--line);
  background: var(--surface);
}

.check:hover::before {
  border-color: var(--primary);
}

.check[aria-checked='true']::before {
  border-color: var(--primary);
  background: var(--primary);
}

.check :deep(svg) {
  grid-area: 1 / 1;
  color: #fff;
}

.body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 3px;
  padding: 10px 4px;
  color: inherit;
  text-decoration: none;
}

.title {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.done .title {
  font-weight: 500;
  color: var(--text-2);
  text-decoration: line-through;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  font-size: 0.875rem;
}

.due {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary-strong);
  font-weight: 600;
}

.due.late {
  background: var(--late-soft);
  color: var(--late);
}

.who {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* Several people overlap a little, each with a ring so they stay apart. */
.avatars {
  display: inline-flex;
}

.avatars > * + * {
  margin-left: -6px;
}

.avatars > * {
  box-shadow: 0 0 0 2px var(--surface);
  border-radius: 50%;
}

.grip {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 48px;
  align-self: stretch;
  color: var(--text-2);
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.dragging .grip {
  cursor: grabbing;
}
</style>
