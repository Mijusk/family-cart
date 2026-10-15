<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useGroupStore, type InvitePreview } from '@/stores/group'
import { useToastStore } from '@/stores/toast'
import { friendlyError } from '@/utils/errors'

const groupStore = useGroupStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

const code = computed(() => String(route.params.code ?? ''))
const preview = ref<InvitePreview | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)

const alreadyMember = computed(() => !!preview.value && groupStore.isActiveMemberOf(preview.value.id))
const waiting = computed(() => !!preview.value && groupStore.isPendingIn(preview.value.id))

const membersLabel = computed(() => {
  const n = preview.value?.memberCount ?? 0
  return n === 1 ? '1 persona' : `${n} personas`
})

onMounted(async () => {
  try {
    preview.value = await groupStore.previewInvite(code.value)
  } catch (e) {
    error.value = friendlyError(e)
  } finally {
    loading.value = false
  }
})

async function openGroup() {
  await groupStore.switchGroup(preview.value!.id)
  await router.replace('/')
}

// Approval arrives in real time (see subscribeToMine in the group store): go straight in.
watch(alreadyMember, (isMember, wasMember) => {
  if (isMember && wasMember === false && !loading.value) {
    toast.show(`Ya estás en ${preview.value!.name}`)
    void openGroup()
  }
})

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

const requestJoin = () => run(() => groupStore.requestJoin(code.value))

const withdraw = () =>
  run(async () => {
    await groupStore.cancelRequest(preview.value!.id)
    toast.show('Has retirado tu solicitud')
  })
</script>

<template>
  <div class="onboard">
    <p class="eyebrow">Compra Familiar</p>

    <p v-if="loading" class="muted">Buscando la invitación…</p>

    <template v-else-if="!preview">
      <h1 class="display-title">Invitación no encontrada</h1>
      <p class="muted">{{ error ?? 'Ese enlace no es válido. Pide a quien te lo envió que lo copie otra vez.' }}</p>
      <RouterLink to="/" class="btn btn-ghost">Volver</RouterLink>
    </template>

    <template v-else-if="alreadyMember">
      <h1 class="display-title">{{ preview.name }}</h1>
      <p class="muted">Ya formas parte de este grupo.</p>
      <button type="button" class="btn btn-primary btn-block" @click="openGroup">Ir al grupo</button>
    </template>

    <template v-else-if="waiting">
      <header>
        <p class="muted">Has pedido unirte a</p>
        <h1 class="display-title">{{ preview.name }}</h1>
      </header>
      <section class="onboard-form" aria-live="polite">
        <p>
          Un administrador del grupo tiene que aceptarte. En cuanto lo haga entrarás solo; puedes cerrar la app mientras
          tanto.
        </p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button type="button" class="btn btn-ghost btn-block" :disabled="saving" @click="withdraw">
          Retirar la solicitud
        </button>
      </section>
      <RouterLink to="/" class="back-link">Volver al inicio</RouterLink>
    </template>

    <template v-else>
      <header>
        <p class="muted">Te han invitado a</p>
        <h1 class="display-title">{{ preview.name }}</h1>
        <p class="muted">{{ membersLabel }} ya están dentro</p>
      </header>
      <section class="onboard-form">
        <p>
          Entrarás como <strong>{{ groupStore.me?.displayName }}</strong>. Un administrador del grupo tendrá que aceptar
          tu solicitud.
        </p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button type="button" class="btn btn-primary btn-block" :disabled="saving" @click="requestJoin">
          {{ saving ? 'Enviando…' : `Pedir unirme a ${preview.name}` }}
        </button>
      </section>
      <RouterLink :to="{ name: 'account' }" class="back-link">¿No eres tú? Cambia de cuenta</RouterLink>
    </template>
  </div>
</template>
