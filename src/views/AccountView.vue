<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import PersonAvatar from '@/components/PersonAvatar.vue'
import { signOut } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { disablePush, enablePush, NOTIFICATION_KINDS, pushState, type PushState } from '@/lib/push'
import { useGroupStore } from '@/stores/group'
import { useToastStore } from '@/stores/toast'
import { PERSON_COLORS } from '@/utils/colors'
import { longDate } from '@/utils/date'
import { friendlyError } from '@/utils/errors'
import { cleanDisplayName } from '@/utils/text'
import type { NotificationKind } from '@/types'

const groupStore = useGroupStore()
const toast = useToastStore()

const me = computed(() => groupStore.me!)
const name = ref(me.value.displayName)
const saving = ref(false)
const leaving = ref(false)
watch(
  () => me.value.displayName,
  (current) => (name.value = current),
)

const nameChanged = computed(() => {
  const clean = cleanDisplayName(name.value)
  return clean !== '' && clean !== me.value.displayName
})

async function saveName() {
  if (!nameChanged.value || saving.value) return
  saving.value = true
  try {
    await groupStore.updatePerson(me.value.id, { displayName: cleanDisplayName(name.value) })
    toast.show('Nombre guardado')
  } catch (e) {
    toast.show(friendlyError(e))
  } finally {
    saving.value = false
  }
}

async function pickColor(color: string) {
  if (color === me.value.color) return
  try {
    await groupStore.updatePerson(me.value.id, { color })
  } catch (e) {
    toast.show(friendlyError(e))
  }
}

// ── Notifications on this device ──────────────────────────────

const push = ref<PushState | null>(null)
const pushBusy = ref(false)
void pushState().then((state) => (push.value = state))

async function togglePush() {
  if (pushBusy.value) return
  pushBusy.value = true
  try {
    if (push.value === 'on') {
      await disablePush()
      push.value = 'off'
    } else {
      push.value = await enablePush()
      if (push.value === 'on') toast.show('Avisos activados en este dispositivo')
    }
  } catch (e) {
    // The browser's own errors (no push service, blocked…) aren't Supabase ones.
    toast.show(e instanceof DOMException ? 'Este navegador no ha podido activar los avisos.' : friendlyError(e))
  } finally {
    pushBusy.value = false
  }
}

// ── Which kinds (for the person, on every device) ─────────────

const savingKinds = ref(false)

async function toggleKind(kind: NotificationKind) {
  if (savingKinds.value) return
  const muted = me.value.mutedNotifications
  savingKinds.value = true
  try {
    await groupStore.updatePerson(me.value.id, {
      mutedNotifications: muted.includes(kind) ? muted.filter((k) => k !== kind) : [...muted, kind],
    })
  } catch (e) {
    toast.show(friendlyError(e))
  } finally {
    savingKinds.value = false
  }
}

// ── AI apps connected with this account (docs/ia.md) ─────────

