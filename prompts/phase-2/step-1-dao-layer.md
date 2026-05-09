# Phase 2 - Step 1: DAO 抽象层 + SQLite TypeORM

## 上下文
Agent 已完成（Phase 1）。现在搭建 NestJS 后端的数据层。
请先阅读 @docs/ARCHITECTURE.md 的数据库设计部分和 @.cursor/rules/03-nestjs-patterns.mdc 的 DAO 规范。

## 任务

### 1. 配置 TypeORM + SQLite
修改 `packages/backend/src/app.module.ts`：
```typescript
import { TypeOrmModule } from '@nestjs/typeorm';

TypeOrmModule.forRoot({
  type: 'better-sqlite3',
  database: 'data/agent-demo.db',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  synchronize: true, // 开发环境自动同步
}),
```

### 2. 创建实体文件
参照 @docs/ARCHITECTURE.md 的数据库设计，创建以下 entity：
- `src/user/user.entity.ts` - users 表
- `src/role/role.entity.ts` - roles 表
- `src/permission/permission.entity.ts` - permissions 表
- `src/student/student.entity.ts` - students 表
- `src/knowledge/knowledge-base.entity.ts` - knowledge_bases 表

每个 entity 使用 UUID 主键、created_at/updated_at 时间戳。
User 和 Role 是多对多关系（user_roles），Role 和 Permission 是多对多关系（role_permissions）。
KnowledgeBase 和 Role 是多对多关系（knowledge_base_roles）。

### 3. 创建 DAO 接口
在 `src/dao/interfaces/` 下创建：
- `base-dao.interface.ts` - 通用 CRUD 接口
- `user-dao.interface.ts`
- `role-dao.interface.ts`
- `permission-dao.interface.ts`
- `student-dao.interface.ts`
- `knowledge-dao.interface.ts`

通用接口参考：
```typescript
export interface IBaseDao<T> {
  findById(id: string): Promise<T | null>;
  findAll(query?: PaginationQuery): Promise<PaginatedResult<T>>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
```

### 4. 创建 SQLite DAO 实现
在 `src/dao/sqlite/` 下为每个接口创建实现类，注入 TypeORM Repository。

### 5. 创建 `src/dao/dao.module.ts`
通过 token 注入，将接口绑定到 SQLite 实现。

## 验证
```bash
cd packages/backend
pnpm run start:dev
# 应该能启动且自动创建 data/agent-demo.db
# 检查 data/ 目录下是否有 .db 文件
```

## 完成后
更新 PROJECT_STATUS.md 标记 2-1 为 ✅
