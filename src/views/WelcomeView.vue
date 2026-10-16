<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { useGroupStore } from '@/stores/group'
import { useToastStore } from '@/stores/toast'
import { friendlyError } from '@/utils/errors'

type Mode = 'choose' | 'create' | 'join' | 'claim'

const groupStore = useGroupStore()
const toast = useToastStore()
const router = useRouter()

const mode = ref<Mode>('choose')
const focusInput = useTemplateRef<HTMLInputElement>('focusInput')

/** A profile can only be claimed from a fresh account, before joining any group. */
const canClaim = computed(() => groupStore.memberships.length === 0)

async function choose(next: Mode) {
  mode.value = next
  await nextTick()
  focusInput.value?.focus()
}

function back() {
  mode.value = 'choose'
  createError.value = joinError.value = claimError.value = null
}

// ── Create a group ────────────────────────────────────────────

const groupName = ref('')
const withCalendar = ref(true)
const withShopping = ref(true)
const withTasks = ref(true)
const creating = ref(false)
const createError = ref<string | null>(null)
const canCreate = computed(
  () => groupName.value.trim() && (withCalendar.value || withShopping.value || withTasks.value) && !creating.value,
)

async function create() {
  if (!canCreate.value) return
  creating.value = true
  createError.value = null
  try {
    await groupStore.createGroup(groupName.value.trim(), { shopping: withShopping.value, calendar: withCalendar.value, tasks: withTasks.value })
    await router.replace({ name: 'group' })
  } catch (e) {
    createError.value = friendlyError(e)
  } finally {
    creating.value = false
  }
}

// ── Join with an invite code ──────────────────────────────────

const code = ref('')
const checking = ref(false)
const joinError = ref<string | null>(null)
const canCheckCode = computed(() => code.value.trim() && !checking.value)

const cleanCode = (raw: string) => raw.trim().replace(/\s+/g, '').toUpperCase()

/** Validates the code against `groups` before handing off to /unirse/:code, which sends the request. */
async function goToInvite() {
  if (!canCheckCode.value) return
  const clean = cleanCode(code.value)
  checking.value = true
  joinError.value = null
  try {
    const found = await groupStore.previewInvite(clean)
    if (!found) {
      joinError.value = 'Ese código no existe. Revísalo con quien te lo dio.'
      return
    }
    await router.push({ name: 'join', params: { code: clean } })
  } catch (e) {
    joinError.value = friendlyError(e)
  } finally {
    checking.value = false
  }
}

// ── Claim a profile someone made for you ──────────────────────

const claimCode = ref('')
const claimPreview = ref<{ displayName: string } | null>(null)
const claiming = ref(false)
const claimError = ref<string | null>(null)

async function checkClaim() {
  if (!claimCode.value.trim() || claiming.value) return
  claiming.value = true
  claimError.value = null
  try {
    claimPreview.value = await groupStore.previewClaim(cleanCode(claimCode.value))
    if (!claimPreview.value) claimError.value = 'Ese código de perfil no existe o ya se ha usado.'
  } catch (e) {
    claimError.value = friendlyError(e)
  } finally {
    claiming.value = false
  }
}

async function confirmClaim() {
  claiming.value = true
  claimError.value = null
  try {
    await groupStore.claimProfile(cleanCode(claimCode.value))
    toast.show(`Ahora eres ${groupStore.me?.displayName ?? 'tú'} en la app`)
    await router.replace('/')
  } catch (e) {
    claimError.value = friendlyError(e)
  } finally {
    claiming.value = false
  }
}

// ── Pending requests ──────────────────────────────────────────

const cancelling = ref<string | null>(null)

async function cancelRequest(groupId: string, name: string) {
  cancelling.value = groupId
  try {
    await groupStore.cancelRequest(groupId)
    toast.show(`Has retirado tu solicitud a ${name}`)
  } catch (e) {
    toast.show(friendlyError(e))
  } finally {
    cancelling.value = null
  }
}
</script>

