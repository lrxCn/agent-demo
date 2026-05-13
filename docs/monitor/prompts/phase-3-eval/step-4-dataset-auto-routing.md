# Phase 7-3 / Step 4：Dataset 自动路由（down 反馈 → 3 个 dataset 之一）

## 上下文

Phase 7-3 第四步。当用户点 👎 时，**后端不仅写 LangSmith feedback，还把该 trace 自动加入对应 dataset 的 example**——按 trace tags 路由：

- 含 `rag:miss` → `plan2code-rag-cases-v1`
- 含 `tool_*` tag 且 tool 名是已知工具 → `plan2code-tool-cases-v1`
- 其他 down → `plan2code-bad-cases-v1`

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §8 决策 #4（直推 LangSmith Dataset，不双写 SQLite）
- `@docs/monitor/1.PRD.md` §5.3.3（Dataset 自动写入）
- `@packages/backend/src/agent/feedback.service.ts`（Step 3 产物，本步要扩展）
- `@.env.example`（已有 3 个 `LANGSMITH_DATASET_*` 变量名）

前置条件：

- Phase 7-3 / Step 3 完成（feedback 接口可用）
- LangSmith API key 有 dataset 写权限

## 任务

### 任务 1：确认 `.env` 中数据集变量名

打开 `@.env`，确保：

```dotenv
LANGSMITH_DATASET_BAD_CASES=plan2code-bad-cases-v1
LANGSMITH_DATASET_RAG_CASES=plan2code-rag-cases-v1
LANGSMITH_DATASET_TOOL_CASES=plan2code-tool-cases-v1
```

`.env.example` 已在 Phase 7-3 / Step 1 添加，确认一致。

### 任务 2：扩展 `feedback.service.ts`

修改 `@packages/backend/src/agent/feedback.service.ts`。

#### 改动 2.1：依赖注入 ConfigService（已存在）+ 新增私有方法

在 class 内**新增**两个私有方法：

