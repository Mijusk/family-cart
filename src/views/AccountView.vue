<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import PersonAvatar from '@/components/PersonAvatar.vue'
import { signOut } from '@/lib/auth'
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

.logout {
  margin-top: 32px;
  padding: 0 var(--gutter);
}
</style>
