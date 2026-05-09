"""LangGraph 图构建：chat → 条件路由 → ToolNode → 回到 chat"""
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from src.config.settings import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL_NAME
from src.graph.state import AgentState

# Step 2-3 起由 ToolRegistry 注入；当前为空列表，图结构已就绪
_TOOLS: list[BaseTool] = []


def get_llm() -> ChatOpenAI:
    """获取 LLM 实例（配置来自 settings）"""
    return ChatOpenAI(
        model=OPENAI_MODEL_NAME,
        base_url=OPENAI_BASE_URL,
        api_key=OPENAI_API_KEY,
        temperature=0,
    )


def should_continue(state: AgentState) -> str:
    """判断最后一条 AI 消息是否包含 tool_calls"""
    last = state['messages'][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return 'tools'
    return END


def chat_node(state: AgentState) -> dict[str, list[BaseMessage]]:
    """聊天节点：绑定工具并调用 LLM"""
    llm = get_llm().bind_tools(_TOOLS)
    response = llm.invoke(state['messages'])
    return {'messages': [response]}


tool_node = ToolNode(_TOOLS)

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
