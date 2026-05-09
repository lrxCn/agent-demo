# Phase 3 - Step 4: 账号管理页面

## 上下文
路由权限已完成。参照 @docs/API_CONTRACTS.md 用户模块接口。

## 任务

### 1. 创建 API `src/api/modules/user.ts`
封装用户 CRUD + 角色分配的 API 调用。

### 2. 创建用户管理页面 `src/views/user/UserListView.vue`
- Arco Design 表格组件展示用户列表（分页）
- 搜索栏（按用户名搜索）
- 新增按钮 → 弹窗表单（用户名、密码、昵称）
- 编辑按钮 → 弹窗表单
- 删除按钮（确认对话框）
- 分配角色按钮 → 弹窗（多选角色列表）

### 3. 权限控制
- 按钮根据用户权限显示/隐藏（v-if="hasPermission('user:create')"）
- 使用 auth store 的 hasPermission getter

## 验证
- admin 登录后访问用户管理，能看到所有按钮
- 能创建、编辑、删除用户
- 能给用户分配角色

## 完成后
更新 PROJECT_STATUS.md 标记 3-4 为 ✅
