# Phase 7-1 / Step 4：Agent 主动打 metadata + SSE run_id 回流（P8 + SSE 改造）

## 上下文

监控体系 Phase 7-1 的第四步。**Agent 在 `chat_node` 入口通过 `RunTree.add_metadata` 把 `app_trace_id` 打到 LangSmith trace**；同时**后端把 LangGraph metadata 流里的 `run_id` 抽出来，作为新 SSE 事件 `{type:'trace'}` 推送给前端**。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §8 决策 #10（W3C）
- `@docs/monitor/1.PRD.md` §4.4（SSE run_id 取出方案）+ §5.2.3 + §5.2.4
- `@docs/monitor/3.ARCHITECTURE.md` §2 P8 + §5.1（数据流 1 步骤 8–13）
- `@docs/monitor/PROGRESS.md`
- `@packages/agent/src/graph/state.py`（要新增字段）
- `@packages/agent/src/graph/nodes.py` `chat_node` 函数
- `@packages/backend/src/agent/agent.service.ts`（要加 `metadata` stream_mode + extractFromMetadata）

前置条件：

- Step 2 已完成（前端 useChat 已经预留 `{type:'trace'}` 分支）
- Step 3 已完成（后端有 `TraceContext.getTraceId()` 可用）

## 任务

### 任务 1：扩展 `AgentState` 加 `app_trace_id` 字段

修改 `@packages/agent/src/graph/state.py`。**完整替换**：

```python
"""LangGraph Agent 状态定义"""
from typing import Annotated, NotRequired, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """Agent 状态"""

    messages: Annotated[list[BaseMessage], add_messages]
    mem0_user_id: str
    thread_id: str
    available_frontend_tools: list[str]
    user_role_ids: NotRequired[list[str]]
    # 由 memory_search_node 写入；invoke 时可不传
    retrieved_memories: NotRequired[list[str]]
    # 监控体系：来自前端 W3C traceparent 的 32 hex；用于在 LangSmith trace 上打 metadata
    app_trace_id: NotRequired[str]
```

### 任务 2：`chat_node` 入口主动打 LangSmith metadata

修改 `@packages/agent/src/graph/nodes.py`。

#### 改动 2.1：import 区追加

在文件顶部 `from langchain_openai import ChatOpenAI` 之后，**追加**：

```python
try:
    # LangSmith SDK 提供 run tree 访问能力；自托管 / 无 LangSmith 时返回 None
    from langsmith.run_helpers import get_current_run_tree
except ImportError:  # pragma: no cover
    get_current_run_tree = None  # type: ignore[assignment]
```

#### 改动 2.2：`chat_node` 函数入口添加打 metadata 调用

找到 `def chat_node(state: AgentState) -> dict[str, list[BaseMessage]]:` 函数。在函数体**第一行**之前（紧贴函数签名）插入：

```python
def chat_node(state: AgentState) -> dict[str, list[BaseMessage]]:
    """聊天节点（使用 memory_search_node 写入的 retrieved_memories 注入系统提示）"""
    # 监控体系：把业务维度打到 LangSmith trace metadata
    if get_current_run_tree is not None:
        try:
            run = get_current_run_tree()
            if run is not None:
                run.add_metadata(
                    {
                        'app_trace_id': state.get('app_trace_id', ''),
                        'mem0_user_id': state.get('mem0_user_id', ''),
                        'thread_id': state.get('thread_id', ''),
                        'role_ids': state.get('user_role_ids', []) or [],
                    },
                )
        except Exception:  # noqa: BLE001
            # 监控埋点失败不影响主流程
            pass

    # 内置工具始终加载
    builtin_tools = registry.get_tools(categories=['builtin'])
    # ... 后续保持不变 ...
```

> **重要**：原有逻辑（builtin_tools 加载、tools 拼装、llm.invoke、return）**不动**，只是在函数开头加上面这段 try。

### 任务 3：后端注入 `app_trace_id` + 加 `metadata` stream_mode + 新 SSE payload + extract

修改 `@packages/backend/src/agent/agent.service.ts`。

#### 改动 3.1：扩展 `AgentChatStreamPayload` 联合类型

找到顶部类型定义，**改为**：

