import { createRouter, createWebHistory } from 'vue-router'
import { useGroupStore } from '@/stores/group'
import ListView from '@/views/ListView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** Full-screen views (shopping mode, onboarding) hide the bottom tab bar. */
    hideNav?: boolean
    /** Reachable without belonging to a group. */
    public?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'list', component: ListView },
    {
      path: '/compra',
      name: 'shopping',
      component: () => import('@/views/ShoppingView.vue'),
      meta: { hideNav: true },
    },
    { path: '/historial', name: 'history', component: () => import('@/views/HistoryView.vue') },
    { path: '/grupo', name: 'group', component: () => import('@/views/GroupView.vue') },
    {
      path: '/bienvenida',
      name: 'welcome',
      component: () => import('@/views/WelcomeView.vue'),
      meta: { hideNav: true, public: true },
    },
    {
      path: '/unirse/:code',
      name: 'join',
      component: () => import('@/views/JoinView.vue'),
      meta: { hideNav: true, public: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const groupStore = useGroupStore()
  await groupStore.init()
  // App.vue shows the error screen; let the navigation through so the URL is kept for a retry.
  if (groupStore.status === 'error') return true
  if (groupStore.status === 'no-group' && !to.meta.public) return { name: 'welcome' }
  return true
})
