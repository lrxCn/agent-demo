# Phase 8 / Step 4：builder 接线 + `chat_node` 消费 `forced_kb_results`

## 上下文

Phase 8 第四步，**真正把图改造接通**。完成后默认走方案 B 新图；`AGENT_RAG_ROUTER_ENABLED=false` 立即回滚旧图。

执行前必读：

- `@docs/AGENT_RAG_ROUTING_PLAN_B_REQUIREMENTS.md`（§4 F3 / F4）
- `@docs/AGENT_RAG_ROUTING_PLAN_B_ARCHITECTURE.md`（§3 图结构 / §6.3 chat_node 增量 / §6.4 builder 接线）
- `@docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md`
- `@packages/agent/src/graph/builder.py`（必读，要修改）
- `@packages/agent/src/graph/nodes.py`（必读，`chat_node` 入口要追加 forced_kb 注入）

前置条件：

- Phase 8 Step 1 ~ Step 3 已 ✅
- `pytest tests/graph/test_intent_router.py tests/graph/test_kb_query_node.py` 全绿
- 知识库至少有一篇文档可命中

---

## 任务

### 任务 1：修改 `packages/agent/src/graph/builder.py`

按需新增 import：

```python
from src.config.settings import AGENT_RAG_ROUTER_ENABLED
from src.graph.intent_router import intent_router
from src.graph.kb_query_node import kb_query_node
```

**完整替换**当前 `builder = StateGraph(...)` 至 `if _is_cli_mode(): ... else: ...` 之间的图构建块：

```python
builder = StateGraph(AgentState)
builder.add_node('memory_search', memory_search_node)
builder.add_node('chat', chat_node)
builder.add_node('memory_save', memory_save_node)
builder.add_node('tools', tool_node_with_retry)
builder.add_node('fallback', fallback_node)

if AGENT_RAG_ROUTER_ENABLED:
    # === Phase 8 方案 B 新图 ===
    builder.add_node('kb_query', kb_query_node)
    builder.add_edge(START, 'memory_search')
    builder.add_conditional_edges(
        'memory_search',
        intent_router,
        {
            'kb_query': 'kb_query',
            'chat_direct': 'chat',
        },
    )
    builder.add_edge('kb_query', 'chat')
else:
    # === 旧图（回滚分支）===
    builder.add_edge(START, 'memory_search')
    builder.add_edge('memory_search', 'chat')

# 后续主循环（两种图共用，零改动）
builder.add_edge('chat', 'memory_save')
builder.add_conditional_edges(
    'memory_save',
    should_continue,
    {
        'tools': 'tools',
        END: END,
    },
)
builder.add_conditional_edges(
    'tools',
    after_tools,
    {
        'fallback': 'fallback',
        'memory_search': 'memory_search',
    },
)
builder.add_edge('fallback', END)
```

> ⚠️ **保持** `_is_cli_mode()` 与 `compile(checkpointer=...)` 那段原样不动，**只替换图结构构建段**。

### 任务 2：修改 `packages/agent/src/graph/nodes.py` 的 `chat_node`

在 `chat_node` 函数内，**找到 memories 注入那段**：

```python
memories = state.get('retrieved_memories') or []

if memories:
    mem_text = '\n'.join([f'- {m}' for m in memories])
    messages = [
        SystemMessage(
            content=(
                f'以下是关于该用户的已知信息：\n{mem_text}\n\n'
                '请参考这些信息回答问题，但不要主动提及这些记忆。'
            ),
        ),
        *messages,
    ]
```

在它**之前**（即 memories 注入之前、tools/llm 之前）插入 forced_kb 注入：

```python
    # === Phase 8：消费 kb_query_node 写入的强制检索结果 ===
    forced_kb = state.get('forced_kb_results') or []
    if forced_kb:
        kb_text = '\n\n'.join(
            [
                f'- [score={item.get("score", 0):.2f}] {item.get("text", "")}'
                for item in forced_kb
            ]
        )
        messages = [
            SystemMessage(
                content=(
                    '以下是与用户问题相关的知识库检索结果，请优先基于此回答：\n'
                    f'{kb_text}\n\n'
                    '若检索结果与问题不匹配，可礼貌说明并询问用户是否需要其他帮助；'
                    '在用户没有明确说"打开/跳转/进入页面"前，不要主动调用 navigate_to_page 工具。'
                ),
            ),
            *messages,
        ]
```

> ✅ **不要**在 chat_node 中再次调用 `_add_tags_to_trace_root([f'route:intent=...'])`——那部分留到 step-5 一起做。本步只做"消费 forced_kb"。

### 任务 3：导出 `kb_query_node` 名字（可选，便于反射）

如果 `packages/agent/src/graph/__init__.py` 中显式 re-export 了节点（一般不用），同步加上 `kb_query_node`。否则跳过此任务。

