# Phase 2 - Step 2: User 模块

## 上下文
DAO 层已完成。请先阅读 @docs/API_CONTRACTS.md 的用户模块接口定义。

## 任务

### 1. 创建 User 模块文件
- `src/user/dto/create-user.dto.ts` - 创建用户 DTO（username, password, nickname）
- `src/user/dto/update-user.dto.ts` - 更新用户 DTO
- `src/user/user.service.ts` - 业务逻辑，通过 @Inject('IUserDao') 注入 DAO
- `src/user/user.controller.ts` - REST API 控制器
- `src/user/user.module.ts` - 模块定义，导入 DaoModule

### 2. 创建统一响应拦截器
`src/common/interceptors/response.interceptor.ts`
将所有响应包装为 `{ code: 0, data: {}, message: 'ok' }` 格式。

### 3. 创建统一异常过滤器
`src/common/filters/http-exception.filter.ts`
捕获异常并返回 `{ code: error_code, data: null, message: '错误信息' }` 格式。

### 4. 在 AppModule 中注册全局拦截器和过滤器

### 5. 密码使用 bcryptjs 加密存储

## 验证
```bash
# 启动后用 curl 测试
curl http://localhost:3000/api/v1/users
# 应返回 { code: 0, data: { items: [], total: 0, ... } }
```

## 完成后
更新 PROJECT_STATUS.md 标记 2-2 为 ✅
