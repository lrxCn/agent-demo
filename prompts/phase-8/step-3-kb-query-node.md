# Phase 8 / Step 3：RAG 强制检索节点 `kb_query_node`

## 上下文

Phase 8 第三步。新建图节点 `kb_query_node`，命中信息查询意图后**强制执行一次 `search_knowledge`**，结果写入 `state.forced_kb_results`，供下一步 `chat_node` 注入。

执行前必读：

- `@docs/AGENT_RAG_ROUTING_PLAN_B_REQUIREMENTS.md`（§4 F2）
- `@docs/AGENT_RAG_ROUTING_PLAN_B_ARCHITECTURE.md`（§6.2 `kb_query_node` 行为契约）
- `@docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md`
- `@packages/agent/src/graph/guards.py`（必读，了解 `node_timeout_guard` 用法）
- `@packages/agent/src/graph/memory_nodes.py`（参考其超时降级写法）
- `@packages/agent/src/rag/retriever.py`（必读，`search_knowledge(query, role_ids, limit)` 签名）

前置条件：

- Phase 8 Step 1、Step 2 已 ✅
- Qdrant 容器可用（`docker ps | grep qdrant`）
- 知识库中至少有 1 篇文档已 ingest（用于 hit 测试）；空知识库也能跑通 miss 路径

---

## 任务

### 任务 1：新建 `packages/agent/src/graph/kb_query_node.py`

```python
"""强制 RAG 检索节点（Phase 8 / Step 3）

命中信息查询意图后，本节点对最近一条 HumanMessage 执行一次 search_knowledge，
结果写入 state.forced_kb_results 供 chat_node 注入 SystemMessage。

特性：
- 失败 / 空结果不阻塞流程，写空数组继续
- 10 秒超时护栏（复用 node_timeout_guard），超时返回空数组
- 角色权限通过 state.user_role_ids 注入（与 tool_node_with_retry 一致）
- 不在本节点重复打 rag:hit/miss tag（沿用 chat_node / tool_node_with_retry 的逻辑）
"""
from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage

from src.graph.guards import node_timeout_guard
from src.graph.state import AgentState
from src.rag.retriever import search_knowledge

logger = logging.getLogger(__name__)

KB_QUERY_TIMEOUT_SECONDS = 10
KB_QUERY_LIMIT = 5


def _last_human_text(state: AgentState) -> str:
    for msg in reversed(state['messages']):
        if isinstance(msg, HumanMessage):
            content = msg.content
            return content if isinstance(content, str) else str(content)
    return ''


@node_timeout_guard(
    node_name='kb_query',
    timeout_seconds=KB_QUERY_TIMEOUT_SECONDS,
    fallback=lambda: {'forced_kb_results': []},
)
def kb_query_node(state: AgentState) -> dict[str, list[dict]]:
    """强制对最近一条用户消息执行一次知识库检索，结果写入 forced_kb_results。"""
    query = _last_human_text(state).strip()
    if not query:
        return {'forced_kb_results': []}

    role_ids = state.get('user_role_ids') or []
    if not role_ids:
        # 与 retriever.search_knowledge 内部行为一致：role_ids 为空直接返回 []
        logger.info('kb_query_node: 空角色列表，跳过检索')
        return {'forced_kb_results': []}

    try:
        results = search_knowledge(query, role_ids=role_ids, limit=KB_QUERY_LIMIT)
    except Exception:
        logger.exception('kb_query_node: search_knowledge 异常，降级为空结果')
        return {'forced_kb_results': []}

    logger.info('kb_query_node: 命中 %d 条', len(results))
    return {'forced_kb_results': results}
```

### 任务 2：单元测试 `packages/agent/tests/graph/test_kb_query_node.py`

