<script setup lang="ts">
import type { Component } from 'vue'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IconApps,
  IconBook,
  IconFile,
  IconLock,
  IconPhone,
  IconUser,
} from '@arco-design/web-vue/es/icon'
import { useAuthStore } from '../../stores/auth'

interface MenuItemConfig {
  key: string
  label: string
  icon: Component
  /** 为空表示登录即可见；否则需具备任一权限（与路由 meta 对齐） */
  permissions: string[]
}

const collapsed = ref(false)
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const allMenuItems: MenuItemConfig[] = [
  { key: '/dashboard', label: '仪表盘', icon: IconApps, permissions: [] },
  { key: '/users', label: '用户管理', icon: IconUser, permissions: ['user:view'] },
  { key: '/roles', label: '角色管理', icon: IconLock, permissions: ['role:view'] },
  { key: '/students', label: '学生管理', icon: IconFile, permissions: ['student:view'] },
  { key: '/knowledge', label: '知识库', icon: IconBook, permissions: ['knowledge:view'] },
  { key: '/rtc', label: '语音通话', icon: IconPhone, permissions: [] },
]

const visibleMenuItems = computed(() =>
  allMenuItems.filter(
    (item) =>
      item.permissions.length === 0 ||
      item.permissions.some((code) => auth.hasPermission(code)),
  ),
)

const selectedKeys = computed(() => [route.path])

function onMenuItemClick(key: string): void {
  void router.push(key)
}

async function handleLogout(): Promise<void> {
  await auth.logout()
  await router.push({ name: 'Login' })
}

const displayName = computed(() => auth.user?.nickname || auth.user?.username || '用户')
</script>

<template>
  <a-layout class="app-shell">
    <a-layout-sider v-model:collapsed="collapsed" collapsible :width="220" breakpoint="lg" class="app-sider">
      <div class="logo-wrap">
        <span class="logo-text">Plan2Code</span>
      </div>
      <a-menu :selected-keys="selectedKeys" auto-open-selected @menu-item-click="onMenuItemClick">
        <a-menu-item v-for="item in visibleMenuItems" :key="item.key">
          <template #icon>
            <component :is="item.icon" />
          </template>
          {{ item.label }}
        </a-menu-item>
      </a-menu>
    </a-layout-sider>
    <a-layout>
      <a-layout-header class="app-header">
        <span class="header-title">{{ route.meta.title ?? '控制台' }}</span>
        <div class="header-actions">
          <a-dropdown trigger="click">
            <a-button type="text" class="user-trigger">
              {{ displayName }}
            </a-button>
            <template #content>
              <a-doption @click="handleLogout">退出登录</a-doption>
            </template>
          </a-dropdown>
        </div>
      </a-layout-header>
      <a-layout-content class="app-main">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-sider {
  border-right: 1px solid var(--color-border-2, rgba(255, 255, 255, 0.08));
}

.logo-wrap {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border-bottom: 1px solid var(--color-border-2, rgba(255, 255, 255, 0.08));
}

.logo-text {
  font-weight: 600;
  font-size: 15px;
  background: var(--primary-gradient, linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--color-border-2, rgba(255, 255, 255, 0.08));
}

.header-title {
  font-size: 16px;
  font-weight: 500;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-trigger {
  color: var(--color-text-1, #e2e8f0);
}

.app-main {
  padding: 20px;
  min-height: 280px;
}
</style>
