<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGroupStore } from '@/stores/group'
import { friendlyError } from '@/utils/errors'

const groupStore = useGroupStore()
const router = useRouter()

const groupName = ref('')
const memberName = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

const canSubmit = computed(() => groupName.value.trim() && memberName.value.trim() && !saving.value)

async function create() {
  if (!canSubmit.value) return
  saving.value = true
  error.value = null
  try {
    await groupStore.createGroup(groupName.value.trim(), memberName.value.trim())
    await router.replace({ name: 'group' })
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
      <h1 class="display-title">La lista de la compra de toda la casa</h1>
      <p class="muted intro">
        Cualquiera apunta lo que falta y quien va a comprar lo va marcando. Sin cuentas ni contraseñas.
      </p>
    </header>

    <form class="onboard-form" @submit.prevent="create">
      <label class="label">
        ¿Cómo se llama el grupo?
        <input v-model="groupName" class="field" placeholder="Casa Martín" maxlength="60" autocomplete="off" />
      </label>
      <label class="label">
        ¿Y tú cómo te llamas?
        <input v-model="memberName" class="field" placeholder="Tu nombre" maxlength="40" autocomplete="given-name" />
      </label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button type="submit" class="btn btn-primary btn-block" :disabled="!canSubmit">
        {{ saving ? 'Creando…' : 'Crear la lista' }}
      </button>
    </form>

    <p class="muted hint">
      ¿Alguien de tu familia ya la usa? Pídele el enlace de invitación (en su pestaña <strong>Grupo</strong>) y ábrelo
      aquí.
    </p>
  </div>
</template>

<style scoped>
.intro {
  margin-top: 10px;
  font-size: 1.0625rem;
}

.hint {
  font-size: 0.9375rem;
}
</style>
