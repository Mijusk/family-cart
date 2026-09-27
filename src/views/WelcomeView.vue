<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { useGroupStore } from '@/stores/group'
import { friendlyError } from '@/utils/errors'

type Mode = 'choose' | 'create' | 'join'

const groupStore = useGroupStore()
const router = useRouter()

const mode = ref<Mode>('choose')

async function choose(next: Mode) {
  mode.value = next
  await nextTick()
  focusInput.value?.focus()
}

// ── Create a group ────────────────────────────────────────────

const groupName = ref('')
const memberName = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)
const canCreate = computed(() => groupName.value.trim() && memberName.value.trim() && !creating.value)

async function create() {
  if (!canCreate.value) return
  creating.value = true
  createError.value = null
  try {
    await groupStore.createGroup(groupName.value.trim(), memberName.value.trim())
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

/** Validates the code against `groups` before handing off to /unirse/:code, which does the actual join. */
async function goToInvite() {
  if (!canCheckCode.value) return
  const clean = code.value.trim().replace(/\s+/g, '').toUpperCase()
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

const focusInput = useTemplateRef<HTMLInputElement>('focusInput')
</script>

<template>
  <div class="onboard">
    <header>
      <p class="eyebrow">Compra Familiar</p>
      <!-- Reached from the group switcher when this device already has a group. -->
      <template v-if="groupStore.status === 'ready'">
        <h1 class="display-title">Añadir otro grupo</h1>
        <p v-if="mode === 'choose'" class="muted intro">
          Seguirás en {{ groupStore.group.name }}; podrás cambiar de grupo tocando su nombre.
        </p>
      </template>
      <h1 v-else class="display-title">La lista de la compra de toda la casa</h1>
      <p v-if="mode === 'choose' && groupStore.status !== 'ready'" class="muted intro">
        Cualquiera apunta lo que falta y quien va a comprar lo va marcando. Sin cuentas ni contraseñas.
      </p>
    </header>

    <RouterLink v-if="mode === 'choose' && groupStore.status === 'ready'" :to="{ name: 'list' }" class="back-link">
      <AppIcon name="back" :size="16" />
      Volver a {{ groupStore.group.name }}
    </RouterLink>

    <div v-if="mode === 'choose'" class="choice-list">
      <button type="button" class="choice" @click="choose('create')">
        <span class="choice-icon"><AppIcon name="plus" :size="24" /></span>
        <span class="choice-text">
          <strong>Crear un grupo nuevo</strong>
          <span class="muted">Empieza una lista para tu familia</span>
        </span>
      </button>
      <button type="button" class="choice" @click="choose('join')">
        <span class="choice-icon"><AppIcon name="group" :size="24" /></span>
        <span class="choice-text">
          <strong>Ya tengo un código</strong>
          <span class="muted">Únete a un grupo que ya existe</span>
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
          placeholder="Casa Martín"
          maxlength="60"
          autocomplete="off"
        />
      </label>
      <label class="label">
        ¿Y tú cómo te llamas?
        <input v-model="memberName" class="field" placeholder="Tu nombre" maxlength="40" autocomplete="given-name" />
      </label>
      <p v-if="createError" class="form-error" role="alert">{{ createError }}</p>
      <button type="submit" class="btn btn-primary btn-block" :disabled="!canCreate">
        {{ creating ? 'Creando…' : 'Crear la lista' }}
      </button>
      <button type="button" class="back-link" @click="mode = 'choose'">
        <AppIcon name="back" :size="16" />
        Volver
      </button>
    </form>

    <form v-else class="onboard-form" @submit.prevent="goToInvite">
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
      <button type="button" class="back-link" @click="mode = 'choose'">
        <AppIcon name="back" :size="16" />
        Volver
      </button>
    </form>
  </div>
</template>

<style scoped>
.intro {
  margin-top: 10px;
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

</style>
