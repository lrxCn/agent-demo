"""强制 RAG 检索节点（Phase 8 / Step 3）

命中信息查询意图后，本节点对最近一条 HumanMessage 执行一次 search_knowledge，
结果写入 state.forced_kb_results 供 chat_node 注入 SystemMessage。

特性：
- 失败 / 空结果不阻塞流程，写空数组继续
- 10 秒超时护栏（复用 node_timeout_guard），超时返回空数组
- 角色权限通过 state.user_role_ids 注入（与 tool_node_with_retry 一致）
- 不在本节点重复打 rag:hit/miss tag（沿用 chat_node / tool_node_with_retry 的逻辑）
"""
from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage

try:
    from langsmith.run_helpers import get_current_run_tree
except ImportError:  # pragma: no cover
    get_current_run_tree = None  # type: ignore[assignment]

from src.graph.guards import node_timeout_guard
from src.graph.state import AgentState
from src.rag.retriever import search_knowledge

logger = logging.getLogger(__name__)

KB_QUERY_TIMEOUT_SECONDS = 10
KB_QUERY_LIMIT = 5


def _add_kb_forced_span_tag() -> None:
    """在当前节点 span 打 route:kb_forced=true（根 trace 标签由 chat_node 负责）。"""
    if get_current_run_tree is not None:
        try:
            run = get_current_run_tree()
            if run is not None:
                run.add_tags(['route:kb_forced=true'])
        except Exception:  # noqa: BLE001
            pass


def _last_human_text(state: AgentState) -> str:
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            content = msg.content
            return content if isinstance(content, str) else str(content)
    return ""


@node_timeout_guard(
    node_name="kb_query",
    timeout_seconds=KB_QUERY_TIMEOUT_SECONDS,
    fallback=lambda: {"forced_kb_results": []},
)
def kb_query_node(state: AgentState) -> dict[str, list[dict]]:
    """强制对最近一条用户消息执行一次知识库检索，结果写入 forced_kb_results。"""
    query = _last_human_text(state).strip()
    if not query:
        _add_kb_forced_span_tag()
        return {"forced_kb_results": []}

    role_ids = state.get("user_role_ids") or []
    if not role_ids:
        # 与 retriever.search_knowledge 内部行为一致：role_ids 为空直接返回 []
        logger.info("kb_query_node: 空角色列表，跳过检索")
        _add_kb_forced_span_tag()
        return {"forced_kb_results": []}

    try:
        results = search_knowledge(query, role_ids=role_ids, limit=KB_QUERY_LIMIT)
    except Exception:
        logger.exception("kb_query_node: search_knowledge 异常，降级为空结果")
        _add_kb_forced_span_tag()
        return {"forced_kb_results": []}

    logger.info("kb_query_node: 命中 %d 条", len(results))
    _add_kb_forced_span_tag()
    return {"forced_kb_results": results}
