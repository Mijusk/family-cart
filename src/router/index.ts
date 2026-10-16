import { createRouter, createWebHistory, type RouteMeta } from 'vue-router'
import { useGroupStore } from '@/stores/group'
import ListView from '@/views/ListView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** Full-screen views (shopping mode, onboarding) hide the bottom tab bar. */
    hideNav?: boolean
    /** Reachable when signed in without belonging to a group. */
    public?: boolean
    /** Sign-in screens: only when signed out (signed-in visitors are sent on). */
    guest?: boolean
    /** Reachable signed in or out (the password reset link). */
    anyone?: boolean
    /** Belongs to a section that a group can switch off. */
    section?: 'shopping' | 'calendar'
  }
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'list', component: ListView, meta: { section: 'shopping' } },
    {
      path: '/compra',
      name: 'shopping',
      component: () => import('@/views/ShoppingView.vue'),
      meta: { hideNav: true, section: 'shopping' },
    },
    {
      path: '/historial',
      name: 'history',
      component: () => import('@/views/HistoryView.vue'),
      meta: { section: 'shopping' },
    },
    {
      path: '/calendario',
      name: 'calendar',
      component: () => import('@/views/CalendarView.vue'),
      meta: { section: 'calendar' },
    },
    {
      path: '/calendario/semana',
      name: 'calendar-week',
      component: () => import('@/views/WeekView.vue'),
      meta: { section: 'calendar' },
    },
    {
      path: '/calendario/mes',
      name: 'calendar-month',
      component: () => import('@/views/MonthView.vue'),
      meta: { section: 'calendar' },
    },
    {
      path: '/calendario/carpetas',
      name: 'folders',
      component: () => import('@/views/FoldersView.vue'),
      meta: { section: 'calendar' },
    },
    {
      path: '/calendario/papelera',
      name: 'trash',
      component: () => import('@/views/TrashView.vue'),
      meta: { section: 'calendar' },
    },
    {
      path: '/calendario/nuevo',
      name: 'event-new',
      component: () => import('@/views/EventFormView.vue'),
      meta: { hideNav: true, section: 'calendar' },
    },
    {
      path: '/calendario/evento/:id',
      name: 'event',
      component: () => import('@/views/EventView.vue'),
      meta: { section: 'calendar' },
    },
    {
      path: '/calendario/evento/:id/editar',
      name: 'event-edit',
      component: () => import('@/views/EventFormView.vue'),
      meta: { hideNav: true, section: 'calendar' },
    },
    { path: '/grupo', name: 'group', component: () => import('@/views/GroupView.vue') },
    {
      path: '/cuenta',
      name: 'account',
      component: () => import('@/views/AccountView.vue'),
      meta: { public: true },
    },
    {
      path: '/entrar',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { hideNav: true, guest: true },
    },
    {
      path: '/nueva-contrasena',
      name: 'reset-password',
      component: () => import('@/views/ResetPasswordView.vue'),
      meta: { hideNav: true, anyone: true, public: true },
    },
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
  // Back and forward return to where the page was; new screens start at the top.
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
})

/** Where a screen of a switched-off section goes instead; null if it can be shown. */
export function sectionRedirect(to: { meta: RouteMeta }) {
  const groupStore = useGroupStore()
  if (groupStore.status !== 'ready') return null
  const { shoppingEnabled, calendarEnabled } = groupStore.group
  if (to.meta.section === 'shopping' && !shoppingEnabled) return { name: 'calendar' }
  if (to.meta.section === 'calendar' && !calendarEnabled) return { name: 'list' }
  return null
}

router.beforeEach(async (to) => {
  const groupStore = useGroupStore()
  await groupStore.init()
  // App.vue shows the error screen; let the navigation through so the URL is kept for a retry.
  if (groupStore.status === 'error') return true
  if (to.meta.anyone) return true

  if (groupStore.status === 'signed-out') {
    if (to.meta.guest) return true
    // Back to where they were going after signing in (e.g. an invite link).
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.meta.guest) {
    const redirect = typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/') ? to.query.redirect : '/'
    return redirect
  }

  if (groupStore.status === 'no-group' && !to.meta.public) return { name: 'welcome' }
  return sectionRedirect(to) ?? true
})
