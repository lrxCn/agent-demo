<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance } from '@arco-design/web-vue'
import { Message } from '@arco-design/web-vue'
import { useAppDisplayName } from '../../composables'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const appDisplayName = useAppDisplayName()

const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({
  username: 'admin',
  password: 'admin',
})

async function onSubmit(): Promise<void> {
  const errors = await formRef.value?.validate()
  if (errors) {
    return
  }
  loading.value = true
  try {
    await auth.login(form.username, form.password)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(redirect)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '登录失败'
    Message.error(msg)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-glow login-glow--a" aria-hidden="true" />
    <div class="login-glow login-glow--b" aria-hidden="true" />
    <a-card class="login-card" :bordered="false">
      <template #title>
        <span class="login-title">{{ appDisplayName }}</span>
      </template>
      <p class="login-subtitle">使用账号登录以继续</p>
      <a-form ref="formRef" :model="form" layout="vertical" class="login-form">
        <a-form-item
          field="username"
          label="用户名"
          :rules="[{ required: true, message: '请输入用户名' }]"
        >
          <a-input v-model="form.username" allow-clear placeholder="用户名" size="large" />
        </a-form-item>
        <a-form-item
          field="password"
          label="密码"
          :rules="[{ required: true, message: '请输入密码' }]"
        >
          <a-input-password v-model="form.password" placeholder="密码" size="large" />
        </a-form-item>
        <a-button type="primary" long size="large" :loading="loading" @click="onSubmit">
          登录
        </a-button>
      </a-form>
    </a-card>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  overflow: hidden;
  background: radial-gradient(ellipse 120% 80% at 50% -20%, rgba(99, 102, 241, 0.35), transparent 55%),
    linear-gradient(180deg, #0a0a14 0%, #0f0f23 40%, #0b0b18 100%);
}

.login-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  opacity: 0.55;
}

.login-glow--a {
  width: 420px;
  height: 420px;
  left: -120px;
  top: 10%;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
}

.login-glow--b {
  width: 380px;
  height: 380px;
  right: -100px;
  bottom: 5%;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
}

.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  border-radius: 16px;
  background: rgba(22, 22, 40, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(129, 131, 248, 0.2);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
}

.login-title {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  background: var(--primary-gradient, linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.login-subtitle {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--color-text-3, #86909c);
}

.login-form {
  margin-top: 8px;
}
</style>