<template>
  <div class="onboard">
    <header>
      <p class="eyebrow">Family App</p>
      <!-- Reached from the group switcher when this person already has a group. -->
      <template v-if="groupStore.status === 'ready'">
        <h1 class="display-title">Añadir otro grupo</h1>
        <p v-if="mode === 'choose'" class="muted intro">
          Seguirás en {{ groupStore.group.name }}; podrás cambiar de grupo tocando su nombre.
        </p>
      </template>
      <template v-else>
        <h1 class="display-title">Hola, {{ groupStore.me?.displayName }}</h1>
        <p v-if="mode === 'choose'" class="muted intro">
          Crea un grupo para tu familia o únete al que ya tengan. Cada grupo elige qué usar: lista de la compra, tareas
          y calendario.
        </p>
      </template>
    </header>

    <RouterLink v-if="mode === 'choose' && groupStore.status === 'ready'" :to="{ name: 'group' }" class="back-link">
      <AppIcon name="back" :size="16" />
      Volver a {{ groupStore.group.name }}
    </RouterLink>

    <section v-if="mode === 'choose' && groupStore.pendingMemberships.length" class="pending" aria-live="polite">
      <h2 class="pending-title">Esperando aprobación</h2>
      <ul class="pending-list">
        <li v-for="m in groupStore.pendingMemberships" :key="m.groupId">
          <span>
            <strong>{{ m.groupName }}</strong>
            <span class="muted small">Un administrador tiene que aceptarte. Entrarás en cuanto lo haga.</span>
          </span>
          <button
            type="button"
            class="btn btn-ghost small-btn"
            :disabled="cancelling === m.groupId"
            @click="cancelRequest(m.groupId, m.groupName)"
          >
            Retirar
          </button>
        </li>
      </ul>
    </section>

    <div v-if="mode === 'choose'" class="choice-list">
      <button type="button" class="choice" @click="choose('create')">
        <span class="choice-icon"><AppIcon name="plus" :size="24" /></span>
        <span class="choice-text">
          <strong>Crear un grupo nuevo</strong>
          <span class="muted">Para tu familia, tu pareja…</span>
        </span>
      </button>
      <button type="button" class="choice" @click="choose('join')">
        <span class="choice-icon"><AppIcon name="group" :size="24" /></span>
        <span class="choice-text">
          <strong>Tengo un código de grupo</strong>
          <span class="muted">Pide unirte a un grupo que ya existe</span>
        </span>
      </button>
      <button v-if="canClaim" type="button" class="choice" @click="choose('claim')">
        <span class="choice-icon"><AppIcon name="user" :size="24" /></span>
        <span class="choice-text">
          <strong>Tengo un código de perfil</strong>
          <span class="muted">Alguien de tu familia ya te había creado en la app</span>
        </span>
      </button>
    </div>

    <form v-else-if="mode === 'create'" class="onboard-form" @submit.prevent="create">
      <label class="label">
        ¿Cómo se llama el grupo?
        <input
          ref="focusInput"
          v-model="groupName"
          class="field"
          placeholder="Casa Martín, Pareja, Padres…"
          maxlength="60"
          autocomplete="off"
        />
      </label>
      <fieldset class="sections">
        <legend class="label">¿Qué vais a usar?</legend>
        <label class="check">
          <input v-model="withCalendar" type="checkbox" />
          <span>
            <strong>Calendario</strong>
            <span class="muted small">Los horarios de cada uno</span>
          </span>
        </label>
        <label class="check">
          <input v-model="withShopping" type="checkbox" />
          <span>
            <strong>Lista de la compra</strong>
            <span class="muted small">Lo que falta en casa</span>
          </span>
        </label>
        <label class="check">
          <input v-model="withTasks" type="checkbox" />
          <span>
            <strong>Tareas</strong>
            <span class="muted small">Cosas por hacer, de una sola vez</span>
          </span>
        </label>
        <p class="muted small">Podrás cambiarlo después en los ajustes del grupo.</p>
      </fieldset>
      <p v-if="!withCalendar && !withShopping && !withTasks" class="form-error">Elige al menos una.</p>
      <p v-if="createError" class="form-error" role="alert">{{ createError }}</p>
      <button type="submit" class="btn btn-primary btn-block" :disabled="!canCreate">
        {{ creating ? 'Creando…' : 'Crear el grupo' }}
      </button>
      <button type="button" class="back-link" @click="back">
        <AppIcon name="back" :size="16" />
        Volver
      </button>
    </form>

    <form v-else-if="mode === 'join'" class="onboard-form" @submit.prevent="goToInvite">
      <label class="label">
        Código de invitación
        <input
          ref="focusInput"
          v-model="code"
          class="field code-field"
          placeholder="HUERTA7Q4K"
          maxlength="20"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
        />
      </label>
      <p v-if="joinError" class="form-error" role="alert">{{ joinError }}</p>
      <button type="submit" class="btn btn-primary btn-block" :disabled="!canCheckCode">
        {{ checking ? 'Comprobando…' : 'Continuar' }}
      </button>
      <button type="button" class="back-link" @click="back">
        <AppIcon name="back" :size="16" />
        Volver
      </button>
    </form>

    <section v-else class="onboard-form" aria-live="polite">
      <template v-if="!claimPreview">
        <form class="claim-form" @submit.prevent="checkClaim">
          <label class="label">
            Código de perfil
            <input
              ref="focusInput"
              v-model="claimCode"
              class="field code-field"
              placeholder="PABLO7Q4KM"
              maxlength="20"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
            />
          </label>
          <p class="muted small">Te lo da un administrador desde la pantalla del grupo.</p>
          <p v-if="claimError" class="form-error" role="alert">{{ claimError }}</p>
          <button type="submit" class="btn btn-primary btn-block" :disabled="!claimCode.trim() || claiming">
            {{ claiming ? 'Comprobando…' : 'Continuar' }}
          </button>
        </form>
      </template>
      <template v-else>
        <p class="question">
          Vas a ser <strong>{{ claimPreview.displayName }}</strong> en la app: sus grupos, su historial y sus horarios
          pasarán a tu cuenta.
        </p>
        <p v-if="claimError" class="form-error" role="alert">{{ claimError }}</p>
        <button type="button" class="btn btn-primary btn-block" :disabled="claiming" @click="confirmClaim">
          {{ claiming ? 'Entrando…' : `Sí, soy ${claimPreview.displayName}` }}
        </button>
        <button type="button" class="btn btn-ghost btn-block" :disabled="claiming" @click="claimPreview = null">
          No soy yo
        </button>
      </template>
      <button type="button" class="back-link" @click="back">
        <AppIcon name="back" :size="16" />
        Volver
      </button>
    </section>

    <RouterLink v-if="mode === 'choose' && groupStore.status !== 'ready'" :to="{ name: 'account' }" class="back-link">
      <AppIcon name="user" :size="16" />
      Tu cuenta ({{ groupStore.email }})
    </RouterLink>
  </div>
