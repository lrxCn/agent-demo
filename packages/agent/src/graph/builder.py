"""LangGraph 图构建"""
import os

from langchain_core.messages import AIMessage

from langgraph.graph import END, START, StateGraph

from src.config.settings import AGENT_RAG_ROUTER_ENABLED
from src.graph.intent_router import intent_router
from src.graph.kb_query_node import kb_query_node
from src.graph.memory_nodes import memory_save_node, memory_search_node
from src.graph.nodes import after_tools, chat_node, fallback_node, tool_node_with_retry
from src.graph.state import AgentState
from src.tools.builtin import register_builtin_tools
from src.tools.frontend import register_frontend_tools


def _is_cli_mode() -> bool:
    """本地 CLI（pnpm dev:agentLocal）为 true；langgraph dev 等不设变量则为 false。"""
    v = os.environ.get('PLAN2CODE_AGENT_CLI_MODE', '').strip().lower()
    return v in ('1', 'true', 'yes', 'on')

# 模块加载时注册内置工具与前端工具
register_builtin_tools()
register_frontend_tools()


def should_continue(state: AgentState) -> str:
    """判断 memory_save 之后是否需要调用工具（依据 chat 刚追加的最后一条消息）"""
    last_message = state['messages'][-1]
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return 'tools'
    return END


builder = StateGraph(AgentState)
builder.add_node('memory_search', memory_search_node)
builder.add_node('chat', chat_node)
builder.add_node('memory_save', memory_save_node)
builder.add_node('tools', tool_node_with_retry)
builder.add_node('fallback', fallback_node)

if AGENT_RAG_ROUTER_ENABLED:
    # === Phase 8 方案 B 新图 ===
    builder.add_node('kb_query', kb_query_node)
    builder.add_edge(START, 'memory_search')
    builder.add_conditional_edges(
        'memory_search',
        intent_router,
        {
            'kb_query': 'kb_query',
            'chat_direct': 'chat',
        },
    )
    builder.add_edge('kb_query', 'chat')
else:
    # === 旧图（回滚分支）===
    builder.add_edge(START, 'memory_search')
    builder.add_edge('memory_search', 'chat')

# 后续主循环（两种图共用，零改动）
builder.add_edge('chat', 'memory_save')
builder.add_conditional_edges(
    'memory_save',
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
        'memory_search': 'memory_search',
    },
)
builder.add_edge('fallback', END)

if _is_cli_mode():
    # 仅本地 CLI 使用 Redis；langgraph dev 由运行时接管 checkpoint，此处不可注入
    from src.memory.short_term import get_redis_checkpointer

    graph = builder.compile(checkpointer=get_redis_checkpointer())
else:
    graph = builder.compile()
