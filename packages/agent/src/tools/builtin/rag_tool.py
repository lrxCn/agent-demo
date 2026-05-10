"""知识库检索工具。"""

from langchain_core.tools import tool

from src.rag.retriever import search_knowledge


@tool
def search_knowledge_base(query: str) -> str:
    """在知识库中搜索相关信息。

    Args:
        query: 搜索查询内容
    """
    # TODO: 后续在 chat_node 中从 state 注入真实 role_ids
    results = search_knowledge(query, role_ids=["admin"])
    if not results:
        return "未找到相关知识。"

    return "\n\n".join(
        [f"[相关度:{item['score']:.2f}] {item['text']}" for item in results]
    )
