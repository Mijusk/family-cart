import { createRouter, createWebHistory } from 'vue-router'
import ListView from '@/views/ListView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** Full-screen views (shopping mode) hide the bottom tab bar. */
    hideNav?: boolean
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
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
