"""LangGraph 图构建"""
from langchain_core.messages import AIMessage

from langgraph.graph import END, START, StateGraph

from src.graph.nodes import after_tools, chat_node, fallback_node, tool_node_with_retry
from src.graph.state import AgentState
from src.tools.builtin import register_builtin_tools

# 模块加载时注册内置工具
register_builtin_tools()


def should_continue(state: AgentState) -> str:
    """判断是否需要调用工具"""
    last_message = state['messages'][-1]
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return 'tools'
    return END


builder = StateGraph(AgentState)
builder.add_node('chat', chat_node)
builder.add_node('tools', tool_node_with_retry)
builder.add_node('fallback', fallback_node)
builder.add_edge(START, 'chat')
builder.add_conditional_edges(
    'chat',
    should_continue,
    {
        'tools': 'tools',
        END: END,
    },
)
builder.add_conditional_edges(
    'tools',
    after_tools,
    {
        'fallback': 'fallback',
        'chat': 'chat',
    },
)
builder.add_edge('fallback', END)

graph = builder.compile()
