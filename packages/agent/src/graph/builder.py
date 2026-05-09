"""LangGraph 图构建"""
import os

from langchain_core.messages import AIMessage

from langgraph.graph import END, START, StateGraph

from src.graph.nodes import after_tools, chat_node, fallback_node, tool_node_with_retry
from src.graph.state import AgentState
from src.tools.builtin import register_builtin_tools


def _is_cli_mode() -> bool:
    """本地 CLI（pnpm dev:agentLocal）为 true；langgraph dev 等不设变量则为 false。"""
    v = os.environ.get('PLAN2CODE_AGENT_CLI_MODE', '').strip().lower()
    return v in ('1', 'true', 'yes', 'on')

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

if _is_cli_mode():
    # 仅本地 CLI 使用 Redis；langgraph dev 由运行时接管 checkpoint，此处不可注入
    from src.memory.short_term import get_redis_checkpointer

    graph = builder.compile(checkpointer=get_redis_checkpointer())
else:
    graph = builder.compile()
