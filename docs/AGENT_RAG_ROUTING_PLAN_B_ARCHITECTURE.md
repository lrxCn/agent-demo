# Phase 8 — Agent RAG 路由方案 B 架构说明

> 本文是 **Phase 8（Agent RAG 路由强约束）** 的架构接力文档，专为「下一个 Cursor 窗口」准备。
> 阅读顺序建议：
>
> 1. `@docs/AGENT_RAG_ROUTING_PLAN_B_REQUIREMENTS.md`（元需求 + 验收）
> 2. `@docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md`（进度接力棒，看做到第几步）
> 3. **本文档**（系统侧改造后的图、状态、开关、回滚）
> 4. 现有项目文档（按需）：`@docs/ARCHITECTURE_FOR_AI.md`、`@docs/ARCHITECTURE.md`、`@docs/API_CONTRACTS.md`
> 5. 当前 step 的 prompt：`@prompts/phase-8/step-N-*.md`

---

## 目录
- 1. 背景速读
- 2. 改造范围（一张表说清楚）
- 3. 图结构（改造前 vs 改造后）
- 4. 新增状态字段
- 5. 新增 / 修改文件清单
- 6. 关键节点行为契约
- 7. 兼容性与回滚开关
- 8. 可观测性（LangSmith）
- 9. 不在本期范围（避免越界）

---

## 1. 背景速读

当前 `chat_node` 完全依赖 LLM 自主决定是否调用 `search_knowledge_base`，在「查询某人信息」场景偶尔会被 `navigate_to_page` 截胡，出现「可查但未查」。

方案 B 的核心思路：**在 `memory_search` 与 `chat` 之间插入「意图路由层」+「强制检索节点」，把「该走 RAG」从 prompt 建议升级为图层硬约束**。

不引入新数据库、不重写已有节点，只通过 **NotRequired state 字段 + 环境变量开关** 接入，可瞬间回滚。

---

## 2. 改造范围（一张表说清楚）

| 维度 | 现状 | 改造后 |
|---|---|---|
| RAG 触发方式 | LLM 自主决策（prompt 建议） | 命中信息查询意图 → 图层强制执行 |
| 新增节点 | — | `intent_router`（路由函数）+ `kb_query_node`（强制检索） |
| 新增 state 字段 | — | `intent_route` / `forced_kb_results`（均 NotRequired） |
| 主循环（`tools → after_tools → fallback`） | 不变 | **不变** |
| `search_knowledge_base` 工具 | 仍保留 | 仍保留（兼容 LLM 二次主动调用） |
| 回滚方式 | — | `AGENT_RAG_ROUTER_ENABLED=false` 走旧路径 |
| 数据库 / API 契约 | — | **零变更** |

---

## 3. 图结构（改造前 vs 改造后）

### 3.1 改造前（当前 main 分支）

```
START
  │
  ▼
memory_search ──► chat ──► memory_save ──► should_continue
                                                 │
                              ┌──────────────────┴──────────────┐
                              ▼ tools                            ▼ END
                     tool_node_with_retry
                              │
                              ▼ after_tools
                  ┌─────────  ──────────┐
                  ▼ fallback           ▼ memory_search（再轮）
                 END                    （回 chat）
```

### 3.2 改造后（Phase 8 启用 `AGENT_RAG_ROUTER_ENABLED=true`）

```
START
  │
  ▼
memory_search ──► intent_router ──┬─► kb_query_node ──► chat ──► memory_save ──► should_continue ─...
                                  │                                                   │
                                  └─► chat ────────────► memory_save ─► should_continue ─...
                                                                                      │
                                                                       (tools / after_tools / fallback 链路保持不变)
```

关键点：
- `intent_router` 是 **路由函数**（返回字符串），不写 state；
- `kb_query_node` 是 **新增图节点**，只做一件事：跑一次 `search_knowledge`，把结果写到 `state.forced_kb_results`；
- `chat_node` 入口读取 `forced_kb_results`，若非空 → 拼成 SystemMessage 注入；
- `tools / after_tools / fallback / memory_save / should_continue` 全部 **零改动**；
- `AGENT_RAG_ROUTER_ENABLED=false`（默认或关闭）时退化为 3.1 旧图，保证回滚。

---

## 4. 新增状态字段

`@packages/agent/src/graph/state.py`：

```python
class AgentState(TypedDict):
    # ... 现有字段保持不变 ...

    # === Phase 8 新增（均为 NotRequired，向下兼容） ===

    # 意图路由结果：'kb_query' | 'chat_direct' | 'unknown'
    # 由 intent_router 写入；chat_node 读取用于打 metadata
    intent_route: NotRequired[str]

    # 强制检索结果：kb_query_node 写入；chat_node 读取拼 SystemMessage
    # 元素为 {'text': str, 'score': float}（与 retriever.search_knowledge 输出一致）
    forced_kb_results: NotRequired[list[dict]]
```