---

## 验证

### 验证步骤 1：图编译 + 节点列表

```bash
cd packages/agent
uv run python -c "
from src.graph.builder import builder, graph
print('nodes:', sorted(builder.nodes.keys()))
print('compile OK')
"
```

期望（启用方案 B 时）：
```
nodes: ['__start__', 'chat', 'fallback', 'kb_query', 'memory_save', 'memory_search', 'tools']
compile OK
```

### 验证步骤 2：开关回滚演练

```bash
cd packages/agent
AGENT_RAG_ROUTER_ENABLED=false uv run python -c "
from src.graph.builder import builder
print('rollback nodes:', sorted(builder.nodes.keys()))
"
```

期望（注意 **没有** `kb_query`）：
```
rollback nodes: ['__start__', 'chat', 'fallback', 'memory_save', 'memory_search', 'tools']
```

> 由于 `builder.py` 在 import 阶段读取 `AGENT_RAG_ROUTER_ENABLED`，**两次 `python -c` 必须在不同进程**，不要在同一 REPL 中切换。

### 验证步骤 3：端到端 invoke（mock 一条信息查询）

```bash
cd packages/agent
uv run python -c "
import os
os.environ.setdefault('AGENT_RAG_ROUTER_ENABLED', 'true')
from langchain_core.messages import HumanMessage
from src.graph.builder import graph

state = {
    'messages': [HumanMessage(content='给我陈可新的信息')],
    'mem0_user_id': 'test_user',
    'thread_id': 'test_thread_p8',
    'available_frontend_tools': [],
    'user_role_ids': ['<你的实际 role_id>'],
}
out = graph.invoke(state)
print('==== forced_kb_results ====')
print(out.get('forced_kb_results'))
print('==== last message ====')
print(out['messages'][-1].content[:300])
"
```

期望：
- `forced_kb_results` 字段非 None（即便为 `[]` 也代表节点跑过）
- 最后一条 AI 消息不会胡乱调 `navigate_to_page`，而是基于检索结果回答（或友好说明无结果）

### 验证步骤 4：导航意图分支正确（不走强制检索）

```bash
cd packages/agent
uv run python -c "
import os
os.environ.setdefault('AGENT_RAG_ROUTER_ENABLED', 'true')
from langchain_core.messages import HumanMessage
from src.graph.builder import graph

state = {
    'messages': [HumanMessage(content='打开学生管理页面')],
    'mem0_user_id': 'test_user',
    'thread_id': 'test_thread_p8_nav',
    'available_frontend_tools': ['navigate_to_page'],
    'user_role_ids': ['<你的实际 role_id>'],
}
out = graph.invoke(state)
print('forced_kb_results:', out.get('forced_kb_results'))
print('last message:', out['messages'][-1].content[:200])
"
```

期望：`forced_kb_results` 为 None 或缺失（说明 `kb_query_node` **未被执行**），最后一条消息含工具调用或导航文案。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| `KeyError: 'kb_query'` 在条件边映射里 | `builder.add_node('kb_query', ...)` 漏写 / 拼错 | 检查 add_node 与映射 dict 的 key 一致 |
| 旧 invoke 报 `Required key 'forced_kb_results' missing` | step-1 把字段写成 Required 了 | 改回 `NotRequired[...]` |
| 走方案 B 但 forced_kb_results 永远是 None | `intent_router` 全部判为 `chat_direct` | 用 step-2 验证步骤 3 单独跑 router；或检查关键词词表 |
| chat 回答仍调 navigate | system prompt 优先级不够 | 确认你把 forced_kb 的 SystemMessage 插在 **memories 之前 / messages 最前面** |
| 启用方案 B 后 langgraph dev 报"图含环" | 接错条件边方向 | 严格按 ARCHITECTURE §6.4 / 本任务 1 的代码块复制 |

---

## 完成后

### 更新 PROGRESS.md

把 `8-4` 那行改为 ✅，变更记录追加。

### git commit

```bash
git add \
  packages/agent/src/graph/builder.py \
  packages/agent/src/graph/nodes.py \
  docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(agent): phase-8 step-4 builder 接入意图路由 + chat_node 消费 forced_kb

- builder.py 按 AGENT_RAG_ROUTER_ENABLED 切换新旧图：
  * true → START → memory_search →(intent_router)→ kb_query/chat → ...
  * false → START → memory_search → chat → ...（旧图回滚分支）
- nodes.py: chat_node 入口在 memories 注入前消费 state.forced_kb_results
- forced_kb 系统提示明确禁止"未明确指令前调 navigate_to_page"
- 主循环（chat→memory_save→tools→after_tools→fallback）零改动
- DoD: 两种开关下 graph 均编译 OK；invoke 信息查询用例可拿到 forced_kb_results

ref: docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md 8-4
EOF
)"
```
