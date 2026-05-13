# Phase 7-3 / Step 3：后端反馈接口 + LangSmith REST 转发

## 上下文

Phase 7-3 第三步。新建 `POST /api/v1/agent/feedback` 接口，把前端反馈转发到 LangSmith（`POST /runs/{run_id}/feedback`），并给该 run 加 tag `feedback:up` / `feedback:down`。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §2 目标 3 验收点（后端反馈接口）
- `@docs/monitor/1.PRD.md` §5.3.2
- `@docs/monitor/3.ARCHITECTURE.md` §2 P6（feedback REST 转发）
- `@packages/backend/src/agent/agent.module.ts`（要在 module 注册新 controller / service）
- `@packages/backend/src/agent/agent.controller.ts`（参考 JwtAuthGuard 用法）
- `@packages/backend/src/bootstrap/admin-bootstrap.service.ts`（参考权限创建）

前置条件：

- Phase 7-3 / Step 2 已完成（前端按钮可点）
- LangSmith API key 在 `.env` 中可用

> **关于权限校验**：PRD 要求新增 `agent:feedback` 权限。考虑到当前 admin 已绑定通配权限 `*:*`，**本 step 仅 `JwtAuthGuard`，不写细粒度权限检查**，避免阻塞流转。如果未来要做角色拆分，权限名 `agent:feedback` 已在 1.PRD.md 中预留。

## 任务

### 任务 1：新建 `feedback.dto.ts`

新建文件 `packages/backend/src/agent/dto/feedback.dto.ts`，**全文**：

```typescript
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class FeedbackDto {
  @IsString()
  @IsNotEmpty()
  thread_id!: string;

  @IsString()
  @IsNotEmpty()
  langsmith_run_id!: string;

  @IsEnum(['up', 'down', 'note'])
  feedback!: 'up' | 'down' | 'note';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
```

### 任务 2：新建 `feedback.service.ts`

新建文件 `packages/backend/src/agent/feedback.service.ts`，**全文**：

```typescript
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { JwtUser } from '../auth/types/jwt-user.types';
import { TraceContext } from '../common/context/trace-context';
import { FeedbackDto } from './dto/feedback.dto';

interface LangSmithFeedbackPayload {
  run_id: string;
  key: string;
  score?: number;
  value?: string;
  comment?: string;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private readonly config: ConfigService) {}

  async submit(dto: FeedbackDto, user: JwtUser): Promise<void> {
    const apiKey = this.config.get<string>('LANGSMITH_API_KEY');
    const endpoint = this.config.get<string>(
      'LANGCHAIN_ENDPOINT',
      'https://api.smith.langchain.com',
    );
    if (!apiKey) {
      throw new HttpException(
        'LangSmith 未配置 API key',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const traceId = TraceContext.getTraceId();
    this.logger.log(
      JSON.stringify({
        trace_id: traceId,
        user_id: user.id,
        thread_id: dto.thread_id,
        module: 'feedback',
        level: 'info',
        msg: '反馈提交',
        extra: {
          run_id: dto.langsmith_run_id,
          feedback: dto.feedback,
          has_comment: Boolean(dto.comment),
        },
      }),
    );

    // 监控体系：把 up=1 / down=0 / note 单独 score=null
    const score: number | undefined =
      dto.feedback === 'up' ? 1 : dto.feedback === 'down' ? 0 : undefined;
    const value: string | undefined =
      dto.feedback === 'note' ? 'note' : undefined;

    const payload: LangSmithFeedbackPayload = {
      run_id: dto.langsmith_run_id,
      key: 'user_feedback',
      ...(score !== undefined ? { score } : {}),
      ...(value !== undefined ? { value } : {}),
      ...(dto.comment ? { comment: dto.comment } : {}),
    };

    const feedbackUrl = `${endpoint.replace(/\/$/, '')}/feedback`;
    const tagsUrl = `${endpoint.replace(/\/$/, '')}/runs/${dto.langsmith_run_id}`;

    try {
      // 1. POST /feedback：写入分值
      const feedbackResp = await fetch(feedbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(payload),
      });
      if (!feedbackResp.ok) {
        const text = await feedbackResp.text().catch(() => '');
        throw new Error(
          `LangSmith /feedback 失败 status=${feedbackResp.status} body=${text}`,
        );
      }

      // 2. PATCH /runs/{id}：追加 tag（feedback:up / feedback:down）
      if (dto.feedback !== 'note') {
        const tagsResp = await fetch(tagsUrl, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            tags: [`feedback:${dto.feedback}`],
          }),
        });
        if (!tagsResp.ok) {
          // 打日志但不阻塞主流程（反馈分值已写成功）
          const text = await tagsResp.text().catch(() => '');
          this.logger.warn(
            `LangSmith /runs/${dto.langsmith_run_id} PATCH tag 失败 status=${tagsResp.status} body=${text}`,
          );
        }
      }
    } catch (e) {
      this.logger.error(
        `提交反馈到 LangSmith 失败: ${(e as Error).message}`,
        e instanceof Error ? e.stack : undefined,
      );
      throw new HttpException(
        '反馈提交失败，请稍后重试',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
```

### 任务 3：新建 `feedback.controller.ts`

新建文件 `packages/backend/src/agent/feedback.controller.ts`，**全文**：

```typescript
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';

import { JwtUser } from '../auth/types/jwt-user.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FeedbackDto } from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post('feedback')
  @HttpCode(200)
  async submit(
    @Body() dto: FeedbackDto,
    @CurrentUser() user: JwtUser,
  ): Promise<{ ok: true }> {
    await this.feedbackService.submit(dto, user);
    return { ok: true };
  }
}
```

