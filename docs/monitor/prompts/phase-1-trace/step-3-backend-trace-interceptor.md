# Phase 7-1 / Step 3：后端全局 Trace 拦截器 + 结构化日志（P4）

## 上下文

监控体系 Phase 7-1 的第三步。**后端从请求 header 解出 W3C `trace_id`，挂到 `AsyncLocalStorage`，所有日志自动注入 trace_id**。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §2 目标 2 验收点（结构化日志字段约定）
- `@docs/monitor/1.PRD.md` §5.2.2（后端验收清单）
- `@docs/monitor/3.ARCHITECTURE.md` §2 P4 + §6.2 / §6.3（Fallback 策略）
- `@docs/monitor/PROGRESS.md`
- `@packages/backend/src/app.module.ts`（现状）
- `@packages/backend/src/common/interceptors/response.interceptor.ts`（参考已有 Interceptor 风格）
- `@packages/backend/src/agent/agent.service.ts`（关键：现有 logger 调用都要能取到 trace_id）

前置条件：

- Step 2 已完成（PROGRESS.md 7-1-2 = ✅）

## 任务

### 任务 1：新建 `TraceContext`（AsyncLocalStorage 封装）

新建文件 `packages/backend/src/common/context/trace-context.ts`，**全文**如下：

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 单次请求级的 trace 上下文。
 * 在 NestJS 全局拦截器（TraceInterceptor）中 `run()`，
 * 后续 Service / DAO 通过 `getTraceId()` 同步取出。
 */
export interface TraceStore {
  /** 32 字符 hex；缺失时由后端 fallback 生成 */
  traceId: string;
  /** 来源：'frontend' = 来自前端 header；'backend' = fallback */
  traceOrigin: 'frontend' | 'backend';
}

const storage = new AsyncLocalStorage<TraceStore>();

export class TraceContext {
  /** 拦截器入口调用，把 store 绑到当前异步链 */
  static run<T>(store: TraceStore, fn: () => T): T {
    return storage.run(store, fn);
  }

  /** Service / DAO 中读 */
  static getStore(): TraceStore | undefined {
    return storage.getStore();
  }

  /** 便捷读 trace_id；上下文外返回空字符串 */
  static getTraceId(): string {
    return storage.getStore()?.traceId ?? '';
  }

  /** 便捷读 origin */
  static getTraceOrigin(): 'frontend' | 'backend' | '' {
    return storage.getStore()?.traceOrigin ?? '';
  }
}

/**
 * 解析 W3C traceparent header（`00-<32hex>-<16hex>-01`）
 * 返回 32 字符 hex trace_id；解析失败返回空字符串
 */
export function parseTraceparent(value: string | string[] | undefined): string {
  if (!value) {
    return '';
  }
  const header = Array.isArray(value) ? value[0] : value;
  if (typeof header !== 'string') {
    return '';
  }
  const parts = header.split('-');
  if (parts.length !== 4 || parts[0] !== '00' || parts[1].length !== 32) {
    return '';
  }
  if (!/^[0-9a-f]{32}$/i.test(parts[1])) {
    return '';
  }
  return parts[1].toLowerCase();
}

/** Fallback 用：生成 32 字符 hex（用 Node 内置 crypto） */
export function generateBackendTraceId(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require('node:crypto') as typeof import('node:crypto');
  return randomBytes(16).toString('hex');
}
```

### 任务 2：新建全局 `TraceInterceptor`

新建文件 `packages/backend/src/common/interceptors/trace.interceptor.ts`，**全文**如下：

```typescript
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Request } from 'express';

