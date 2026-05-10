<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ChatBubble from '../chat/ChatBubble.vue'
import { useAuthStore } from '../../stores/auth'
import { usePermissionStore } from '../../stores/permission'
import { useWebSocket } from '../../composables/useWebSocket'
import { useToolRegistry } from '../../composables/useToolRegistry'

const collapsed = ref(false)
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const permission = usePermissionStore()

// 全局 WebSocket 连接（tool:invoke 监听）
useWebSocket()

// 全局注册 navigate_to_page 工具（任何页面都可用）
const { register } = useToolRegistry()
register({ name: 'navigate_to_page', description: '导航到指定页面' })

const selectedKeys = computed(() => [route.path])

/** 根据当前匹配路由生成面包屑（仅包含有 meta.title 的记录） */
const breadcrumbs = computed(() =>
  route.matched
    .filter((r) => Boolean(r.meta?.title) && !r.meta.public)
    .map((r) => {
      const path = r.path === '' ? '/' : r.path
      return { title: r.meta.title as string, path }
    }),
)

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
  <div class="app-layout-root">
    <a-layout class="app-shell">
      <a-layout-sider v-model:collapsed="collapsed" collapsible :width="220" breakpoint="lg" class="app-sider">
        <div class="logo-wrap">
          <span class="logo-text">Plan2Code</span>
        </div>
        <a-menu :selected-keys="selectedKeys" auto-open-selected @menu-item-click="onMenuItemClick">
          <a-menu-item v-for="item in permission.visibleMenuItems" :key="item.path">
            <template #icon>
              <component :is="item.icon" />
            </template>
            {{ item.title }}
          </a-menu-item>
        </a-menu>
      </a-layout-sider>
      <a-layout>
        <a-layout-header class="app-header">
          <a-breadcrumb class="header-breadcrumb">
            <a-breadcrumb-item v-for="(bc, index) in breadcrumbs" :key="bc.path + bc.title">
              <router-link v-if="index < breadcrumbs.length - 1" :to="bc.path">{{ bc.title }}</router-link>
              <template v-else>{{ bc.title }}</template>
            </a-breadcrumb-item>
          </a-breadcrumb>
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
    <ChatBubble />
  </div>
</template>

<style scoped>
.app-layout-root {
  position: relative;
  min-height: 100vh;
}

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

.header-breadcrumb {
  flex: 1;
  min-width: 0;
}

.header-breadcrumb :deep(.arco-breadcrumb-item) {
  color: var(--color-text-2, #94a3b8);
}

.header-breadcrumb :deep(.arco-breadcrumb-item:last-child) {
  color: var(--color-text-1, #e2e8f0);
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
