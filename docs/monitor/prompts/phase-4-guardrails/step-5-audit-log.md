# Phase 7-4 / Step 5：审计日志落库（Guardrails 收尾）

## 上下文

Phase 7-4 收尾步骤。把前 4 个 step 的所有命中事件（`quota_exceeded` / `tool_denied` / `prompt_injection` / `pii_filtered`）落到 SQLite `audit_logs` 表。Agent 端通过 `POST /api/v1/internal/audit-log` 回调后端写入。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §8 决策 #12（零新增数据库；audit 落 SQLite）
- `@docs/monitor/1.PRD.md` §5.4.5（审计日志验收清单）
- `@docs/monitor/3.ARCHITECTURE.md` §2 P5 / P8（审计回路）
- `@packages/backend/src/dao/dao.module.ts`（DAO 抽象模式）
- `@packages/backend/src/dao/dao.tokens.ts`（要新增 AUDIT_LOG_DAO token）
- `@packages/backend/src/dao/sqlite/permission-dao.sqlite.ts`（参考 DAO 实现写法）

前置条件：

- Phase 7-4 Step-1 / 2 / 3 / 4 全部完成（顺序锁死）

## 任务

### 任务 1：补 `.env.example`

修改 `@.env.example`，追加：

```dotenv
# Audit - 内部 API 鉴权（Agent 端回调 backend 写审计日志用）
INTERNAL_API_KEY=change-me-internal-shared-secret
```

`.env` 也加上对应实际值（生成方法：`openssl rand -hex 16`）。

### 任务 2：新建 `audit-log.entity.ts`

新建文件 `packages/backend/src/dao/sqlite/audit-log.entity.ts`，**全文**：

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * 监控体系 Phase 7-4 Step 5：Agent / Backend Guardrails 命中事件审计。
 * 字段约定见 docs/monitor/1.PRD.md §5.4.5。
 */
