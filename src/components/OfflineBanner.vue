<script setup lang="ts">
import { computed } from 'vue'
import { online } from '@/lib/offline'
import { useGroupStore } from '@/stores/group'
import { useListStore } from '@/stores/list'

// A thin bar while there is no connection, or the app shows the copy saved on this device.

const groupStore = useGroupStore()
const list = useListStore()

const detail = computed(() => {
  const n = list.pendingWrites
  if (n) return `${n} ${n === 1 ? 'cambio se guardará' : 'cambios se guardarán'} al volver la conexión`
  if (groupStore.savedCopy) return 'Ves lo último que se cargó en este dispositivo'
  return 'Lo que cambies en la compra se guardará al volver la conexión'
})
</script>

<template>
  <div v-if="!online || groupStore.savedCopy" class="offline" role="status">
    <strong>{{ online ? 'Conectando…' : 'Sin conexión' }}</strong>
    <span>{{ detail }}</span>
  </div>
</template>

<style scoped>
.offline {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  justify-content: center;
  padding: 6px var(--gutter);
  background: var(--warn-soft);
  color: var(--warn);
  font-size: 0.8125rem;
  line-height: 1.3;
  text-align: center;
}
</style>