> 严禁把这两个字段做成 Required。Required 会破坏现有 invoke 调用与 CLI 模式向下兼容。

---

## 5. 新增 / 修改文件清单

### 新增

| 文件 | 用途 |
|---|---|
| `packages/agent/src/graph/intent_router.py` | 意图路由（规则法）+ 关键词常量 |
| `packages/agent/src/graph/kb_query_node.py` | 强制 RAG 检索节点（带超时护栏） |
| `packages/agent/tests/graph/test_intent_router.py` | 路由规则单元测试 |
| `packages/agent/tests/graph/test_kb_query_node.py` | 强制检索节点单元测试（mock retriever） |

### 修改

| 文件 | 改动点 |
|---|---|
| `packages/agent/src/graph/state.py` | 增 `intent_route` / `forced_kb_results` 字段 |
| `packages/agent/src/graph/builder.py` | 接入 `intent_router` 条件边、`kb_query_node` 节点；按开关切换 |
| `packages/agent/src/graph/nodes.py` | `chat_node` 入口读取 `forced_kb_results` 注入 SystemMessage；记录 `route:*` tag |
| `packages/agent/src/config/settings.py` | 读 `AGENT_RAG_ROUTER_ENABLED` 开关 |
| `.env` / `.env.example` | 增加 `AGENT_RAG_ROUTER_ENABLED=true` 默认值 |

### 不动

- `packages/backend/**`（API 契约不变）
- `packages/frontend/**`（前端无感知）
- `tools/builtin/rag_tool.py`（仍保留，供 LLM 二次主动检索）
- `memory_nodes.py` / `tool_node_with_retry` / `after_tools` / `fallback_node`

---

## 6. 关键节点行为契约

### 6.1 `intent_router(state)`（路由函数，不是节点）

- **输入**：`state.messages` 中最近一条 `HumanMessage` 文本
- **输出**：字符串
  - `'kb_query'` → 走强制检索分支
  - `'chat_direct'` → 直接进 chat
- **判定规则（v1，规则法）**：
  - 命中 **信息查询关键词**（如「信息 / 资料 / 详情 / 介绍 / 是谁 / 记录 / 档案 / 简介 / 履历」）→ `kb_query`
  - 命中 **明确导航关键词**（如「打开 / 跳转 / 去到 / 进入」+ 「页面 / 管理页 / 列表」）→ `chat_direct`
  - 同时命中 → `kb_query` 优先（先检索，再让 LLM 决定是否导航）
  - 都不命中 → `chat_direct`（保持当前行为，模型自由决策）
- **副作用**：可选地调用 `_add_tags_to_trace_root([f'route:intent={result}'])`（实际打 tag 推荐放在 `chat_node`，避免重复 trace 调用）

### 6.2 `kb_query_node(state)`（图节点）

- **职责**：对 `state.messages[-1]`（最近一条 HumanMessage）执行一次 `retriever.search_knowledge`，结果写入 `state.forced_kb_results`
- **权限注入**：直接读 `state.user_role_ids`（与 `tool_node_with_retry` 中 `search_knowledge_base` 的角色注入逻辑一致）
- **失败 / 空结果**：**不中断流程**
  - retriever 抛异常 → log + 写 `forced_kb_results=[]`
  - 检索为空 → 写 `forced_kb_results=[]`
- **超时护栏**：复用 `@node_timeout_guard`（默认 10s，超时 → fallback 写空数组，主流程继续）
- **副作用**：在 trace 上打 `route:kb_forced=true`、`rag:hit|miss`（与现有 `chat_node` rag tag 逻辑共存，**不重复打**）

### 6.3 `chat_node(state)`（增量改动）

在 **memory 注入前** 插入：

```python
forced = state.get('forced_kb_results') or []
if forced:
    kb_text = '\n\n'.join([
        f'- [score={item.get("score", 0):.2f}] {item.get("text", "")}'
        for item in forced
    ])
    messages = [
        SystemMessage(content=(
            '以下是与用户问题相关的知识库检索结果，请优先基于此回答：\n'
            f'{kb_text}\n\n'
            '若检索结果与问题不匹配，可礼貌说明并询问用户是否需要其他帮助；'
            '不要在没有得到用户明确指令前主动调用 navigate_to_page。'
        )),
        *messages,
    ]
```

LangSmith 打 tag（在原 `add_metadata` 块同位）：
```python
intent = state.get('intent_route', 'unknown')
forced = state.get('forced_kb_results')
kb_forced = isinstance(forced, list)
_add_tags_to_trace_root([
    f'route:intent={intent}',
    f'route:kb_forced={"true" if kb_forced else "false"}',
])
```

### 6.4 `builder.py`（图接线）

