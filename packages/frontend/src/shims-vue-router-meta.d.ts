import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    /** 无需登录即可访问 */
    public?: boolean
    /** 访问所需权限码（全部满足） */
    permissions?: string[]
  }
}
