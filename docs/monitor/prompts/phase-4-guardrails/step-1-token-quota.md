# Phase 7-4 / Step 1：Token 配额（Redis 计数 + 429）

## 上下文

Phase 7-4 第一步（**5 个 step 顺序锁死**：配额 → 工具白名单 → 输入 filter → 输出 PII → 审计落库）。本步实现"每用户每天 N 个 token"的硬配额，超额返回 429。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §8 决策 #9（顺序锁死）+ §8.1 不做清单（不上 Falkor 等）
- `@docs/monitor/1.PRD.md` §5.4.1（token 配额验收清单）
- `@docs/monitor/3.ARCHITECTURE.md` §2 P5（quota 决策点）
- `@docs/monitor/PROGRESS.md`
- `@packages/backend/src/agent/agent.controller.ts`（要加 checkAndReserve）
- `@packages/backend/src/agent/agent.service.ts`（要加 commit 调用）
- `@packages/backend/src/app.module.ts`（要注册 QuotaModule）

前置条件：

- Phase 7-1 / 7-2 / 7-3 全部完成
- Redis 服务在 `redis://localhost:6379` 可用（与 Agent checkpointer 共用 Redis 实例，**key 命名隔离**）

> 本 step 配额采用**字符数粗估**（每条 message + answer 的 utf-8 字符数 ÷ 3 作为 token 估算）。精确版未来从 LangSmith run.usage 回填，作为 v2 改进。

## 任务

### 任务 1：安装 Redis 客户端

```bash
cd packages/backend
pnpm add ioredis
```

`ioredis` 是 NestJS 生态最常用的 Redis 客户端，类型完整。

### 任务 2：补 `.env.example`

修改 `@.env.example`，**追加**：

```dotenv
# Quota - Token 配额（监控体系 Phase 7-4 Step 1）
QUOTA_DAILY_TOKENS_PER_USER=200000
QUOTA_PER_THREAD=50000
QUOTA_REDIS_KEY_PREFIX=plan2code:quota
```

`@.env` 中也加上对应实际值。

### 任务 3：新建 `quota.config.ts`

新建文件 `packages/backend/src/common/quota/quota.config.ts`，**全文**：

```typescript
export interface QuotaConfig {
  dailyTokensPerUser: number;
  perThread: number;
  redisKeyPrefix: string;
  redisUrl: string;
}

export function loadQuotaConfig(env: Record<string, string | undefined>): QuotaConfig {
  return {
    dailyTokensPerUser: Number(env.QUOTA_DAILY_TOKENS_PER_USER ?? 200_000),
    perThread: Number(env.QUOTA_PER_THREAD ?? 50_000),
    redisKeyPrefix: env.QUOTA_REDIS_KEY_PREFIX ?? 'plan2code:quota',
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
  };
}
```

### 任务 4：新建 `quota.service.ts`

新建文件 `packages/backend/src/common/quota/quota.service.ts`，**全文**：

```typescript
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { TraceContext } from '../context/trace-context';
import { loadQuotaConfig, type QuotaConfig } from './quota.config';

/** 配额超限异常（前端见 429 + 中文 message） */
export class QuotaExceededException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class QuotaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QuotaService.name);
  private redis!: Redis;
  private config!: QuotaConfig;

  constructor(private readonly nestConfig: ConfigService) {}

  onModuleInit(): void {
    this.config = loadQuotaConfig(process.env);
    this.redis = new Redis(this.config.redisUrl, {
      lazyConnect: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
    });
    this.redis.on('error', (err) =>
      this.logger.error(`Redis 错误: ${err.message}`),
    );
    this.logger.log(
      JSON.stringify({
        msg: 'QuotaService 已启动',
        daily: this.config.dailyTokensPerUser,
        per_thread: this.config.perThread,
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }

  private dailyKey(userId: string): string {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `${this.config.redisKeyPrefix}:user:${userId}:${today}`;
  }

  private threadKey(threadId: string): string {
    return `${this.config.redisKeyPrefix}:thread:${threadId}`;
  }

  /**
   * 入口预检：reserve N tokens（粗估）。超限抛 429。
   * 返回 reservedTokens 数；commit() 时若实际 > reserved，补差额；< reserved 不退还。
   */
  async checkAndReserve(
    userId: string,
    threadId: string,
    estimatedTokens: number,
  ): Promise<number> {
    const dKey = this.dailyKey(userId);
    const tKey = this.threadKey(threadId);
    const [dailyUsed, threadUsed] = await Promise.all([
      this.redis.get(dKey),
      this.redis.get(tKey),
    ]);
    const dailyN = Number(dailyUsed ?? 0);
    const threadN = Number(threadUsed ?? 0);

    if (dailyN + estimatedTokens > this.config.dailyTokensPerUser) {
      this.logger.warn(
        JSON.stringify({
          trace_id: TraceContext.getTraceId(),
          user_id: userId,
          module: 'quota',
          level: 'warn',
          msg: '日配额超限',
          extra: { used: dailyN, requested: estimatedTokens, cap: this.config.dailyTokensPerUser },
        }),
      );
      throw new QuotaExceededException(
        `今日 AI 用量已达上限（${this.config.dailyTokensPerUser} tokens），请明日再试`,
      );
    }
    if (threadN + estimatedTokens > this.config.perThread) {
      this.logger.warn(
        JSON.stringify({
          trace_id: TraceContext.getTraceId(),
          user_id: userId,
          module: 'quota',
          level: 'warn',
          msg: '单会话配额超限',
          extra: { used: threadN, requested: estimatedTokens, cap: this.config.perThread },
        }),
      );
      throw new QuotaExceededException(
        `当前会话 token 用量过大，请新建会话继续`,
      );
    }
    return estimatedTokens;
  }

  /**
   * SSE 流结束时调用，把实际消耗的 token 数累加到 Redis。
   * Daily key TTL = 48h 自动清理；thread key TTL = 7d。
   */
  async commit(
    userId: string,
    threadId: string,
    actualTokens: number,
  ): Promise<void> {
    if (actualTokens <= 0) {
      return;
    }
    const dKey = this.dailyKey(userId);
    const tKey = this.threadKey(threadId);
    const pipeline = this.redis.pipeline();
    pipeline.incrby(dKey, actualTokens).expire(dKey, 48 * 3600);
    pipeline.incrby(tKey, actualTokens).expire(tKey, 7 * 24 * 3600);
    await pipeline.exec().catch((e) => {
      this.logger.warn(`commit 失败 user=${userId} thread=${threadId}: ${(e as Error).message}`);
    });
  }

  /** 粗估 token 数：utf-8 字符数 ÷ 3（保守值，中文实际更接近 ÷ 2，英文更接近 ÷ 4） */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 3);
  }
}
```

