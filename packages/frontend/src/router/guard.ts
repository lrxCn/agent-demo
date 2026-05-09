import type { Router } from 'vue-router'
import { useAuthStore } from '../stores/auth'

/**
 * 登录态与路由 meta.permissions 的基础校验（细粒度动态菜单在 Phase 3-3 扩展）
 */
export function setupRouterGuard(router: Router): void {
  router.beforeEach(async (to, _from, next) => {
    const auth = useAuthStore()
    if (!auth.initialized) {
      auth.initFromStorage()
    }

    if (to.meta.public) {
      if (to.name === 'Login' && auth.isLoggedIn) {
        next({ path: '/dashboard' })
        return
      }
      next()
      return
    }

    if (!auth.token) {
      next({ name: 'Login', query: { redirect: to.fullPath } })
      return
    }

    if (!auth.user?.id) {
      await auth.logout()
      next({ name: 'Login', query: { redirect: to.fullPath } })
      return
    }

    if (!auth.profileSynced) {
      try {
        await auth.fetchUserInfo()
      } catch {
        await auth.logout()
        next({ name: 'Login', query: { redirect: to.fullPath } })
        return
      }
    }

    const required = to.matched
      .map((r) => r.meta.permissions)
      .find((p) => Array.isArray(p) && p.length > 0) as string[] | undefined

    if (required?.length) {
      const allowed = required.every((code) => auth.hasPermission(code))
      if (!allowed) {
        next({ name: 'Dashboard' })
        return
      }
    }

    next()
  })
}
