# Phase 3 - Step 3: 动态菜单 + 路由权限

## 上下文
登录已完成。现在实现按角色动态渲染菜单。

## 任务

### 1. 创建 permission store `src/stores/permission.ts`
```typescript
// 根据用户的 permissions 数组，过滤路由表，生成可访问的菜单
// admin 用户（permissions 包含 '*'）可访问所有菜单
```

### 2. 修改 AppLayout 侧边栏
从 permission store 获取过滤后的菜单，动态渲染 `<a-menu-item>`。
菜单项包含图标和标题。

### 3. 创建面包屑导航
根据当前路由路径自动生成面包屑。

### 4. 创建 Dashboard 页面 `src/views/dashboard/DashboardView.vue`
简单的欢迎页面，显示用户名和当前角色信息。

## 验证
- admin 登录能看到所有菜单
- 创建一个 teacher 角色（通过 API），只给 student:view 权限
- 用 teacher 账号登录，只能看到学生管理菜单

## 完成后
更新 PROJECT_STATUS.md 标记 3-3 为 ✅