### 任务 5：新建 `quota.module.ts`

新建文件 `packages/backend/src/common/quota/quota.module.ts`，**全文**：

```typescript
import { Module } from '@nestjs/common';
import { QuotaService } from './quota.service';

@Module({
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
```

### 任务 6：在 `app.module.ts` 注册

修改 `@packages/backend/src/app.module.ts`：

import:

```typescript
import { QuotaModule } from './common/quota/quota.module';
```

`imports` 数组加 `QuotaModule`。

### 任务 7：在 `agent.module.ts` 引入

修改 `@packages/backend/src/agent/agent.module.ts`：

import:

```typescript
import { QuotaModule } from '../common/quota/quota.module';
```

`@Module({ imports: [..., QuotaModule] })`

### 任务 8：在 `agent.controller.ts` 入口预检

修改 `@packages/backend/src/agent/agent.controller.ts`。

#### 改动 8.1：注入 QuotaService

```typescript
import { QuotaService } from '../common/quota/quota.service';

  constructor(
    private readonly agentService: AgentService,
    private readonly sttService: SttService,
    private readonly quota: QuotaService,
  ) {}
```

#### 改动 8.2：在 `chat()` 方法的 try 之前预检

```typescript
  @Post('chat')
  @SkipResponseWrap()
  async chat(
    @Body() body: ChatDto,
    @CurrentUser() user: JwtUser,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    // 监控体系 Phase 7-4 Step 1：入口预检（粗估 = 用户输入字符 ÷ 3 + 预留 2000 输出）
    const estimated =
      this.quota.estimateTokens(body.message) + 2000;
    // 缺 thread_id 时用 'pending'，后续 commit 用 dto 创建的真实 thread_id 累加
    const threadIdForReserve = body.thread_id ?? `pending-${user.id}`;
    await this.quota.checkAndReserve(user.id, threadIdForReserve, estimated);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    const flushable = res as Response & { flushHeaders?: () => void };
    flushable.flushHeaders?.();

    const writeEvent = (payload: AgentChatStreamPayload) => {
      res.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      for await (const payload of this.agentService.chatStream(user, body)) {
        writeEvent(payload);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '流式对话失败';
      writeEvent({ type: 'error', message });
    } finally {
      res.end();
    }
  }
```

> ⚠️ `await this.quota.checkAndReserve(...)` 抛出 `QuotaExceededException` (`HttpException 429`)：会被 NestJS 全局 filter 转成 JSON 错误响应，**前端 axios/fetch 会按 429 处理**——这是预期。前端早已有 `streamChat` 的 `res.ok` 判断，会显示 `errText` Toast。

### 任务 9：在 `agent.service.ts` 流末尾 commit

修改 `@packages/backend/src/agent/agent.service.ts`：

#### 改动 9.1：注入 QuotaService

```typescript
import { QuotaService } from '../common/quota/quota.service';

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly userFrontendTools: UserFrontendToolsService,
    private readonly gateway: AppGateway,
    private readonly quota: QuotaService,
  ) {}
```

#### 改动 9.2：在 `streamChat` 流结束处 commit

