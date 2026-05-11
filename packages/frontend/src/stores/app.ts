import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

/** 主题偏好：固定明亮 / 固定黑暗 / 跟随系统 */
export type ThemeMode = 'light' | 'dark' | 'auto'

const LS_THEME_MODE = 'app_theme_mode'

function readStoredThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(LS_THEME_MODE) as ThemeMode | null
    if (raw === 'light' || raw === 'dark' || raw === 'auto') {
      return raw
    }
  } catch {
    // 忽略本地存储不可用
  }
  /** 与历史默认（曾写死 dark）保持一致 */
  return 'dark'
}

function readSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export const useAppStore = defineStore('app', () => {
  const themeMode = ref<ThemeMode>(readStoredThemeMode())
  const prefersDark = ref(readSystemPrefersDark())

  const resolvedTheme = computed<'light' | 'dark'>(() => {
    if (themeMode.value === 'light' || themeMode.value === 'dark') {
      return themeMode.value
    }
    return prefersDark.value ? 'dark' : 'light'
  })

  let mediaListenerBound = false

  function applyDomTheme(): void {
    if (typeof document === 'undefined') {
      return
    }
    if (resolvedTheme.value === 'dark') {
      document.body.setAttribute('arco-theme', 'dark')
    } else {
      document.body.removeAttribute('arco-theme')
    }
  }

  function syncPrefersFromSystem(): void {
    prefersDark.value = readSystemPrefersDark()
  }

  function ensureMediaQueryListener(): void {
    if (mediaListenerBound || typeof window === 'undefined') {
      return
    }
    mediaListenerBound = true
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', () => {
      syncPrefersFromSystem()
    })
  }

  function setThemeMode(mode: ThemeMode): void {
    themeMode.value = mode
    try {
      localStorage.setItem(LS_THEME_MODE, mode)
    } catch {
      // 忽略写入失败
    }
  }

  /**
   * 在 pinia 安装后调用一次：绑定系统主题监听。
   * DOM 同步由下方 watch(resolvedTheme) 负责。
   */
  function initTheme(): void {
    ensureMediaQueryListener()
    syncPrefersFromSystem()
  }

  watch(resolvedTheme, () => applyDomTheme(), { immediate: true })

  return {
    themeMode,
    resolvedTheme,
    setThemeMode,
    initTheme,
  }
})