/** The connector's address, to paste in Claude (Ajustes → Conectores). */
const connectorUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp`
const grants = ref<{ clientId: string; name: string; since: string }[] | null>(null)
const revoking = ref<string | null>(null)

async function loadGrants() {
  const { data, error } = await supabase.auth.oauth.listGrants()
  // Without the OAuth server (a local database without it, say) the section just says there are none.
  grants.value = error ? [] : data.map((g) => ({ clientId: g.client.id, name: g.client.name || 'Una app', since: g.granted_at }))
}
void loadGrants()

async function revoke(clientId: string, name: string) {
  if (revoking.value) return
  revoking.value = clientId
  try {
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId })
    if (error) throw error
    grants.value = grants.value?.filter((g) => g.clientId !== clientId) ?? null
    toast.show(`${name} ya no puede usar tu Family-App`)
  } catch (e) {
    toast.show(friendlyError(e))
  } finally {
    revoking.value = null
  }
}

async function copyConnectorUrl() {
  try {
    await navigator.clipboard.writeText(connectorUrl)
    toast.show('Dirección copiada')
  } catch {
    toast.show('No se pudo copiar. Mantén pulsada la dirección para copiarla.')
  }
}

/** The group store hears the sign-out and starts over; App.vue then shows the sign-in screen. */
async function logOut() {
  leaving.value = true
  try {
    await signOut()
  } catch (e) {
    toast.show(friendlyError(e))
    leaving.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <RouterLink :to="groupStore.status === 'ready' ? { name: 'group' } : { name: 'welcome' }" class="back-link">
        <AppIcon name="back" :size="16" />
        Volver
      </RouterLink>
      <div class="who">
        <PersonAvatar :name="me.displayName" :color="me.color" :size="56" />
        <div>
          <h1 class="display-title">{{ me.displayName }}</h1>
          <p class="muted">{{ groupStore.email }}</p>
        </div>
      </div>
    </header>

    <h2 class="section-title"><span>Tu nombre</span></h2>
    <form class="panel" @submit.prevent="saveName">
      <input v-model="name" class="field" maxlength="60" autocomplete="given-name" aria-label="Tu nombre" />
      <button type="submit" class="btn btn-primary" :disabled="!nameChanged || saving">
        {{ saving ? 'Guardando…' : 'Guardar' }}
      </button>
    </form>

    <h2 class="section-title"><span>Tu color</span></h2>
    <div class="panel colors" role="radiogroup" aria-label="Tu color">
      <button
        v-for="color in PERSON_COLORS"
        :key="color"
        type="button"
        class="swatch"
        role="radio"
        :aria-checked="color === me.color"
        :aria-label="color"
        :style="{ background: color }"
        @click="pickColor(color)"
      >
        <AppIcon v-if="color === me.color" name="check" :size="18" />
      </button>
    </div>
    <p class="muted note">Es el color con el que te verá tu familia en la app.</p>

    <h2 class="section-title"><span>Avisos en este dispositivo</span></h2>
    <div v-if="push" class="panel push">
      <template v-if="push === 'off' || push === 'on'">
        <p>
          {{ push === 'on' ? 'Activados.' : 'Desactivados.' }}
          <span class="muted">Abajo eliges qué te avisa.</span>
        </p>
        <button
          type="button"
          class="btn"
          :class="push === 'on' ? 'btn-ghost' : 'btn-primary'"
          :disabled="pushBusy"
          @click="togglePush"
        >
          <AppIcon name="bell" :size="20" />
          {{ push === 'on' ? 'Desactivar' : 'Activar avisos' }}
        </button>
      </template>
      <p v-else-if="push === 'install-first'" class="muted">
        En iPhone y iPad los avisos solo llegan con la app en la pantalla de inicio. En Safari, toca
        <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>; ábrela desde ese icono y vuelve aquí.
      </p>
      <p v-else-if="push === 'denied'" class="muted">
        Los avisos están bloqueados para esta app. Permítelos en los ajustes del navegador o del móvil y vuelve aquí.
      </p>
      <p v-else class="muted">Este navegador no puede recibir avisos.</p>
    </div>

    <h2 class="section-title"><span>Qué te avisa</span></h2>
    <div class="panel kinds">
      <div class="choices">
        <button
          v-for="k in NOTIFICATION_KINDS"
          :key="k.kind"
          type="button"
          class="choice"
          :aria-pressed="!me.mutedNotifications.includes(k.kind)"
          :disabled="savingKinds"
          @click="toggleKind(k.kind)"
        >
          <AppIcon v-if="!me.mutedNotifications.includes(k.kind)" name="check" :size="16" />
          {{ k.label }}
        </button>
      </div>
    </div>
    <p class="muted note">Vale para todos tus dispositivos.</p>

    <h2 class="section-title"><span>Conectado con IA</span></h2>
    <div v-if="grants" class="panel ai">
      <ul v-if="grants.length" class="grants">
        <li v-for="g in grants" :key="g.clientId">
          <div>
            <strong>{{ g.name }}</strong>
            <span class="muted"> · desde el {{ longDate(g.since) }}</span>
          </div>
          <button type="button" class="btn btn-ghost" :disabled="revoking === g.clientId" @click="revoke(g.clientId, g.name)">
            {{ revoking === g.clientId ? 'Quitando…' : 'Quitar acceso' }}
          </button>
        </li>
      </ul>
      <p v-else class="muted">Ninguna app de IA tiene acceso a tu Family-App.</p>
      <p class="muted small">
        Para usarla desde Claude: en Claude, Ajustes → Conectores → Añadir conector personalizado, con esta dirección:
      </p>
      <button type="button" class="connector-url" @click="copyConnectorUrl">
        <span>{{ connectorUrl }}</span>
        <AppIcon name="copy" :size="18" />
      </button>
    </div>
    <p class="muted note">Ven y cambian lo mismo que tú, pero no pueden borrar nada ni cambiar tus grupos.</p>

    <div class="logout">
      <button type="button" class="btn btn-ghost btn-block" :disabled="leaving" @click="logOut">
        <AppIcon name="logout" :size="20" />
        {{ leaving ? 'Cerrando sesión…' : 'Cerrar sesión' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.who {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 16px;
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

.colors {
  flex-wrap: wrap;
}

.swatch {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: #fff;
}

.swatch[aria-checked='true'] {
  box-shadow:
    0 0 0 3px var(--surface),
    0 0 0 5px var(--text);
}

.note {
  padding: 8px var(--gutter) 0;
  font-size: 0.875rem;
}

.push {
  flex-direction: column;
  align-items: flex-start;
}

.push p {
  font-size: 0.9375rem;
}

.kinds {
  flex-direction: column;
}

.ai {
  flex-direction: column;
}

.grants {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.grants li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.9375rem;
}

.small {
  font-size: 0.875rem;
}

.connector-url {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: var(--bg);
  font-family: ui-monospace, monospace;
  font-size: 0.8125rem;
  text-align: left;
  overflow-wrap: anywhere;
  user-select: text;
}

.logout {
  margin-top: 32px;
  padding: 0 var(--gutter);
}
</style>
