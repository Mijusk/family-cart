<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { sendPasswordReset, signIn, signUp } from '@/lib/auth'
import { useGroupStore } from '@/stores/group'
import { friendlyError } from '@/utils/errors'
import { cleanDisplayName } from '@/utils/text'

type Mode = 'login' | 'signup' | 'forgot'

const MIN_PASSWORD = 8

const groupStore = useGroupStore()
const route = useRoute()
const router = useRouter()

const mode = ref<Mode>('login')
const name = ref('')
const email = ref('')
const password = ref('')
const saving = ref(false)
const error = ref<string | null>(null)
/** Shown instead of the form once an email has been sent (confirmation or password reset). */
const sentTo = ref<{ kind: 'confirm' | 'reset'; email: string } | null>(null)
const nameInput = useTemplateRef<HTMLInputElement>('nameInput')
const emailInput = useTemplateRef<HTMLInputElement>('emailInput')

/** An invite link opened while signed out comes back here after signing in. */
const redirect = computed(() => {
  const r = route.query.redirect
  return typeof r === 'string' && r.startsWith('/') ? r : '/'
})
const comingFromInvite = computed(() => redirect.value.startsWith('/unirse/'))

const canSubmit = computed(() => {
  if (saving.value || !email.value.trim()) return false
  if (mode.value === 'forgot') return true
  if (mode.value === 'signup' && !name.value.trim()) return false
  return password.value.length >= (mode.value === 'signup' ? MIN_PASSWORD : 1)
})

async function switchTo(next: Mode) {
  mode.value = next
  error.value = null
  password.value = ''
  await nextTick()
  ;(next === 'signup' ? nameInput.value : emailInput.value)?.focus()
}

async function enter() {
  await groupStore.reload()
  await router.replace(redirect.value)
}

async function submit() {
  if (!canSubmit.value) return
  saving.value = true
  error.value = null
  try {
    if (mode.value === 'login') {
      await signIn(email.value, password.value)
      await enter()
    } else if (mode.value === 'signup') {
      const signedIn = await signUp(cleanDisplayName(name.value), email.value, password.value)
      if (signedIn) await enter()
      else sentTo.value = { kind: 'confirm', email: email.value.trim() }
    } else {
      await sendPasswordReset(email.value)
      sentTo.value = { kind: 'reset', email: email.value.trim() }
    }
  } catch (e) {
    error.value = friendlyError(e)
  } finally {
    saving.value = false
  }
}

function backToLogin() {
  sentTo.value = null
  void switchTo('login')
}
</script>

<template>
  <div class="onboard">
    <header>
      <p class="eyebrow">Family-App</p>
      <h1 class="display-title">
        <template v-if="sentTo">Revisa tu email</template>
        <template v-else-if="mode === 'login'">Entrar</template>
        <template v-else-if="mode === 'signup'">Crear cuenta</template>
        <template v-else>Recuperar contraseña</template>
      </h1>
      <p v-if="!sentTo && comingFromInvite" class="muted intro">
        Te han invitado a un grupo. Entra o crea tu cuenta para pedir unirte.
      </p>
      <p v-else-if="!sentTo && mode === 'login'" class="muted intro">
        La compra y los horarios de toda la familia, en un solo sitio.
      </p>
    </header>

    <section v-if="sentTo" class="onboard-form" aria-live="polite">
      <p v-if="sentTo.kind === 'confirm'">
        Te hemos enviado un enlace a <strong>{{ sentTo.email }}</strong>. Ábrelo para confirmar la cuenta y entrarás
        directamente.
      </p>
      <p v-else>
        Si hay una cuenta con <strong>{{ sentTo.email }}</strong>, te llegará un enlace para elegir una contraseña nueva.
      </p>
      <p class="muted small">¿No lo ves? Mira en la carpeta de spam.</p>
      <button type="button" class="back-link" @click="backToLogin">
        <AppIcon name="back" :size="16" />
        Volver a entrar
      </button>
    </section>

    <form v-else class="onboard-form" novalidate @submit.prevent="submit">
      <label v-if="mode === 'signup'" class="label">
        ¿Cómo te llamas?
        <input
          ref="nameInput"
          v-model="name"
          class="field"
          placeholder="Así te verá tu familia"
          maxlength="60"
          autocomplete="given-name"
        />
      </label>
      <label class="label">
        Email
        <input
          ref="emailInput"
          v-model="email"
          class="field"
          type="email"
          inputmode="email"
          placeholder="tu@email.com"
          autocomplete="email"
          autocapitalize="off"
          spellcheck="false"
        />
      </label>
      <label v-if="mode !== 'forgot'" class="label">
        Contraseña
        <input
          v-model="password"
          class="field"
          type="password"
          :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
          :minlength="mode === 'signup' ? MIN_PASSWORD : undefined"
        />
        <span v-if="mode === 'signup'" class="muted hint">Al menos {{ MIN_PASSWORD }} caracteres</span>
      </label>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>

      <button type="submit" class="btn btn-primary btn-block" :disabled="!canSubmit">
        <template v-if="mode === 'login'">{{ saving ? 'Entrando…' : 'Entrar' }}</template>
        <template v-else-if="mode === 'signup'">{{ saving ? 'Creando…' : 'Crear cuenta' }}</template>
        <template v-else>{{ saving ? 'Enviando…' : 'Enviarme un enlace' }}</template>
      </button>

      <div class="switches">
        <template v-if="mode === 'login'">
          <button type="button" class="link-btn" @click="switchTo('signup')">No tengo cuenta: crear una</button>
          <button type="button" class="link-btn" @click="switchTo('forgot')">He olvidado la contraseña</button>
        </template>
        <button v-else type="button" class="back-link" @click="switchTo('login')">
          <AppIcon name="back" :size="16" />
          Ya tengo cuenta
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.intro {
  margin-top: 10px;
  font-size: 1.0625rem;
}

.hint,
.small {
  font-size: 0.8125rem;
  font-weight: 400;
}

.switches {
  display: grid;
  justify-items: start;
  gap: 4px;
}

.link-btn {
  min-height: 40px;
  color: var(--primary);
  font-weight: 600;
  text-align: left;
}
</style>