import {
  TraceContext,
  generateBackendTraceId,
  parseTraceparent,
} from '../context/trace-context';

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TraceInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // 仅处理 HTTP 请求；WebSocket / GraphQL 等不在 v1 范围
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<Request>();
    const headerValue = req.headers['traceparent'];
    let traceId = parseTraceparent(headerValue);
    let origin: 'frontend' | 'backend' = 'frontend';
    if (!traceId) {
      traceId = generateBackendTraceId();
      origin = 'backend';
      this.logger.debug(
        `traceparent 缺失，fallback 生成 trace_id=${traceId} path=${req.method} ${req.url}`,
      );
    }
    return new Observable((subscriber) => {
      TraceContext.run({ traceId, traceOrigin: origin }, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e: unknown) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
```

### 任务 3：新建结构化日志中间件

新建文件 `packages/backend/src/common/middleware/structured-log.middleware.ts`，**全文**如下：

```typescript
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { TraceContext } from '../context/trace-context';

/**
 * HTTP 请求出入日志（JSON 结构化）。
 * 字段约定（与 docs/monitor/4.ARCHITECTURE_FOR_AI.md §2 P4 一致）：
 *   - trace_id / user_id / thread_id / module / level / msg / elapsed_ms / extra
 */
@Injectable()
export class StructuredLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    res.on('finish', () => {
      const elapsedMs = Date.now() - start;
      const store = TraceContext.getStore();
      const userId = (req as Request & { user?: { id?: string } }).user?.id ?? '';
      const payload = {
        trace_id: store?.traceId ?? '',
        trace_origin: store?.traceOrigin ?? '',
        user_id: userId,
        module: 'http',
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        msg: `${req.method} ${req.url}`,
        elapsed_ms: elapsedMs,
        extra: {
          status: res.statusCode,
          ua: req.headers['user-agent'] ?? '',
        },
      };
      const line = JSON.stringify(payload);
      if (payload.level === 'error') {
        this.logger.error(line);
      } else if (payload.level === 'warn') {
        this.logger.warn(line);
      } else {
        this.logger.log(line);
      }
    });
    next();
  }
}
```

### 任务 4：注册到 `AppModule`

修改 `@packages/backend/src/app.module.ts`。

#### 改动 4.1：import + provider 注册（全局拦截器）

在 imports 区追加：

```typescript
import { TraceInterceptor } from './common/interceptors/trace.interceptor';
import { StructuredLogMiddleware } from './common/middleware/structured-log.middleware';
```

在 `providers` 数组中**追加**（注意：拦截器顺序很重要，trace 必须在 response 之前注册）：

```typescript
    { provide: APP_INTERCEPTOR, useClass: TraceInterceptor },
