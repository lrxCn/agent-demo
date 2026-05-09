# Phase 0 - Step 4: 初始化 NestJS Backend

## 上下文
Monorepo 已初始化，请先阅读 @docs/ARCHITECTURE.md 和 @docs/PROJECT_STATUS.md 了解进度。

## 任务
1. 在 `packages/` 目录下用 NestJS CLI 创建后端项目：
```bash
cd packages
npx -y @nestjs/cli new backend --package-manager pnpm --skip-git
```

2. 安装核心依赖：
```bash
cd packages/backend
pnpm add @nestjs/typeorm typeorm better-sqlite3 @nestjs/jwt @nestjs/passport passport passport-jwt @nestjs/config class-validator class-transformer bcryptjs uuid
pnpm add -D @types/passport-jwt @types/bcryptjs @types/uuid
```

3. 安装 WebSocket 依赖：
```bash
pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io
```

4. 安装 HTTP 模块（用于调用 LangGraph API）：
```bash
pnpm add @nestjs/axios axios
```

5. 在 `src/` 下创建以下空模块目录结构（每个目录创建一个空的 `.gitkeep` 文件）：
   - `src/auth/`
   - `src/user/`
   - `src/role/`
   - `src/permission/`
   - `src/student/`
   - `src/agent/`
   - `src/knowledge/`
   - `src/rtc/`
   - `src/dao/interfaces/`
   - `src/dao/sqlite/`
   - `src/common/guards/`
   - `src/common/filters/`
   - `src/common/interceptors/`
   - `src/common/decorators/`

6. 修改 `src/app.module.ts`，添加 ConfigModule 的基础配置：
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env', // monorepo 根目录的 .env
    }),
  ],
})
export class AppModule {}
```

## 验证
```bash
cd packages/backend
pnpm run start:dev
# 应该能在 localhost:3000 看到 Hello World
```

## 完成后
更新 @docs/PROJECT_STATUS.md 将 Phase 0 Step 0-4 状态改为 ✅
