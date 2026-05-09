# Phase 1 - Step 8: Mem0 + Qdrant 长期记忆

## 上下文
Redis 短期记忆已完成。现在集成 Mem0 + Qdrant 实现按 user_id 的长期记忆。

## 变更范围（本步骤）
本步骤涉及配置、向量维度、Mem0 封装、LangGraph 节点与环境变量示例等多处联动，**实现时允许在一次迭代中修改多个文件**（例如 `packages/agent/src/config/settings.py`、`memory/long_term.py`、`graph/nodes.py`、仓库根目录 `.env.example`、`docs/PROJECT_STATUS.md` 等），不必为遵守「单次变更尽量少文件」的一般习惯而拆成多轮；仍建议**按逻辑小步提交**（如先配置与维度、再接节点、再文档），便于 code review。

## Qdrant 向量维度（必读）
Mem0 使用 Qdrant 时，**必须在 `vector_store.config` 里显式设置 `embedding_model_dims`**，且与当前 embedder 模型输出的向量维度一致。Mem0 若未配置，历史上易按 OpenAI 默认 **1536** 建集合，与 BGE 等模型写入的向量维度不一致会导致检索/写入失败。

**本项目约定**：Embedding 模型名在 `packages/agent/src/config/settings.py` 的 `EMBEDDING_MODEL`（可由环境变量 `EMBEDDING_MODEL` 覆盖）处确定；与之配套的维度在**同一文件**的 `EMBEDDING_MODEL_DIMS`（环境变量 `EMBEDDING_MODEL_DIMS`，默认 `1024`）处确定。

- 当前默认模型 `BAAI/bge-large-zh-v1.5`（见 `.env.example` 的 `EMBEDDING_MODEL`）的向量维度为 **1024**（与 [Hugging Face 模型说明](https://huggingface.co/BAAI/bge-large-zh-v1.5) 一致）。
- 若更换 `EMBEDDING_MODEL`，必须查阅该模型的输出维度并同步修改 `EMBEDDING_MODEL_DIMS`；若 Qdrant 中已有错误维度的集合，应换 `collection_name` 或删集合后重建。

## 任务

### 1. 创建 `packages/agent/src/memory/long_term.py`
```python
"""Mem0 长期记忆 - 基于 Qdrant 向量存储"""
from mem0 import Memory
from src.config.settings import (
    EMBEDDING_MODEL,
    EMBEDDING_MODEL_DIMS,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    OPENAI_MODEL_NAME,
    QDRANT_HOST,
    QDRANT_PORT,
)

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
                    "embedding_model_dims": EMBEDDING_MODEL_DIMS,
                    "host": QDRANT_HOST,
                    "port": QDRANT_PORT,
                },
            },
            "llm": {
                "provider": "openai",
                "config": {
                    "model": OPENAI_MODEL_NAME,
                    "api_key": OPENAI_API_KEY,
                    "openai_base_url": OPENAI_BASE_URL,
                },
            },
            "embedder": {
                "provider": "openai",
                "config": {
                    "model": EMBEDDING_MODEL,
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
