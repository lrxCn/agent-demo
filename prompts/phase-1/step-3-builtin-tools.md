# Phase 1 - Step 3: 内置工具 + 图集成

## 上下文
ToolRegistry 已完成。现在创建几个示例内置工具并集成到图中。

## 任务

### 1. 创建内置工具 `packages/agent/src/tools/builtin/math_tool.py`
```python
"""数学计算工具"""
from langchain_core.tools import tool


@tool
def calculate(expression: str) -> str:
    """计算数学表达式。支持加减乘除、幂运算等。
    
    Args:
        expression: 数学表达式，如 "2 + 3 * 4"
    """
    try:
        # 安全的数学计算（只允许数学运算）
        allowed_chars = set("0123456789+-*/.() ")
        if not all(c in allowed_chars for c in expression):
            return f"错误：表达式包含不允许的字符"
        result = eval(expression)  # 这里限制了输入，是安全的
        return f"计算结果：{expression} = {result}"
    except Exception as e:
        return f"计算错误：{str(e)}"
```

### 2. 创建内置工具 `packages/agent/src/tools/builtin/datetime_tool.py`
```python
"""日期时间工具"""
from langchain_core.tools import tool
from datetime import datetime


@tool
def get_current_time() -> str:
    """获取当前日期和时间"""
    now = datetime.now()
    return f"当前时间：{now.strftime('%Y年%m月%d日 %H:%M:%S')}，星期{'一二三四五六日'[now.weekday()]}"
```

### 3. 创建 `packages/agent/src/tools/builtin/__init__.py`
```python
"""内置工具注册"""
from src.tools.registry import registry
from src.tools.builtin.math_tool import calculate
from src.tools.builtin.datetime_tool import get_current_time


def register_builtin_tools():
    """注册所有内置工具"""
    registry.register(calculate, category="builtin", tags=["math"])
    registry.register(get_current_time, category="builtin", tags=["utility"])
```

### 4. 修改 `packages/agent/src/graph/builder.py`，集成工具
更新图结构，将 ToolRegistry 的工具绑定到 LLM，并添加 ToolNode：

```python
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI
from src.graph.state import AgentState
from src.config.settings import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL_NAME
from src.tools.registry import registry
from src.tools.builtin import register_builtin_tools

# 注册内置工具
register_builtin_tools()


def get_llm(tools=None):
    """获取 LLM 实例，可选绑定工具"""
    llm = ChatOpenAI(
        model=OPENAI_MODEL_NAME,
        base_url=OPENAI_BASE_URL,
        api_key=OPENAI_API_KEY,
        temperature=0,
    )
    if tools:
        llm = llm.bind_tools(tools)
    return llm


def should_continue(state: AgentState) -> str:
    """判断是否需要调用工具"""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    return END


def chat_node(state: AgentState) -> dict:
    """聊天节点"""
    # 获取当前可用的工具
    tools = registry.get_tools(categories=["builtin"])
    llm = get_llm(tools=tools)
    response = llm.invoke(state["messages"])
    return {"messages": [response]}


# 构建图
tools = registry.get_all_tools()
tool_node = ToolNode(tools)

builder = StateGraph(AgentState)
builder.add_node("chat", chat_node)
builder.add_node("tools", tool_node)
builder.add_conditional_edges("chat", should_continue, {
    "tools": "tools",
    END: END,
})
builder.add_edge("tools", "chat")
builder.add_edge(START, "chat")

graph = builder.compile()
```

## 验证
```bash
cd packages/agent
uv run python -c "
from src.graph.builder import graph
from langchain_core.messages import HumanMessage

# 测试工具调用
result = graph.invoke({
    'messages': [HumanMessage(content='请帮我计算 123 * 456')],
    'mem0_user_id': 'test',
    'thread_id': 'test',
    'available_frontend_tools': []
})
print('计算测试:', result['messages'][-1].content)

# 测试时间工具
result = graph.invoke({
    'messages': [HumanMessage(content='现在几点了？')],
    'mem0_user_id': 'test',
    'thread_id': 'test',
    'available_frontend_tools': []
})
print('时间测试:', result['messages'][-1].content)
"
```

## 完成后
更新 @docs/PROJECT_STATUS.md 将 Phase 1 Step 1-3 状态改为 ✅

执行 git commit：
```bash
git add .
git commit -m "feat: Agent 基础图结构 + 工具注册中心 + 内置工具"
```
