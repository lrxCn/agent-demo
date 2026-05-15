# Phase 8 / Step 1：State 字段 + 环境变量回滚开关

## 上下文

Phase 8 第一步。**仅做基础设施铺垫**，不修改任何节点行为。完成后旧图与新图都能编译通过、`langgraph dev` 可正常启动。

执行前必读：

- `@docs/AGENT_RAG_ROUTING_PLAN_B_REQUIREMENTS.md`（§4 功能需求 / §5 非功能需求）
- `@docs/AGENT_RAG_ROUTING_PLAN_B_ARCHITECTURE.md`（§4 新增状态字段 / §7 兼容性与回滚开关）
- `@docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md`（接力棒）
- `@packages/agent/src/graph/state.py`（必读，要追加字段）
- `@packages/agent/src/config/settings.py`（必读，要追加开关变量）
- `@.env.example`（必读，要追加默认值）

前置条件：

- Phase 7 全部完成（`app_trace_id` / `allowed_builtin_tools` 字段已存在）
- Agent 当前在主分支可正常 `uv run langgraph dev --port 8123`
- 工作区干净（`git status` 无未提交变更，便于事后 diff）

---

## 任务

### 任务 1：在 `state.py` 新增两个 NotRequired 字段

修改 `@packages/agent/src/graph/state.py`：

在 `AgentState` 现有字段末尾追加（**保持其他字段顺序不变**）：

```python
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
    # 监控体系 Phase 7-4 Step 2：后端按角色过滤后的 builtin 工具白名单
    # 缺失时按"全允许"兜底（向后兼容旧 invoke 调用）
    allowed_builtin_tools: NotRequired[list[str]]
    # === Phase 8 新增：RAG 路由方案 B（向下兼容） ===
    # 意图路由结果：'kb_query' | 'chat_direct' | 'unknown'
    # 由 intent_router 路由函数判定（不写 state，仅在 chat_node 中读取打 trace tag 时用）
    # 但保留字段是为了未来扩展时不再迁移；当前 step 暂不写入
    intent_route: NotRequired[str]
    # 强制检索结果：由 kb_query_node 写入
    # 元素结构：{'text': str, 'score': float}（与 retriever.search_knowledge 输出一致）
    forced_kb_results: NotRequired[list[dict]]
```

> ⚠️ **必须**保持 `NotRequired`，否则旧的 invoke 调用（CLI / 旧测试）会报 `TypedDict missing key`。

### 任务 2：在 `settings.py` 增加开关读取

修改 `@packages/agent/src/config/settings.py`，在文件末尾追加：

```python
# === Phase 8 新增：RAG 路由方案 B 开关 ===
# 默认 true（启用方案 B）；置为 false 可瞬间回滚到 START → memory_search → chat 旧图
def _parse_bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ('1', 'true', 'yes', 'on')


AGENT_RAG_ROUTER_ENABLED = _parse_bool_env('AGENT_RAG_ROUTER_ENABLED', default=True)
```

> 复用 settings.py 顶部已 `import os` 与 `load_dotenv`，不需要重复 import。

### 任务 3：`.env.example` 增加示例

修改 `@.env.example`，在 `# LangGraph API` 段下方追加：

```bash
# === Agent RAG 路由方案 B（Phase 8）===
# true = 启用图层强制 RAG 路由（默认）；false = 回滚到旧 chat-only 路由
AGENT_RAG_ROUTER_ENABLED=true
```

如果你的本地 `.env`（已 git ignore）也存在，请同步追加同一行（值可改为 false 用于回滚演练）。

### 任务 4：本地 `.env` 同步（可选）

如果 `.env` 文件已存在（被 git ignore），建议追加：

```bash
AGENT_RAG_ROUTER_ENABLED=true
```

---

## 验证

### 验证步骤 1：Python 编译 + 字段读取

```bash
cd packages/agent
uv run python -c "
from src.graph.state import AgentState
from src.config.settings import AGENT_RAG_ROUTER_ENABLED
print('AGENT_RAG_ROUTER_ENABLED =', AGENT_RAG_ROUTER_ENABLED)

s: AgentState = {
    'messages': [],
    'mem0_user_id': 'u1',
    'thread_id': 't1',
    'available_frontend_tools': [],
}
print('旧 state 兼容 OK，缺字段不报错')

s2: AgentState = {
    **s,
    'intent_route': 'kb_query',
    'forced_kb_results': [{'text': 'foo', 'score': 0.9}],
}
print('新字段写入 OK:', s2['intent_route'], s2['forced_kb_results'])
"
```

期望输出 3 行 `AGENT_RAG_ROUTER_ENABLED = True`、`旧 state 兼容 OK`、`新字段写入 OK: kb_query [{'text': 'foo', 'score': 0.9}]`。

### 验证步骤 2：开关回滚演练

```bash
AGENT_RAG_ROUTER_ENABLED=false uv run python -c "
from src.config.settings import AGENT_RAG_ROUTER_ENABLED
print('回滚模式:', AGENT_RAG_ROUTER_ENABLED)
"
```

期望输出 `回滚模式: False`。

### 验证步骤 3：图编译不破坏（旧图继续工作）

```bash
cd packages/agent
uv run python -c "from src.graph.builder import graph; print('graph compile OK')"
```

期望输出 `graph compile OK`。

### 验证步骤 4：`langgraph dev` 正常启动

```bash
cd packages/agent
uv run langgraph dev --port 8123 &
sleep 5
curl -s http://127.0.0.1:2024/ok || curl -s http://127.0.0.1:8123/ok
# 浏览器访问 LangGraph Studio 看到一个 thread 即 OK
kill %1
```

期望：服务启动无 traceback，且能 `curl /ok` 返回 `OK`。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| `TypedDict missing required key 'intent_route'` | 把字段写成了 Required | 改回 `NotRequired[...]` |
| `AGENT_RAG_ROUTER_ENABLED = False`（默认应为 True）| `.env` 中已有同名变量被读取 | 检查 `.env`，删掉旧行或显式设为 true |
| `langgraph dev` 启动报 ImportError | settings.py 用了未导入的 `os` | 检查 settings.py 顶部已有 `import os` |
| 单测 / CLI 报 `TypedDict` 缺字段 | 你不小心把现有字段也改了 | 与 git diff 比对，只追加新两行 |

---

## 完成后

### 更新 PROGRESS.md

把 `@docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md` 表格中 `8-1` 那行改为：

```
| 8-1 | State 字段 + 环境变量开关 | ✅ | <今天日期> | `@prompts/phase-8/step-1-state-and-flag.md` | state.py 新增 intent_route/forced_kb_results NotRequired；settings.py 读 AGENT_RAG_ROUTER_ENABLED；.env.example 增默认 true |
```

并在文末「变更记录」追加一行。

### git commit

```bash
git add \
  packages/agent/src/graph/state.py \
  packages/agent/src/config/settings.py \
  .env.example \
  docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(agent): phase-8 step-1 新增 RAG 路由 state 字段与开关

- state.py 增加 intent_route / forced_kb_results 两个 NotRequired 字段
- settings.py 读 AGENT_RAG_ROUTER_ENABLED 默认 true
- .env.example 增加默认开关
- 旧 invoke / CLI 不带新字段仍可正常运行（向下兼容）
- DoD: graph compile OK；langgraph dev 启动 OK；回滚开关可生效

ref: docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md 8-1
EOF
)"
```