```typescript
/** 下发给前端的 SSE 业务负载（与 API_CONTRACTS 对齐，含 trace / error 便于排错） */
export type AgentChatStreamPayload =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; tool: string; params: Record<string, unknown> }
  | { type: 'done'; content: string; thread_id: string }
  | { type: 'error'; message: string }
  | { type: 'trace'; trace_id: string; langsmith_run_id: string };
```

#### 改动 3.2：import `TraceContext`

在文件顶部 import 区追加：

```typescript
import { TraceContext } from '../common/context/trace-context';
```

#### 改动 3.3：`streamChat` 把 `app_trace_id` 写入 `input`

找到 `streamChat` 中的 `const input = { ... };` 块，**改为**：

```typescript
    const input = {
      messages: [{ role: 'user', content: dto.message }],
      mem0_user_id: user.id,
      thread_id: threadId,
      available_frontend_tools: mergedTools,
      user_role_ids: user.roleIds,
      // 监控体系：把 W3C trace_id 传给 Agent 用于 LangSmith metadata
      app_trace_id: TraceContext.getTraceId(),
    };
```

#### 改动 3.4：`stream_mode` 加 `'metadata'`

找到 `streamChat` 中的 `const body = { ... };` 块，**改为**：

```typescript
    const body = {
      assistant_id: 'agent',
      input,
      stream_mode: ['messages-tuple', 'updates', 'metadata'],
    };
```

#### 改动 3.5：在 SSE 流处理循环里增加 `extractFromMetadata` 调用，并提前 yield trace 事件

找到 `streamChat` 中的 `for await (const evt of this.parseSse(stream)) { ... }` 循环。**完整替换**为：

```typescript
    /** 收集 updates 模式下的完整前端工具调用（覆盖策略，保证 params 完整） */
    const wsToolCalls = new Map<
      string,
      { tool: string; params: Record<string, unknown> }
    >();
    let traceEventEmitted = false;
    const appTraceId = TraceContext.getTraceId();
    try {
      for await (const evt of this.parseSse(stream)) {
        // 监控体系：从 LangGraph metadata 事件中提取 run_id，第一时间下发 trace 事件
        if (!traceEventEmitted) {
          const runId = this.extractRunIdFromMetadata(evt);
          if (runId) {
            traceEventEmitted = true;
            yield {
              type: 'trace',
              trace_id: appTraceId,
              langsmith_run_id: runId,
            };
          }
        }
        for (const out of this.mapLangGraphEvent(
          evt,
          available,
          emittedToolKeys,
        )) {
          if (out.type === 'token' && out.content) {
            accumulatedText += out.content;
          }
          yield out;
        }
        // 从原始 SSE 事件中额外提取 updates 模式的完整 tool_calls（不受 emittedToolKeys 限制）
        this.collectUpdatesToolCalls(evt, available, wsToolCalls);
      }
    } finally {
      stream.destroy();
    }
```

#### 改动 3.6：新增 `extractRunIdFromMetadata` 私有方法

在 `AgentService` class 内（建议放在 `collectUpdatesToolCalls` 方法之后）**新增**：

```typescript
  /**
   * 从 LangGraph SSE `metadata` 流模式中提取顶层 run_id（即 LangSmith run_id）。
   * 失败返回 null。
   */
  private extractRunIdFromMetadata(evt: {
    event: string;
    data: string;
  }): string | null {
    const raw = evt.data.trim();
    if (!raw || raw === '[DONE]') {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
    // 多 stream_mode 格式：["metadata", { run_id: "...", ... }]
    let payload: Record<string, unknown> | undefined;
    if (
      Array.isArray(parsed) &&
      parsed.length >= 2 &&
      parsed[0] === 'metadata' &&
      parsed[1] &&
      typeof parsed[1] === 'object'
    ) {
      payload = parsed[1] as Record<string, unknown>;
    } else if (
      evt.event === 'metadata' &&
      parsed &&
      typeof parsed === 'object'
    ) {
      payload = parsed as Record<string, unknown>;
    }
    if (!payload) {
      return null;
    }
    const runId =
      typeof payload.run_id === 'string'
        ? payload.run_id
        : typeof (payload as { id?: unknown }).id === 'string'
          ? ((payload as { id?: unknown }).id as string)
          : '';
    return runId || null;
  }
```

> 解析兼容两种格式：
> - 单 stream_mode：`event: metadata\ndata: { "run_id": "..." }`
> - 多 stream_mode：`data: ["metadata", { "run_id": "..." }]`
> LangGraph 的实际格式以 v0.2+ 为准；上面两种都兜底。

