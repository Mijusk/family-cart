<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import BottomNav from '@/components/BottomNav.vue'
import UndoToast from '@/components/UndoToast.vue'

const route = useRoute()
</script>

<template>
  <!-- Without the tab bar, --nav-height drops to 0 so docked buttons and toasts sit at the bottom edge. -->
  <div class="app" :class="{ 'no-nav': route.meta.hideNav }">
    <main class="column">
      <RouterView />
    </main>
    <BottomNav v-if="!route.meta.hideNav" />
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
