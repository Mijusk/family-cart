<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { buildPlanText, DEFAULT_PLAN_REQUEST, type PlanEvent, type PlanTask } from '@/lib/planText'
import { goBack } from '@/router/back'
import { useCalendarStore } from '@/stores/calendar'
import { useGroupStore } from '@/stores/group'
import { useTasksStore } from '@/stores/tasks'
import { useToastStore } from '@/stores/toast'
import { addDays, addMonths, startOfMonth, startOfWeek, today } from '@/utils/days'

// "Planificar con IA": the group's calendar for a month (or a week) as text to paste into a chat
// and ask where tasks or exercise could go (src/lib/planText.ts). ?periodo=mes|proximo|semana,
// ?sin=<person ids> for the people left out.

const groupStore = useGroupStore()
const calendar = useCalendarStore()
const tasksStore = useTasksStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

const PERIODS = [
  { key: 'mes', label: 'Este mes' },
  { key: 'proximo', label: 'Próximo mes' },
  { key: 'semana', label: 'Esta semana' },
] as const
type PeriodKey = (typeof PERIODS)[number]['key']

const period = computed<PeriodKey>(() => PERIODS.find((p) => p.key === route.query.periodo)?.key ?? 'mes')
function pickPeriod(key: PeriodKey) {
  const { periodo: _, ...query } = route.query
  void router.replace({ query: key === 'mes' ? query : { ...query, periodo: key } })
}

const range = computed(() => {
  const now = today()
  if (period.value === 'semana') return { from: startOfWeek(now), to: addDays(startOfWeek(now), 6) }
  const first = period.value === 'mes' ? startOfMonth(now) : addMonths(now, 1)
  return { from: first, to: addDays(addMonths(first, 1), -1) }
})

// ── Loading ───────────────────────────────────────────────────

