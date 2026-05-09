# Phase 1 - Step 7: Redis 短期记忆

## 上下文
Agent 容错机制已完成。现在集成 Redis 作为 checkpointer 实现短期记忆（按 thread_id 隔离对话上下文）。

## 任务

### 1. 创建 `packages/agent/src/memory/short_term.py`
```python
"""Redis 短期记忆 - 基于 LangGraph Checkpointer"""
from langgraph.checkpoint.redis import RedisSaver
from src.config.settings import REDIS_URL


def get_redis_checkpointer() -> RedisSaver:
    """获取 Redis checkpointer 实例"""
    return RedisSaver(conn_string=REDIS_URL)
```

注意：需要先安装 langgraph-checkpoint-redis：
```bash
uv add langgraph-checkpoint-redis
```

### 2. 修改 `packages/agent/src/graph/builder.py`
在 `graph = builder.compile()` 时传入 checkpointer：

```python
from src.memory.short_term import get_redis_checkpointer

checkpointer = get_redis_checkpointer()
graph = builder.compile(checkpointer=checkpointer)
```

### 3. 验证短期记忆
```bash
cd packages/agent
uv run python -c "
from src.graph.builder import graph
from langchain_core.messages import HumanMessage

config = {'configurable': {'thread_id': 'test-thread-001'}}

# 第一轮对话
result = graph.invoke({
    'messages': [HumanMessage(content='我叫小明')],
    'mem0_user_id': 'test', 'thread_id': 'test-thread-001',
    'available_frontend_tools': []
}, config=config)
print('第一轮:', result['messages'][-1].content)

# 第二轮对话（同一 thread）
result = graph.invoke({
    'messages': [HumanMessage(content='我叫什么名字？')],
    'mem0_user_id': 'test', 'thread_id': 'test-thread-001',
    'available_frontend_tools': []
}, config=config)
print('第二轮:', result['messages'][-1].content)
# 应该能回答出"小明"
"
```

## 完成后
更新 PROJECT_STATUS.md 标记 1-7 为 ✅
