# Phase 8 / Step 2：意图路由 `intent_router`（规则法 + 单元测试）

## 上下文

Phase 8 第二步。新建路由函数 `intent_router`，**只判定不写 state**，输出字符串 `'kb_query'` 或 `'chat_direct'`，供 `builder.py` 在下一步接入条件边。

执行前必读：

- `@docs/AGENT_RAG_ROUTING_PLAN_B_REQUIREMENTS.md`（§4 F1）
- `@docs/AGENT_RAG_ROUTING_PLAN_B_ARCHITECTURE.md`（§6.1 `intent_router` 行为契约）
- `@docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md`（接力棒）
- `@packages/agent/src/graph/state.py`（必读，确认 `intent_route` 字段已在 step-1 添加）
- `@packages/agent/src/graph/memory_nodes.py`（参考其 `_last_human_text` 写法）

前置条件：

- Phase 8 Step 1 已 ✅
- `uv run python -c "from src.config.settings import AGENT_RAG_ROUTER_ENABLED; print(AGENT_RAG_ROUTER_ENABLED)"` 输出 `True`

---

## 任务

### 任务 1：新建 `packages/agent/src/graph/intent_router.py`

```python
"""意图路由（Phase 8 / Step 2）

只读 state.messages 中最近一条 HumanMessage，按规则法返回路由方向：
- 'kb_query'    : 命中信息查询关键词 → 走强制检索分支
- 'chat_direct' : 其余情况（含明确导航意图） → 直接进 chat
"""
from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage

from src.graph.state import AgentState

logger = logging.getLogger(__name__)


# ===== 关键词词表（v1 规则法，谨慎收敛，宁缺毋滥） =====
# 命中即视为"信息查询意图"
INFO_QUERY_KEYWORDS: tuple[str, ...] = (
    '信息',
    '资料',
    '详情',
    '介绍',
    '是谁',
    '记录',
    '档案',
    '简介',
    '履历',
    '背景',
    '查一下',
    '查询',
    '了解一下',
    '知道',
)

# 命中即视为"明确导航意图"（仅当未同时命中 INFO_QUERY_KEYWORDS 时生效）
NAV_KEYWORDS: tuple[str, ...] = (
    '打开',
    '跳转',
    '去到',
    '进入',
    '切换到',
    '带我去',
    '前往',
)

# 命中即视为"导航的目标对象"，与 NAV_KEYWORDS 联合判定（避免"打开你的话匣子"被误判）
NAV_OBJECTS: tuple[str, ...] = (
    '页面',
    '管理页',
    '列表',
    '页',
    '模块',
)


def _last_human_text(state: AgentState) -> str:
    """取最近一条 HumanMessage 的纯文本。"""
    for msg in reversed(state['messages']):
        if isinstance(msg, HumanMessage):
            content = msg.content
            return content if isinstance(content, str) else str(content)
    return ''


def _hit_info_query(text: str) -> bool:
    return any(kw in text for kw in INFO_QUERY_KEYWORDS)


def _hit_nav(text: str) -> bool:
    has_verb = any(kw in text for kw in NAV_KEYWORDS)
    has_object = any(obj in text for obj in NAV_OBJECTS)
    return has_verb and has_object


def intent_router(state: AgentState) -> str:
    """LangGraph 条件边路由函数。

    判定优先级：
      1) 命中信息查询关键词 → 'kb_query'（即便同时命中导航，也先检索）
      2) 命中明确导航意图 → 'chat_direct'
      3) 兜底 → 'chat_direct'

    本函数不写 state（条件边路由函数不应写 state），仅返回字符串。
    """
    text = _last_human_text(state).strip()
    if not text:
        logger.debug('intent_router: empty human text, default chat_direct')
        return 'chat_direct'

    if _hit_info_query(text):
        logger.info('intent_router: kb_query (text=%s)', text[:60])
        return 'kb_query'

    if _hit_nav(text):
        logger.info('intent_router: chat_direct (nav, text=%s)', text[:60])
        return 'chat_direct'

    logger.info('intent_router: chat_direct (default, text=%s)', text[:60])
    return 'chat_direct'
```

### 任务 2：新建单元测试 `packages/agent/tests/graph/test_intent_router.py`

> 如 `tests/` 目录或 `tests/graph/` 不存在，先 `mkdir -p packages/agent/tests/graph` 并加 `__init__.py`。

