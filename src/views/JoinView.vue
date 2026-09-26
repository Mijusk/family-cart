<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useGroupStore, type InvitePreview } from '@/stores/group'
import { friendlyError } from '@/utils/errors'

const groupStore = useGroupStore()
const route = useRoute()
const router = useRouter()

const code = computed(() => String(route.params.code ?? ''))
const preview = ref<InvitePreview | null>(null)
const loading = ref(true)
const memberName = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

const alreadyMember = computed(() => groupStore.status === 'ready' && preview.value?.id === groupStore.group.id)

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

async function join() {
  if (!memberName.value.trim() || saving.value) return
  saving.value = true
  error.value = null
  try {
    await groupStore.joinGroup(code.value, memberName.value.trim())
    await router.replace({ name: 'list' })
  } catch (e) {
    error.value = friendlyError(e)
  } finally {
    saving.value = false
  }
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

      <form class="onboard-form" @submit.prevent="join">
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
        <button type="submit" class="btn btn-primary btn-block" :disabled="!memberName.trim() || saving">
          {{ saving ? 'Entrando…' : `Unirme a ${preview.name}` }}
        </button>
      </form>
    </template>
  </div>
</template>