> 注意：endpoint 是 `POST /api/v1/agent/feedback`，因为 `Controller('agent')` 给路由加了 `agent` 前缀，全局 prefix `/api/v1` 已在 `main.ts` 中设置。

### 任务 4：注册到 `agent.module.ts`

修改 `@packages/backend/src/agent/agent.module.ts`。

#### 改动 4.1：import

```typescript
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
```

#### 改动 4.2：把 controller / service 加入 module

找到 `@Module({...})`，**改为**：

```typescript
@Module({
  // ... 现有 imports 保持
  controllers: [
    AgentController,
    FeedbackController, // 监控体系 Phase 7-3
  ],
  providers: [
    AgentService,
    SttService,
    FeedbackService, // 监控体系 Phase 7-3
  ],
  exports: [
    // 保持原样；不导出 FeedbackService
  ],
})
export class AgentModule {}
```

> 如果 agent.module.ts 现有结构与此略有不同，**保持现有结构**，只把 `FeedbackController` 加到 controllers 数组、`FeedbackService` 加到 providers 数组即可。

## 验证

### 验证步骤 1：编译通过

```bash
cd packages/backend
pnpm build
```

期望无错误。

### 验证步骤 2：起后端，看路由打印

```bash
pnpm start:dev
```

NestJS 启动日志应能看到：

```
[Nest] ... LOG [RouterExplorer] Mapped {/api/v1/agent/feedback, POST} route
```

### 验证步骤 3：前端打通

继续 Step 2 留下的"点 👍 时 404"场景：

1. 浏览器登录，发一条消息
2. 等 AI 回复完成
3. 点击 👍 按钮
4. 期望 Toast 显示 **"已反馈：有用"**（而不是 "反馈失败 404"）
5. 按钮 disable + 高亮
6. 浏览器 Network → POST `/api/v1/agent/feedback` 返回 200

### 验证步骤 4：LangSmith 上确认 feedback 写入

打开 https://smith.langchain.com → 找到刚才那条 trace（用 Phase 7-1 / Step 5 的 `metadata.app_trace_id` filter 锁定）。

- 顶部 / 详情区应能看到 **Feedback** 区域，含一条：
  - Key: `user_feedback`
  - Score: 1（👍）或 0（👎）
  - Comment: （备注内容，如点的是 ✏️）
- 顶部 Tags 区域应能看到 `feedback:up` 或 `feedback:down`

### 验证步骤 5：备注按钮

前端点 ✏️ → 输入 "AI 答得不够具体" → 回 LangSmith trace 详情，Feedback 区应有一条 value=note + comment 文本。

### 验证步骤 6：curl 直测（可选）

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' \
  | grep -o '"access_token":"[^"]*' | cut -d '"' -f4)

curl -s -i -X POST http://localhost:3000/api/v1/agent/feedback \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "thread_id": "test-thread",
    "langsmith_run_id": "<LangSmith trace 上某条 run 的 UUID>",
    "feedback": "up"
  }'
```

期望返回 `200 OK` 且 `{"code":0,"data":{"ok":true},"message":"success"}`（全局响应包装）。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| 启动报 `Nest can't resolve dependencies of FeedbackService` | Module 未注册 | 检查 agent.module.ts 的 providers 数组 |
| 路由没出现在启动日志 | Controller 未注册 | 检查 agent.module.ts 的 controllers 数组 |
| 400 Bad Request 校验失败 | DTO 字段名拼写不对 / 缺字段 | 看后端 console 输出的 class-validator 错误信息 |
| LangSmith /feedback 502 | API key 错 / endpoint URL 错 | 确认 `.env` 中 `LANGSMITH_API_KEY` + `LANGCHAIN_ENDPOINT`，无尾部斜杠 |
| trace 上 feedback 写了但 tags 没加 | LangSmith run PATCH 接口要求只追加 tag，可能版本不同 | 接受这个降级；分值已写成功不影响功能。可在 LangSmith API docs 查 PATCH `/runs/{id}` 当前 schema |
| 后端日志看不到 trace_id | TraceContext 没生效 | 回 Phase 7-1 / Step 3 复查 TraceInterceptor 注册顺序 |

## 完成后

### 更新 PROGRESS.md

```
| 7-3-3 | 后端反馈接口 + LangSmith REST（P6） | ✅ | <今天日期> | feedback.controller + feedback.service；POST /agent/feedback 转发 LangSmith /feedback + PATCH tag；前端三按钮联调通过 |
```

### git commit

```bash
git add packages/backend/src/agent/dto/feedback.dto.ts \
        packages/backend/src/agent/feedback.controller.ts \
        packages/backend/src/agent/feedback.service.ts \
        packages/backend/src/agent/agent.module.ts \
        docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(monitor): phase-7-3 step-3 后端反馈接口 + LangSmith REST 转发

- POST /api/v1/agent/feedback (受 JwtAuthGuard 保护)
- FeedbackDto class-validator 校验 (up/down/note + 500 字 comment)
- FeedbackService:
  * POST {endpoint}/feedback 写分值 key=user_feedback (up=1 / down=0 / note=value)
  * PATCH {endpoint}/runs/{id} 追加 tag feedback:up|down
  * 日志含 trace_id（来自 TraceContext）
- agent.module.ts 注册新 controller / service
- DoD: 前端 👍 按钮点击后 LangSmith trace 出现 Feedback + Tag

ref: docs/monitor/PROGRESS.md 7-3-3
EOF
)"
```
