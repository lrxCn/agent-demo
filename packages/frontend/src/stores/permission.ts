import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { computed } from 'vue'
import { defineStore } from 'pinia'
import {
  IconApps,
  IconBook,
  IconFile,
  IconLock,
  IconPhone,
  IconUser,
} from '@arco-design/web-vue/es/icon'
import { routes } from '../router/routes'
import { useAuthStore } from './auth'

/** 侧栏菜单项（与路由表 meta 对齐，由权限过滤） */
export interface AppMenuItem {
  path: string
  title: string
  icon: Component
  /** 为空表示登录即可见；否则需全部满足（与路由守卫 meta.permissions 一致） */
  permissions: string[]
}

const ICON_BY_PATH: Record<string, Component> = {
  '/dashboard': IconApps,
  '/users': IconUser,
  '/roles': IconLock,
  '/students': IconFile,
  '/knowledge': IconBook,
  '/rtc': IconPhone,
}

/** 从路由表生成完整菜单（启动时算一次，与 routes.ts 保持同步） */
function buildMenuItemsFromRoutes(): AppMenuItem[] {
  const root = routes.find((r) => r.path === '/')
  const children = (root?.children ?? []) as RouteRecordRaw[]
  const items: AppMenuItem[] = []
  for (const child of children) {
    if (typeof child.path !== 'string' || !child.meta?.title) {
      continue
    }
    const fullPath = child.path.startsWith('/') ? child.path : `/${child.path}`
    const meta = child.meta
    const permissions = Array.isArray(meta.permissions) ? [...meta.permissions] : []
    items.push({
      path: fullPath,
      title: meta.title as string,
      icon: ICON_BY_PATH[fullPath] ?? IconApps,
      permissions,
    })
  }
  return items
}

const ALL_MENU_ITEMS = buildMenuItemsFromRoutes()

/**
 * 根据当前用户的 permissions 过滤侧栏菜单。
 * admin（permissions 含 '*'）经 hasPermission 校验后等价于可见全部需权限项。
 */
export const usePermissionStore = defineStore('permission', () => {
  const visibleMenuItems = computed(() => {
    const auth = useAuthStore()
    return ALL_MENU_ITEMS.filter((item) => {
      if (item.permissions.length === 0) {
        return true
      }
      return item.permissions.every((code) => auth.hasPermission(code))
    })
  })

  return {
    visibleMenuItems,
  }
})
