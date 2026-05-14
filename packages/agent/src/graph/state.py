"""LangGraph Agent 状态定义"""
from typing import Annotated, NotRequired, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """Agent 状态"""

    messages: Annotated[list[BaseMessage], add_messages]
    mem0_user_id: str
    thread_id: str
    available_frontend_tools: list[str]
    user_role_ids: NotRequired[list[str]]
    # 由 memory_search_node 写入；invoke 时可不传
    retrieved_memories: NotRequired[list[str]]
    # 监控体系：来自前端 W3C traceparent 的 32 hex；用于在 LangSmith trace 上打 metadata
    app_trace_id: NotRequired[str]