```python
"""intent_router 单元测试（Phase 8 / Step 2）"""
from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from src.graph.intent_router import intent_router


def _state(messages):
    return {
        'messages': messages,
        'mem0_user_id': 'u1',
        'thread_id': 't1',
        'available_frontend_tools': [],
    }


# ===== kb_query 命中（信息查询）=====

@pytest.mark.parametrize('text', [
    '给我陈可新的信息',
    '查一下张三的资料',
    '李四是谁？',
    '王五的档案能看吗',
    '帮我了解一下这个学生',
    '查询一下他的履历',
    '介绍下这个班',
])
def test_kb_query_hit(text: str):
    assert intent_router(_state([HumanMessage(content=text)])) == 'kb_query'


# ===== chat_direct（明确导航）=====

@pytest.mark.parametrize('text', [
    '打开学生管理页面',
    '跳转到知识库列表',
    '帮我打开角色管理页',
    '进入用户管理模块',
])
def test_chat_direct_nav(text: str):
    assert intent_router(_state([HumanMessage(content=text)])) == 'chat_direct'


# ===== 同时命中：信息查询优先 =====

def test_kb_query_when_both_hit():
    text = '查一下陈可新的信息，然后打开学生管理页面'
    assert intent_router(_state([HumanMessage(content=text)])) == 'kb_query'


# ===== chat_direct 兜底 =====

@pytest.mark.parametrize('text', [
    '你好',
    '今天天气怎么样',
    '1+1 等于几',
    '',
])
def test_chat_direct_default(text: str):
    assert intent_router(_state([HumanMessage(content=text)])) == 'chat_direct'


# ===== 边界：取最近一条 HumanMessage，忽略 AIMessage =====

def test_take_only_last_human_message():
    msgs = [
        HumanMessage(content='打开学生管理页面'),
        AIMessage(content='已打开'),
        HumanMessage(content='给我陈可新的信息'),  # ← 这条才是判定依据
    ]
    assert intent_router(_state(msgs)) == 'kb_query'


def test_no_human_message():
    assert intent_router(_state([AIMessage(content='你好')])) == 'chat_direct'
```

### 任务 3：补 `tests/graph/__init__.py`（如缺失）

```bash
mkdir -p packages/agent/tests/graph
touch packages/agent/tests/__init__.py packages/agent/tests/graph/__init__.py
```

---

## 验证

### 验证步骤 1：编译检查

```bash
cd packages/agent
uv run python -c "from src.graph.intent_router import intent_router; print('import OK')"
```

期望输出 `import OK`。

### 验证步骤 2：单元测试

```bash
cd packages/agent
uv run pytest tests/graph/test_intent_router.py -v
```

期望：所有用例 PASS（含参数化用例 7+4+1+4+1+1 = 18 个 assert）。

### 验证步骤 3：交互式手动验证

```bash
cd packages/agent
uv run python -c "
from langchain_core.messages import HumanMessage
from src.graph.intent_router import intent_router

cases = [
    '给我陈可新的信息',          # kb_query
    '打开学生管理页面',          # chat_direct
    '陈可新是谁？并帮我打开学生页', # kb_query（信息查询优先）
    '你好',                     # chat_direct
]
for t in cases:
    s = {'messages': [HumanMessage(content=t)], 'mem0_user_id': 'u', 'thread_id': 't', 'available_frontend_tools': []}
    print(f'{intent_router(s):<12} <- {t}')
"
```

期望输出（顺序）：
```
kb_query     <- 给我陈可新的信息
chat_direct  <- 打开学生管理页面
kb_query     <- 陈可新是谁？并帮我打开学生页
chat_direct  <- 你好
```

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| `ModuleNotFoundError: src.graph.intent_router` | `__init__.py` 缺失 / `PYTHONPATH` 不对 | 确保 `packages/agent/src/graph/__init__.py` 存在；用 `cd packages/agent && uv run pytest` |
| `kb_query` 误命中「我打开你的话匣子」之类 | NAV_KEYWORDS 太宽 | 已要求 `NAV_KEYWORDS + NAV_OBJECTS` 联合判定，无需改 |
| 「你好吗，张三的资料」未被路由到 kb_query | 「资料」在 INFO_QUERY_KEYWORDS 中应能命中 | 检查是否拼错关键字 |
| 想加新关键字 | 修改 `INFO_QUERY_KEYWORDS` 元组 | 同时在测试里加用例 |

---

## 完成后

### 更新 PROGRESS.md

把 `8-2` 那行改为 ✅，并在变更记录追加。

### git commit

```bash
git add \
  packages/agent/src/graph/intent_router.py \
  packages/agent/tests/__init__.py \
  packages/agent/tests/graph/__init__.py \
  packages/agent/tests/graph/test_intent_router.py \
  docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(agent): phase-8 step-2 新增意图路由 intent_router

- 新增 src/graph/intent_router.py（v1 规则法 + 词表）
- 新增 tests/graph/test_intent_router.py（参数化 18+ 用例）
- 路由规则：信息查询优先于导航；导航需动词+目标对象联合判定
- 路由函数不写 state，仅返回 'kb_query' / 'chat_direct'
- DoD: pytest 全 PASS；不改任何已有节点

ref: docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md 8-2
EOF
)"
```