```typescript
  /** 读 LangSmith Run 的 tags / inputs / outputs / 父 trace_id，路由 dataset 用 */
  private async fetchRun(runId: string): Promise<{
    tags: string[];
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
    trace_id?: string;
  } | null> {
    const apiKey = this.config.get<string>('LANGSMITH_API_KEY');
    const endpoint = this.config.get<string>(
      'LANGCHAIN_ENDPOINT',
      'https://api.smith.langchain.com',
    );
    if (!apiKey) {
      return null;
    }
    try {
      const resp = await fetch(
        `${endpoint.replace(/\/$/, '')}/runs/${runId}`,
        {
          method: 'GET',
          headers: { 'x-api-key': apiKey },
        },
      );
      if (!resp.ok) {
        this.logger.warn(
          `LangSmith GET /runs/${runId} 失败 status=${resp.status}`,
        );
        return null;
      }
      const data = (await resp.json()) as Record<string, unknown>;
      const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
      const inputs =
        typeof data.inputs === 'object' && data.inputs !== null
          ? (data.inputs as Record<string, unknown>)
          : {};
      const outputs =
        typeof data.outputs === 'object' && data.outputs !== null
          ? (data.outputs as Record<string, unknown>)
          : {};
      const traceId =
        typeof data.trace_id === 'string' ? data.trace_id : undefined;
      return { tags, inputs, outputs, trace_id: traceId };
    } catch (e) {
      this.logger.warn(`fetchRun 异常: ${(e as Error).message}`);
      return null;
    }
  }

  /** 按 tags 路由到 dataset 名称（最后 fallback 到 bad_cases） */
  private routeDataset(tags: string[]): string {
    if (tags.includes('rag:miss')) {
      return (
        this.config.get<string>('LANGSMITH_DATASET_RAG_CASES') ||
        'plan2code-rag-cases-v1'
      );
    }
    if (tags.some((t) => t.startsWith('tool:') || t.startsWith('tool_'))) {
      return (
        this.config.get<string>('LANGSMITH_DATASET_TOOL_CASES') ||
        'plan2code-tool-cases-v1'
      );
    }
    return (
      this.config.get<string>('LANGSMITH_DATASET_BAD_CASES') ||
      'plan2code-bad-cases-v1'
    );
  }

  /** dataset 不存在时自动创建并返回 id；存在时返回已有 id */
  private async ensureDataset(name: string): Promise<string | null> {
    const apiKey = this.config.get<string>('LANGSMITH_API_KEY');
    const endpoint = this.config.get<string>(
      'LANGCHAIN_ENDPOINT',
      'https://api.smith.langchain.com',
    );
    if (!apiKey) {
      return null;
    }
    try {
      // 1. 先查询是否已存在
      const listResp = await fetch(
        `${endpoint.replace(/\/$/, '')}/datasets?name=${encodeURIComponent(name)}`,
        { method: 'GET', headers: { 'x-api-key': apiKey } },
      );
      if (listResp.ok) {
        const list = (await listResp.json()) as Array<{ id?: string }>;
        if (Array.isArray(list) && list[0]?.id) {
          return list[0].id;
        }
      }
      // 2. 不存在则创建
      const createResp = await fetch(
        `${endpoint.replace(/\/$/, '')}/datasets`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            name,
            description: 'plan2code 自动收集的 bad case（用户 👎 反馈）',
          }),
        },
      );
      if (!createResp.ok) {
        this.logger.warn(
          `LangSmith 创建 dataset=${name} 失败 status=${createResp.status}`,
        );
        return null;
      }
      const created = (await createResp.json()) as { id?: string };
      return created.id ?? null;
    } catch (e) {
      this.logger.warn(`ensureDataset 异常: ${(e as Error).message}`);
      return null;
    }
  }

  /** 把 run 转成 dataset example 并 POST 进去 */
  private async addRunToDataset(
    datasetId: string,
    runDetail: NonNullable<Awaited<ReturnType<typeof this.fetchRun>>>,
    feedbackComment: string | undefined,
  ): Promise<void> {
    const apiKey = this.config.get<string>('LANGSMITH_API_KEY');
    const endpoint = this.config.get<string>(
      'LANGCHAIN_ENDPOINT',
      'https://api.smith.langchain.com',
    );
    if (!apiKey) {
      return;
    }
    // example.inputs：原始 input；example.outputs：原始 output；元数据放 tag/comment 备查
    const example = {
      inputs: runDetail.inputs,
      outputs: runDetail.outputs,
      metadata: {
        source: 'user_thumb_down',
        tags: runDetail.tags,
        feedback_comment: feedbackComment ?? '',
      },
    };
    try {
      const resp = await fetch(
        `${endpoint.replace(/\/$/, '')}/datasets/${datasetId}/examples`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify(example),
        },
      );
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        this.logger.warn(
          `LangSmith POST dataset example 失败 status=${resp.status} body=${text}`,
        );
      }
    } catch (e) {
      this.logger.warn(`addRunToDataset 异常: ${(e as Error).message}`);
    }
  }
```

#### 改动 2.2：在 `submit()` 末尾调用上述方法（仅 down 时触发）

找到 `submit()` 函数末尾（成功写入 feedback + tag 之后、return 之前），**追加**：

```typescript
    // 监控体系 Phase 7-3 Step 4：down 反馈 → 自动路由到 dataset
    if (dto.feedback === 'down') {
      const runDetail = await this.fetchRun(dto.langsmith_run_id);
      if (runDetail) {
        const datasetName = this.routeDataset(runDetail.tags);
        const datasetId = await this.ensureDataset(datasetName);
        if (datasetId) {
          await this.addRunToDataset(datasetId, runDetail, dto.comment);
          this.logger.log(
            JSON.stringify({
              trace_id: TraceContext.getTraceId(),
              user_id: user.id,
              module: 'feedback',
              level: 'info',
              msg: 'bad case 已加入 dataset',
              extra: {
                run_id: dto.langsmith_run_id,
                dataset: datasetName,
              },
            }),
          );
        }
      }
    }
```

> 全部追加是"软失败"的：dataset 写不进去不影响主流程返回 200，仅记日志。

### 任务 3：（可选）让 `runner.py` 跑真实 bad case dataset

修改 `@packages/agent/src/eval/runner.py`，在 `cli()` 函数中**追加** dataset 短别名：

