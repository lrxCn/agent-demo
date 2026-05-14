# Phase 7-2 / Step 2：业务指标 tag 注入（`rag:hit` / `rag:miss`）

## 上下文

Phase 7-2 第二步。在 `chat_node` 内根据上一轮 `search_knowledge_base` 工具的返回内容，**给 LangSmith trace 打 `rag:hit` 或 `rag:miss` tag**，让看板能按 tag 筛选并计算 RAG 命中率。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §2 目标 1 验收（业务指标埋点）
- `@docs/monitor/1.PRD.md` §5.3.2（RAG hit/miss 验收清单）
- `@docs/monitor/3.ARCHITECTURE.md` §2 P8（业务 metadata + tag）
- `@docs/monitor/PROGRESS.md`
- `@packages/agent/src/graph/nodes.py`（必读，要插入代码）
- `@packages/agent/src/tools/`（确认 `search_knowledge_base` 返回的"无结果"文案）

前置条件：

- Phase 7-1 全部完成
- Phase 7-2 step-1 完成（trace cost 字段已生效）
- `chat_node` 入口已有 `get_current_run_tree().add_metadata({...})` 那段（Phase 7-1 / Step 4 产物）
- Agent 仅保留一个实例运行（避免端口漂移导致你观察到的 trace 来自旧进程）
- 后端 `LANGGRAPH_API_URL` 必须指向当前正在运行的 Agent 地址

## 任务

### 任务 0：先确认 `search_knowledge_base` 的"无结果"文案

打开 `@packages/agent/src/tools/`（或用 ripgrep `rg 'search_knowledge_base' packages/agent/src/tools/`），找到工具实现，**记录两个关键字符串**：

1. 工具名（必须严格匹配，本步默认 `'search_knowledge_base'`）
2. 工具在"无结果"时返回的文案，常见有：
   - `"未找到相关内容"`
   - `"知识库无相关结果"`
   - `"[]"` 或空字符串

**把实际找到的"无结果"文案记下来**，待会作为判定关键字。

> 如果找不到工具实现 / 不确定，**保守做法**：把"内容为空字符串"和"长度 < 10 字符"都判为 miss。

### 任务 0.5：先校准观察口径（避免“有 tag 但看错位置”）

1. 验收主口径统一看 **LangSmith Project → Traces**（根 trace，通常 `name=agent`）。
2. `Runs` 视图主要用于排障，它会显示大量子节点（`chat`、`tools`、`memory_*`），不要拿它当最终验收口径。
3. 本步骤只在**确实触发 `search_knowledge_base` 工具调用**时才会产生 `rag:*` tag。
4. 若本轮仅触发记忆链路（`memory_search/chat/memory_save`）而未触发 KB，`rag:*` 不出现是正常行为，不是 bug。

### 任务 1：在 `chat_node` 入口追加 hit/miss tag 逻辑

修改 `@packages/agent/src/graph/nodes.py`。

#### 改动 1.1：新增辅助函数（顶层，紧挨着 `_collect_trailing_tool_messages` 之后）

```python
# 监控体系 Phase 7-2：search_knowledge_base 工具"无结果"文案关键字
# 任务 0 中查到的实际文案请追加到这个元组里
_KB_MISS_MARKERS: tuple[str, ...] = (
    '未找到相关内容',
    '知识库无相关结果',
    '无相关',
    '没有相关',
)


def _kb_search_hit_or_miss(state: AgentState) -> str | None:
    """
    扫描 state.messages 尾部连续 ToolMessage，找最近一条 search_knowledge_base 工具结果：
      - 内容空 / 命中 miss 关键字 → 'miss'
      - 否则 → 'hit'
    若本轮无该工具调用，返回 None（不打 tag）。
    """
    for msg in reversed(state['messages']):
        if not isinstance(msg, ToolMessage):
            # 遇到非 ToolMessage 即停止（只看最尾部连续 ToolMessage 段）
            break
        if getattr(msg, 'name', '') != 'search_knowledge_base':
            continue
        content = msg.content if isinstance(msg.content, str) else str(msg.content)
        stripped = content.strip()
        if not stripped:
            return 'miss'
        if len(stripped) < 10:
            return 'miss'
        for marker in _KB_MISS_MARKERS:
            if marker in stripped:
                return 'miss'
        return 'hit'
    return None
```

