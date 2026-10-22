import { createRouter, createWebHistory, START_LOCATION, type RouteLocationNormalized, type RouteMeta } from 'vue-router'
import { useGroupStore } from '@/stores/group'
import { isIsoDate, startOfWeek, today } from '@/utils/days'
import CalendarView from '@/views/CalendarView.vue'

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
    section?: 'shopping' | 'tasks' | 'calendar'
  }
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // The app opens on today's calendar; a group without it goes to its first section (see sectionRedirect).
    { path: '/', redirect: { name: 'calendar' } },
    {
      path: '/lista',
      name: 'list',
      component: () => import('@/views/ListView.vue'),
      meta: { section: 'shopping' },
    },
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
      path: '/tareas',
      name: 'tasks',
      component: () => import('@/views/TasksView.vue'),
      meta: { section: 'tasks' },
    },
    {
      path: '/tareas/listas',
      name: 'task-lists',
      component: () => import('@/views/TaskListsView.vue'),
      meta: { section: 'tasks' },
    },
    {
      path: '/tareas/papelera',
      name: 'task-trash',
      component: () => import('@/views/TaskTrashView.vue'),
      meta: { section: 'tasks' },
    },
    {
      path: '/tareas/:id',
      name: 'task',
      component: () => import('@/views/TaskView.vue'),
      meta: { section: 'tasks' },
    },
    {
      path: '/calendario',
      name: 'calendar',
      component: CalendarView,
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
      path: '/calendario/planificar',
      name: 'plan',
      component: () => import('@/views/PlanView.vue'),
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
      // Supabase Auth's OAuth consent screen (Authorization Path in the dashboard, docs/ia.md).
      // Signed out, the guard sends it through /entrar and back, query included.
      path: '/autorizar',
      name: 'authorize',
      component: () => import('@/views/AuthorizeView.vue'),
      meta: { hideNav: true, public: true },
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
  scrollBehavior: (to, from, saved) => {
    const opening = from === START_LOCATION
    // Semana opens at today, so the end of the week is at hand without scrolling.
    if (to.name === 'calendar-week' && (opening || (!saved && to.path !== from.path))) return weekScroll(to, true)
    // Opening or reloading the app starts at the top: the browser keeps the last scroll in the
    // history entry, and restoring it once the loading screen goes would land mid-page.
    if (opening) return { top: 0 }
    // Back and forward return to where the page was.
    if (saved) return saved
    // Another week: back to its Monday if the old week was scrolled past it.
    if (to.name === 'calendar-week' && from.name === 'calendar-week' && to.query.semana !== from.query.semana) {
      return weekScroll(to, false)
    }
    // Same screen with another day, week or filter in the URL: stay where you are.
    if (to.path === from.path) return false
    return { top: 0 }
  },
})

/**
 * Where Semana scrolls to. Opening it: today, when this week is on screen and today's day isn't
 * already in sight. Changing week: its Monday, only if the list was scrolled past it, so the week
 * arrows stay under the finger. The days render once the calendar has loaded, hence the wait.
 */
async function weekScroll(to: RouteLocationNormalized, opening: boolean) {
  const week = startOfWeek(isIsoDate(to.query.semana) ? to.query.semana : today())
  const day = opening ? (week === startOfWeek(today()) ? today() : null) : week
  const el = day ? await rendered(`[data-day="${day}"]`) : null
  if (!el) return opening ? { top: 0 } : false
  const top = el.getBoundingClientRect().top
  if (opening) return top > window.innerHeight / 2 ? { el, top: 0 } : { top: 0 }
  return top < 0 ? { el, top: 0 } : false
}

/** The element once it is on the page, giving up after a few seconds (slow or failed load). */
function rendered(selector: string, timeout = 8000): Promise<Element | null> {
  const start = performance.now()
  return new Promise((resolve) => {
    const check = () => {
      const el = document.querySelector(selector)
      if (el || performance.now() - start > timeout) resolve(el)
      else requestAnimationFrame(check)
    }
    check()
  })
}

/** Where a screen of a switched-off section goes instead; null if it can be shown. */
export function sectionRedirect(to: { meta: RouteMeta }) {
  const groupStore = useGroupStore()
  if (groupStore.status !== 'ready') return null
  const { shoppingEnabled, tasksEnabled, calendarEnabled } = groupStore.group
  const enabled = { shopping: shoppingEnabled, tasks: tasksEnabled, calendar: calendarEnabled }
  if (!to.meta.section || enabled[to.meta.section]) return null
  // The first section the group does use, in the order of the tab bar.
  if (calendarEnabled) return { name: 'calendar' }
  return { name: tasksEnabled ? 'tasks' : 'list' }
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