const loading = ref(true)
const failed = ref(false)
watch(
  () => [groupStore.group.id, range.value.from, range.value.to] as const,
  async ([id, from, to]) => {
    loading.value = true
    failed.value = false
    try {
      await Promise.all([calendar.ensureLoaded(id, from, to), groupStore.group.tasksEnabled ? tasksStore.ensureLoaded(id) : null])
    } catch {
      failed.value = true
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

// ── The request (remembered on this device) ───────────────────

const REQUEST_KEY = 'family-cart:plan-request'
function savedRequest(): string {
  try {
    return localStorage.getItem(REQUEST_KEY) ?? DEFAULT_PLAN_REQUEST
  } catch {
    return DEFAULT_PLAN_REQUEST
  }
}
const request = ref(savedRequest())
watch(request, (value) => {
  try {
    if (value.trim() === DEFAULT_PLAN_REQUEST || !value.trim()) localStorage.removeItem(REQUEST_KEY)
    else localStorage.setItem(REQUEST_KEY, value)
  } catch {
    // Without storage it just isn't remembered.
  }
})

// ── The text ──────────────────────────────────────────────────

/** The active members, me first. */
const members = computed(() =>
  [...groupStore.activeMembers]
    .sort((a, b) => Number(groupStore.isMe(b.id)) - Number(groupStore.isMe(a.id)))
    .map((m) => ({ id: m.personId, name: m.name, isMe: groupStore.isMe(m.id) })),
)

/** People left out of the text, in ?sin=id,id. */
const left = computed(() => new Set(typeof route.query.sin === 'string' ? route.query.sin.split(',') : []))
const people = computed(() => members.value.filter((p) => !left.value.has(p.id)))

function togglePerson(id: string) {
  const next = new Set(left.value)
  if (next.has(id)) next.delete(id)
  else if (people.value.length > 1) next.add(id)
  else return
  const { sin: _, ...query } = route.query
  void router.replace({ query: next.size ? { ...query, sin: [...next].join(',') } : query })
}

const events = computed<PlanEvent[]>(() => {
  const inGroup = new Set(people.value.map((p) => p.id))
  const full = calendar.events.flatMap((e) => {
    const owner = calendar.owners[e.id]
    if (!owner) return []
    const who = [owner.ownerId, ...(calendar.participants[e.id] ?? [])].filter((id, i, all) => inGroup.has(id) && all.indexOf(id) === i)
    if (!who.length) return []
    return [{ id: e.id, title: e.title, folder: calendar.calendarById(e.calendarId)?.name ?? null, people: who, timing: e, exceptions: calendar.exceptionsOf(e.id) }]
  })
  const busy = calendar.busyEvents
    .filter((b) => inGroup.has(b.ownerId))
    .map((b) => ({ id: b.id, title: null, folder: null, people: [b.ownerId], timing: b, exceptions: b.exceptions }))
  return [...full, ...busy]
})

const tasks = computed<PlanTask[]>(() => {
  if (!groupStore.group.tasksEnabled) return []
  const lists = new Map(tasksStore.groupLists.map((l) => [l.id, l.name]))
  const nameOf = (id: string) => people.value.find((p) => p.id === id)?.name ?? tasksStore.personName(id)
  return tasksStore.tasks
    .filter((t) => !t.doneAt && lists.has(t.listId))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    .map((t) => ({ title: t.title, list: lists.get(t.listId)!, dueDate: t.dueDate, assignees: t.assignees.map(nameOf) }))
})

const text = computed(() =>
  buildPlanText({
    groupName: groupStore.group.name,
    from: range.value.from,
    to: range.value.to,
    today: today(),
    people: people.value,
    events: events.value,
    tasks: tasks.value,
    request: request.value,
  }),
)

const canShare = typeof navigator !== 'undefined' && 'share' in navigator

async function copy() {
  try {
    await navigator.clipboard.writeText(text.value)
    toast.show('Copiado: pégalo en el chat')
  } catch {
    toast.show('No se pudo copiar: abre el texto de abajo y cópialo a mano')
  }
}

async function share() {
  try {
    await navigator.share({ title: `Calendario de ${groupStore.group.name}`, text: text.value })
  } catch {
    // The user closed the share sheet.
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <button type="button" class="back-link" @click="goBack()"><AppIcon name="back" :size="18" /> Calendario</button>
      <h1 class="display-title">Planificar con IA</h1>
      <p class="muted intro">
        Copia el calendario de {{ groupStore.group.name }} y pégalo en Claude, ChatGPT u otro chat para
        que te proponga dónde encajar tareas, ejercicio o lo que necesites.
      </p>
    </header>

    <h2 class="section-title"><span>Qué periodo</span></h2>
    <div class="panel">
      <div class="choices" role="radiogroup" aria-label="Periodo">
        <button
          v-for="p in PERIODS"
          :key="p.key"
          type="button"
          class="choice"
          role="radio"
          :aria-checked="period === p.key"
          @click="pickPeriod(p.key)"
        >
          {{ p.label }}
        </button>
      </div>
    </div>

    <h2 class="section-title"><span>Quién entra</span></h2>
    <div class="panel">
      <div class="choices">
        <button
          v-for="p in members"
          :key="p.id"
          type="button"
          class="choice"
          :aria-pressed="!left.has(p.id)"
          @click="togglePerson(p.id)"
        >
          <AppIcon v-if="!left.has(p.id)" name="check" :size="16" />
          {{ p.isMe ? `${p.name} (tú)` : p.name }}
        </button>
      </div>
    </div>

    <h2 class="section-title"><span>Qué le pides</span></h2>
    <div class="panel column">
      <textarea v-model="request" class="field" rows="5" maxlength="2000" aria-label="Qué le pides" />
      <button v-if="request !== DEFAULT_PLAN_REQUEST" type="button" class="btn btn-ghost" @click="request = DEFAULT_PLAN_REQUEST">
        Volver al texto de ejemplo
      </button>
    </div>
    <p class="muted note">
      Va al final del texto. Cuanto más concreto (días libres, horas que prefieres, cuántas veces), mejor.
    </p>

    <div class="actions">
      <p v-if="failed" class="muted">No se ha podido cargar todo el calendario. Revisa la conexión y vuelve a entrar.</p>
      <button type="button" class="btn btn-primary btn-block" :disabled="loading || failed" @click="copy">
        <AppIcon name="copy" :size="20" />
        {{ loading ? 'Cargando…' : 'Copiar para la IA' }}
      </button>
      <button v-if="canShare" type="button" class="btn btn-ghost btn-block" :disabled="loading || failed" @click="share">
        <AppIcon name="share" :size="20" />
        Compartir con una app
      </button>
    </div>

    <details v-if="!loading && !failed" class="preview">
      <summary>Ver el texto</summary>
      <pre>{{ text }}</pre>
    </details>
  </div>
</template>

<style scoped>
.intro {
  margin-top: 8px;
  font-size: 0.9375rem;
}

.panel {
  display: flex;
  gap: 10px;
  padding: 14px var(--gutter);
  background: var(--surface);
  border-block: 1px solid var(--line);
}

@media (min-width: 592px) {
  .panel {
    border-inline: 1px solid var(--line);
    border-radius: var(--radius);
  }
}

.column {
  flex-direction: column;
  align-items: flex-start;
}

.column .field {
  width: 100%;
  resize: vertical;
}

.note {
  padding: 8px var(--gutter) 0;
  font-size: 0.875rem;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 24px;
  padding: 0 var(--gutter);
}

.preview {
  margin: 20px var(--gutter) 32px;
}

.preview summary {
  min-height: 40px;
  color: var(--text-2);
  font-weight: 600;
  cursor: pointer;
}

.preview pre {
  max-height: 60vh;
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: 0.8125rem;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
