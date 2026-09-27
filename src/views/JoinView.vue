<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { useGroupStore, type InvitePreview } from '@/stores/group'
import { friendlyError } from '@/utils/errors'
import { cleanDisplayName } from '@/utils/text'

/** name → (if the name is taken) confirm → (if they are different people) extra */
type Step = 'name' | 'confirm' | 'extra'

const groupStore = useGroupStore()
const route = useRoute()
const router = useRouter()

const code = computed(() => String(route.params.code ?? ''))
const preview = ref<InvitePreview | null>(null)
const loading = ref(true)
const step = ref<Step>('name')
const memberName = ref('')
const extra = ref('')
/** Existing member with the same normalized name. */
const match = ref<{ id: string; name: string } | null>(null)
const saving = ref(false)
const error = ref<string | null>(null)
const extraInput = useTemplateRef<HTMLInputElement>('extraInput')

const alreadyMember = computed(() => groupStore.status === 'ready' && preview.value?.id === groupStore.group.id)

const membersLabel = computed(() => {
  const n = preview.value?.memberCount ?? 0
  return n === 1 ? '1 persona' : `${n} personas`
})

const baseName = computed(() => cleanDisplayName(memberName.value))
const finalName = computed(() => `${baseName.value} (${cleanDisplayName(extra.value)})`)

onMounted(async () => {
  try {
    preview.value = await groupStore.previewInvite(code.value)
  } catch (e) {
    error.value = friendlyError(e)
  } finally {
    loading.value = false
  }
})

/** Runs a step's server call with the shared saving/error handling. */
async function run(action: () => Promise<void>) {
  if (saving.value) return
  saving.value = true
  error.value = null
  try {
    await action()
  } catch (e) {
    error.value = friendlyError(e)
  } finally {
    saving.value = false
  }
}

async function joinAs(name: string) {
  await groupStore.joinGroup(code.value, name)
  await router.replace({ name: 'list' })
}

function submitName() {
  if (!baseName.value) return
  return run(async () => {
    const existing = await groupStore.findMemberByName(code.value, baseName.value)
    if (existing) {
      match.value = existing
      step.value = 'confirm'
      return
    }
    await joinAs(baseName.value)
  })
}

function itsMe() {
  return run(async () => {
    await groupStore.claimMember(code.value, match.value!.id)
    await router.replace({ name: 'list' })
  })
}

async function differentPeople() {
  error.value = null
  step.value = 'extra'
  await nextTick()
  extraInput.value?.focus()
}

function submitExtra() {
  if (!extra.value.trim()) return
  return run(async () => {
    if (await groupStore.findMemberByName(code.value, finalName.value)) {
      error.value = `También hay alguien llamado ${finalName.value}. Prueba con otro apodo o apellido.`
      return
    }
    await joinAs(finalName.value)
  })
}

function changeName() {
  error.value = null
  extra.value = ''
  match.value = null
  step.value = 'name'
}
</script>

<template>
  <div class="onboard">
    <p class="eyebrow">Compra Familiar</p>

    <p v-if="loading" class="muted">Buscando la invitación…</p>

    <template v-else-if="!preview">
      <h1 class="display-title">Invitación no encontrada</h1>
      <p class="muted">{{ error ?? 'Ese enlace no es válido. Pide a quien te lo envió que lo copie otra vez.' }}</p>
      <RouterLink :to="{ name: 'list' }" class="btn btn-ghost">Volver</RouterLink>
    </template>

    <template v-else-if="alreadyMember">
      <h1 class="display-title">{{ preview.name }}</h1>
      <p class="muted">Ya formas parte de este grupo.</p>
      <RouterLink :to="{ name: 'list' }" class="btn btn-primary btn-block">Ir a la lista</RouterLink>
    </template>

    <template v-else>
      <header>
        <p class="muted">Te han invitado a la lista de</p>
        <h1 class="display-title">{{ preview.name }}</h1>
        <p class="muted">{{ membersLabel }} ya la usan</p>
      </header>

      <form v-if="step === 'name'" class="onboard-form" @submit.prevent="submitName">
        <label class="label">
          ¿Cómo te llamas?
          <input
            v-model="memberName"
            class="field"
            placeholder="Así te verán los demás"
            maxlength="40"
            autocomplete="given-name"
          />
        </label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button type="submit" class="btn btn-primary btn-block" :disabled="!baseName || saving">
          {{ saving ? 'Entrando…' : `Unirme a ${preview.name}` }}
        </button>
      </form>

      <section v-else-if="step === 'confirm'" class="onboard-form" aria-live="polite">
        <p class="question">
          Ya hay alguien llamado <strong>{{ match!.name }}</strong> en este grupo. ¿Eres tú entrando desde otro
          dispositivo, o sois personas distintas?
        </p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button type="button" class="btn btn-primary btn-block" :disabled="saving" @click="itsMe">
          {{ saving ? 'Entrando…' : 'Soy yo, es solo otro dispositivo' }}
        </button>
        <button type="button" class="btn btn-ghost btn-block" :disabled="saving" @click="differentPeople">
          Somos personas distintas
        </button>
        <button type="button" class="back-link" @click="changeName">
          <AppIcon name="back" :size="16" />
          Cambiar mi nombre
        </button>
      </section>

      <form v-else class="onboard-form" @submit.prevent="submitExtra">
        <label class="label">
          Añade un apodo o apellido para distinguirte de {{ match!.name }}
          <input
            ref="extraInput"
            v-model="extra"
            class="field"
            placeholder="Por ejemplo, un apellido"
            maxlength="16"
            autocomplete="off"
          />
        </label>
        <p v-if="extra.trim()" class="muted preview-name">
          Aparecerás como <strong>{{ finalName }}</strong>
        </p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button type="submit" class="btn btn-primary btn-block" :disabled="!extra.trim() || saving">
          {{ saving ? 'Entrando…' : 'Unirme' }}
        </button>
        <button type="button" class="back-link" @click="step = 'confirm'">
          <AppIcon name="back" :size="16" />
          Volver
        </button>
      </form>
    </template>
  </div>
</template>

<style scoped>
.question {
  font-size: 1.0625rem;
}

.preview-name {
  font-size: 0.9375rem;
}

</style>