找到 `streamChat` 函数（asyncgen）末尾——`finally { stream.destroy(); }` 之后，**追加**：

```typescript
    // 监控体系 Phase 7-4 Step 1：估算总 token 并 commit
    try {
      const promptTokens = this.quota.estimateTokens(dto.message);
      const completionTokens = this.quota.estimateTokens(accumulatedText);
      const total = promptTokens + completionTokens;
      await this.quota.commit(user.id, threadId, total);
    } catch (e) {
      this.logger.warn(`配额 commit 失败 user=${user.id}: ${(e as Error).message}`);
    }
```

> `accumulatedText` 是 Phase 7-1 / Step 4 已在循环里维护的"累计输出文本"变量；`threadId` 是函数局部变量。如果你的 `streamChat` 没有这两个变量，先 Read 一下确认现状，必要时声明 `let accumulatedText = ''` 并在每个 `token` payload 拼接。

## 验证

### 验证步骤 1：编译

```bash
cd packages/backend && pnpm build
```

### 验证步骤 2：起后端，看 QuotaService 启动日志

```bash
pnpm start:dev
```

应看到：

```
[Nest] ... LOG [QuotaService] {"msg":"QuotaService 已启动","daily":200000,"per_thread":50000}
```

### 验证步骤 3：正常调用记账

前端发一条短消息（如 `你好`）。后端日志应看到 `streamChat 开始` 之后流结束。**没有报错就 OK**。

查 Redis：

```bash
redis-cli
> KEYS plan2code:quota:*
> GET plan2code:quota:user:<admin_uuid>:<today_YYYY-MM-DD>
```

应看到非零数字（粗估的 token 数）。

### 验证步骤 4：超额触发 429

临时把 `QUOTA_DAILY_TOKENS_PER_USER=200` 改小（注意不是 200_000），**重启后端**。

前端再发一条稍长的消息（如 `请详细介绍一下黑洞`，估算 token > 200）：

- 浏览器 Console 应看到 `streamChat` 报错（res.ok = false，status = 429）
- Toast 显示 `今日 AI 用量已达上限...`

把 `.env` 改回 200_000。

### 验证步骤 5：单会话超限

`QUOTA_PER_THREAD=200`、`QUOTA_DAILY_TOKENS_PER_USER=200000`（注意只限 thread），重启。

在**同一会话**里连续多次对话直到 thread 累加 > 200，期望第 N 次拿到 `当前会话 token 用量过大，请新建会话继续`。

新建会话（前端清掉 thread_id）应能继续。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| `Redis 错误: ECONNREFUSED` | Redis 未启动 | `redis-cli ping`；启动 OrbStack Redis 容器 |
| 后端启动报 `Cannot find module 'ioredis'` | 任务 1 未执行 | `cd packages/backend && pnpm add ioredis` |
| 永远不超限 | `dailyTokensPerUser` 太大 | 临时改 `.env` 200 重测 |
| 429 但前端没 Toast | `streamChat` 的 `res.ok` 分支已有逻辑（Phase 7-1 验过）| 看 Network response body 是否含 `message` 字段 |
| Redis key 不带日期 | 系统时区导致 `toISOString().slice(0,10)` 日期跳变 | UTC vs 本地差几小时；可改 `new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')` |

## 完成后

### 更新 PROGRESS.md

```
| 7-4-1 | Guardrails Step-1：token 配额 | ✅ | <今天日期> | quota.service + ioredis；agent.controller checkAndReserve；streamChat commit；429 + 前端 Toast 联调通过 |
```

### git commit

```bash
git add packages/backend/package.json packages/backend/pnpm-lock.yaml \
        packages/backend/src/common/quota/ \
        packages/backend/src/app.module.ts \
        packages/backend/src/agent/agent.module.ts \
        packages/backend/src/agent/agent.controller.ts \
        packages/backend/src/agent/agent.service.ts \
        .env.example \
        docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(monitor): phase-7-4 step-1 token 配额（Redis + 429）

- packages/backend 新增 ioredis 依赖
- src/common/quota/ 三件套：config / service / module
  * checkAndReserve(userId, threadId, estimated) → 超限 429
  * commit(userId, threadId, actual) → Redis incrby + TTL
  * estimateTokens(text) = ceil(len ÷ 3) 粗估
  * dailyKey = plan2code:quota:user:{id}:{YYYY-MM-DD} (TTL 48h)
  * threadKey = plan2code:quota:thread:{id} (TTL 7d)
- agent.controller chat() 入口预检 (estimated=输入+2000)
- agent.service streamChat 流末尾 commit (粗估 prompt+completion)
- 顺序锁死：本步为 Phase 7-4 Step-1，下一步前不得跳过
- DoD: redis-cli 可见配额 key；超额返回 429 + 前端 Toast

ref: docs/monitor/PROGRESS.md 7-4-1
EOF
)"
```

### 下一步

完成本 step 才能进入 Phase 7-4 / Step 2（工具白名单）。**顺序不可跳过**。