```python
"""kb_query_node 单元测试（Phase 8 / Step 3）"""
from __future__ import annotations

from unittest.mock import patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from src.graph.kb_query_node import kb_query_node


def _state(messages, role_ids=('admin',)):
    return {
        'messages': messages,
        'mem0_user_id': 'u1',
        'thread_id': 't1',
        'available_frontend_tools': [],
        'user_role_ids': list(role_ids),
    }


def test_returns_results_on_success():
    fake = [{'text': '陈可新简介…', 'score': 0.85}]
    with patch('src.graph.kb_query_node.search_knowledge', return_value=fake) as m:
        out = kb_query_node(_state([HumanMessage(content='给我陈可新的信息')]))
        assert out == {'forced_kb_results': fake}
        m.assert_called_once()
        kwargs = m.call_args.kwargs
        assert kwargs['role_ids'] == ['admin']


def test_empty_role_ids_returns_empty():
    with patch('src.graph.kb_query_node.search_knowledge') as m:
        out = kb_query_node(_state([HumanMessage(content='给我陈可新的信息')], role_ids=()))
        assert out == {'forced_kb_results': []}
        m.assert_not_called()  # 角色为空直接跳过


def test_no_human_message_returns_empty():
    out = kb_query_node(_state([AIMessage(content='你好')]))
    assert out == {'forced_kb_results': []}


def test_search_exception_swallowed():
    with patch('src.graph.kb_query_node.search_knowledge', side_effect=RuntimeError('boom')):
        out = kb_query_node(_state([HumanMessage(content='查一下学生')]))
        assert out == {'forced_kb_results': []}


def test_empty_results_returned_as_is():
    with patch('src.graph.kb_query_node.search_knowledge', return_value=[]):
        out = kb_query_node(_state([HumanMessage(content='查一下学生')]))
        assert out == {'forced_kb_results': []}


def test_timeout_guard_falls_back_to_empty():
    """模拟 retriever 卡住超过 10s，期望 fallback 为空数组。"""
    import time

    def slow(*args, **kwargs):
        time.sleep(15)
        return [{'text': 'never reached'}]

    with patch('src.graph.kb_query_node.search_knowledge', side_effect=slow):
        out = kb_query_node(_state([HumanMessage(content='查一下学生')]))
        assert out == {'forced_kb_results': []}


@pytest.mark.parametrize('role_ids', [
    ['admin'],
    ['student-viewer', 'kb-reader'],
])
def test_role_ids_passed_through(role_ids):
    fake = [{'text': 'x', 'score': 0.5}]
    with patch('src.graph.kb_query_node.search_knowledge', return_value=fake) as m:
        kb_query_node(_state([HumanMessage(content='查一下学生')], role_ids=role_ids))
        assert m.call_args.kwargs['role_ids'] == role_ids
```

> 超时用例真的会 sleep 10s+，**预期单测耗时较长**。如需加快，可在该用例上加 `@pytest.mark.slow` 并默认跳过；但本期不做。

---

## 验证

### 验证步骤 1：编译检查

```bash
cd packages/agent
uv run python -c "from src.graph.kb_query_node import kb_query_node; print('import OK')"
```

### 验证步骤 2：单元测试

```bash
cd packages/agent
uv run pytest tests/graph/test_kb_query_node.py -v
```

期望：6 + 2 = 8 用例 PASS（含 `test_timeout_guard_falls_back_to_empty` 约 10s）。

### 验证步骤 3：真实 Qdrant 链路抽查（可选，需 Qdrant 运行）

```bash
cd packages/agent
uv run python -c "
from langchain_core.messages import HumanMessage
from src.graph.kb_query_node import kb_query_node

state = {
    'messages': [HumanMessage(content='项目里学生管理模块的核心字段有哪些')],
    'mem0_user_id': 'u',
    'thread_id': 't',
    'available_frontend_tools': [],
    'user_role_ids': ['<你的实际 role_id>'],  # ← 替换成真实 role_id 才能召回
}
out = kb_query_node(state)
print('hits:', len(out['forced_kb_results']))
for r in out['forced_kb_results'][:2]:
    print(r['score'], r['text'][:80])
"
```

期望：能看到 ≥ 1 条召回结果（前提是知识库已 ingest）。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| 超时用例 PASS 但耗时巨长 | `node_timeout_guard` 超时后线程仍在 sleep | 这是预期：`pool.shutdown(wait=False, cancel_futures=True)` 不打断 sleep；测试本身已正确 |
| `search_knowledge` 实际签名不一致 | 上游 retriever.py 改过 | 先 `cat packages/agent/src/rag/retriever.py` 确认 `search_knowledge(query, role_ids, limit)` 三参数 |
| Qdrant 抽查 hits=0 | role_id 与 ingest 时不匹配 | 用 `curl http://localhost:6333/collections/knowledge_base/points/scroll -X POST -d '{"limit":1}'` 看 payload.role_ids |
| `node_timeout_guard` 报参数错 | step-1 漏装新依赖 / guards.py 已被改 | 对照本期 ARCHITECTURE 的 §6.2 重新核对装饰器签名 |

---

## 完成后

### 更新 PROGRESS.md

把 `8-3` 那行改为 ✅，变更记录追加。

### git commit

```bash
git add \
  packages/agent/src/graph/kb_query_node.py \
  packages/agent/tests/graph/test_kb_query_node.py \
  docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(agent): phase-8 step-3 新增 RAG 强制检索节点 kb_query_node

- 新增 src/graph/kb_query_node.py（10s 超时护栏 + 异常吞掉）
- 新增 tests/graph/test_kb_query_node.py（mock retriever，覆盖 6+2 用例）
- 失败 / 空结果 / 超时 / 空角色 → 一律返回 {'forced_kb_results': []}
- role_ids 由 state.user_role_ids 注入（与 tool_node_with_retry 一致）
- 不重复打 rag:hit/miss tag（沿用 chat_node / tool_node 现有逻辑）
- DoD: pytest 全 PASS；不改任何已有节点 / 工具

ref: docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md 8-3
EOF
)"
```