> `ToolMessage.name` 字段在 LangChain ≥ 0.2 默认填充；如果你那边版本较老导致 `name=''`，可改用 `tool_call_id` → 在 `state.messages` 里反查对应 `AIMessage.tool_calls` 的 `name`。本 prompt 默认 `name` 可用。

#### 改动 1.1-b：补充分数阈值判定（必做）

仅靠“文本非空”会把低质量召回误判为 `hit`。请在判定函数里补充：

- 从工具返回文本提取 `相关度:0.xx`（或 `score:0.xx`）分数
- 若提取到分数且 `max_score < 0.2`，判为 `miss`
- 若命中“未找到相关知识”等 miss 文案，同样判为 `miss`

这样类似“查无此人但返回若干 `相关度:0.00`”会稳定落到 `rag:miss`。

#### 改动 1.2：在 `chat_node` 入口 `add_metadata` 那段后追加 `add_tags`

找到 Phase 7-1 / Step 4 已添加的代码：

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
            pass
```

在这段 try/except 之后**追加**（注意：tag 要写到 trace 顶级 run）：

```python
def _add_tags_to_trace_root(tags: list[str]) -> None:
    """把 tag 写到 trace 根 run，确保在 Traces 顶级行可见。"""
    if not tags or get_current_run_tree is None:
        return
    run = get_current_run_tree()
    if run is None:
        return
    run.add_tags(tags)  # 当前 span 也保留，便于排障

    trace_id = getattr(run, 'trace_id', None)
    client = getattr(run, 'ls_client', None)
    if trace_id is None or client is None:
        return
    root_run = client.read_run(trace_id)
    existing_tags = list(getattr(root_run, 'tags', []) or [])
    merged_tags = list(dict.fromkeys(existing_tags + tags))
    client.update_run(trace_id, tags=merged_tags)


    # 监控体系 Phase 7-2：根据 search_knowledge_base 工具结果打 rag tag
    if get_current_run_tree is not None:
        try:
            rag_result = _kb_search_hit_or_miss(state)
            if rag_result is not None:
                _add_tags_to_trace_root([f'rag:{rag_result}'])
        except Exception:  # noqa: BLE001
            pass
```

#### 改动 1.3：在 `tool_node_with_retry` 末尾给本节点 span 也打 tag（可选但推荐）

> **可选**：让"工具调用 span"自身也带上 tag，方便在 trace 详情页一眼看到。本任务可省略，但推荐做。

在 `tool_node_with_retry` 函数最后 `return {'messages': results}` 之前插入：

```python
    # 监控体系 Phase 7-2：若本轮工具批次含 search_knowledge_base，给当前 span 也打 tag
    if get_current_run_tree is not None:
        try:
            kb_msg = next(
                (m for m in results if getattr(m, 'name', '') == 'search_knowledge_base'),
                None,
            )
            if kb_msg is not None:
                content = (
                    kb_msg.content
                    if isinstance(kb_msg.content, str)
                    else str(kb_msg.content)
                )
                stripped = content.strip()
                hit = (
                    bool(stripped)
                    and len(stripped) >= 10
                    and not any(marker in stripped for marker in _KB_MISS_MARKERS)
                )
                run = get_current_run_tree()
                if run is not None:
                    run.add_tags([f'rag:{"hit" if hit else "miss"}'])
        except Exception:  # noqa: BLE001
            pass
