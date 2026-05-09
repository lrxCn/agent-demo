# Phase 3 - Step 2: 登录页面 + Token 管理

## 上下文
布局已完成。请参照 @docs/API_CONTRACTS.md 的登录接口。

## 任务

### 1. 创建登录页面 `src/views/login/LoginView.vue`
- 居中卡片式设计，深色背景 + 蓝紫渐变装饰
- 用户名、密码输入框
- 登录按钮（loading 状态）
- 默认填充 admin/admin 方便测试

### 2. 创建 API 模块 `src/api/modules/auth.ts`
```typescript
import request from '../request'

export function login(data: { username: string; password: string }) {
  return request.post('/auth/login', data)
}

export function refreshToken(refreshToken: string) {
  return request.post('/auth/refresh', { refresh_token: refreshToken })
}
```

### 3. 完善 Pinia auth store
- login action: 调用 API → 存储 token 到 localStorage + state → 获取用户信息
- logout action: 清除 token → 跳转登录页
- 页面刷新时从 localStorage 恢复 token

### 4. 创建路由守卫 `src/router/guard.ts`
```typescript
router.beforeEach((to, from, next) => {
  // 无需认证的页面直接放行
  // 已登录且访问 /login → 重定向到 /dashboard
  // 未登录 → 重定向到 /login
  // 权限检查：meta.permissions 与用户权限对比
})
```

## 验证
- 访问 localhost:5173 → 自动跳转登录页
- 输入 admin/admin 登录 → 跳转到 dashboard
- 刷新页面 → 保持登录状态

## 完成后
更新 PROJECT_STATUS.md 标记 3-2 为 ✅
