<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import BottomNav from '@/components/BottomNav.vue'
import OfflineBanner from '@/components/OfflineBanner.vue'
import UndoToast from '@/components/UndoToast.vue'
import { useOnResume } from '@/composables/resume'
import { sectionRedirect } from '@/router'
import { useGroupStore } from '@/stores/group'
import { useInboxStore } from '@/stores/inbox'

const route = useRoute()
const router = useRouter()
const groupStore = useGroupStore()
const inbox = useInboxStore()

/** The greeting, the bell and the menu go with the tab bar. */
const withChrome = computed(() => groupStore.status === 'ready' && !route.meta.hideNav)

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

// The tab bar (and the page's button above it, .dock) slides away while scrolling down, to leave
// the screen to the content, and comes back when scrolling up, near the top or the bottom, and on every change of screen (back
// button included), so it is never left hidden. Only the person's own scrolling hides it: a view
// that scrolls by itself (Semana opening on today) leaves it in place.
const navHidden = ref(false)
const SCROLL_SLACK = 12
/** How long after a touch, wheel or key a scroll still counts as the person's (momentum included). */
const INPUT_WINDOW_MS = 1500
let lastY = 0
let lastInput = -Infinity
let ticking = false

function onInput() {
  lastInput = performance.now()
}

function onScroll() {
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => {
    ticking = false
    const y = Math.max(0, window.scrollY)
    const nearTop = y < 80
    const nearBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 40
    if (nearTop || nearBottom) navHidden.value = false
    else if (y > lastY + SCROLL_SLACK) navHidden.value = performance.now() - lastInput < INPUT_WINDOW_MS
    else if (y < lastY - SCROLL_SLACK) navHidden.value = false
    else return
    lastY = y
  })
}

function showNav() {
  navHidden.value = false
  lastY = Math.max(0, window.scrollY)
}

const INPUTS = ['touchstart', 'touchmove', 'touchend', 'wheel', 'keydown'] as const

watch(() => route.fullPath, showNav)
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  for (const type of INPUTS) window.addEventListener(type, onInput, { passive: true })
  window.addEventListener('popstate', showNav)
  document.addEventListener('visibilitychange', showNav)
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  for (const type of INPUTS) window.removeEventListener(type, onInput)
  window.removeEventListener('popstate', showNav)
  document.removeEventListener('visibilitychange', showNav)
})

// The bell's list, once signed in (and for each account signed in after).
watch(
  () => groupStore.status === 'ready' && groupStore.userId,
  (signedIn) => {
    if (signedIn) void inbox.load()
  },
  { immediate: true },
)

// A notification arriving with the app open (public/sw.js says so) goes onto the list.
function onWorkerMessage(e: MessageEvent) {
  if (e.data?.type === 'notification' && groupStore.status === 'ready') void inbox.load()
}
onMounted(() => navigator.serviceWorker?.addEventListener('message', onWorkerMessage))
onUnmounted(() => navigator.serviceWorker?.removeEventListener('message', onWorkerMessage))

// Back from the background or online again: the data on screen updates in place.
useOnResume(() => {
  if (groupStore.status === 'error' && groupStore.offline) void retry()
  else {
    void groupStore.catchUp()
    if (groupStore.status === 'ready') void inbox.load()
  }
})

async function retry() {
  await groupStore.init()
  // The router guard let this route through while offline; apply its redirects now.
  if (groupStore.status === 'signed-out' && !route.meta.guest) await router.replace({ name: 'login' })
  else if (groupStore.status === 'no-group' && !route.meta.public) await router.replace({ name: 'welcome' })
}
</script>

<template>
  <!-- Without the tab bar, --nav-height drops to 0 so docked buttons and toasts sit at the bottom edge. -->
  <div class="app" :class="{ 'no-nav': route.meta.hideNav || groupStore.status !== 'ready', 'nav-hidden': withChrome && navHidden }">
    <OfflineBanner v-if="groupStore.status === 'ready'" />
    <main class="column" :class="{ 'with-header': withChrome }">
      <AppHeader v-if="withChrome" />
      <!-- Screens that need a group never render without one (e.g. just after leaving the last group). -->
      <div v-if="!canShowRoute" class="onboard" aria-busy="true">
        <p class="eyebrow">Family-App</p>
        <p class="muted">Cargando…</p>
      </div>

      <div v-else-if="groupStore.status === 'error'" class="onboard" role="alert">
        <p class="eyebrow">Family-App</p>
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
    <BottomNav v-if="withChrome" :hidden="navHidden" />
    <UndoToast />
  </div>
</template>

<style scoped>
.app.no-nav {
  --nav-height: 0px;
}

/* Docked buttons and toasts follow the tab bar down when it slides away. */
.app.nav-hidden {
  --nav-offset: 0px;
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
