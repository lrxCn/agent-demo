# Phase 3 - Step 5: 角色管理页面

## 上下文
用户管理已完成。参照 @docs/API_CONTRACTS.md 角色和权限模块接口。

## 任务

### 1. 创建 API `src/api/modules/role.ts` 和 `src/api/modules/permission.ts`

### 2. 创建角色管理页面 `src/views/role/RoleListView.vue`
- 角色列表表格
- 新增/编辑角色弹窗
- 删除角色
- 分配权限按钮 → 弹窗（按分组展示权限列表，使用 Tree 或 CheckboxGroup）

## 验证
- 能创建角色
- 能给角色分配权限
- 给 admin 之外的角色分配部分权限后，用该角色的用户登录验证菜单过滤

## 完成后
更新 PROJECT_STATUS.md 标记 3-5 为 ✅
