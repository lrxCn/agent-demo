# Phase 1 - Step 4: 工具调用重试机制

## 上下文
Agent 已能调用工具。现在添加重试机制，当工具调用失败时自动重试。
请先阅读 @packages/agent/src/graph/builder.py 了解当前图结构。

## 任务

### 1. 创建 `packages/agent/src/graph/retry.py`
```python
"""工具调用重试机制"""
import asyncio
import logging
from typing import Any
from langchain_core.tools import BaseTool
from langchain_core.messages import ToolMessage

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
BASE_DELAY = 1  # 秒


async def invoke_tool_with_retry(
    tool: BaseTool, 
    tool_input: dict[str, Any],
    tool_call_id: str,
) -> ToolMessage:
    """带重试的工具调用
    
    使用指数退避策略：1s → 2s → 4s
    """
    last_error = None
    
    for attempt in range(MAX_RETRIES):
        try:
            result = await tool.ainvoke(tool_input)
            return ToolMessage(content=str(result), tool_call_id=tool_call_id)
        except Exception as e:
            last_error = e
            delay = BASE_DELAY * (2 ** attempt)
            logger.warning(
                f"工具 {tool.name} 第 {attempt + 1} 次调用失败: {e}，"
                f"{delay}秒后重试..."
            )
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(delay)
    
    # 全部重试失败
    error_msg = f"工具 {tool.name} 调用失败（已重试 {MAX_RETRIES} 次）: {last_error}"
    logger.error(error_msg)
    return ToolMessage(
        content=f"⚠️ {error_msg}",
        tool_call_id=tool_call_id,
    )
```

### 2. 创建自定义 ToolNode `packages/agent/src/graph/nodes.py`
替换 LangGraph 内置的 ToolNode，使用带重试的版本：

```python
"""图节点定义"""
import asyncio
from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessage
from src.graph.state import AgentState
from src.graph.retry import invoke_tool_with_retry
from src.tools.registry import registry
from src.config.settings import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL_NAME

TIMEOUT_SECONDS = 30


def get_llm(tools=None):
    """获取 LLM 实例"""
    llm = ChatOpenAI(
        model=OPENAI_MODEL_NAME,
        base_url=OPENAI_BASE_URL,
        api_key=OPENAI_API_KEY,
        temperature=0,
    )
    if tools:
        llm = llm.bind_tools(tools)
    return llm


async def chat_node(state: AgentState) -> dict:
    """聊天节点"""
    tools = registry.get_tools(categories=["builtin"])
    llm = get_llm(tools=tools)
    response = await llm.ainvoke(state["messages"])
    return {"messages": [response]}


async def tool_node_with_retry(state: AgentState) -> dict:
    """工具节点（带重试和超时）"""
    last_message = state["messages"][-1]
    
    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        return {"messages": []}
    
    # 获取所有可用工具的映射
    all_tools = registry.get_all_tools()
    tool_map = {t.name: t for t in all_tools}
    
    results = []
    for tool_call in last_message.tool_calls:
        tool_name = tool_call["name"]
        tool_input = tool_call["args"]
        tool_call_id = tool_call["id"]
        
        tool = tool_map.get(tool_name)
        if not tool:
            from langchain_core.messages import ToolMessage
            results.append(ToolMessage(
                content=f"❌ 未找到工具: {tool_name}",
                tool_call_id=tool_call_id,
            ))
            continue
        
        # 带超时的重试调用
        try:
            result = await asyncio.wait_for(
                invoke_tool_with_retry(tool, tool_input, tool_call_id),
                timeout=TIMEOUT_SECONDS,
            )
            results.append(result)
        except asyncio.TimeoutError:
            from langchain_core.messages import ToolMessage
            results.append(ToolMessage(
                content=f"⏱️ 工具 {tool_name} 调用超时（{TIMEOUT_SECONDS}秒）",
                tool_call_id=tool_call_id,
            ))
    
    return {"messages": results}
```

### 3. 更新 `packages/agent/src/graph/builder.py`
使用新的节点替换旧的：

```python
"""LangGraph 图构建"""
from langgraph.graph import StateGraph, START, END
from src.graph.state import AgentState
from src.graph.nodes import chat_node, tool_node_with_retry
from src.tools.builtin import register_builtin_tools

# 注册内置工具
register_builtin_tools()


def should_continue(state: AgentState) -> str:
    """判断是否需要调用工具"""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    return END


# 构建图
builder = StateGraph(AgentState)
builder.add_node("chat", chat_node)
builder.add_node("tools", tool_node_with_retry)
builder.add_conditional_edges("chat", should_continue, {
    "tools": "tools",
    END: END,
})
builder.add_edge("tools", "chat")
builder.add_edge(START, "chat")

graph = builder.compile()
```

## 验证
同 Step 3 的验证命令，确保工具调用仍然正常工作。

## 完成后
更新 @docs/PROJECT_STATUS.md 将 Phase 1 Step 1-4 和 1-5 状态改为 ✅（超时检测已在本步骤中一并实现）
