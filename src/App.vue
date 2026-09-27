<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import BottomNav from '@/components/BottomNav.vue'
import UndoToast from '@/components/UndoToast.vue'
import { useGroupStore } from '@/stores/group'

const route = useRoute()
const router = useRouter()
const groupStore = useGroupStore()

const canShowRoute = computed(
  () => groupStore.status === 'error' || groupStore.status === 'ready' || (groupStore.status === 'no-group' && route.meta.public),
)

async function retry() {
  await groupStore.init()
  // The router guard let this route through while offline; apply its redirects now.
  if (groupStore.status === 'no-group' && !route.meta.public) await router.replace({ name: 'welcome' })
}
</script>

<template>
  <!-- Without the tab bar, --nav-height drops to 0 so docked buttons and toasts sit at the bottom edge. -->
  <div class="app" :class="{ 'no-nav': route.meta.hideNav || groupStore.status !== 'ready' }">
    <main class="column">
      <!-- Screens that need a group never render without one (e.g. just after leaving the last group). -->
      <div v-if="!canShowRoute" class="onboard" aria-busy="true">
        <p class="eyebrow">Compra Familiar</p>
        <p class="muted">Cargando la lista…</p>
      </div>

      <div v-else-if="groupStore.status === 'error'" class="onboard" role="alert">
        <p class="eyebrow">Compra Familiar</p>
        <h1 class="display-title">No se pudo conectar</h1>
        <p class="muted">Comprueba la conexión a internet e inténtalo otra vez.</p>
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

.column {
  max-width: var(--column);
  margin-inline: auto;
}
</style>
