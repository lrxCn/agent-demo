import type { App } from 'vue'
import { createPinia } from 'pinia'
import { useAppStore } from './app'

export { useAppStore } from './app'
export { useAuthStore } from './auth'
export { useChatStore } from './chat'
export { usePermissionStore } from './permission'

/** 注册 Pinia 并完成依赖 store 的启动逻辑（如主题） */
export function installStores(app: App): void {
  const pinia = createPinia()
  app.use(pinia)
  useAppStore().initTheme()
}
