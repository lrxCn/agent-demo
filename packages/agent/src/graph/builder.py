"""LangGraph 图构建"""
from langchain_core.messages import BaseMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph

from src.config.settings import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL_NAME
from src.graph.state import AgentState


def chat_node(state: AgentState) -> dict[str, list[BaseMessage]]:
    """基础聊天节点"""
    llm = ChatOpenAI(
        model=OPENAI_MODEL_NAME,
        base_url=OPENAI_BASE_URL,
        api_key=OPENAI_API_KEY,
        temperature=0,
    )
    response = llm.invoke(state['messages'])
    return {'messages': [response]}


# 构建图
builder = StateGraph(AgentState)
builder.add_node('chat', chat_node)
builder.add_edge(START, 'chat')
builder.add_edge('chat', END)

graph = builder.compile()
