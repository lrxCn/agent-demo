# Phase 2 - Step 4: Role + Permission RBAC

## 上下文
JWT 认证已完成。请先阅读 @docs/API_CONTRACTS.md 角色和权限模块。

## 任务

### 1. 创建 Permission 模块
- `src/permission/permission.service.ts`
- `src/permission/permission.controller.ts` - GET /api/v1/permissions（按分组返回）
- `src/permission/permission.module.ts`

### 2. 初始化预置权限（在 onModuleInit 中）
```typescript
const permissions = [
  // 用户管理
  { code: 'user:view', name: '查看用户', group_name: '用户管理' },
  { code: 'user:create', name: '创建用户', group_name: '用户管理' },
  { code: 'user:update', name: '更新用户', group_name: '用户管理' },
  { code: 'user:delete', name: '删除用户', group_name: '用户管理' },
  { code: 'user:assign-role', name: '分配角色', group_name: '用户管理' },
  // 角色管理
  { code: 'role:view', name: '查看角色', group_name: '角色管理' },
  { code: 'role:create', name: '创建角色', group_name: '角色管理' },
  { code: 'role:update', name: '更新角色', group_name: '角色管理' },
  { code: 'role:delete', name: '删除角色', group_name: '角色管理' },
  { code: 'role:assign-permission', name: '分配权限', group_name: '角色管理' },
  // 学生管理
  { code: 'student:view', name: '查看学生', group_name: '学生管理' },
  { code: 'student:create', name: '创建学生', group_name: '学生管理' },
  { code: 'student:update', name: '更新学生', group_name: '学生管理' },
  { code: 'student:delete', name: '删除学生', group_name: '学生管理' },
  // 知识库
  { code: 'knowledge:view', name: '查看知识库', group_name: '知识库' },
  { code: 'knowledge:create', name: '上传知识', group_name: '知识库' },
  { code: 'knowledge:delete', name: '删除知识', group_name: '知识库' },
  { code: 'knowledge:manage', name: '管理知识库权限', group_name: '知识库' },
];
```

### 3. 创建 Role 模块
- `src/role/dto/create-role.dto.ts`
- `src/role/role.service.ts` - CRUD + assignPermissions(roleId, permissionIds[])
- `src/role/role.controller.ts` - 参照 API_CONTRACTS.md
- `src/role/role.module.ts`

### 4. 在 User 模块添加角色分配
`PUT /api/v1/users/:id/roles` - body: { roleIds: string[] }

### 5. 完善 PermissionsGuard
检查当前用户的角色所拥有的权限是否包含接口要求的权限。
admin 角色（权限码 '*'）跳过检查。

## 验证
```bash
# 用 admin 登录，创建新角色
curl -X POST http://localhost:3000/api/v1/roles \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name": "teacher", "description": "教师"}'

# 给角色分配权限
curl -X PUT http://localhost:3000/api/v1/roles/<ROLE_ID>/permissions \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"permissionIds": ["..."]}'
```

## 完成后
更新 PROJECT_STATUS.md 标记 2-4 为 ✅
