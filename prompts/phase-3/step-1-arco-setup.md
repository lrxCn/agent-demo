# Phase 3 - Step 1: Arco Design 主题 + 布局

## 上下文
后端已完成（Phase 2）。现在搭建前端框架。请先阅读 @.cursor/rules/04-vue-patterns.mdc。

## 任务

### 1. 配置 Arco Design 深色主题
创建 `src/styles/theme.css`，自定义深色主题 + 蓝紫渐变主色调：
```css
body {
  --primary-color: #6366f1;     /* 蓝紫主色 */
  --primary-gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  background-color: #0f0f23;
  color: #e2e8f0;
}
```
在 `main.ts` 中引入 Arco Design 的 dark 模式。

### 2. 创建布局组件
`src/components/layout/AppLayout.vue`：
- 左侧可折叠侧边栏（菜单根据用户权限动态生成）
- 顶部导航栏（用户信息、退出登录）
- 主内容区域（router-view）
- 使用 Arco Design 的 `a-layout`、`a-menu`、`a-layout-sider` 等组件

### 3. 配置 Pinia
`src/stores/auth.ts`：
- state: user, token, permissions
- actions: login, logout, fetchUserInfo
- getters: isLoggedIn, hasPermission(code)

### 4. 配置 Vue Router
`src/router/index.ts` 和 `src/router/routes.ts`：
- `/login` - 登录页（无需认证）
- `/` - 主布局，嵌套子路由：
  - `/dashboard` - 仪表盘
  - `/users` - 用户管理（meta: permissions: ['user:view']）
  - `/roles` - 角色管理
  - `/students` - 学生管理
  - `/knowledge` - 知识库（Phase 5）
  - `/rtc` - 语音通话（Phase 6）

### 5. 修改 `src/main.ts`
引入 Arco、Pinia、Router，挂载 App。

### 6. 修改 `src/App.vue`
使用 `<router-view />`。

## 验证
浏览器访问 localhost:5173，应看到深色主题的布局框架。

## 完成后
更新 PROJECT_STATUS.md 标记 3-1 为 ✅