</template>

<style scoped>
.intro {
  margin-top: 10px;
  font-size: 1.0625rem;
}

.small {
  display: block;
  font-size: 0.875rem;
  font-weight: 400;
}

.question {
  font-size: 1.0625rem;
}

.choice-list {
  display: grid;
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  margin-inline: calc(-1 * var(--gutter));
}

@media (min-width: 592px) {
  .choice-list {
    margin-inline: 0;
    border-radius: var(--radius);
    overflow: hidden;
  }
}

.choice {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 76px;
  padding: 14px var(--gutter);
  background: var(--surface);
  text-align: left;
}

.choice:hover {
  background: var(--primary-soft);
}

.choice-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
  flex-shrink: 0;
}

.choice-text {
  display: grid;
  gap: 2px;
  font-size: 0.9375rem;
}

.choice-text strong {
  font-size: 1.0625rem;
}

.code-field {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}

.sections {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;
}

.sections legend {
  margin-bottom: 6px;
}

.check {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: var(--tap);
  padding: 8px 12px;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
}

.check:has(input:checked) {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.check input {
  width: 20px;
  height: 20px;
  accent-color: var(--primary);
  flex-shrink: 0;
}

.claim-form {
  display: grid;
  gap: 16px;
}

.pending {
  display: grid;
  gap: 8px;
}

.pending-title {
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-2);
}

.pending-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.pending-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: var(--qty-soft);
  border-radius: var(--radius);
}

.small-btn {
  min-height: 40px;
  padding-inline: 14px;
  flex-shrink: 0;
}
</style>
