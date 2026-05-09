# Phase 1 - Step 1: LangGraph 基础图结构

## 上下文
项目脚手架已完成（Phase 0）。请先阅读：
- @docs/ARCHITECTURE.md（整体架构）
- @docs/PROJECT_STATUS.md（当前进度）
- @packages/agent/src/graph/state.py（已有的 State 定义）
- @packages/agent/src/graph/builder.py（已有的基础图）

## 任务
改造 `packages/agent/src/graph/builder.py`，实现带条件路由的图结构：

1. 修改 `builder.py`，构建如下图结构：
```
START → chat_node → should_use_tool? 
                     ├─ YES → tool_node → chat_node
                     └─ NO  → END
```

2. `chat_node`：调用 LLM，使用 `llm.bind_tools(tools)` 绑定工具
3. `tool_node`：使用 LangGraph 内置的 `ToolNode`
4. `should_use_tool`：条件路由函数，检查最后一条消息是否包含 `tool_calls`

具体实现：
```python
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI
from src.graph.state import AgentState
from src.config.settings import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL_NAME


def get_llm():
    """获取 LLM 实例"""
    return ChatOpenAI(
        model=OPENAI_MODEL_NAME,
        base_url=OPENAI_BASE_URL,
        api_key=OPENAI_API_KEY,
        temperature=0,
    )


def should_continue(state: AgentState) -> str:
    """判断是否需要调用工具"""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    return END


def chat_node(state: AgentState) -> dict:
    """聊天节点：调用 LLM"""
    llm = get_llm()
    # 工具绑定将在 Step 2-3 中通过 ToolRegistry 实现
    # 目前先不绑定工具
    response = llm.invoke(state["messages"])
    return {"messages": [response]}


# 构建图
builder = StateGraph(AgentState)
builder.add_node("chat", chat_node)
# tool_node 将在 Step 3 添加工具后启用
builder.add_conditional_edges("chat", should_continue, {
    "tools": END,  # 暂时走 END，Step 3 后改为 "tools"
    END: END,
})
builder.add_edge(START, "chat")

graph = builder.compile()
```

## 验证
```bash
cd packages/agent
uv run python -c "
from src.graph.builder import graph
from langchain_core.messages import HumanMessage
result = graph.invoke({
    'messages': [HumanMessage(content='1+1等于几？')],
    'mem0_user_id': 'test',
    'thread_id': 'test',
    'available_frontend_tools': []
})
print(result['messages'][-1].content)
"
```

## 完成后
更新 @docs/PROJECT_STATUS.md 将 Phase 1 Step 1-1 状态改为 ✅
