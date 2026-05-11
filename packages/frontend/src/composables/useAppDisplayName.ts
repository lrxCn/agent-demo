import { computed, type ComputedRef } from 'vue'

/**
 * 应用展示名（登录页标题、侧栏 Logo 等）。
 * 读取仓库根目录 `.env` 中的 `VITE_APP_DISPLAY_NAME`；需与 `vite.config.ts` 的 `envDir` 配置一致。
 */
export function useAppDisplayName(): ComputedRef<string> {
  return computed(() => String(import.meta.env.VITE_APP_DISPLAY_NAME ?? '').trim())
}
