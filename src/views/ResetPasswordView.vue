<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { setNewPassword } from '@/lib/auth'
import { useGroupStore } from '@/stores/group'
import { useToastStore } from '@/stores/toast'
import { friendlyError } from '@/utils/errors'

const MIN_PASSWORD = 8

// The link in the email signs this browser in (Supabase reads it from the URL), so by the time
// this screen shows, a valid link means a session. Without one the link was old or already used.
const groupStore = useGroupStore()
const toast = useToastStore()
const router = useRouter()

const password = ref('')
const saving = ref(false)
const error = ref<string | null>(null)
const hasSession = computed(() => groupStore.status !== 'signed-out')
const canSubmit = computed(() => password.value.length >= MIN_PASSWORD && !saving.value)

async function submit() {
  if (!canSubmit.value) return
  saving.value = true
  error.value = null
  try {
    await setNewPassword(password.value)
    toast.show('Contraseña cambiada')
    await router.replace('/')
  } catch (e) {
    error.value = friendlyError(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="onboard">
    <header>
      <p class="eyebrow">Compra Familiar</p>
      <h1 class="display-title">{{ hasSession ? 'Nueva contraseña' : 'Enlace caducado' }}</h1>
    </header>

    <form v-if="hasSession" class="onboard-form" @submit.prevent="submit">
      <label class="label">
        Elige una contraseña nueva
        <input
          v-model="password"
          class="field"
          type="password"
          autocomplete="new-password"
          :minlength="MIN_PASSWORD"
          autofocus
        />
        <span class="muted hint">Al menos {{ MIN_PASSWORD }} caracteres</span>
      </label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button type="submit" class="btn btn-primary btn-block" :disabled="!canSubmit">
        {{ saving ? 'Guardando…' : 'Guardar contraseña' }}
      </button>
    </form>

    <template v-else>
      <p class="muted">Este enlace ya se usó o ha caducado. Pide otro desde la pantalla de entrar.</p>
      <RouterLink :to="{ name: 'login' }" class="btn btn-primary btn-block">Ir a entrar</RouterLink>
    </template>
  </div>
</template>

<style scoped>
.hint {
  font-size: 0.8125rem;
  font-weight: 400;
}
</style>
