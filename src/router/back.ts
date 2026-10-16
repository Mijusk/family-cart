import { ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { router } from './index'

// Going back the way the user came, like the phone's back button, instead of always to Hoy.

const CALENDAR_VIEWS = ['calendar', 'calendar-week', 'calendar-month']

/** The last calendar view shown (Hoy, Semana or Mes, with its day, week, month and filters). */
export const lastCalendarView = ref<string>('/calendario')

/** The tasks view as last left (its list, filter and order). */
export const lastTasksView = ref<string>('/tareas')

router.afterEach((to) => {
  if (CALENDAR_VIEWS.includes(String(to.name))) lastCalendarView.value = to.fullPath
  if (to.name === 'tasks') lastTasksView.value = to.fullPath
})

/**
 * Back to the previous screen of the app. Without one (opened from a link, or after a reload)
 * replaces the current screen with `fallback`, so back never leaves the app.
 */
export function goBack(fallback: RouteLocationRaw = lastCalendarView.value) {
  if (window.history.state?.back) router.back()
  else void router.replace(fallback)
}