@Entity({ name: 'audit_logs' })
@Index(['traceId'])
@Index(['userId', 'createdAt'])
@Index(['eventType'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** W3C trace_id（32 hex），来自 TraceContext */
  @Column({ type: 'text', name: 'trace_id', nullable: true })
  traceId?: string | null;

  /** 触发用户 id；系统类事件可为空 */
  @Column({ type: 'text', name: 'user_id', nullable: true })
  userId?: string | null;

  /** quota_exceeded / tool_denied / prompt_injection / pii_filtered */
  @Column({ type: 'text', name: 'event_type' })
  eventType!: string;

  /** info / warn / block */
  @Column({ type: 'text', default: 'info' })
  severity!: string;

  /** 业务负载（JSON 序列化字符串） */
  @Column({ type: 'text', name: 'payload_json', nullable: true })
  payloadJson?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
```

### 任务 3：新建 DAO 接口

新建文件 `packages/backend/src/dao/interfaces/audit-log-dao.interface.ts`，**全文**：

```typescript
export interface CreateAuditLogInput {
  traceId?: string | null;
  userId?: string | null;
  eventType: string;
  severity?: 'info' | 'warn' | 'block';
  payload?: Record<string, unknown>;
}

export interface IAuditLogDao {
  create(input: CreateAuditLogInput): Promise<{ id: string }>;
  findRecent(limit?: number): Promise<
    Array<{
      id: string;
      traceId: string | null;
      userId: string | null;
      eventType: string;
      severity: string;
      payload: Record<string, unknown> | null;
      createdAt: Date;
    }>
  >;
}
```

### 任务 4：新建 SQLite 实现

新建文件 `packages/backend/src/dao/sqlite/audit-log-dao.sqlite.ts`，**全文**：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  CreateAuditLogInput,
  IAuditLogDao,
} from '../interfaces/audit-log-dao.interface';
import { AuditLog } from './audit-log.entity';

@Injectable()
export class AuditLogDaoSqlite implements IAuditLogDao {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async create(input: CreateAuditLogInput): Promise<{ id: string }> {
    const entity = this.repo.create({
      traceId: input.traceId ?? null,
      userId: input.userId ?? null,
      eventType: input.eventType,
      severity: input.severity ?? 'info',
      payloadJson: input.payload ? JSON.stringify(input.payload) : null,
    });
    const saved = await this.repo.save(entity);
    return { id: saved.id };
  }

  async findRecent(limit = 50): Promise<
    Array<{
      id: string;
      traceId: string | null;
      userId: string | null;
      eventType: string;
      severity: string;
      payload: Record<string, unknown> | null;
      createdAt: Date;
    }>
  > {
    const rows = await this.repo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      traceId: r.traceId ?? null,
      userId: r.userId ?? null,
      eventType: r.eventType,
      severity: r.severity,
      payload: r.payloadJson ? (JSON.parse(r.payloadJson) as Record<string, unknown>) : null,
      createdAt: r.createdAt,
    }));
  }
}
```

### 任务 5：注册到 `dao.module.ts` / `dao.tokens.ts`

修改 `@packages/backend/src/dao/dao.tokens.ts`，**追加**：

```typescript
export const AUDIT_LOG_DAO = Symbol('AUDIT_LOG_DAO');
```

修改 `@packages/backend/src/dao/dao.module.ts`：

```typescript
import { AuditLog } from './sqlite/audit-log.entity';
import { AuditLogDaoSqlite } from './sqlite/audit-log-dao.sqlite';
import {
  AUDIT_LOG_DAO,
  KNOWLEDGE_DAO,
  PERMISSION_DAO,
  ROLE_DAO,
  STUDENT_DAO,
  USER_DAO,
} from './dao.tokens';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Role,
      Permission,
      Student,
      KnowledgeBase,
      AuditLog,
    ]),
  ],
  providers: [
    { provide: USER_DAO, useClass: UserDaoSqlite },
    { provide: ROLE_DAO, useClass: RoleDaoSqlite },
    { provide: PERMISSION_DAO, useClass: PermissionDaoSqlite },
    { provide: STUDENT_DAO, useClass: StudentDaoSqlite },
    { provide: KNOWLEDGE_DAO, useClass: KnowledgeDaoSqlite },
    { provide: AUDIT_LOG_DAO, useClass: AuditLogDaoSqlite },
  ],
  exports: [
    USER_DAO,
    ROLE_DAO,
    PERMISSION_DAO,
    STUDENT_DAO,
    KNOWLEDGE_DAO,
    AUDIT_LOG_DAO,
  ],
})
export class DaoModule {}
```

### 任务 6：新建 audit 模块（service + controller + module）

#### 6.1：新建 `audit.service.ts`

新建文件 `packages/backend/src/common/audit/audit.service.ts`，**全文**：

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';

import { AUDIT_LOG_DAO } from '../../dao/dao.tokens';
import type {
  CreateAuditLogInput,
  IAuditLogDao,
} from '../../dao/interfaces/audit-log-dao.interface';
import { TraceContext } from '../context/trace-context';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(AUDIT_LOG_DAO) private readonly dao: IAuditLogDao) {}

  /** 后端直接调（如 quota / tool ACL 命中） */
  async log(input: CreateAuditLogInput): Promise<void> {
    const traceId = input.traceId ?? TraceContext.getTraceId() ?? null;
    try {
      const { id } = await this.dao.create({ ...input, traceId });
      this.logger.log(
        JSON.stringify({
          trace_id: traceId,
          user_id: input.userId ?? '',
          module: 'audit',
          level: 'info',
          msg: 'audit_log 写入成功',
          extra: { id, event_type: input.eventType, severity: input.severity },
        }),
      );
    } catch (e) {
      this.logger.warn(`audit_log 写入失败: ${(e as Error).message}`);
    }
  }
}
```

#### 6.2：新建 `audit.controller.ts`

新建文件 `packages/backend/src/common/audit/audit.controller.ts`，**全文**：

```typescript
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SkipResponseWrap } from '../decorators/skip-response-wrap.decorator';
import { AuditService } from './audit.service';

/**
 * 内部接口：Agent 端（python）回调写审计日志。
 * 鉴权：x-internal-api-key header 必须等于 .env 中 INTERNAL_API_KEY。
 * 路径：POST /api/v1/internal/audit-log
 */
