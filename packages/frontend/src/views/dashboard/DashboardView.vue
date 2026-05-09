<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()

const displayName = computed(() => auth.user?.nickname || auth.user?.username || '用户')

const rolesText = computed(() => {
  const roles = auth.user?.roles ?? []
  return roles.length > 0 ? roles.join('、') : '未分配角色'
})

const permissionsPreview = computed(() => {
  const list = auth.user?.permissions ?? []
  if (list.includes('*')) {
    return '全部权限（*）'
  }
  if (list.length === 0) {
    return '暂无权限码'
  }
  return list.join('、')
})
</script>

<template>
  <a-space direction="vertical" :size="20" fill>
    <a-typography>
      <a-typography-title :heading="4">欢迎，{{ displayName }}</a-typography-title>
      <a-typography-paragraph type="secondary"> 这是控制台首页，侧栏菜单已按账号权限动态展示。 </a-typography-paragraph>
    </a-typography>

    <a-card title="当前账号">
      <a-descriptions :column="1" size="large" bordered>
        <a-descriptions-item label="用户名">
          {{ auth.user?.username ?? '—' }}
        </a-descriptions-item>
        <a-descriptions-item label="昵称">
          {{ auth.user?.nickname || '—' }}
        </a-descriptions-item>
        <a-descriptions-item label="角色">
          {{ rolesText }}
        </a-descriptions-item>
        <a-descriptions-item label="权限码">
          {{ permissionsPreview }}
        </a-descriptions-item>
      </a-descriptions>
    </a-card>
  </a-space>
</template>
