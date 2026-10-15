<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import GroupSwitcher from '@/components/GroupSwitcher.vue'
</script>

<template>
  <!-- Placeholder until the calendar itself lands (docs/calendario.md, PR 3 onwards). -->
  <div class="page">
    <header class="page-header">
      <p class="eyebrow">Calendario</p>
      <GroupSwitcher />
    </header>
    <section class="soon">
      <span class="soon-icon"><AppIcon name="calendar" :size="28" /></span>
      <h2>El calendario está en camino</h2>
      <p class="muted">
        Aquí veréis la rutina, los horarios y los eventos de cada persona del grupo. De momento, el grupo ya está
        preparado para usarlo.
      </p>
    </section>
  </div>
</template>

<style scoped>
.soon {
  display: grid;
  justify-items: center;
  gap: 10px;
  margin-top: 24px;
  padding: 32px var(--gutter);
  text-align: center;
}

.soon h2 {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.5rem;
}

.soon-icon {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
}
</style>
