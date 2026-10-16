<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import BottomNav from '@/components/BottomNav.vue'
import UndoToast from '@/components/UndoToast.vue'
import { sectionRedirect } from '@/router'
import { useGroupStore } from '@/stores/group'

const route = useRoute()
const router = useRouter()
const groupStore = useGroupStore()

const canShowRoute = computed(() => {
  if (route.meta.anyone) return groupStore.status !== 'loading'
  switch (groupStore.status) {
    case 'error':
    case 'ready':
      return true
    case 'signed-out':
      return !!route.meta.guest
    case 'no-group':
      return !!route.meta.public
    default:
      return false
  }
})

// The session can change under the current screen: signing out (here or in another tab), being
// removed from the group, or an admin switching off the section on screen.
watch(
  () => [groupStore.status, groupStore.status === 'ready' && groupStore.group] as const,
  async ([status]) => {
    // The sign-in screen moves on by itself once the new session has loaded.
    if (route.meta.guest || route.meta.anyone) return
    if (status === 'signed-out') {
      await router.replace({ name: 'login' })
    } else if (status === 'no-group' && !route.meta.public) {
      await router.replace({ name: 'welcome' })
    } else if (status === 'ready') {
      const redirect = sectionRedirect(route)
      if (redirect) await router.replace(redirect)
    }
  },
)

async function retry() {
  await groupStore.init()
  // The router guard let this route through while offline; apply its redirects now.
  if (groupStore.status === 'signed-out' && !route.meta.guest) await router.replace({ name: 'login' })
  else if (groupStore.status === 'no-group' && !route.meta.public) await router.replace({ name: 'welcome' })
}
</script>

<template>
  <!-- Without the tab bar, --nav-height drops to 0 so docked buttons and toasts sit at the bottom edge. -->
  <div class="app" :class="{ 'no-nav': route.meta.hideNav || groupStore.status !== 'ready' }">
    <main class="column">
      <!-- Screens that need a group never render without one (e.g. just after leaving the last group). -->
      <div v-if="!canShowRoute" class="onboard" aria-busy="true">
        <p class="eyebrow">Family App</p>
        <p class="muted">Cargando…</p>
      </div>

      <div v-else-if="groupStore.status === 'error'" class="onboard" role="alert">
        <p class="eyebrow">Family App</p>
        <template v-if="groupStore.offline">
          <h1 class="display-title">No se pudo conectar</h1>
          <p class="muted">Comprueba la conexión a internet e inténtalo otra vez.</p>
        </template>
        <template v-else>
          <h1 class="display-title">Algo ha fallado al cargar</h1>
          <p class="muted">El servidor ha respondido con un error. Si vuelve a pasar, pasa este detalle a quien mantiene la app:</p>
          <p class="error-detail">{{ groupStore.errorMessage }}</p>
        </template>
        <button type="button" class="btn btn-primary btn-block" @click="retry">Reintentar</button>
      </div>

      <RouterView v-else />
    </main>
    <BottomNav v-if="groupStore.status === 'ready' && !route.meta.hideNav" />
    <UndoToast />
  </div>
</template>

<style scoped>
.app.no-nav {
  --nav-height: 0px;
}

.error-detail {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--line);
  font-family: ui-monospace, monospace;
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
  user-select: text;
}

.column {
  max-width: var(--column);
  margin-inline: auto;
}
</style>