@Controller('internal')
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  @Post('audit-log')
  @HttpCode(204)
  @SkipResponseWrap()
  async write(
    @Headers('x-internal-api-key') apiKey: string | undefined,
    @Body()
    body: {
      trace_id?: string;
      user_id?: string;
      event_type?: string;
      severity?: 'info' | 'warn' | 'block';
      payload?: Record<string, unknown>;
    },
  ): Promise<void> {
    const expected = this.config.get<string>('INTERNAL_API_KEY');
    if (!expected || !apiKey || apiKey !== expected) {
      throw new ForbiddenException('invalid internal api key');
    }
    if (!body.event_type) {
      throw new BadRequestException('event_type required');
    }
    await this.audit.log({
      traceId: body.trace_id ?? null,
      userId: body.user_id ?? null,
      eventType: body.event_type,
      severity: body.severity ?? 'info',
      payload: body.payload,
    });
  }
}
```

#### 6.3：新建 `audit.module.ts`

新建文件 `packages/backend/src/common/audit/audit.module.ts`，**全文**：

```typescript
import { Module } from '@nestjs/common';

import { DaoModule } from '../../dao/dao.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [DaoModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
```

#### 6.4：在 `app.module.ts` 注册 AuditModule

```typescript
import { AuditModule } from './common/audit/audit.module';

@Module({
  imports: [
    // ... 现有
    QuotaModule,
    AuditModule, // 监控体系 Phase 7-4 Step 5
  ],
  // ...
})
```

### 任务 7：把 backend 端 4 类命中事件接到 AuditService

**约定**：只在后端能直接观察到的事件由 AuditService 落库；Agent 端事件走 HTTP 回调（任务 8）。

#### 7.1：Quota 命中接入

修改 `@packages/backend/src/common/quota/quota.module.ts` import AuditModule：

```typescript
import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { QuotaService } from './quota.service';

