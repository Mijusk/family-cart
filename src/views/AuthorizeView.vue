<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { supabase } from '@/lib/supabase'
import { useGroupStore } from '@/stores/group'
import { friendlyError } from '@/utils/errors'

// Consent screen of Supabase Auth's OAuth 2.1 server (docs/ia.md): an AI app (Claude…) sends the
// person here with ?authorization_id=… to let it use Family App with their account. Signed out,
// the router guard goes through /entrar and comes back. Allowing or cancelling hands the browser
// back to the app's own address, which Supabase gives.

const route = useRoute()
const groupStore = useGroupStore()

const authorizationId = computed(() => (typeof route.query.authorization_id === 'string' ? route.query.authorization_id : ''))
const status = ref<'loading' | 'ask' | 'leaving' | 'error'>('loading')
const error = ref<string | null>(null)
const clientName = ref('')
/** Where the browser goes back to, shown so a look-alike app can't pass for Claude unnoticed. */
const returnHost = ref('')
const busy = ref<'allow' | 'deny' | null>(null)

function leave(url: string) {
  status.value = 'leaving'
  window.location.assign(url)
}

async function load() {
  if (!authorizationId.value) {
    status.value = 'error'
    error.value = 'Falta el código de la autorización. Vuelve a conectar Family App desde la app de IA.'
    return
  }
  const { data, error: e } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId.value)
  if (e || !data) {
    status.value = 'error'
    error.value = /not found|expired|invalid/i.test(e?.message ?? '')
      ? 'Este enlace de autorización ha caducado o ya se ha usado. Vuelve a conectar Family App desde la app de IA.'
      : friendlyError(e)
    return
  }
  // Already allowed before: Supabase answers with where to go back to.
  if (!('authorization_id' in data)) return leave(data.redirect_url)
  clientName.value = data.client.name || 'Una app'
  try {
    returnHost.value = new URL(data.redirect_uri).host
  } catch {
    returnHost.value = data.redirect_uri
  }
  status.value = 'ask'
}

async function answer(allow: boolean) {
  if (busy.value) return
  busy.value = allow ? 'allow' : 'deny'
  error.value = null
  const { data, error: e } = allow
    ? await supabase.auth.oauth.approveAuthorization(authorizationId.value)
    : await supabase.auth.oauth.denyAuthorization(authorizationId.value)
  if (e || !data) {
    error.value = friendlyError(e)
    busy.value = null
    return
  }
  leave(data.redirect_url)
}

void load().catch((e) => {
  status.value = 'error'
  error.value = friendlyError(e)
})
</script>

<template>
  <div class="onboard">
    <header>
      <p class="eyebrow">Family App</p>
      <template v-if="status === 'ask'">
        <h1 class="display-title">{{ clientName }} quiere acceder a tu Family App</h1>
        <p class="muted intro">Con tu cuenta {{ groupStore.email }}.</p>
      </template>
      <h1 v-else-if="status === 'error'" class="display-title">No se puede conectar</h1>
      <h1 v-else class="display-title">Un momento…</h1>
    </header>

    <template v-if="status === 'ask'">
      <ul class="onboard-form grants">
        <li>
          <AppIcon name="calendar" :size="20" />
          <span>Ver tu calendario, tus tareas y la lista de la compra: lo mismo que ves tú en la app.</span>
        </li>
        <li>
          <AppIcon name="edit" :size="20" />
          <span>Crear y cambiar eventos y tareas, y añadir cosas a la compra. Te preguntará antes de hacerlo.</span>
        </li>
        <li>
          <AppIcon name="trash" :size="20" />
          <span>No podrá borrar nada ni cambiar tus grupos.</span>
        </li>
      </ul>
      <p class="muted small">
        Al permitirlo vuelves a <strong>{{ returnHost }}</strong>. Puedes quitarle el acceso cuando quieras en Cuenta → Conectado con IA.
      </p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" class="btn btn-primary btn-block" :disabled="!!busy" @click="answer(true)">
          {{ busy === 'allow' ? 'Conectando…' : 'Permitir' }}
        </button>
        <button type="button" class="btn btn-ghost btn-block" :disabled="!!busy" @click="answer(false)">Cancelar</button>
      </div>
    </template>

    <p v-else-if="status === 'error'" class="form-error" role="alert">{{ error }}</p>
    <p v-else class="muted" aria-busy="true">{{ status === 'leaving' ? 'Volviendo a la app…' : 'Cargando…' }}</p>
  </div>
</template>

<style scoped>
.intro {
  margin-top: 8px;
}

.grants {
  list-style: none;
  margin-block: 0;
}

.grants li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  font-size: 0.9375rem;
}

.grants li :deep(svg) {
  flex: none;
  margin-top: 1px;
  color: var(--text-2);
}

.small {
  font-size: 0.875rem;
}

.actions {
  display: grid;
  gap: 10px;
}
</style>
