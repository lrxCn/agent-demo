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
    # 监控体系 Phase 7-4 Step 2：后端按角色过滤后的 builtin 工具白名单
    # 缺失时按"全允许"兜底（向后兼容旧 invoke 调用）
    allowed_builtin_tools: NotRequired[list[str]]
    # === Phase 8 新增：RAG 路由方案 B（向下兼容） ===
    # 意图路由结果：'kb_query' | 'chat_direct' | 'unknown'
    # 由 intent_router 路由函数判定（不写 state，仅在 chat_node 中读取打 trace tag 时用）
    # 但保留字段是为了未来扩展时不再迁移；当前 step 暂不写入
    intent_route: NotRequired[str]
    # 强制检索结果：由 kb_query_node 写入
    # 元素结构：{'text': str, 'score': float}（与 retriever.search_knowledge 输出一致）
    forced_kb_results: NotRequired[list[dict]]
