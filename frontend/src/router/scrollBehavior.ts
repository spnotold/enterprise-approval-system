import type { RouteLocationNormalized, RouterScrollBehavior } from 'vue-router'

/** Decide whether navigation should restore, preserve, or reset the scroll position. */
export function getScrollBehavior(
  to: Pick<RouteLocationNormalized, 'path'>,
  from: Pick<RouteLocationNormalized, 'path'>,
  savedPosition: Parameters<RouterScrollBehavior>[2],
): ReturnType<RouterScrollBehavior> {
  if (savedPosition) return savedPosition
  if (to.path === from.path) return false
  return { top: 0 }
}