```python
ROUTER_ENABLED = os.environ.get('AGENT_RAG_ROUTER_ENABLED', 'true').lower() in ('1', 'true', 'yes', 'on')

builder.add_node('memory_search', memory_search_node)
builder.add_node('chat', chat_node)
builder.add_node('memory_save', memory_save_node)
builder.add_node('tools', tool_node_with_retry)
builder.add_node('fallback', fallback_node)

if ROUTER_ENABLED:
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
    # 旧图：保持向下兼容（即原 START → memory_search → chat）
    builder.add_edge(START, 'memory_search')
    builder.add_edge('memory_search', 'chat')

builder.add_edge('chat', 'memory_save')
builder.add_conditional_edges('memory_save', should_continue, {'tools': 'tools', END: END})
builder.add_conditional_edges('tools', after_tools, {'fallback': 'fallback', 'memory_search': 'memory_search'})
builder.add_edge('fallback', END)
```

> 注意：`tools → after_tools → memory_search` 的回边在改造后会经过新的 `intent_router`，**这是设计预期**——多轮工具调用后第二次进入 chat 时也享受路由判定。

---

## 7. 兼容性与回滚开关

| 场景 | 行为 |
|---|---|
| 默认 `AGENT_RAG_ROUTER_ENABLED=true` | 启用方案 B 新图 |
| `AGENT_RAG_ROUTER_ENABLED=false` | 退化为旧图（START → memory_search → chat） |
| 旧 invoke 调用未带 `intent_route` / `forced_kb_results` | NotRequired 字段，状态机自然为空 |
| backend 旧 `app_trace_id` / `allowed_builtin_tools` 字段 | **完全不受影响** |
| LangGraph CLI（`langgraph dev`）/ 本地 CLI（`pnpm dev:agentLocal`）| 都按开关同等生效 |

回滚命令（生产事故场景）：
```bash
# 1. 关开关，重启 Agent
echo 'AGENT_RAG_ROUTER_ENABLED=false' >> .env
# 2. 重启
uv run langgraph dev --port 8123
# 3. 验证 trace 中不再出现 'route:intent=*'
```

---

## 8. 可观测性（LangSmith）

新增 trace **根 run**（`name=agent`）层面 tag：

| Tag | 含义 |
|---|---|
| `route:intent=kb_query` | 本轮被路由到强制检索分支 |
| `route:intent=chat_direct` | 本轮直接进 chat |
| `route:intent=unknown` | （兜底，state 缺字段时） |
| `route:kb_forced=true` | 本轮真的执行了 `kb_query_node` |
| `route:kb_forced=false` | 本轮未执行 `kb_query_node` |
| `rag:hit` / `rag:miss` | 沿用 Phase 7-2-2 的逻辑（**不重复打**） |

LangSmith Filter 速查：
```
tags has "route:intent=kb_query" AND tags has "rag:miss"
→ 路由判定 OK 但召回为空，候选关键字需扩充或知识库需补料
```

> 本期 **不新增** LangSmith Dashboard 卡片；用现有 `plan2code-cost-overview` 看板的 Filter 即可观察。

---

## 9. 不在本期范围（避免越界）

| 不要做 | 原因 |
|---|---|
| 训练意图分类小模型 / 接 BERT | v1 规则法即可命中 KPI；模型方案放 v2 |
| 改 `search_knowledge_base` 工具 schema 把 `role_ids` 移除 | 工具仍保留对外调用能力，只是图层多了一条强制路径 |
| 重构 `tool_node_with_retry` / `after_tools` | 主循环稳定，禁止动 |
| 引入新的 LangSmith Dashboard 卡片 | Phase 7-2 已建，新 Filter 即可 |
| 修改前端 / 后端 API | 本期是纯 Agent 图层改造，前后端零感知 |
| 引入新依赖（如 `jieba` / `pkuseg`） | v1 规则法用 Python 标准 `in` 字符串匹配即可，不引入分词依赖 |

---

## 10. 三组验收用例（与需求 §6.1 一致）

| 用例 | 期望 trace tag |
|---|---|
| 「给我陈可新的信息」 | `route:intent=kb_query` + `route:kb_forced=true` + `rag:hit\|miss` |
| 「打开学生管理页面」 | `route:intent=chat_direct` + `route:kb_forced=false`，且模型实际调用 `navigate_to_page` |
| 「陈可新是谁？并帮我打开学生页」 | `route:intent=kb_query` + `route:kb_forced=true`（先检索），后续 chat 才调 `navigate_to_page` |

通过标准：每条用例 LangSmith trace 中 tag 序列与「期望」一致。

---

## 附：与 Phase 7（监控体系）的关系

- 复用 Phase 7-1 的 `app_trace_id` / `add_metadata` 机制
- 复用 Phase 7-2 的 `_add_tags_to_trace_root()` / `rag:hit\|miss` 逻辑
- 不修改 Phase 7-3（eval）/ 7-4（guardrails）/ 7-5（cost playbook）任何代码
- 命中 `prompt_injection` / `pii_filtered` 等 Guardrails 规则仍按现有逻辑工作（与本期正交）
