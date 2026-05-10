"""知识库检索工具。"""

from langchain_core.tools import tool

from src.rag.retriever import search_call_transcripts, search_knowledge


@tool
def search_knowledge_base(query: str, role_ids: list[str]) -> str:
    """在知识库中搜索相关信息。

    Args:
        query: 搜索查询内容
        role_ids: 当前用户角色 ID 列表（由 Agent 状态注入）
    """
    results = search_knowledge(query, role_ids=role_ids)
    if not results:
        return "未找到相关知识。"

    return "\n\n".join(
        [f"[相关度:{item['score']:.2f}] {item['text']}" for item in results]
    )


@tool
def search_call_history(query: str, user_id: str) -> str:
    """搜索用户参与的通话记录。

    Args:
        query: 搜索查询内容
        user_id: 当前用户 ID（由 Agent 状态注入）
    """
    results = search_call_transcripts(query, user_id=user_id)
    if not results:
        return "未找到相关通话记录。"

    return "\n\n".join(
        [
            f"[时间:{item['call_time']}][相关度:{item['score']:.2f}] {item['text']}"
            for item in results
        ]
    )
