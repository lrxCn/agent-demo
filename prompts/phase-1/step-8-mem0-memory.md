# Phase 1 - Step 8: Mem0 + Qdrant 长期记忆

## 上下文
Redis 短期记忆已完成。现在集成 Mem0 + Qdrant 实现按 user_id 的长期记忆。

## 任务

### 1. 创建 `packages/agent/src/memory/long_term.py`
```python
"""Mem0 长期记忆 - 基于 Qdrant 向量存储"""
from mem0 import Memory
from src.config.settings import QDRANT_HOST, QDRANT_PORT, OPENAI_API_KEY, OPENAI_BASE_URL

_memory_instance = None

def get_memory() -> Memory:
    """获取 Mem0 实例（单例）"""
    global _memory_instance
    if _memory_instance is None:
        config = {
            "vector_store": {
                "provider": "qdrant",
                "config": {
                    "collection_name": "user_memories",
                    "host": QDRANT_HOST,
                    "port": QDRANT_PORT,
                },
            },
            "llm": {
                "provider": "openai",
                "config": {
                    "model": "deepseek-ai/DeepSeek-V3.2",
                    "api_key": OPENAI_API_KEY,
                    "openai_base_url": OPENAI_BASE_URL,
                },
            },
            "embedder": {
                "provider": "openai",
                "config": {
                    "model": "BAAI/bge-large-zh-v1.5",
                    "api_key": OPENAI_API_KEY,
                    "openai_base_url": OPENAI_BASE_URL,
                },
            },
        }
        _memory_instance = Memory.from_config(config)
    return _memory_instance


def search_memories(query: str, user_id: str, limit: int = 5) -> list[str]:
    """搜索用户的长期记忆"""
    memory = get_memory()
    results = memory.search(query=query, user_id=user_id, limit=limit)
    return [r["memory"] for r in results.get("results", [])]


def save_memories(messages: list[dict], user_id: str):
    """保存对话到长期记忆"""
    memory = get_memory()
    memory.add(messages=messages, user_id=user_id)
```

### 2. 修改 `packages/agent/src/graph/nodes.py` 的 chat_node
在 chat_node 开头搜索长期记忆，注入到系统提示中：

```python
from src.memory.long_term import search_memories, save_memories
from langchain_core.messages import SystemMessage

async def chat_node(state: AgentState) -> dict:
    tools = registry.get_tools(categories=["builtin"])
    llm = get_llm(tools=tools)
    
    user_id = state.get("mem0_user_id", "")
    messages = list(state["messages"])
    
    # 搜索长期记忆
    if user_id and messages:
        last_user_msg = next(
            (m.content for m in reversed(messages) if hasattr(m, 'content') and not hasattr(m, 'tool_calls')),
            ""
        )
        if last_user_msg:
            memories = search_memories(last_user_msg, user_id)
            if memories:
                mem_text = "\n".join([f"- {m}" for m in memories])
                system_msg = SystemMessage(
                    content=f"以下是关于该用户的已知信息：\n{mem_text}\n\n请参考这些信息回答问题，但不要主动提及这些记忆。"
                )
                messages = [system_msg] + messages
    
    response = await llm.ainvoke(messages)
    
    # 保存到长期记忆（异步，不阻塞响应）
    if user_id:
        try:
            last_user = next((m for m in reversed(state["messages"]) if hasattr(m, 'content')), None)
            if last_user:
                save_memories(
                    [{"role": "user", "content": last_user.content},
                     {"role": "assistant", "content": response.content}],
                    user_id=user_id,
                )
        except Exception:
            pass  # 记忆保存失败不影响主流程
    
    return {"messages": [response]}
```

## 验证
```bash
cd packages/agent
uv run python -c "
from src.graph.builder import graph
from langchain_core.messages import HumanMessage

config1 = {'configurable': {'thread_id': 'mem-test-1'}}
config2 = {'configurable': {'thread_id': 'mem-test-2'}}

# Thread 1: 告诉 agent 一些信息
graph.invoke({
    'messages': [HumanMessage(content='我喜欢吃火锅，最喜欢的颜色是蓝色')],
    'mem0_user_id': 'user-001', 'thread_id': 'mem-test-1',
    'available_frontend_tools': []
}, config=config1)

# Thread 2: 不同的 thread，相同的 user_id
result = graph.invoke({
    'messages': [HumanMessage(content='你知道我喜欢吃什么吗？')],
    'mem0_user_id': 'user-001', 'thread_id': 'mem-test-2',
    'available_frontend_tools': []
}, config=config2)
print('跨 thread 记忆测试:', result['messages'][-1].content)
# 应该能回答出火锅
"
```

## 完成后
更新 PROJECT_STATUS.md 标记 1-8 为 ✅