```

> 此处又写一次判定逻辑是有意为之，**不复用上面的函数**——这两个 span 是不同 LangSmith run，tag 不会自动继承到子 span。chat_node 那次 tag 是给 trace 根节点用，tool_node 这次给工具 span 用，看板和 trace 详情页都能看到 tag。

## 验证

### 验证步骤 1：编译检查

```bash
cd packages/agent
uv run python -c "from src.graph.nodes import chat_node, tool_node_with_retry, _kb_search_hit_or_miss; print('OK')"
```

期望输出 `OK`。

### 验证步骤 2：触发 hit 场景

启动三端（参考 Phase 7-1 / Step 5）。前端发一条**确定能命中知识库**的消息，例如：

```
项目里学生管理模块的核心字段有哪些？
```

（前提：知识库中已上传相关文档。如果还没上传，请用 `Knowledge` 页面先 ingest 一篇）

#### 期望

去 LangSmith → 找最新一条 trace：

- **trace 顶部 Tags 区域**应出现：`rag:hit`
- 展开 span 树 → 点 `tool_node_with_retry` 子 span，**该 span 的 Tags** 也应出现：`rag:hit`
- 在 Project 列表里切到 `Traces` 视图，`name=agent` 的根 trace 行 `Tags` 列应能看到 `rag:hit`

### 验证步骤 3：触发 miss 场景

前端发一条**确定不会命中**的消息：

```
什么是黑洞的霍金辐射？
```

LangSmith trace 应出现 `rag:miss` tag。

### 验证步骤 4：未调 KB 工具时不打 tag（含命中记忆场景）

前端发一条**不会触发知识库工具**的消息：

```
你好
```

LangSmith trace **不应出现** `rag:*` tag（只应有 Phase 7-1 / Step 4 写入的 metadata）。

### 验证步骤 5：Filter 按 tag 命中

LangSmith Project 列表页 Filter 输入：

```
tags has "rag:hit"
```

应能列出全部 hit 类 trace。再换 `tags has "rag:miss"`，应列出 miss 类。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| LangSmith trace 一直没有 `rag:*` tag | `ToolMessage.name` 为空 | 改用 `tool_call_id` 反查上一条 AIMessage 的 `tool_calls` 找到 name；或在 `_kb_search_hit_or_miss` 中 `print(msg.name, msg.content[:80])` debug |
| `Runs` 里子节点有 tag，但 `Traces` 根节点看不到 | 验收口径混用了 `Runs` 子节点 | 回到 `Traces` 视图，以 `name=agent` 的根 trace 为准 |
| `Traces` 根节点仍无 tag，而子节点有 tag | 仅对当前 run 调了 `add_tags`，未同步根 trace run | 用 `trace_id + ls_client.update_run(trace_id, tags=...)` 显式更新根 run |
| 同一轮只看到 `memory_search/chat/memory_save`，没有 `search_knowledge_base` | 命中了用户长期记忆，模型未调用 KB 工具 | 换成明确依赖知识库的问题（例如“请基于知识库回答：学生管理模块字段有哪些”），再验证 `rag:*` |
| 明明改了代码但行为不稳定（有时有 tag、有时没有） | 同时运行多个 Agent 进程，后端打到旧端口 | 保持单实例；确认后端 `LANGGRAPH_API_URL` 与当前 Agent 端口一致 |
| 总是 `rag:miss`（应 hit）| `_KB_MISS_MARKERS` 太宽，把正常结果误判 | 把 `'无相关'`/`'没有相关'` 之类宽匹配关键字去掉，只保留工具实际返回的精确文案 |
| 总是 `rag:hit`（应 miss）| 工具返回是 `'[]'` 字符串 / 占位文案不在 `_KB_MISS_MARKERS` | 任务 0 重新查工具实现，把实际文案补进去 |
| “查无此人”被打成 `rag:hit` | 仅按“非空文本”判定，未使用分数阈值 | 提取相关度分数；`max_score < 0.2` 判为 `miss` |
| trace 根节点 tag 在，但 tool span tag 没在 | 改动 1.3 未做 | 改动 1.3 是可选项，不做不影响验收，但推荐做 |
| `name` 属性访问报错 | 旧版 langchain-core | 改 `getattr(msg, 'name', '') == 'search_knowledge_base'` 防御（本 prompt 已用此写法）|

## 完成后

### 更新 PROGRESS.md

```
| 7-2-2 | 业务指标 tag 注入（`rag:hit` / `rag:miss`） | ✅ | <今天日期> | nodes.py 新增 _kb_search_hit_or_miss 辅助函数；chat_node + tool_node_with_retry 两处均按 KB 返回打 tag；LangSmith Filter 可命中 |
```

### git commit

```bash
git add packages/agent/src/graph/nodes.py docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(monitor): phase-7-2 step-2 RAG hit/miss tag 注入

- nodes.py 新增 _kb_search_hit_or_miss 辅助函数
- chat_node 入口扫描 state 尾部 ToolMessage 给 trace 根节点打 rag:hit/miss
- tool_node_with_retry 末尾给工具 span 也打同 tag
- _KB_MISS_MARKERS 元组维护"无结果"判定关键字
- DoD: LangSmith Filter `tags has "rag:hit"` 可命中；
  `tags has "rag:miss"` 可命中；非 KB 调用不打 tag

ref: docs/monitor/PROGRESS.md 7-2-2
EOF
)"
```
