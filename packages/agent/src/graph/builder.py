"""LangGraph 图构建：chat → 条件路由 → ToolNode → 回到 chat"""
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from src.config.settings import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL_NAME
from src.graph.state import AgentState
from src.tools.builtin import register_builtin_tools
from src.tools.registry import registry

# 模块加载时注册内置工具
register_builtin_tools()


def get_llm(tools: list[BaseTool] | None = None) -> ChatOpenAI:
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
    """判断最后一条 AI 消息是否包含 tool_calls"""
    last = state['messages'][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return 'tools'
    return END


def chat_node(state: AgentState) -> dict[str, list[BaseMessage]]:
    """聊天节点：按需绑定内置工具并调用 LLM"""
    tools = registry.get_tools(categories=['builtin'])
    llm = get_llm(tools=tools)
    response = llm.invoke(state['messages'])
    return {'messages': [response]}


_tool_list = registry.get_all_tools()
tool_node = ToolNode(_tool_list)

builder = StateGraph(AgentState)
builder.add_node('chat', chat_node)
builder.add_node('tools', tool_node)
builder.add_edge(START, 'chat')
builder.add_conditional_edges(
    'chat',
    should_continue,
    {
        'tools': 'tools',
        END: END,
    },
)
builder.add_edge('tools', 'chat')

graph = builder.compile()
