# Phase 2 - Step 3: JWT 认证

## 上下文
User 模块已完成。请先阅读 @docs/API_CONTRACTS.md 的认证模块接口。

## 任务

### 1. 创建 Auth 模块
- `src/auth/auth.service.ts` - login(验证密码、生成JWT)、refresh、validateUser
- `src/auth/auth.controller.ts` - POST /api/v1/auth/login, POST /api/v1/auth/refresh
- `src/auth/dto/login.dto.ts` - { username, password }
- `src/auth/strategies/jwt.strategy.ts` - Passport JWT 策略
- `src/auth/auth.module.ts`

### 2. 创建 Guards
- `src/common/guards/jwt-auth.guard.ts` - JWT 认证守卫
- `src/common/guards/roles.guard.ts` - 角色守卫
- `src/common/guards/permissions.guard.ts` - 权限守卫

### 3. 创建 Decorators
- `src/common/decorators/roles.decorator.ts` - @Roles('admin')
- `src/common/decorators/permissions.decorator.ts` - @RequirePermissions('student:create')
- `src/common/decorators/current-user.decorator.ts` - @CurrentUser() 获取当前用户

### 4. JWT 配置
从环境变量读取 JWT_SECRET、JWT_EXPIRES_IN（1h）、JWT_REFRESH_EXPIRES_IN（7d）。
返回 access_token 和 refresh_token。

### 5. 内置超级管理员
在 AppModule 的 onModuleInit 中，检查是否存在 admin 用户：
- 如果不存在，自动创建 admin/admin 账户
- 自动创建 admin 角色并赋予所有权限（code: '*'）
- 将 admin 角色分配给 admin 用户

### 6. 给 User Controller 的 CRUD 接口加上 @UseGuards(JwtAuthGuard)

## 验证
```bash
# 登录
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin"}'
# 应返回 access_token

# 用 token 访问保护接口
curl http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer <TOKEN>"
```

## 完成后
更新 PROJECT_STATUS.md 标记 2-3 为 ✅，git commit。
