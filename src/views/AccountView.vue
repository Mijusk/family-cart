<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import PersonAvatar from '@/components/PersonAvatar.vue'
import { signOut } from '@/lib/auth'
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push'
import { useGroupStore } from '@/stores/group'
import { useToastStore } from '@/stores/toast'
import { PERSON_COLORS } from '@/utils/colors'
import { friendlyError } from '@/utils/errors'
import { cleanDisplayName } from '@/utils/text'

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
          <span class="muted">Recordatorios de eventos, tareas que te asignen y solicitudes para entrar en tus grupos.</span>
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

.logout {
  margin-top: 32px;
  padding: 0 var(--gutter);
}
</style>