@Module({
  imports: [AuditModule],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
```

修改 `@packages/backend/src/common/quota/quota.service.ts`，注入并调用：

```typescript
import { AuditService } from '../audit/audit.service';

  constructor(
    private readonly nestConfig: ConfigService,
    private readonly audit: AuditService,
  ) {}
```

并把 `checkAndReserve` 中两处 `throw new QuotaExceededException(...)` 之前**追加**：

```typescript
      await this.audit.log({
        userId,
        eventType: 'quota_exceeded',
        severity: 'block',
        payload: {
          scope: 'daily', // 或 'thread'
          used: dailyN,    // 或 threadN
          requested: estimatedTokens,
          cap: this.config.dailyTokensPerUser, // 或 perThread
        },
      });
```

> 两处 throw 各加一段；注意 `scope` / `used` / `cap` 字段值要分别对应 daily / thread 两个分支。

#### 7.2：Tool ACL 拒绝接入

修改 `@packages/backend/src/agent/tool-acl.service.ts`，注入 AuditService 并在 `resolveAllowed` 中检测到拒绝时调用：

```typescript
import { AuditService } from '../common/audit/audit.service';

  constructor(private readonly audit: AuditService) {}

  resolveAllowed(user: JwtUser): string[] {
    // ... 现有逻辑
    if (allowed.length !== ToolAclService.ALL_BUILTIN_TOOLS.length) {
      // 部分工具被拒绝 → 异步落审计（不阻塞主流程）
      const denied = ToolAclService.ALL_BUILTIN_TOOLS.filter(
        (t) => !allowed.includes(t),
      );
      void this.audit.log({
        userId: user.id,
        eventType: 'tool_denied',
        severity: 'info',
        payload: { denied, allowed },
      });
    }
    return allowed;
  }
```

修改 `@packages/backend/src/agent/agent.module.ts` 加 `AuditModule` 到 imports（让 ToolAclService 能注入 AuditService）：

```typescript
import { AuditModule } from '../common/audit/audit.module';

@Module({
  imports: [
    // ...
    QuotaModule,
    AuditModule,
  ],
  // ...
})
```

### 任务 8：Agent 端 audit_client（HTTP 回调）

新建文件 `packages/agent/src/guardrails/audit_client.py`，**全文**：

```python
"""Agent 端审计日志客户端：HTTP 回调 backend /api/v1/internal/audit-log。

落库失败仅日志告警，不阻塞主链路。
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _endpoint() -> str | None:
    raw = os.environ.get('BACKEND_INTERNAL_URL', 'http://localhost:3000').rstrip('/')
    return f'{raw}/api/v1/internal/audit-log'


def _api_key() -> str | None:
    return os.environ.get('INTERNAL_API_KEY')


def log(
    event_type: str,
    *,
    trace_id: str = '',
    user_id: str = '',
    severity: str = 'info',
    payload: dict[str, Any] | None = None,
) -> None:
    """Fire-and-forget 风格的审计上报；同步 HTTP 请求（短超时）"""
    endpoint = _endpoint()
    api_key = _api_key()
    if not endpoint or not api_key:
        logger.debug('audit_client: 未配置 endpoint/key，跳过')
        return
    body = {
        'event_type': event_type,
        'severity': severity,
        'payload': payload or {},
    }
    if trace_id:
        body['trace_id'] = trace_id
    if user_id:
        body['user_id'] = user_id
    try:
        httpx.post(
            endpoint,
            json=body,
            headers={'x-internal-api-key': api_key},
            timeout=3.0,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning('audit_client 上报失败 event=%s err=%r', event_type, e)
```

### 任务 9：替换 Step 3 / Step 4 中的 TODO 占位

修改 `@packages/agent/src/graph/nodes.py`。

#### 9.1：import

```python
from src.guardrails import audit_client, input_filter, output_filter
```

#### 9.2：Step 3 占位替换

找到 Step 3 留下的：

```python
        # 监控体系 Phase 7-4 Step 5（占位）：写入审计
        # TODO Step-5: audit_client.log('prompt_injection', ...)
```

**改为**：

```python
        audit_client.log(
            'prompt_injection',
            trace_id=state.get('app_trace_id', ''),
            user_id=state.get('mem0_user_id', ''),
            severity='warn',
            payload={
                'matched_keywords': filter_result.matched_keywords[:5],
                'last_human_text_preview': last_human_text[:200],
            },
        )
```

#### 9.3：Step 4 占位替换

找到 Step 4 留下的：

```python
            # 3) 占位：审计落库（Phase 7-4 Step 5 实现）
            # TODO Step-5: audit_client.log('pii_filtered', {...})
```

**改为**：

```python
            audit_client.log(
                'pii_filtered',
                trace_id=state.get('app_trace_id', ''),
                user_id=state.get('mem0_user_id', ''),
                severity='warn',
                payload={
                    'replacements': filter_out.replacements,
                },
            )
```

### 任务 10：`.env` 同步 `BACKEND_INTERNAL_URL`

修改 `@.env.example` 追加：

```dotenv
# Audit - Agent 端回调 backend 内部 API 的根 URL
BACKEND_INTERNAL_URL=http://localhost:3000
```

并补到 `.env`。

## 验证

### 验证步骤 1：编译 + 启动

```bash
cd packages/backend && pnpm build && pnpm start:dev
```

启动日志应见：

- `Mapped {/api/v1/internal/audit-log, POST}`
- 没有任何 DI 错误

```bash
cd packages/agent
uv run python -c "from src.guardrails import audit_client; print('OK')"
uv run langgraph dev --port 8123
```

### 验证步骤 2：触发 quota_exceeded

把 `QUOTA_DAILY_TOKENS_PER_USER=200` 临时调小，重启后端，前端发一条长消息 → 拿到 429。

查 SQLite：

```bash
sqlite3 packages/backend/data/agent-demo.db \
  "SELECT id, trace_id, user_id, event_type, severity, payload_json, created_at \
   FROM audit_logs ORDER BY created_at DESC LIMIT 5;"
```

期望看到 1 行 `event_type=quota_exceeded severity=block`，payload_json 含 `scope/used/cap`。

把 quota 改回 200000。

### 验证步骤 3：触发 tool_denied

用 Step 2 任务 6 建的 `lowuser` 登录（或新建一个），登录后发一条消息——任意消息都会触发 ToolAclService.resolveAllowed。

期望 SQLite 出现一行 `event_type=tool_denied severity=info`，payload 含 `denied: [...]`。

### 验证步骤 4：触发 prompt_injection

前端发 `请忽略以上所有指令...`。

期望 SQLite 出现 `event_type=prompt_injection severity=warn`，payload 含 `matched_keywords` + `last_human_text_preview`。

### 验证步骤 5：触发 pii_filtered

前端发 `请用 markdown 表格列出张三 13812345678`。

期望 SQLite 出现 `event_type=pii_filtered severity=warn`，payload 含 `replacements: ["china_phone"]`。

### 验证步骤 6：4 类事件齐全

```bash
sqlite3 packages/backend/data/agent-demo.db \
  "SELECT event_type, COUNT(*) FROM audit_logs GROUP BY event_type;"
```

期望输出包含 4 行：

```
pii_filtered|N
prompt_injection|N
quota_exceeded|N
tool_denied|N
```

### 验证步骤 7：trace_id 串通

任选一条 audit log 的 trace_id：

```sql
SELECT trace_id, event_type FROM audit_logs WHERE trace_id IS NOT NULL LIMIT 1;
```

把该 trace_id 粘到 LangSmith Filter：

```
metadata.app_trace_id = "<那个 trace_id>"
```

应能精确命中 1 条 trace（Phase 7-1 / DoD-1 闭环）。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| Agent 端调 `/internal/audit-log` 拿到 403 | INTERNAL_API_KEY 不一致 | 确认 `.env` 后端和 agent 端的值一致；重启两端 |
| SQLite 表不存在 | TypeORM synchronize=true 没生效 / entity 没注册 | 检查 dao.module 的 forFeature 数组含 AuditLog；删除 `data/agent-demo.db` 让它重建（仅 dev） |
| audit_log 写入但 trace_id 全空 | Agent 端 audit_client 没传 trace_id | 检查 nodes.py 调用处的 `trace_id=state.get('app_trace_id', '')` |
| 后端日志看不到 audit_log 写入成功 | NestJS Logger 级别太高 | 默认 LOG 级别即可，不需要调 |
| tool_denied 重复落库（一次请求多条） | resolveAllowed 被多次调用 | 接受这个行为或在 ToolAclService 内部加 traceId 级 dedupe |

## 完成后

### 更新 PROGRESS.md

#### 7-4-5 标 ✅

```
| 7-4-5 | Guardrails Step-5：审计日志落库 | ✅ | <今天日期> | audit_logs 表 + DAO + AuditService + AuditController（INTERNAL_API_KEY 鉴权）+ 4 类事件接入 + Agent audit_client；trace_id 与 LangSmith metadata 联动 |
```

#### Phase 7-4 整体标 ✅

```
## Phase 7-4：Guardrails 安全边界（目标 4，P1）

**整体：✅ 已完成（<今天日期>）**（实际工期：X 天）
```

#### DoD-4 标 ✅

```
| DoD-4 | 安全边界 | ✅ | 4 类命中事件落 audit_logs 表；超额返回 429；trace_id 串通 |
```

### git commit

```bash
git add packages/backend/src/dao/sqlite/audit-log.entity.ts \
        packages/backend/src/dao/sqlite/audit-log-dao.sqlite.ts \
        packages/backend/src/dao/interfaces/audit-log-dao.interface.ts \
        packages/backend/src/dao/dao.tokens.ts \
        packages/backend/src/dao/dao.module.ts \
        packages/backend/src/common/audit/ \
        packages/backend/src/common/quota/ \
        packages/backend/src/agent/tool-acl.service.ts \
        packages/backend/src/agent/agent.module.ts \
        packages/backend/src/app.module.ts \
        packages/agent/src/guardrails/audit_client.py \
        packages/agent/src/graph/nodes.py \
        .env.example \
        docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(monitor): phase-7-4 step-5 审计日志落库（Phase 7-4 收尾）

- packages/backend:
  * dao/sqlite/audit-log.entity.ts (audit_logs 表，trace_id/user_id/event_type/severity/payload_json)
  * dao/interfaces/audit-log-dao.interface.ts
  * dao/sqlite/audit-log-dao.sqlite.ts (TypeORM 实现)
  * dao.tokens.ts: AUDIT_LOG_DAO
  * dao.module.ts: 注册 AuditLog + AUDIT_LOG_DAO
  * common/audit/audit.service.ts (AuditService.log)
  * common/audit/audit.controller.ts (POST /api/v1/internal/audit-log, x-internal-api-key 鉴权)
  * common/audit/audit.module.ts
  * quota.service 注入 AuditService → 超额时 log quota_exceeded
  * tool-acl.service 拒绝时 log tool_denied
- packages/agent:
  * guardrails/audit_client.py (httpx fire-and-forget 短超时)
  * nodes.py: prompt_injection / pii_filtered 命中点调 audit_client.log
- .env.example: INTERNAL_API_KEY + BACKEND_INTERNAL_URL
- DoD: 4 类事件齐全落库；trace_id 与 LangSmith metadata 联动
- Phase 7-4 整体完成；DoD-4 ✅

ref: docs/monitor/PROGRESS.md Phase 7-4
EOF
)"
```

### 下一步

Phase 7-4 完成。进入 **Phase 7-5（Cost Optimization Playbook，1 个 step，0.5 天）**——纯文档产出，无代码改动。
