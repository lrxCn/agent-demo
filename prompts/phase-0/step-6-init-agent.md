# Phase 0 - Step 6: 初始化 Python Agent

## 上下文
Monorepo、NestJS、Vue3 已初始化。请先阅读 @docs/ARCHITECTURE.md。

## 任务
1. 在 `packages/` 目录下创建 agent 项目：
```bash
cd packages
mkdir -p agent/src/graph agent/src/tools/builtin agent/src/tools/frontend agent/src/memory agent/src/rag agent/src/config
```

2. 用 uv 初始化 Python 项目：
```bash
cd packages/agent
uv init --no-readme
```

3. 添加核心依赖：
```bash
uv add langgraph langchain-openai langchain-core langchain-community
uv add mem0ai qdrant-client
uv add python-dotenv redis
uv add langgraph-cli
```

4. 创建 `src/config/settings.py`：
```python
"""项目配置管理"""
import os
from dotenv import load_dotenv

# 加载 monorepo 根目录的 .env
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '.env'))

# LLM 配置
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL")
OPENAI_MODEL_NAME = os.getenv("OPENAI_MODEL_NAME")

# Redis 配置
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# Qdrant 配置
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))

# Embedding 配置
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-large-zh-v1.5")
```

5. 创建 `src/__init__.py`（空文件）和各子目录的 `__init__.py`

6. 创建 `langgraph.json`：
```json
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./src/graph/builder.py:graph"
  },
  "env": "../../.env"
}
```

7. 创建 `src/graph/state.py`（基础 State 定义）：
```python
"""LangGraph Agent 状态定义"""
from typing import Annotated, TypedDict
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage


class AgentState(TypedDict):
    """Agent 状态"""
    messages: Annotated[list[BaseMessage], add_messages]
    mem0_user_id: str
    thread_id: str
    available_frontend_tools: list[str]
```

8. 创建 `src/graph/builder.py`（最小可运行图）：
```python
"""LangGraph 图构建"""
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
from src.graph.state import AgentState
from src.config.settings import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL_NAME


def chat_node(state: AgentState) -> dict:
    """基础聊天节点"""
    llm = ChatOpenAI(
        model=OPENAI_MODEL_NAME,
        base_url=OPENAI_BASE_URL,
        api_key=OPENAI_API_KEY,
        temperature=0,
    )
    response = llm.invoke(state["messages"])
    return {"messages": [response]}


# 构建图
builder = StateGraph(AgentState)
builder.add_node("chat", chat_node)
builder.add_edge(START, "chat")
builder.add_edge("chat", END)

graph = builder.compile()
```

## 验证
```bash
cd packages/agent
uv run python -c "
from src.graph.builder import graph
from langchain_core.messages import HumanMessage
result = graph.invoke({
    'messages': [HumanMessage(content='你好，请做自我介绍')],
    'mem0_user_id': 'test',
    'thread_id': 'test',
    'available_frontend_tools': []
})
print(result['messages'][-1].content)
"
```
应该能看到 LLM 的回复。

## 完成后
更新 @docs/PROJECT_STATUS.md 将 Phase 0 Step 0-6 状态改为 ✅
