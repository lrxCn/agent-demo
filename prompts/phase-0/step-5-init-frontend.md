# Phase 0 - Step 5: 初始化 Vue3 Frontend

## 上下文
Monorepo 和 NestJS 后端已初始化。请先阅读 @docs/ARCHITECTURE.md。

## 任务
1. 在 `packages/` 目录下用 Vite 创建 Vue3 项目：
```bash
cd packages
npx -y create-vite frontend --template vue-ts
cd frontend
pnpm install
```

2. 安装核心依赖：
```bash
pnpm add @arco-design/web-vue pinia vue-router@4 axios
pnpm add -D unplugin-vue-components @arco-plugins/vite-vue
```

3. 配置 Arco Design 按需引入，修改 `vite.config.ts`：
```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { vitePluginForArco } from '@arco-plugins/vite-vue'

export default defineConfig({
  plugins: [
    vue(),
    vitePluginForArco({
      style: 'css',
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
})
```

4. 创建基础目录结构（每个创建一个空的 `index.ts` 导出文件）：
   - `src/views/`
   - `src/components/layout/`
   - `src/components/chat/`
   - `src/stores/`
   - `src/router/`
   - `src/api/modules/`
   - `src/composables/`
   - `src/types/`
   - `src/utils/`

5. 创建 `src/api/request.ts` 基础 axios 封装：
```typescript
import axios from 'axios'

const request = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

// 请求拦截器：添加 JWT token
request.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：统一错误处理
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default request
```

## 验证
```bash
cd packages/frontend
pnpm run dev
# 浏览器访问 localhost:5173 应该看到 Vite + Vue 默认页面
```

## 完成后
更新 @docs/PROJECT_STATUS.md 将 Phase 0 Step 0-5 状态改为 ✅