```python
def cli() -> None:
    parser = argparse.ArgumentParser(description='plan2code eval runner')
    parser.add_argument(
        '--dataset',
        required=True,
        help='LangSmith dataset 名（可用别名 bad/rag/tool）',
    )
    parser.add_argument('--limit', type=int, default=None)
    parser.add_argument('--baseline', type=str, default=None)
    args = parser.parse_args()

    alias_map = {
        'bad': os.environ.get('LANGSMITH_DATASET_BAD_CASES', 'plan2code-bad-cases-v1'),
        'rag': os.environ.get('LANGSMITH_DATASET_RAG_CASES', 'plan2code-rag-cases-v1'),
        'tool': os.environ.get('LANGSMITH_DATASET_TOOL_CASES', 'plan2code-tool-cases-v1'),
    }
    dataset_name = alias_map.get(args.dataset, args.dataset)

    if args.baseline:
        print('NOTE: --baseline 将在 Step 5 实现；本次忽略', file=sys.stderr)
    run_eval(dataset_name, args.limit)
```

> 这样可以 `pnpm eval:run -- --dataset bad` 直接跑全部 bad case，无需记完整名字。

## 验证

### 验证步骤 1：编译

```bash
cd packages/backend && pnpm build
```

### 验证步骤 2：触发一次 down 反馈

启动三端。前端发一条预期 RAG miss 的消息（如 `什么是霍金辐射？`）。

等 AI 回复完，**点 👎**。

后端日志应能看到顺序：

```
[FeedbackService] {"trace_id":"...","msg":"反馈提交","extra":{"feedback":"down",...}}
[FeedbackService] {"trace_id":"...","msg":"bad case 已加入 dataset","extra":{"dataset":"plan2code-rag-cases-v1"}}
```

### 验证步骤 3：LangSmith Datasets 页面确认

打开 https://smith.langchain.com → 左侧 **Datasets** → 应能看到（取决于触发场景）：

- `plan2code-rag-cases-v1`（如触发的是 rag:miss case）
- `plan2code-bad-cases-v1`（其他 down case）
- `plan2code-tool-cases-v1`（工具 case，需要前期有 `tool:*` tag，本项目尚未广泛打这些 tag，可能为空）

点进 dataset → 应能看到刚才那条 example，含 `metadata.source = "user_thumb_down"`。

### 验证步骤 4：用真实 dataset 跑 eval（联动 Step 1）

```bash
pnpm eval:run -- --dataset bad --limit 5
```

期望能跑通（如果 bad_cases dataset 里还没数据，会报 "no examples to evaluate" 或类似——这表示路由正确但 dataset 是空的，先点几次 👎 攒数据）。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| 后端日志只有"反馈提交"，没有"bad case 已加入 dataset" | 反馈是 up/note 不会走 dataset 路由 | 这是预期；只有 down 会路由 |
| LangSmith /runs/{id} GET 返回 404 | run_id 不属于当前 workspace，或权限 | 确认前端拿到的 langsmith_run_id 来自同一个 LangSmith project |
| 创建 dataset 失败 status=403 | API key 是 read-only | LangSmith → Settings → API Keys 重新生成一个 Member-level key |
| Dataset 创建成功但 example 没写进去 | example schema 不匹配 | 看后端日志 warn 行的具体错误；可能 `inputs` 含不可序列化对象 |
| 同一条 run 重复点 👎 → dataset 内重复 example | 故意允许（多次反馈 = 用户强烈不满） | 如需去重，可改 `routeDataset` 前查 `GET /datasets/{id}/examples?run_id=xxx`，本 step 不实现 |

## 完成后

### 更新 PROGRESS.md

```
| 7-3-4 | Dataset 自动路由 | ✅ | <今天日期> | feedback.service.ts 加 fetchRun/routeDataset/ensureDataset/addRunToDataset；按 tags 路由 3 个 dataset；down 反馈自动入库 |
```

### git commit

```bash
git add packages/backend/src/agent/feedback.service.ts \
        packages/agent/src/eval/runner.py \
        docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(monitor): phase-7-3 step-4 bad case 自动路由到 LangSmith Dataset

- feedback.service.ts 新增 4 个私有方法:
  * fetchRun(runId) → 拿 tags/inputs/outputs
  * routeDataset(tags) → rag:miss → rag-cases / tool:* → tool-cases / else bad-cases
  * ensureDataset(name) → 查询或自动创建
  * addRunToDataset(id, run, comment) → POST example 含 metadata.source=user_thumb_down
- submit() 末尾仅 down 反馈触发路由；软失败不阻塞主流程
- runner.py CLI 加 dataset 别名 bad/rag/tool
- DoD: 点 👎 后 LangSmith Datasets 页面能看到自动产生的 example

ref: docs/monitor/PROGRESS.md 7-3-4
EOF
)"
```