## 验证

### 验证步骤 1：TS / Python 编译通过

```bash
cd packages/backend && pnpm build
cd ../agent && uv run python -c "from src.graph.state import AgentState; print('OK')"
```

期望均无错误。

### 验证步骤 2：三端联调

重启三端：

```bash
# 终端 1
cd packages/agent && uv run langgraph dev --port 8123

# 终端 2
cd packages/backend && pnpm start:dev

# 终端 3
cd packages/frontend && pnpm dev
```

前端发一条消息（`你好`）。

### 验证步骤 3：浏览器 Console

预期顺序输出（**关键**）：

```
[trace] POST /agent/chat trace_id= abc123...
[trace] chat 流开始 trace_id= abc123... assistantId= <uuid>
[trace] SSE 收到 trace 事件 run_id= <LangSmith run UUID>     ← 本步新增产物
```

第三行如果出现，说明 SSE `metadata` 流提取成功。

### 验证步骤 4：后端日志

应能看到 `app_trace_id` 已写入 LangGraph 请求（Network 抓包看 `/runs/stream` 请求 body，或在 `agent.service.ts` 临时加 logger）。

### 验证步骤 5：LangSmith Web 确认 metadata

去 https://smith.langchain.com → Projects → 你的 project → 点最新一条 trace → 详情页找到 **Metadata** 区域，应能看到：

```
app_trace_id: abc123...        ← 与前端 console 的 trace_id 完全一致
mem0_user_id: <用户 UUID>
thread_id: <thread UUID>
role_ids: ["<role UUID>", ...]
```

**这是 DoD-1 的核心验证**：三端 trace_id 一致。

### 验证步骤 6：搜索过滤验证

LangSmith 顶部 Filter 输入：

```
metadata.app_trace_id = "<把上面 abc123 完整粘贴>"
```

应当**精确命中一条** trace。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| Console 看不到 `SSE 收到 trace 事件` | LangGraph 版本不发 `metadata` 流，或解析格式不匹配 | 在 `agent.service.ts` 的 `parseSse` 处加临时 `logger.debug(evt)` 看原始格式，调 `extractRunIdFromMetadata` 解析分支 |
| LangSmith metadata 区域空 | `get_current_run_tree()` 返回 None（说明 LangSmith SDK 未启用 trace） | 重新确认 `.env` 的 `LANGCHAIN_TRACING_V2=true` 并重启 Agent |
| `app_trace_id` 是空字符串 | Backend `TraceContext.getTraceId()` 返回空（说明 Step 3 拦截器未生效） | 回到 Step 3 验证步骤 4，确认 TraceInterceptor 注册顺序 |
| TS 编译报 `Property 'trace' does not exist on type 'AgentChatStreamPayload'` | 改动 3.1 没生效 | 重新检查联合类型的 `\|` 是否完整 |

## 完成后

### 更新 PROGRESS.md

```
| 7-1-4 | Agent metadata 主动打标 + SSE run_id 回流 | ✅ | <今天日期> | state.py 加 app_trace_id；chat_node 调 RunTree.add_metadata；agent.service.ts stream_mode += 'metadata' + extractRunIdFromMetadata + SSE 新增 {type:'trace'} payload；前端 console / LangSmith metadata 三端 trace_id 一致 |
```

### git commit

```bash
git add packages/agent/src/graph/state.py \
        packages/agent/src/graph/nodes.py \
        packages/backend/src/agent/agent.service.ts \
        docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(monitor): phase-7-1 step-4 Agent metadata + SSE run_id 回流

- state.py 新增 app_trace_id 字段（NotRequired）
- nodes.py chat_node 入口调 RunTree.add_metadata 打 4 字段
- agent.service.ts:
  * AgentChatStreamPayload 新增 {type:'trace'} 分支
  * input 注入 app_trace_id (来自 TraceContext.getTraceId)
  * stream_mode 增加 'metadata'
  * 新增 extractRunIdFromMetadata 解析方法
  * SSE 流首次见到 run_id 即 yield trace 事件
- DoD: LangSmith metadata.app_trace_id 与前端 trace_id 一致

ref: docs/monitor/PROGRESS.md 7-1-4
EOF
)"
```