```

**完整 providers 块应当是**：

```typescript
  providers: [
    AppService,
    AdminBootstrapService,
    // 监控体系：trace 拦截器必须在 response 之前（更外层）
    { provide: APP_INTERCEPTOR, useClass: TraceInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
```

> NestJS 的全局 interceptor 执行顺序：声明在前的更"外层"，先解析请求、最后包装响应。`TraceInterceptor` 放最前面，才能让 `ResponseInterceptor` 也跑在 trace 上下文中。

#### 改动 4.2：注册中间件

`AppModule` class 实现 `NestModule` 接口（如果尚未实现），并在 `configure()` 中注册中间件：

```typescript
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
// ... 其他 imports

@Module({
  // ... 不变
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(StructuredLogMiddleware).forRoutes('*');
  }
}
```

> 如果 `@nestjs/common` 还没 import `MiddlewareConsumer` / `NestModule`，加上去。

### 任务 5：示范——把 `agent.service.ts` 中关键日志改为带 trace_id

仅作示范（其他 service 可在后续 phase 中陆续改造）。修改 `@packages/backend/src/agent/agent.service.ts`：

在 import 区追加：

```typescript
import { TraceContext } from '../common/context/trace-context';
```

找到 `streamChat` 方法的开头（紧挨着方法签名内）插入：

```typescript
    const traceId = TraceContext.getTraceId();
    this.logger.log(
      JSON.stringify({
        trace_id: traceId,
        user_id: user.id,
        thread_id: threadId,
        module: 'agent',
        level: 'info',
        msg: 'streamChat 开始',
        extra: {
          message_len: dto.message.length,
          available_tools_count: mergedTools.length,
        },
      }),
    );
```

> 这是**演示性改造**。本 Step 不强制把所有 logger 调用都改，只要 `streamChat` 入口能看到结构化日志即可。完整结构化日志改造留到 Phase 7-1 step-5 验收完后视情况补做。

## 验证

### 验证步骤 1：TS 编译通过

```bash
cd packages/backend
pnpm build
```

期望无错误。

### 验证步骤 2：起后端

```bash
pnpm start:dev
```

日志中应能看到 NestJS 正常启动，无 DI 错误。

### 验证步骤 3：前端发起对话，看后端 trace_id

继续 Step 2 的环境：前端 dev + 后端 dev + agent dev 三端都起着。

前端浏览器发一条聊天消息，记下 Console 中的 `[trace] POST /agent/chat trace_id= <hex>`。

切到后端终端，应当能看到 JSON 日志行，例如：

```
[Nest] 12345  - 05/13/2026, 11:30:00 AM     LOG [HTTP] {"trace_id":"<上面那个 hex>","trace_origin":"frontend","user_id":"<uuid>","module":"http","level":"info","msg":"POST /api/v1/agent/chat","elapsed_ms":2340,"extra":{"status":200,"ua":"Mozilla/..."}}
[Nest] 12345  - 05/13/2026, 11:30:00 AM     LOG [AgentService] {"trace_id":"<同上 hex>","user_id":"<uuid>","thread_id":"<uuid>","module":"agent","level":"info","msg":"streamChat 开始","extra":{"message_len":2,"available_tools_count":4}}
```

**关键验证**：

- 前端 console 的 trace_id 与后端日志中的 trace_id **完全一致**
- `trace_origin` = `frontend`（不是 `backend`）

### 验证步骤 4：fallback 路径验证

用 `curl` 直接调用一个 API（不带 traceparent header）：

```bash
curl -i http://localhost:3000/api/v1/permissions \
  -H "Authorization: Bearer <你的有效 token>"
```

后端日志应当看到：

```
[Nest] ... DEBUG [TraceInterceptor] traceparent 缺失，fallback 生成 trace_id=<hex> path=GET /api/v1/permissions
[Nest] ... LOG [HTTP] {"trace_id":"<hex>","trace_origin":"backend",...}
```

**关键验证**：`trace_origin = backend`。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| `Cannot find module './common/context/trace-context'` | 文件路径错 | 确认在 `packages/backend/src/common/context/trace-context.ts` |
| 拦截器报 `Cannot read properties of undefined (reading 'switchToHttp')` | WebSocket 请求被错误拦截 | 已有 `if (context.getType() !== 'http') return next.handle()` 防御，检查代码 |
| 日志中 `trace_id` 全空 | 拦截器没注册或顺序错 | 确认 `TraceInterceptor` 在 `providers` 数组的**第一个** APP_INTERCEPTOR |
| `MiddlewareConsumer` import 报错 | 没在 import 中加 | import `{ MiddlewareConsumer, Module, NestModule }` |
| SSE 流的日志看不到 | SSE 不会触发 `res.on('finish')` 直到流结束 | 这是正常的；流结束后才会输出一行汇总日志 |

## 完成后

### 更新 PROGRESS.md

```
| 7-1-3 | 后端 trace 拦截器 + 结构化日志（P4） | ✅ | <今天日期> | TraceContext / TraceInterceptor / StructuredLogMiddleware 已注册；agent.service.ts 演示日志改造完成 |
```

### git commit

```bash
git add packages/backend/src/common/context/ \
        packages/backend/src/common/interceptors/trace.interceptor.ts \
        packages/backend/src/common/middleware/structured-log.middleware.ts \
        packages/backend/src/app.module.ts \
        packages/backend/src/agent/agent.service.ts \
        docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(monitor): phase-7-1 step-3 后端 trace 拦截器 + 结构化日志

- 新增 common/context/trace-context.ts (AsyncLocalStorage 封装)
- 新增 common/interceptors/trace.interceptor.ts (全局 W3C trace_id 解析)
- 新增 common/middleware/structured-log.middleware.ts (JSON 日志)
- app.module.ts 注册全局拦截器与中间件
- agent.service.ts streamChat 入口演示日志含 trace_id
- Fallback: header 缺失时生成 trace_id, trace_origin=backend
- DoD: 前后端同一 trace_id 跨多行可 grep

ref: docs/monitor/PROGRESS.md 7-1-3
EOF
)"
```
