"""通话记录查询工具。"""

from langchain_core.tools import tool

from src.rag.retriever import search_call_transcripts


@tool
def search_my_calls(query: str, user_id: str) -> str:
    """搜索我的通话记录内容。只能查询自己参与的通话。

    Args:
        query: 搜索内容，如"上次和谁聊了什么"
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
